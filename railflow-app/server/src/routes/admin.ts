import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { requireAdmin } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { indianRailwayService } from '../services/indianRailwayService';

const router = Router();
router.use(requireAdmin);

// ─── Schemas (strict: unknown fields are rejected with 400) ──────────────────
// Using .strict() ensures any field not listed here causes a validation error.
// This prevents mass-assignment even if the validate() middleware were bypassed.

const trainCreateSchema = z.object({
  number: z.string().regex(/^\d{5}$/, 'Train number must be exactly 5 digits'),
  name: z.string().min(3).max(100),
  type: z.enum(['VANDE_BHARAT', 'RAJDHANI', 'SHATABDI', 'DURONTO', 'SUPERFAST', 'MAIL_EXPRESS', 'PASSENGER']),
  isActive: z.boolean().default(true),
}).strict();

// Partial update schema — also strict so unknown fields are still rejected
const trainUpdateSchema = z.object({
  number: z.string().regex(/^\d{5}$/, 'Train number must be exactly 5 digits').optional(),
  name: z.string().min(3).max(100).optional(),
  type: z.enum(['VANDE_BHARAT', 'RAJDHANI', 'SHATABDI', 'DURONTO', 'SUPERFAST', 'MAIL_EXPRESS', 'PASSENGER']).optional(),
  isActive: z.boolean().optional(),
}).strict();

const stationCreateSchema = z.object({
  code: z.string().min(2).max(8).toUpperCase(),
  name: z.string().min(2).max(100),
  fullName: z.string().min(2).max(200),
  zone: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  isActive: z.boolean().default(true),
}).strict();

const stationUpdateSchema = z.object({
  code: z.string().min(2).max(8).toUpperCase().optional(),
  name: z.string().min(2).max(100).optional(),
  fullName: z.string().min(2).max(200).optional(),
  zone: z.string().min(2).max(100).optional(),
  state: z.string().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
}).strict();

const routeCreateSchema = z.object({
  name: z.string().min(3).max(200),
  isActive: z.boolean().default(true),
}).strict();

const routeUpdateSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  isActive: z.boolean().optional(),
}).strict();

const routeStationCreateSchema = z.object({
  routeId: z.string().min(1),
  stationId: z.string().min(1),
  sequence: z.number().int().min(1),
  arrivalOffsetMin: z.number().int().min(0).optional().nullable(),
  departureOffsetMin: z.number().int().min(0).optional().nullable(),
  distanceKm: z.number().int().min(0),
  platformNumber: z.string().optional().nullable(),
  haltDurationMin: z.number().int().min(0).default(2),
}).strict();

// Update schema: routeId and stationId intentionally excluded — cannot re-parent a stop
const routeStationUpdateSchema = z.object({
  sequence: z.number().int().min(1).optional(),
  arrivalOffsetMin: z.number().int().min(0).optional().nullable(),
  departureOffsetMin: z.number().int().min(0).optional().nullable(),
  distanceKm: z.number().int().min(0).optional(),
  platformNumber: z.string().optional().nullable(),
  haltDurationMin: z.number().int().min(0).optional(),
}).strict();

const scheduleCreateSchema = z.object({
  trainId: z.string().min(1),
  routeId: z.string().min(1),
  runningDays: z.number().int().min(1).max(127),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be HH:MM in 24h format'),
  isActive: z.boolean().default(true),
}).strict();

// Update schema: trainId and routeId intentionally excluded — cannot re-parent a schedule
const scheduleUpdateSchema = z.object({
  runningDays: z.number().int().min(1).max(127).optional(),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be HH:MM in 24h format').optional(),
  isActive: z.boolean().optional(),
}).strict();

const fareRuleCreateSchema = z.object({
  scheduleId: z.string().min(1),
  classType: z.enum(['ONE_AC', 'TWO_AC', 'THREE_AC', 'SLEEPER', 'CHAIR_CAR', 'EXEC_CHAIR', 'SECOND']),
  baseFarePaise: z.number().int().min(0),
  reservationCharge: z.number().int().min(0).default(6000),
  superfastCharge: z.number().int().min(0).default(4500),
  cateringCharge: z.number().int().min(0).default(0),
  gstPercent: z.number().int().min(0).max(30).default(5),
  isActive: z.boolean().default(true),
}).strict();

// Update schema: scheduleId and classType intentionally excluded
const fareRuleUpdateSchema = z.object({
  baseFarePaise: z.number().int().min(0).optional(),
  reservationCharge: z.number().int().min(0).optional(),
  superfastCharge: z.number().int().min(0).optional(),
  cateringCharge: z.number().int().min(0).optional(),
  gstPercent: z.number().int().min(0).max(30).optional(),
  isActive: z.boolean().optional(),
}).strict();

// ─── TRAINS CRUD ──────────────────────────────────────────────────────────────
router.get('/trains', async (_req, res, next) => {
  try {
    const trains = await prisma.train.findMany({ orderBy: { number: 'asc' } });
    res.json({ success: true, data: { trains } });
  } catch (err) { next(err); }
});

router.post('/trains', validate(trainCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Explicitly construct the data object — never forward req.body directly
    const { number, name, type, isActive } = req.body as z.infer<typeof trainCreateSchema>;
    const train = await prisma.train.create({ data: { number, name, type, isActive } });
    res.status(201).json({ success: true, data: { train } });
  } catch (err) { next(err); }
});

router.put('/trains/:id', validate(trainUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { number, name, type, isActive } = req.body as z.infer<typeof trainUpdateSchema>;
    // Build the update object only with fields that were provided
    const data: Record<string, unknown> = {};
    if (number !== undefined) data.number = number;
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (isActive !== undefined) data.isActive = isActive;

    const train = await prisma.train.update({ where: { id }, data });
    res.json({ success: true, data: { train } });
  } catch (err) { next(err); }
});

router.delete('/trains/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await prisma.train.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true, message: 'Train deactivated' });
  } catch (err) { next(err); }
});

// ─── STATIONS CRUD ────────────────────────────────────────────────────────────
router.get('/stations', async (_req, res, next) => {
  try {
    const stations = await prisma.station.findMany({ orderBy: { code: 'asc' } });
    res.json({ success: true, data: { stations } });
  } catch (err) { next(err); }
});

router.post('/stations', validate(stationCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, name, fullName, zone, state, isActive } = req.body as z.infer<typeof stationCreateSchema>;
    const station = await prisma.station.create({ data: { code, name, fullName, zone, state, isActive } });
    res.status(201).json({ success: true, data: { station } });
  } catch (err) { next(err); }
});

router.put('/stations/:id', validate(stationUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { code, name, fullName, zone, state, isActive } = req.body as z.infer<typeof stationUpdateSchema>;
    const data: Record<string, unknown> = {};
    if (code !== undefined) data.code = code;
    if (name !== undefined) data.name = name;
    if (fullName !== undefined) data.fullName = fullName;
    if (zone !== undefined) data.zone = zone;
    if (state !== undefined) data.state = state;
    if (isActive !== undefined) data.isActive = isActive;

    const station = await prisma.station.update({ where: { id }, data });
    res.json({ success: true, data: { station } });
  } catch (err) { next(err); }
});

// ─── ROUTES CRUD ──────────────────────────────────────────────────────────────
router.get('/routes', async (_req, res, next) => {
  try {
    const routes = await prisma.route.findMany({
      include: { stations: { include: { station: true }, orderBy: { sequence: 'asc' } } },
    });
    res.json({ success: true, data: { routes } });
  } catch (err) { next(err); }
});

router.post('/routes', validate(routeCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, isActive } = req.body as z.infer<typeof routeCreateSchema>;
    const route = await prisma.route.create({ data: { name, isActive } });
    res.status(201).json({ success: true, data: { route } });
  } catch (err) { next(err); }
});

router.put('/routes/:id', validate(routeUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, isActive } = req.body as z.infer<typeof routeUpdateSchema>;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (isActive !== undefined) data.isActive = isActive;

    const route = await prisma.route.update({ where: { id }, data });
    res.json({ success: true, data: { route } });
  } catch (err) { next(err); }
});

// ─── ROUTE STATIONS ───────────────────────────────────────────────────────────
router.post('/route-stations', validate(routeStationCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { routeId, stationId, sequence, arrivalOffsetMin, departureOffsetMin, distanceKm, platformNumber, haltDurationMin } =
      req.body as z.infer<typeof routeStationCreateSchema>;
    const rs = await prisma.routeStation.create({
      data: { routeId, stationId, sequence, arrivalOffsetMin, departureOffsetMin, distanceKm, platformNumber, haltDurationMin },
    });
    res.status(201).json({ success: true, data: { routeStation: rs } });
  } catch (err) { next(err); }
});

router.put('/route-stations/:id', validate(routeStationUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { sequence, arrivalOffsetMin, departureOffsetMin, distanceKm, platformNumber, haltDurationMin } =
      req.body as z.infer<typeof routeStationUpdateSchema>;
    const data: Record<string, unknown> = {};
    if (sequence !== undefined) data.sequence = sequence;
    if (arrivalOffsetMin !== undefined) data.arrivalOffsetMin = arrivalOffsetMin;
    if (departureOffsetMin !== undefined) data.departureOffsetMin = departureOffsetMin;
    if (distanceKm !== undefined) data.distanceKm = distanceKm;
    if (platformNumber !== undefined) data.platformNumber = platformNumber;
    if (haltDurationMin !== undefined) data.haltDurationMin = haltDurationMin;

    const rs = await prisma.routeStation.update({ where: { id }, data });
    res.json({ success: true, data: { routeStation: rs } });
  } catch (err) { next(err); }
});

// ─── SCHEDULES CRUD ───────────────────────────────────────────────────────────
router.get('/schedules', async (_req, res, next) => {
  try {
    const schedules = await prisma.trainSchedule.findMany({
      include: { train: true, route: true },
    });
    res.json({ success: true, data: { schedules } });
  } catch (err) { next(err); }
});

router.post('/schedules', validate(scheduleCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { trainId, routeId, runningDays, departureTime, isActive } = req.body as z.infer<typeof scheduleCreateSchema>;
    const schedule = await prisma.trainSchedule.create({ data: { trainId, routeId, runningDays, departureTime, isActive } });
    res.status(201).json({ success: true, data: { schedule } });
  } catch (err) { next(err); }
});

router.put('/schedules/:id', validate(scheduleUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { runningDays, departureTime, isActive } = req.body as z.infer<typeof scheduleUpdateSchema>;
    const data: Record<string, unknown> = {};
    if (runningDays !== undefined) data.runningDays = runningDays;
    if (departureTime !== undefined) data.departureTime = departureTime;
    if (isActive !== undefined) data.isActive = isActive;

    const schedule = await prisma.trainSchedule.update({ where: { id }, data });
    res.json({ success: true, data: { schedule } });
  } catch (err) { next(err); }
});

// ─── FARE RULES CRUD ──────────────────────────────────────────────────────────
router.get('/fare-rules', async (_req, res, next) => {
  try {
    const fareRules = await prisma.fareRule.findMany({
      include: { schedule: { include: { train: true } } },
    });
    res.json({ success: true, data: { fareRules } });
  } catch (err) { next(err); }
});

router.post('/fare-rules', validate(fareRuleCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduleId, classType, baseFarePaise, reservationCharge, superfastCharge, cateringCharge, gstPercent, isActive } =
      req.body as z.infer<typeof fareRuleCreateSchema>;
    const fareRule = await prisma.fareRule.create({
      data: { scheduleId, classType, baseFarePaise, reservationCharge, superfastCharge, cateringCharge, gstPercent, isActive },
    });
    res.status(201).json({ success: true, data: { fareRule } });
  } catch (err) { next(err); }
});

router.put('/fare-rules/:id', validate(fareRuleUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { baseFarePaise, reservationCharge, superfastCharge, cateringCharge, gstPercent, isActive } =
      req.body as z.infer<typeof fareRuleUpdateSchema>;
    const data: Record<string, unknown> = {};
    if (baseFarePaise !== undefined) data.baseFarePaise = baseFarePaise;
    if (reservationCharge !== undefined) data.reservationCharge = reservationCharge;
    if (superfastCharge !== undefined) data.superfastCharge = superfastCharge;
    if (cateringCharge !== undefined) data.cateringCharge = cateringCharge;
    if (gstPercent !== undefined) data.gstPercent = gstPercent;
    if (isActive !== undefined) data.isActive = isActive;

    const fareRule = await prisma.fareRule.update({ where: { id }, data });
    res.json({ success: true, data: { fareRule } });
  } catch (err) { next(err); }
});

// ─── BOOKINGS (Admin view) ────────────────────────────────────────────────────
router.get('/bookings', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: status ? { status } : undefined,
        include: {
          user: { select: { name: true, email: true } },
          trainRun: { include: { schedule: { include: { train: true } } } },
          passengers: { orderBy: { passengerIndex: 'asc' } },
          cancellation: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where: status ? { status } : undefined }),
    ]);

    res.json({ success: true, data: { bookings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (err) { next(err); }
});

// ─── TRANSACTIONS (Admin view) ────────────────────────────────────────────────
router.get('/transactions', async (_req, res, next) => {
  try {
    const transactions = await prisma.paymentTransaction.findMany({
      include: {
        booking: {
          select: { pnr: true, user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: { transactions } });
  } catch (err) { next(err); }
});

// ─── REPORTS & SUMMARY ────────────────────────────────────────────────────────
router.get(['/summary', '/reports/summary'], async (_req, res, next) => {
  try {
    const [totalUsers, totalStations, totalTrains, totalBookings, confirmedBookings, cancelledBookings, revenue] = await Promise.all([
      prisma.user.count(),
      prisma.station.count({ where: { isActive: true } }),
      prisma.train.count({ where: { isActive: true } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'CONFIRMED' } }),
      prisma.booking.count({ where: { status: 'CANCELLED' } }),
      prisma.paymentTransaction.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amountPaise: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          totalStations,
          totalTrains,
          totalBookings,
          confirmedBookings,
          cancelledBookings,
          pendingBookings: totalBookings - confirmedBookings - cancelledBookings,
          totalRevenuePaise: revenue._sum.amountPaise || 0,
          note: 'Revenue figures reflect simulated demo payments only.',
        },
      },
    });
  } catch (err) { next(err); }
});

router.get('/reports/popular-routes', async (_req, res, next) => {
  try {
    const popularRoutes = await prisma.booking.groupBy({
      by: ['trainRunId'],
      _count: { id: true },
      where: { status: 'CONFIRMED' },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    res.json({ success: true, data: { popularRoutes } });
  } catch (err) { next(err); }
});

// ─── DATA HEALTH & SOURCE STATUS ─────────────────────────────────────────────
router.get(['/data-health', '/reports/data-health'], async (_req, res, next) => {
  try {
    const [
      prismaStations,
      prismaTrains,
      prismaRoutes,
      prismaSchedules,
      dataSources,
      syncRuns,
    ] = await Promise.all([
      prisma.station.count(),
      prisma.train.count(),
      prisma.route.count(),
      prisma.trainSchedule.count(),
      prisma.dataSource.findMany(),
      prisma.syncRun.findMany({ take: 5, orderBy: { startedAt: 'desc' } }),
    ]);

    const irStationCount = indianRailwayService.getStationCount();
    const irTrainCount = indianRailwayService.getTrainCount();
    const allStations = indianRailwayService.getAllStations();
    const quarantinedCount = allStations.filter(s => s.code.startsWith('XX-') || s.code.startsWith('YY-')).length;

    res.json({
      success: true,
      data: {
        status: 'HEALTHY',
        timestamp: new Date().toISOString(),
        summary: {
          totalStationsAvailable: irStationCount + prismaStations,
          totalTrainsAvailable: irTrainCount + prismaTrains,
          quarantinedStationsCount: quarantinedCount,
          activeCityClustersCount: 17,
        },
        sources: [
          {
            name: 'INDIAN_RAILWAY_OPEN_DATA',
            type: 'OPEN_DATASET',
            provider: 'prasenjit-27/Indian-Railway-Data (MIT License)',
            recordCounts: {
              stations: irStationCount,
              trains: irTrainCount,
              quarantined: quarantinedCount,
            },
            status: 'ACTIVE',
            isOfficial: false,
            notes: 'Static scheduled timetable. Live PRS booking inventory requires official CRIS gateway.',
          },
          {
            name: 'RAILFLOW_PRISMA_MASTER',
            type: 'PRISMA_SQLITE',
            provider: 'RailFlow Internal High-Concurrency Database',
            recordCounts: {
              stations: prismaStations,
              trains: prismaTrains,
              routes: prismaRoutes,
              schedules: prismaSchedules,
            },
            status: 'ACTIVE',
            isOfficial: true,
            notes: 'High-concurrency SQLite dev.db with serializable isolation & coach inventory.',
          },
        ],
        syncRuns,
        features: {
          canonicalStationSearch: true,
          aliasTranslation: true,
          connectingJourneys: true,
          nearbyStationRecommendations: true,
          alternateDateSuggestions: true,
          quarantineFiltering: true,
        },
      },
    });
  } catch (err) { next(err); }
});

export default router;

