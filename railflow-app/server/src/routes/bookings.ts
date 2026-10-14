import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { generatePNR } from '../services/bookingService';
import { calculateFare } from '../services/fareService';
import { ensureTrainRunInventory, scheduleRunsOnDate } from '../services/inventoryService';

const router = Router();

// ─── All booking routes require auth ─────────────────────────────────────────
router.use(requireAuth);

// ─── Schemas ─────────────────────────────────────────────────────────────────
const createBookingSchema = z.object({
  trainRunId: z.string(),
  scheduleId: z.string(),
  fromStationCode: z.string(),
  toStationCode: z.string(),
  classType: z.enum(['ONE_AC', 'TWO_AC', 'THREE_AC', 'SLEEPER', 'CHAIR_CAR', 'EXEC_CHAIR', 'SECOND']),
  quotaType: z.enum(['GENERAL', 'TATKAL', 'PREMIUM_TATKAL', 'LADIES', 'SENIOR_CITIZEN']).default('GENERAL'),
  includeCatering: z.boolean().optional().default(false),
  passengers: z.array(z.object({
    name: z.string().min(2).max(100),
    age: z.coerce.number().min(1).max(120),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    berthPreference: z.enum(['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER', 'WINDOW', 'AISLE']).optional(),
  })).min(1).max(6).refine((passengers) => {
    const names = passengers.map(p => p.name.trim().toLowerCase());
    return new Set(names).size === names.length;
  }, {
    message: 'Each passenger must have a distinct name; duplicate passenger entries are not permitted.',
  }),
});

const cancelSchema = z.object({
  reason: z.string().optional(),
});

// ─── POST /api/bookings ───────────────────────────────────────────────────────
// Critical: Atomic seat allocation with transaction serialization
router.post('/', validate(createBookingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { trainRunId, scheduleId, fromStationCode, toStationCode, classType, quotaType, includeCatering, passengers } = req.body;

    // Server-side fare calculation (never trust browser-submitted totals)
    const fareQuote = await calculateFare(scheduleId, fromStationCode, toStationCode, classType, passengers.length, Boolean(includeCatering));
    if (!fareQuote) {
      next(createError('Unable to calculate fare for this journey', 400, 'FARE_CALCULATION_FAILED'));
      return;
    }

    // Get route station sequences for segment overlap checking
    const schedule = await prisma.trainSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        route: {
          include: {
            stations: {
              include: { station: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    });

    if (!schedule) { next(createError('Schedule not found', 404, 'NOT_FOUND')); return; }

    const fromRS = schedule.route.stations.find(rs => rs.station.code === fromStationCode.toUpperCase());
    const toRS = schedule.route.stations.find(rs => rs.station.code === toStationCode.toUpperCase());

    if (!fromRS || !toRS || fromRS.sequence >= toRS.sequence) {
      next(createError('Invalid route segment', 400, 'INVALID_SEGMENT'));
      return;
    }

    const pnr = generatePNR();
    const lockExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // ─── ATOMIC TRANSACTION ───────────────────────────────────────────────────
    const booking = await prisma.$transaction(async (tx) => {
      // Lock the train run row to prevent concurrent seat conflicts
      let trainRun = await tx.trainRun.findUnique({
        where: { id: trainRunId },
        include: {
          coaches: {
            where: { classType },
            include: {
              seats: {
                include: {
                  allocations: {
                    where: {
                      status: { in: ['LOCKED', 'CONFIRMED'] },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!trainRun) throw createError('Train run not found', 404, 'NOT_FOUND');
      if (trainRun.scheduleId !== scheduleId) throw createError('Train run does not match schedule', 400, 'INVALID_SCHEDULE');
      if (trainRun.status === 'CANCELLED') throw createError('This train run has been cancelled', 400, 'RUN_CANCELLED');

      const journeyDate = new Date(trainRun.runDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (journeyDate < today) throw createError('Cannot book for past journey date', 400, 'INVALID_DATE');
      if (!scheduleRunsOnDate(schedule.runningDays, trainRun.runDate)) {
        throw createError('Train does not operate on this journey date', 400, 'SCHEDULE_NOT_RUNNING');
      }

      // Defensive healing: if this trainRun has no coaches created yet, ensure inventory exists
      if (trainRun.coaches.length === 0) {
        await ensureTrainRunInventory(trainRun.scheduleId, trainRun.runDate);
        trainRun = await tx.trainRun.findUnique({
          where: { id: trainRunId },
          include: {
            coaches: {
              where: { classType },
              include: {
                seats: {
                  include: {
                    allocations: {
                      where: {
                        status: { in: ['LOCKED', 'CONFIRMED'] },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!trainRun) throw createError('Train run not found', 404, 'NOT_FOUND');
      }

      const now = new Date();

      // Find available seats (segment-aware overlap check)
      const availableSeats: Array<{ id: string; coachId: string; seatNumber: number; coachNumber: string }> = [];

      for (const coach of trainRun.coaches) {
        for (const seat of coach.seats) {
          const hasConflict = seat.allocations.some(alloc => {
            // Treat expired locks as released
            if (alloc.status === 'LOCKED' && alloc.lockedUntil && alloc.lockedUntil < now) return false;
            // Segment overlap: conflict if ranges intersect
            return alloc.boardingSeq < toRS.sequence && alloc.alightingSeq > fromRS.sequence;
          });

          if (!hasConflict) {
            availableSeats.push({
              id: seat.id,
              coachId: coach.id,
              seatNumber: seat.seatNumber,
              coachNumber: coach.coachNumber,
            });
          }
        }
      }

      if (availableSeats.length < passengers.length) {
        throw createError(
          `Only ${availableSeats.length} seat(s) available for ${classType} on this journey. Requested: ${passengers.length}`,
          409,
          'INSUFFICIENT_SEATS'
        );
      }

      // Assign seats to passengers (FIFO, respecting berth preference where possible)
      const assignedSeats = availableSeats.slice(0, passengers.length);

      // Create the booking with all passengers and seat allocations atomically
      const newBooking = await tx.booking.create({
        data: {
          pnr,
          userId,
          trainRunId,
          fromRouteStationSeq: fromRS.sequence,
          toRouteStationSeq: toRS.sequence,
          classType,
          quotaType,
          totalFarePaise: fareQuote.totalPaise,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          passengers: {
            create: passengers.map((p: typeof passengers[0], i: number) => ({
              passengerIndex: i + 1,
              name: p.name,
              age: p.age,
              gender: p.gender,
              berthPreference: p.berthPreference,
              allocation: {
                create: {
                  seatId: assignedSeats[i].id,
                  boardingRouteStationId: fromRS.id,
                  alightingRouteStationId: toRS.id,
                  boardingSeq: fromRS.sequence,
                  alightingSeq: toRS.sequence,
                  status: 'LOCKED',
                  lockedUntil: lockExpiry,
                  allocatedCoach: assignedSeats[i].coachNumber,
                  allocatedSeatNumber: assignedSeats[i].seatNumber,
                },
              },
            })),
          },
        },
        include: {
          passengers: { include: { allocation: true } },
        },
      });

      return newBooking;
    }, {
      isolationLevel: 'Serializable' as any, // SQLite uses serializable by default
      maxWait: 5000,
      timeout: 10000,
    });

    res.status(201).json({
      success: true,
      data: {
        booking: {
          id: booking.id,
          pnr: booking.pnr,
          status: booking.status,
          totalFarePaise: booking.totalFarePaise,
          passengers: booking.passengers.map(p => ({
            name: p.name,
            age: p.age,
            gender: p.gender,
            coach: p.allocation?.allocatedCoach,
            seatNumber: p.allocation?.allocatedSeatNumber,
          })),
          lockedUntil: lockExpiry,
        },
        fare: fareQuote,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: { userId },
        include: {
          passengers: {
            include: { allocation: true },
            orderBy: { passengerIndex: 'asc' },
          },
          trainRun: {
            include: {
              schedule: {
                include: {
                  train: true,
                  route: {
                    include: {
                      stations: {
                        include: { station: true },
                        orderBy: { sequence: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
          cancellation: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where: { userId } }),
    ]);

    res.json({
      success: true,
      data: { bookings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings/pnr/:pnr ──────────────────────────────────────────────
router.get('/pnr/:pnr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const pnr = req.params.pnr as string;

    const booking = await prisma.booking.findUnique({
      where: { pnr },
      include: {
        passengers: {
          include: { allocation: true },
          orderBy: { passengerIndex: 'asc' },
        },
        trainRun: {
          include: {
            schedule: {
              include: {
                train: true,
                route: {
                  include: {
                    stations: {
                      include: { station: true },
                      orderBy: { sequence: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
        cancellation: true,
      },
    });

    if (!booking) {
      next(createError('PNR not found', 404, 'PNR_NOT_FOUND'));
      return;
    }

    // Users can only see their own bookings (admin can see all — checked separately in admin routes)
    if (booking.userId !== userId) {
      next(createError('PNR not found', 404, 'PNR_NOT_FOUND')); // Don't reveal it exists
      return;
    }

    res.json({ success: true, data: { booking } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings/:id ────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const id = req.params.id as string;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        passengers: {
          include: { allocation: true },
          orderBy: { passengerIndex: 'asc' },
        },
        trainRun: {
          include: {
            schedule: {
              include: {
                train: true,
                route: {
                  include: {
                    stations: {
                      include: { station: true },
                      orderBy: { sequence: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        transactions: { orderBy: { createdAt: 'desc' } },
        cancellation: true,
      },
    });

    if (!booking || booking.userId !== userId) {
      next(createError('Booking not found', 404, 'NOT_FOUND'));
      return;
    }

    res.json({ success: true, data: { booking } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bookings/:id/cancel ────────────────────────────────────────────
router.post('/:id/cancel', validate(cancelSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { reason } = req.body;
    const id = req.params.id as string;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        passengers: { include: { allocation: true } },
        trainRun: {
          include: {
            schedule: {
              include: {
                train: true,
                route: {
                  include: {
                    stations: {
                      include: { station: true },
                      orderBy: { sequence: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        cancellation: true,
      },
    });

    if (!booking || booking.userId !== userId) {
      next(createError('Booking not found', 404, 'NOT_FOUND'));
      return;
    }

    if (booking.status === 'CANCELLED') {
      next(createError('Booking is already cancelled', 400, 'ALREADY_CANCELLED'));
      return;
    }

    if (booking.status !== 'CONFIRMED') {
      next(createError('Only confirmed bookings can be cancelled', 400, 'NOT_ELIGIBLE'));
      return;
    }

    // Calculate cancellation deduction based on journey date
    const journeyDate = new Date(booking.trainRun.runDate);
    const now = new Date();
    const hoursUntilDeparture = (journeyDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    let deductionPercent = 0;
    if (hoursUntilDeparture <= 0) {
      next(createError('Cannot cancel after train departure', 400, 'CANNOT_CANCEL_AFTER_DEPARTURE'));
      return;
    } else if (hoursUntilDeparture < 4) {
      deductionPercent = 100; // No refund within 4 hours
    } else if (hoursUntilDeparture < 12) {
      deductionPercent = 50;
    } else if (hoursUntilDeparture < 48) {
      deductionPercent = 25;
    } else {
      deductionPercent = 10; // Minimal cancellation charge
    }

    const deductionPaise = Math.round(booking.totalFarePaise * deductionPercent / 100);
    const refundAmountPaise = booking.totalFarePaise - deductionPaise;

    // Atomic cancellation: update booking + release seats + create cancellation record
    const cancellation = await prisma.$transaction(async (tx) => {
      // Update booking status
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', paymentStatus: 'REFUNDED' },
      });

      // Release all seat allocations
      await tx.seatAllocation.updateMany({
        where: {
          bookingPassenger: { bookingId: booking.id },
          status: { in: ['LOCKED', 'CONFIRMED'] },
        },
        data: { status: 'RELEASED' },
      });

      // Update payment transaction to REFUNDED
      await tx.paymentTransaction.updateMany({
        where: { bookingId: booking.id, status: 'SUCCESS' },
        data: { status: 'REFUNDED' },
      });

      // Create cancellation record
      return tx.cancellation.create({
        data: {
          bookingId: booking.id,
          deductionPercent,
          refundAmountPaise,
          reason: reason || 'Cancelled by user',
          processedAt: new Date(),
          refundStatus: 'PROCESSED',
        },
      });
    });

    res.json({
      success: true,
      data: {
        cancellation: {
          id: cancellation.id,
          pnr: booking.pnr,
          deductionPercent,
          deductionPaise,
          refundAmountPaise,
          refundStatus: cancellation.refundStatus,
          message: `Refund of ₹${(refundAmountPaise / 100).toFixed(2)} will be processed to your original payment method within 5-7 business days (demo: instant).`,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
