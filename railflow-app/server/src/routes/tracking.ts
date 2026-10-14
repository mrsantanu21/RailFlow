import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { trackingService } from '../services/tracking/trackingService';
import { createError } from '../middleware/errorHandler';

const router = Router();

// Dedicated rate limiter for tracking requests to respect upstream limits
const trackingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,                 // 60 requests/min
  message: { success: false, error: 'Tracking rate limit exceeded. Please wait a moment.', code: 'RATE_LIMIT' },
});

router.use(trackingLimiter);

// ─── GET /api/tracking/active-trains ─────────────────────────────────────────
router.get('/active-trains', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const trains = await trackingService.getActiveTrackableTrains();
    res.json({
      success: true,
      data: { trains },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tracking/audit ─────────────────────────────────────────────────
router.get('/audit', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const audit = trackingService.getDataSourceAudit();
    res.json({
      success: true,
      data: { audit },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Train Number Schema Validation ──────────────────────────────────────────
const trainNumberSchema = z.string().regex(/^\d{4,5}$/, 'Train number must be 4 or 5 digits');

// ─── GET /api/tracking/:trainNumber ──────────────────────────────────────────
router.get('/:trainNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = trainNumberSchema.safeParse(req.params.trainNumber);
    if (!parseResult.success) {
      next(createError('Invalid train number format. Must be a 4 or 5 digit railway number.', 400, 'INVALID_TRAIN_NUMBER'));
      return;
    }

    const trainNumber = parseResult.data;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;

    try {
      const status = await trackingService.getRunningStatus(trainNumber, date);
      res.json({
        success: true,
        data: { status },
      });
    } catch (err: any) {
      if (err.message && err.message.includes('not found')) {
        next(createError(`Train ${trainNumber} not found in railway master or active schedules.`, 404, 'TRAIN_NOT_FOUND'));
        return;
      }
      next(err);
    }
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tracking/:trainNumber/route ────────────────────────────────────
router.get('/:trainNumber/route', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = trainNumberSchema.safeParse(req.params.trainNumber);
    if (!parseResult.success) {
      next(createError('Invalid train number format. Must be a 4 or 5 digit railway number.', 400, 'INVALID_TRAIN_NUMBER'));
      return;
    }

    const trainNumber = parseResult.data;
    const geometry = await trackingService.getRouteGeometry(trainNumber);
    res.json({
      success: true,
      data: { geometry },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tracking/stations/:stationCode/live ─────────────────────────────
const stationCodeSchema = z.string().regex(/^[A-Za-z0-9]{2,6}$/, 'Station code must be 2 to 6 alphanumeric characters');

router.get('/stations/:stationCode/live', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = stationCodeSchema.safeParse(req.params.stationCode);
    if (!parseResult.success) {
      next(createError('Invalid station code format.', 400, 'INVALID_STATION_CODE'));
      return;
    }

    const stationCode = parseResult.data.toUpperCase();
    const hours = req.query.hours ? parseInt(req.query.hours as string, 10) || 4 : 4;

    const board = await trackingService.getStationLiveBoard(stationCode, hours);
    res.json({
      success: true,
      data: { board },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tracking/between/:from/:to ─────────────────────────────────────
router.get('/between/:from/:to', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = String(req.params.from).toUpperCase();
    const to = String(req.params.to).toUpperCase();
    const result = await trackingService.getTrainsBetweenStations(from, to);
    res.json({
      success: true,
      data: { result },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

