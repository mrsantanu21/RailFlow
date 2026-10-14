import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

const initializeSchema = z.object({
  bookingId: z.string(),
  method: z.enum(['UPI', 'NET_BANKING', 'DEBIT_CARD', 'CREDIT_CARD', 'WALLET']).default('UPI'),
});

const simulateSchema = z.object({
  outcome: z.enum(['SUCCESS', 'FAILED']),
  failureReason: z.string().optional(),
});

// ─── POST /api/payments/initialize or /api/payments/create ─────────────────────
router.post(['/initialize', '/create'], validate(initializeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { bookingId, method } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { passengers: { include: { allocation: true } } },
    });

    if (!booking || booking.userId !== userId) {
      next(createError('Booking not found', 404, 'NOT_FOUND'));
      return;
    }

    if (booking.status !== 'PENDING') {
      next(createError('Booking is not in PENDING state', 400, 'INVALID_STATE'));
      return;
    }

    if (booking.paymentStatus !== 'PENDING') {
      next(createError('Payment already processed', 400, 'PAYMENT_ALREADY_PROCESSED'));
      return;
    }

    // Check if any locks have expired
    const now = new Date();
    const expiredLock = booking.passengers.find(p =>
      p.allocation?.status === 'LOCKED' &&
      p.allocation?.lockedUntil &&
      p.allocation.lockedUntil < now
    );

    if (expiredLock) {
      // Release all locks and fail the booking
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({ where: { id: bookingId }, data: { status: 'FAILED' } });
        await tx.seatAllocation.updateMany({
          where: { bookingPassenger: { bookingId }, status: 'LOCKED' },
          data: { status: 'RELEASED' },
        });
      });
      next(createError('Seat reservation expired. Please search again and rebook.', 410, 'LOCK_EXPIRED'));
      return;
    }

    // Create idempotency key for this payment attempt
    const idempotencyKey = `pay_${bookingId}_${Date.now()}`;

    const transaction = await prisma.paymentTransaction.create({
      data: {
        bookingId,
        idempotencyKey,
        amountPaise: booking.totalFarePaise,
        method,
        status: 'PENDING',
      },
    });

    res.json({
      success: true,
      data: {
        id: transaction.id,
        paymentId: transaction.id,
        transaction,
        idempotencyKey,
        amountPaise: booking.totalFarePaise,
        bookingId,
        // Simulated payment gateway data
        simulatedGateway: {
          orderId: `RF_${booking.pnr}_${Date.now()}`,
          currency: 'INR',
          amount: booking.totalFarePaise / 100,
          description: `RailFlow Booking - PNR ${booking.pnr}`,
          note: 'DEMO: This is a simulated payment. No real money is charged.',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/payments/:id/simulate-result ───────────────────────────────────
router.post('/:id/simulate-result', validate(simulateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { outcome, failureReason } = req.body;
    const id = req.params.id as string;

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id },
      include: { booking: { include: { passengers: { include: { allocation: true } } } } },
    });

    if (!transaction || transaction.booking.userId !== userId) {
      next(createError('Payment transaction not found', 404, 'NOT_FOUND'));
      return;
    }

    // Idempotency: if already processed, return same result
    if (transaction.status !== 'PENDING') {
      res.json({
        success: true,
        data: {
          alreadyProcessed: true,
          status: transaction.status,
          bookingStatus: transaction.booking.status,
        },
      });
      return;
    }

    const transactionRef = `RFPAY${Date.now().toString(36).toUpperCase()}`;

    if (outcome === 'SUCCESS') {
      // Confirm booking: update transaction + booking + allocations atomically
      await prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'SUCCESS', transactionRef },
        });

        await tx.booking.update({
          where: { id: transaction.bookingId },
          data: { status: 'CONFIRMED', paymentStatus: 'SUCCESS' },
        });

        // Upgrade all LOCKED allocations to CONFIRMED
        await tx.seatAllocation.updateMany({
          where: {
            bookingPassenger: { bookingId: transaction.bookingId },
            status: 'LOCKED',
          },
          data: { status: 'CONFIRMED', lockedUntil: null },
        });
      });

      res.json({
        success: true,
        data: {
          status: 'SUCCESS',
          transactionRef,
          pnr: transaction.booking.pnr,
          message: 'Payment successful! Your booking is confirmed.',
          note: 'DEMO: This is a simulated payment. No real money was charged.',
        },
      });
    } else {
      // Payment failed: release seats
      await prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED', failureReason: failureReason || 'Payment declined' },
        });

        await tx.booking.update({
          where: { id: transaction.bookingId },
          data: { status: 'FAILED', paymentStatus: 'FAILED' },
        });

        await tx.seatAllocation.updateMany({
          where: {
            bookingPassenger: { bookingId: transaction.bookingId },
            status: 'LOCKED',
          },
          data: { status: 'RELEASED' },
        });
      });

      res.json({
        success: false,
        data: {
          status: 'FAILED',
          failureReason: failureReason || 'Payment declined',
          message: 'Payment failed. Your seat reservation has been released.',
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/transactions ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const transactions = await prisma.paymentTransaction.findMany({
      where: { booking: { userId } },
      include: { booking: { select: { pnr: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: { transactions } });
  } catch (err) {
    next(err);
  }
});

export default router;
