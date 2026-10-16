import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { railSearchService } from '../services/railSearchService';
import { validate } from '../middleware/validate';

const router = Router();

const searchTrainsSchema = z.object({
  from: z.string().min(2).max(50),
  to: z.string().min(2).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  quota: z.string().optional(),
  passengers: z.coerce.number().min(1).max(6).optional(),
  trainNumberOrName: z.string().optional(),
  directOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort: z.enum(['departure', 'arrival', 'duration', 'fare']).optional(),
  filterClass: z.string().optional(),
  filterType: z.string().optional(),
});

// ─── GET /api/search/trains ──────────────────────────────────────────────────
router.get('/trains', validate(searchTrainsSchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query as any;
    const result = await railSearchService.search({
      from: query.from,
      to: query.to,
      date: query.date || new Date().toISOString().split('T')[0],
      quota: query.quota || 'GENERAL',
      passengers: query.passengers ? parseInt(query.passengers, 10) : 1,
      trainNumberOrName: query.trainNumberOrName,
      directOnly: query.directOnly,
      sort: query.sort,
      filterClass: query.filterClass,
      filterType: query.filterType,
    });

    res.json(result);
  } catch (err: any) {
    if (err.message && err.message.startsWith('SAME_STATION')) {
      res.status(400).json({
        error: 'SAME_STATION',
        message: 'Source and destination stations cannot be the same',
      });
      return;
    }
    if (err.message && err.message.startsWith('STATION_NOT_FOUND')) {
      res.status(404).json({
        error: 'STATION_NOT_FOUND',
        message: err.message,
      });
      return;
    }
    next(err);
  }
});

export default router;
