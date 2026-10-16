import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { createError } from '../middleware/errorHandler';

const router = Router();

import {
  ensureTrainRunInventory,
  scheduleRunsOnDate,
  formatRunningDays,
} from '../services/inventoryService';
import { datameetService } from '../services/datameet';
import { DATAMEET_LIMITATIONS, PROVENANCE_LABELS } from '../services/datameet/types';
import { indianRailwayService, IR_DATASET_LIMITATIONS } from '../services/indianRailwayService';
import { canonicalStationService } from '../services/canonicalStationService';
import { railSearchService } from '../services/railSearchService';

// ─── Schemas ─────────────────────────────────────────────────────────────────
const searchSchema = z.object({
  from: z.string().min(2).max(10).optional(),
  fromStationCode: z.string().min(2).max(10).optional(),
  to: z.string().min(2).max(10).optional(),
  toStationCode: z.string().min(2).max(10).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  class: z.enum(['ONE_AC', 'TWO_AC', 'THREE_AC', 'SLEEPER', 'CHAIR_CAR', 'EXEC_CHAIR', 'SECOND']).optional(),
  classType: z.string().optional(),
  quota: z.string().optional(),
  passengers: z.coerce.number().min(1).max(6).optional(),
  passCount: z.coerce.number().min(1).max(6).optional(),
}).refine(data => (data.from || data.fromStationCode) && (data.to || data.toStationCode), {
  message: 'Origin and destination station codes are required',
});

// ─── GET /api/trains and /api/trains/search ──────────────────────────────────
router.get(['/', '/search'], validate(searchSchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fromRaw = ((req.query.from || req.query.fromStationCode) as string).toUpperCase();
    const toRaw = ((req.query.to || req.query.toStationCode) as string).toUpperCase();
    const fromRes = canonicalStationService.resolveCanonicalStationCode(fromRaw);
    const toRes = canonicalStationService.resolveCanonicalStationCode(toRaw);
    const from = fromRes.code || fromRaw;
    const to = toRes.code || toRaw;
    const date = req.query.date as string;
    const passCount = parseInt(((req.query.passengers || req.query.passCount || '1') as string)) || 1;

    // Validate date is not in the past
    const journeyDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (journeyDate < today) {
      next(createError('Journey date cannot be in the past', 400, 'INVALID_DATE'));
      return;
    }

    // Find source and destination stations
    const [fromStation, toStation] = await Promise.all([
      prisma.station.findFirst({ where: { OR: [{ code: from }, { id: from }], isActive: true } }),
      prisma.station.findFirst({ where: { OR: [{ code: to }, { id: to }], isActive: true } }),
    ]);

    if (fromStation && toStation && fromStation.id === toStation.id) {
      next(createError('Source and destination cannot be the same', 400, 'SAME_STATION'));
      return;
    }
    if (from.toUpperCase() === to.toUpperCase()) {
      next(createError('Source and destination cannot be the same', 400, 'SAME_STATION'));
      return;
    }

    const routes = (fromStation && toStation)
      ? await prisma.route.findMany({
          where: {
            isActive: true,
            stations: {
              some: { stationId: fromStation.id },
            },
          },
          include: {
            stations: {
              include: { station: true },
              orderBy: { sequence: 'asc' },
            },
            schedules: {
              where: { isActive: true },
              include: {
                train: true,
                fareRules: true,
              },
            },
          },
        })
      : [];

    // Filter routes where fromStation appears BEFORE toStation
    const validSchedules: Array<{
      schedule: typeof routes[0]['schedules'][0];
      route: typeof routes[0];
      fromRS: typeof routes[0]['stations'][0];
      toRS: typeof routes[0]['stations'][0];
      fromStn: NonNullable<typeof fromStation>;
      toStn: NonNullable<typeof toStation>;
    }> = [];

    if (fromStation && toStation) {
      for (const route of routes) {
        const fromRS = route.stations.find(rs => rs.stationId === fromStation.id);
        const toRS = route.stations.find(rs => rs.stationId === toStation.id);

        if (!fromRS || !toRS) continue;
        if (fromRS.sequence >= toRS.sequence) continue; // wrong order

        for (const schedule of route.schedules) {
          if (scheduleRunsOnDate(schedule.runningDays, date)) {
            validSchedules.push({ schedule, route, fromRS, toRS, fromStn: fromStation, toStn: toStation });
          }
        }
      }
    }

    // For each valid schedule, ensure persisted TrainRun & inventory exists for date, then check availability
    const results = await Promise.all(validSchedules.map(async ({ schedule, route, fromRS, toRS, fromStn, toStn }) => {
      const trainRun = await ensureTrainRunInventory(schedule.id, date);

      // Calculate availability per class
      const now = new Date();
      const classAvailability: Record<string, { available: number; status: string; fare: number }> = {};

      for (const coach of trainRun.coaches) {
        const existing = classAvailability[coach.classType] || { available: 0, status: 'AVAILABLE', fare: 0 };

        for (const seat of coach.seats) {
          // Check if this seat has any conflicting allocation for our journey segment
          const isOccupied = seat.allocations.some(alloc => {
            // Skip expired locks
            if (alloc.status === 'LOCKED' && alloc.lockedUntil && alloc.lockedUntil < now) return false;
            if (alloc.status === 'RELEASED') return false;
            // Check segment overlap: our [fromSeq, toSeq] overlaps with existing [boardingSeq, alightingSeq]
            return alloc.boardingSeq < toRS.sequence && alloc.alightingSeq > fromRS.sequence;
          });

          if (!isOccupied) existing.available++;
        }

        classAvailability[coach.classType] = existing;
      }

      // Add fare info (base ticket fare without optional catering)
      for (const fareRule of schedule.fareRules) {
        const distanceKm = toRS.distanceKm - fromRS.distanceKm;
        const baseFare = Math.round((fareRule.baseFarePaise * distanceKm) / 100); // per 100 km
        const charges = fareRule.reservationCharge + fareRule.superfastCharge; // catering is optional add-on during booking
        const subtotal = (baseFare + charges) * passCount;
        const gst = Math.round(subtotal * fareRule.gstPercent / 100);
        const total = subtotal + gst;

        if (classAvailability[fareRule.classType]) {
          classAvailability[fareRule.classType].fare = total;
        }
      }

      // Determine departure/arrival times for this segment
      const depTime = fromRS.departureOffsetMin != null
        ? addMinutesToTime(schedule.departureTime, fromRS.departureOffsetMin)
        : schedule.departureTime;
      const arrTime = toRS.arrivalOffsetMin != null
        ? addMinutesToTime(schedule.departureTime, toRS.arrivalOffsetMin)
        : null;

      const durationMin = (toRS.arrivalOffsetMin ?? 0) - (fromRS.departureOffsetMin ?? 0);
      const distanceKm = toRS.distanceKm - fromRS.distanceKm;

      return {
        scheduleId: schedule.id,
        trainRunId: trainRun.id,
        train: {
          id: schedule.train.id,
          number: schedule.train.number,
          name: schedule.train.name,
          type: schedule.train.type,
        },
        route: {
          id: route.id,
          name: route.name,
          totalStops: route.stations.length,
          stops: route.stations.map(rs => ({
            sequence: rs.sequence,
            stationCode: rs.station.code,
            stationName: rs.station.name,
            arrivalOffset: rs.arrivalOffsetMin,
            departureOffset: rs.departureOffsetMin,
            distanceKm: rs.distanceKm,
            platform: rs.platformNumber,
          })),
        },
        fromStation: { code: fromStn.code, name: fromStn.name, sequence: fromRS.sequence },
        toStation: { code: toStn.code, name: toStn.name, sequence: toRS.sequence },
        journey: {
          fromStation: fromStn.code,
          toStation: toStn.code,
          fromStationName: fromStn.name,
          toStationName: toStn.name,
          departureTime: depTime,
          arrivalTime: arrTime,
          durationMinutes: durationMin,
          distanceKm,
          runDate: date,
        },
        departureTime: depTime,
        arrivalTime: arrTime,
        durationMin,
        distanceKm,
        runningDays: formatRunningDays(schedule.runningDays),
        classes: classAvailability,
        journeyDate: date,
      };
    }));

    const localResults = results.map((r) => ({
      ...r,
      bookable: true as const,
      provenance: {
        provenance: 'RAILFLOW_DEMO' as const,
        provenanceLabel: PROVENANCE_LABELS.RAILFLOW_DEMO,
        source: 'RAILFLOW_PRISMA_MASTER',
        providerName: 'RailFlow local timetable + sandbox inventory',
        isOfficial: false,
        isLive: false,
        cached: false,
        fetchedAt: new Date().toISOString(),
        freshnessSeconds: 0,
        limitations: [
          'Local seeded timetable and simulated berth inventory.',
          'Not an IRCTC PNR, fare, or availability feed.',
        ],
      },
    }));

    let irResults: any[] = [];
    try {
      irResults = await indianRailwayService.searchTrainsBetween(from, to, date);
    } catch (err) {
      console.warn('[trains] Indian Railway dataset search unavailable:', (err as Error).message);
    }

    let catalogResults: Awaited<ReturnType<typeof datameetService.searchTrainsBetween>> = [];
    try {
      catalogResults = await datameetService.searchTrainsBetween(from, to, date);
    } catch (err) {
      console.warn('[trains] DataMeet catalog search unavailable:', (err as Error).message);
    }

    const localNumbers = new Set(localResults.map((r) => r.train.number));
    const extraIr = irResults.filter((r) => !localNumbers.has(r.train.number));
    for (const r of extraIr) localNumbers.add(r.train.number);

    const extraCatalog = catalogResults.filter((r) => !localNumbers.has(r.train.number));
    const merged = [...localResults, ...extraIr, ...extraCatalog];
    merged.sort((a, b) => String(a.departureTime || '99:99').localeCompare(String(b.departureTime || '99:99')));

    if (merged.length === 0) {
      const [fromExists, toExists] = await Promise.all([
        fromStation ? true : indianRailwayService.getStation(from).then(Boolean),
        toStation ? true : indianRailwayService.getStation(to).then(Boolean),
      ]);

      if (!fromExists) {
        next(createError(`Source station '${from}' not found`, 404, 'STATION_NOT_FOUND'));
        return;
      }
      if (!toExists) {
        next(createError(`Destination station '${to}' not found`, 404, 'STATION_NOT_FOUND'));
        return;
      }
    }

    const irFrom = await indianRailwayService.getStation(from);
    const irTo = await indianRailwayService.getStation(to);
    const catalogFrom = extraIr[0]?.fromStation || extraCatalog[0]?.fromStation;
    const catalogTo = extraIr[0]?.toStation || extraCatalog[0]?.toStation;

    let alternatives: any = { nearbyStations: [], alternateDates: [], connectingJourneys: [] };
    try {
      alternatives = await (railSearchService as any).buildAlternatives({
        fromCode: from,
        fromName: fromStation?.name || catalogFrom?.name || irFrom?.name || from,
        toCode: to,
        toName: toStation?.name || catalogTo?.name || irTo?.name || to,
        dateStr: date,
        directCount: merged.length,
        directOnly: true,
      });
    } catch {
      // Non-blocking fallback for alternatives
    }

    res.json({
      success: true,
      data: {
        trains: merged,
        results: merged,
        fromStation: fromStation || (catalogFrom ? { code: catalogFrom.code, name: catalogFrom.name } : (irFrom ? { code: irFrom.code, name: irFrom.name } : { code: from, name: from })),
        toStation: toStation || (catalogTo ? { code: catalogTo.code, name: catalogTo.name } : (irTo ? { code: irTo.code, name: irTo.name } : { code: to, name: to })),
        journeyDate: date,
        passengers: passCount,
        alternatives,
        meta: {
          total: merged.length,
          localCount: localResults.length,
          catalogCount: extraIr.length + extraCatalog.length,
          catalogLimitations: extraIr.length > 0 ? IR_DATASET_LIMITATIONS : DATAMEET_LIMITATIONS,
          canonicalResolution: {
            fromResolvedFrom: fromRes.isAlias ? fromRes.originalInput : undefined,
            toResolvedFrom: toRes.isAlias ? toRes.originalInput : undefined,
            fromIsAlias: fromRes.isAlias,
            toIsAlias: toRes.isAlias,
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/trains/lookup?q=... ──────────────────────────────────────────
router.get('/lookup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    if (!q) {
      res.json({ success: true, data: { trains: [] } });
      return;
    }
    const trains = await prisma.train.findMany({
      where: {
        isActive: true,
        OR: [
          { number: { contains: q } },
          { name: { contains: q } },
        ],
      },
      include: {
        schedules: {
          where: { isActive: true },
          include: {
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
        },
      },
      take: 10,
    });

    const localNumbers = new Set(trains.map((t) => t.number));
    let irLookupTrains: any[] = [];
    try {
      const extraIr = await indianRailwayService.lookupTrains(q, 10);
      for (const t of extraIr) {
        if (!localNumbers.has(t.trainNumber)) {
          localNumbers.add(t.trainNumber);
          irLookupTrains.push({
            id: `ir:${t.trainNumber}`,
            number: t.trainNumber,
            name: t.trainName,
            type: t.type || 'EXPRESS',
            isActive: true,
            source: 'INDIAN_RAILWAY_OPEN_DATA',
            bookable: false,
            schedules: [
              {
                isActive: true,
                route: {
                  stations: [
                    { station: { code: t.source.code, name: t.source.name } },
                    { station: { code: t.destination.code, name: t.destination.name } },
                  ],
                },
              },
            ],
          });
        }
      }
    } catch (err) {
      console.warn('[trains] Indian Railway lookup unavailable:', (err as Error).message);
    }

    let catalogTrains: any[] = [];
    try {
      const extra = await datameetService.lookupTrains(q, 10);
      catalogTrains = extra
        .filter((t) => !localNumbers.has(t.number))
        .map((t) => ({
          id: `datameet:${t.number}`,
          number: t.number,
          name: t.name,
          type: t.type || 'UNKNOWN',
          isActive: true,
          source: 'DATAMEET_OPEN_DATA',
          bookable: false,
          schedules: [
            {
              isActive: true,
              route: {
                stations: [
                  { station: { code: t.fromStationCode, name: t.fromStationName } },
                  { station: { code: t.toStationCode, name: t.toStationName } },
                ],
              },
            },
          ],
        }));
    } catch (err) {
      console.warn('[trains] DataMeet lookup unavailable:', (err as Error).message);
    }

    const allLookup = [...trains, ...irLookupTrains, ...catalogTrains];
    const qClean = q.replace(/\s+/g, '').toUpperCase();
    allLookup.sort((a, b) => {
      const aNum = String(a.number).trim().toUpperCase();
      const bNum = String(b.number).trim().toUpperCase();
      const aExact = aNum === qClean;
      const bExact = bNum === qClean;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      const aPrefix = aNum.startsWith(qClean);
      const bPrefix = bNum.startsWith(qClean);
      if (aPrefix && !bPrefix) return -1;
      if (!aPrefix && bPrefix) return 1;
      return 0;
    });

    res.json({ success: true, data: { trains: allLookup.slice(0, 10) } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/trains/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const train = await prisma.train.findFirst({
      where: { OR: [{ id }, { number: id }], isActive: true },
      include: {
        schedules: {
          where: { isActive: true },
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
        },
      },
    });

    if (!train) {
      res.status(404).json({ success: false, error: 'Train not found', code: 'NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: { train } });
  } catch (err) {
    next(err);
  }
});

// ─── Helper: Add minutes to HH:MM time string ─────────────────────────────────
function addMinutesToTime(baseTime: string, offsetMin: number): string {
  const [hours, mins] = baseTime.split(':').map(Number);
  const totalMins = hours * 60 + mins + offsetMin;
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}


export default router;
