import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { createError } from '../middleware/errorHandler';

const router = Router();

const quoteSchema = z.object({
  scheduleId: z.string(),
  fromStationCode: z.string(),
  toStationCode: z.string(),
  classType: z.enum(['ONE_AC', 'TWO_AC', 'THREE_AC', 'SLEEPER', 'CHAIR_CAR', 'EXEC_CHAIR', 'SECOND']),
  passengers: z.coerce.number().min(1).max(6).default(1),
  includeCatering: z.enum(['true', 'false']).transform(v => v === 'true').optional().default('false'),
});

// ─── GET /api/fares/quote ────────────────────────────────────────────────────
router.get('/quote', validate(quoteSchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduleId, fromStationCode, toStationCode, classType, passengers, includeCatering } = req.query as any;
    const passCount = parseInt(passengers) || 1;
    const hasCatering = includeCatering === true || includeCatering === 'true';

    const schedule = await prisma.trainSchedule.findUnique({
      where: { id: scheduleId },
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
        fareRules: true,
      },
    });

    if (!schedule) {
      next(createError('Schedule not found', 404, 'NOT_FOUND'));
      return;
    }

    const fromRS = schedule.route.stations.find(rs => rs.station.code === fromStationCode.toUpperCase());
    const toRS = schedule.route.stations.find(rs => rs.station.code === toStationCode.toUpperCase());

    if (!fromRS || !toRS || fromRS.sequence >= toRS.sequence) {
      next(createError('Invalid route segment', 400, 'INVALID_SEGMENT'));
      return;
    }

    const fareRule = schedule.fareRules.find(fr => fr.classType === classType);
    if (!fareRule) {
      next(createError(`No fare rule found for class ${classType}`, 404, 'FARE_NOT_FOUND'));
      return;
    }

    const distanceKm = toRS.distanceKm - fromRS.distanceKm;
    const baseFarePerPax = Math.round((fareRule.baseFarePaise * distanceKm) / 100);
    const reservationCharge = fareRule.reservationCharge;
    const superfastCharge = fareRule.superfastCharge;
    const cateringCharge = hasCatering ? fareRule.cateringCharge : 0;

    const subtotalPerPax = baseFarePerPax + reservationCharge + superfastCharge + cateringCharge;
    const subtotalAll = subtotalPerPax * passCount;
    const gstPaise = Math.round(subtotalAll * fareRule.gstPercent / 100);
    const totalPaise = subtotalAll + gstPaise;

    res.json({
      success: true,
      data: {
        fare: {
          distanceKm,
          passCount,
          classType,
          perPassenger: {
            baseFarePaise: baseFarePerPax,
            reservationChargePaise: reservationCharge,
            superfastChargePaise: superfastCharge,
            cateringChargePaise: cateringCharge,
            subtotalPaise: subtotalPerPax,
          },
          total: {
            subtotalPaise: subtotalAll,
            gstPaise,
            gstPercent: fareRule.gstPercent,
            totalPaise,
          },
        },
        train: { number: schedule.train.number, name: schedule.train.name },
        fromStation: { code: fromRS.station.code, name: fromRS.station.name },
        toStation: { code: toRS.station.code, name: toRS.station.name },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
