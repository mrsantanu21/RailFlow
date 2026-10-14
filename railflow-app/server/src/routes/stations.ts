import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { datameetService } from '../services/datameet';

const router = Router();

const searchSchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ─── GET /api/stations?q=<search> ────────────────────────────────────────────
router.get('/', validate(searchSchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, limit } = req.query as { q?: string; limit: string };
    const limitNum = parseInt(limit as string) || 20;

    const stations = await prisma.station.findMany({
      where: {
        isActive: true,
        ...(q ? {
          OR: [
            { code: { contains: (q as string).toUpperCase() } },
            { name: { contains: q as string } },
            { fullName: { contains: q as string } },
            { state: { contains: q as string } },
          ],
        } : {}),
      },
      take: limitNum,
      orderBy: { code: 'asc' },
    });

    const seen = new Set(stations.map((s) => s.code.toUpperCase()));
    let catalogStations: Array<{
      id: string;
      code: string;
      name: string;
      fullName: string;
      zone: string;
      state: string;
      isActive: boolean;
    }> = [];
    try {
      const extra = await datameetService.searchStations(q || '', limitNum);
      catalogStations = extra
        .filter((s) => !seen.has(s.code.toUpperCase()))
        .slice(0, Math.max(0, limitNum - stations.length))
        .map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          fullName: s.fullName,
          zone: s.zone,
          state: s.state,
          isActive: s.isActive,
        }));
    } catch (err) {
      console.warn('[stations] DataMeet catalog unavailable:', (err as Error).message);
    }

    res.json({
      success: true,
      data: {
        stations: [...stations, ...catalogStations],
        meta: {
          localCount: stations.length,
          catalogCount: catalogStations.length,
          catalogProvenance: datameetService.isEnabled() ? datameetService.getProvenance() : null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/stations/:id ────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const station = await prisma.station.findFirst({
      where: {
        OR: [{ id }, { code: id.toUpperCase() }],
        isActive: true,
      },
    });

    if (!station) {
      try {
        const catalogStation = await datameetService.getStation(id);
        if (catalogStation) {
          res.json({
            success: true,
            data: {
              station: {
                id: catalogStation.id,
                code: catalogStation.code,
                name: catalogStation.name,
                fullName: catalogStation.fullName,
                zone: catalogStation.zone,
                state: catalogStation.state,
                isActive: catalogStation.isActive,
              },
              provenance: catalogStation.provenance,
            },
          });
          return;
        }
      } catch (err) {
        console.warn('[stations] DataMeet station lookup failed:', (err as Error).message);
      }
      res.status(404).json({ success: false, error: 'Station not found', code: 'NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: { station } });
  } catch (err) {
    next(err);
  }
});

export default router;
