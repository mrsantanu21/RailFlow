import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { datameetService } from '../services/datameet';
import { indianRailwayService } from '../services/indianRailwayService';

const router = Router();

const searchSchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

import { canonicalStationService, isMalformedOrQuarantinedStation } from '../services/canonicalStationService';

// ─── GET /api/stations?q=<search> ────────────────────────────────────────────
router.get('/', validate(searchSchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, limit } = req.query as { q?: string; limit: string };
    const limitNum = parseInt(limit as string) || 20;

    const canonicalResults = await canonicalStationService.searchStations(q || '', limitNum);

    // Also check local Prisma stations
    const prismaStations = await prisma.station.findMany({
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
    });

    const seen = new Set<string>();
    const finalStations: Array<any> = [];

    // Prioritize exact code matches first
    const qUpper = (q || '').trim().toUpperCase();

    // Add exact code match from prisma if present
    for (const p of prismaStations) {
      if (p.code.toUpperCase() === qUpper && !isMalformedOrQuarantinedStation(p.code, p.name)) {
        seen.add(p.code.toUpperCase());
        finalStations.push({
          id: p.id,
          code: p.code,
          name: p.name,
          fullName: p.fullName || `${p.name} (${p.code})`,
          zone: p.zone,
          state: p.state,
          city: (p as any).city || p.state,
          isActive: p.isActive,
          provenance: {
            source: 'PRISMA_SEED',
            isOfficial: true,
            providerName: 'RailFlow Master Database',
          },
        });
      }
    }

    // Add ranked canonical stations (which filters out XX-*, YY-*, and ranks cities/aliases properly)
    for (const s of canonicalResults) {
      if (!seen.has(s.code.toUpperCase()) && finalStations.length < limitNum) {
        seen.add(s.code.toUpperCase());
        finalStations.push({
          id: s.id,
          code: s.code,
          name: s.name,
          fullName: s.fullName,
          zone: s.zone,
          state: s.state,
          city: s.city,
          isActive: s.isActive,
          provenance: s.provenance,
        });
      }
    }

    // If still have room, add remaining Prisma stations
    for (const p of prismaStations) {
      if (!seen.has(p.code.toUpperCase()) && finalStations.length < limitNum && !isMalformedOrQuarantinedStation(p.code, p.name)) {
        seen.add(p.code.toUpperCase());
        finalStations.push({
          id: p.id,
          code: p.code,
          name: p.name,
          fullName: p.fullName || `${p.name} (${p.code})`,
          zone: p.zone,
          state: p.state,
          city: (p as any).city || p.state,
          isActive: p.isActive,
          provenance: {
            source: 'PRISMA_SEED',
            isOfficial: true,
            providerName: 'RailFlow Master Database',
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        stations: finalStations,
        meta: {
          total: finalStations.length,
          canonicalCount: canonicalResults.length,
          query: q || '',
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
        const irStation = await indianRailwayService.getStation(id);
        if (irStation) {
          res.json({
            success: true,
            data: {
              station: {
                id: irStation.id,
                code: irStation.code,
                name: irStation.name,
                fullName: irStation.fullName,
                zone: irStation.zone,
                state: irStation.state,
                isActive: irStation.isActive,
              },
              provenance: irStation.provenance,
            },
          });
          return;
        }
      } catch (err) {
        console.warn('[stations] Indian Railway station lookup failed:', (err as Error).message);
      }

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
