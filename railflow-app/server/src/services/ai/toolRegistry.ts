import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { ensureTrainRunInventory, scheduleRunsOnDate, formatRunningDays } from '../inventoryService';
import { calculateFare } from '../fareService';
import { trackingService } from '../tracking/trackingService';
import { ToolDefinition, AiRequestContext } from './types';

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [hours, mins] = timeStr.split(':').map(Number);
  const totalMinutes = (hours * 60 + mins + minutes) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const CITY_ALIASES: Record<string, string> = {
  delhi: 'NDLS',
  'new delhi': 'NDLS',
  dilli: 'NDLS',
  kolkata: 'HWH',
  calcutta: 'HWH',
  howrah: 'HWH',
  mumbai: 'MMCT',
  bombay: 'MMCT',
  kanpur: 'CNB',
  varanasi: 'BSB',
  kashi: 'BSB',
  banaras: 'BSB',
  benares: 'BSB',
  agra: 'AGC',
  chennai: 'MAS',
  madras: 'MAS',
  bengaluru: 'SBC',
  bangalore: 'SBC',
};

function normalizeJourneyDate(dateInput?: string): string {
  if (!dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  const clean = dateInput.trim().toLowerCase();
  const today = new Date();

  if (clean === 'today') {
    return today.toISOString().split('T')[0];
  }
  if (clean === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  if (clean.includes('day after tomorrow')) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  const parsed = new Date(dateInput);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  return fallback.toISOString().split('T')[0];
}

/**
 * Resolve a station query (code, name, or city) to a Station record
 */
async function resolveStation(query: string) {
  if (!query) return null;
  const clean = query.trim();
  const lower = clean.toLowerCase();

  // 1. Check known city aliases
  if (CITY_ALIASES[lower]) {
    const aliased = await prisma.station.findFirst({
      where: { code: CITY_ALIASES[lower], isActive: true },
    });
    if (aliased) return aliased;
  }

  // 2. Try exact code or id match
  let station = await prisma.station.findFirst({
    where: {
      OR: [{ code: clean.toUpperCase() }, { id: clean }],
      isActive: true,
    },
  });

  if (station) return station;

  // 3. Robust case-insensitive search across all active master stations
  const allStations = await prisma.station.findMany({ where: { isActive: true } });
  station =
    allStations.find(
      (s) =>
        s.code.toLowerCase() === lower ||
        s.name.toLowerCase().includes(lower) ||
        s.fullName.toLowerCase().includes(lower) ||
        lower.includes(s.name.toLowerCase()) ||
        lower.includes(s.code.toLowerCase())
    ) || null;

  return station;
}

// ─── TOOL DEFINITIONS ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_trains',
    description:
      'Search real-time Indian Railway train schedules, seat availability, and class fares between two stations on a specific date. Always call this tool to find real trains.',
    parameters: {
      type: 'object',
      properties: {
        fromStation: {
          type: 'string',
          description: 'Origin station name or railway code (e.g. "NDLS" or "New Delhi")',
        },
        toStation: {
          type: 'string',
          description: 'Destination station name or railway code (e.g. "BSB" or "Varanasi")',
        },
        date: {
          type: 'string',
          description: 'Journey date in YYYY-MM-DD format (must not be in the past)',
        },
        passengers: {
          type: 'integer',
          description: 'Number of passengers (1 to 6, default 1)',
        },
      },
      required: ['fromStation', 'toStation', 'date'],
    },
  },
  {
    name: 'get_fare',
    description:
      'Get the authoritative server-side fare calculation and transparent price breakdown (Base Fare, Reservation Charge, Superfast Charge, Catering, GST) for a specific train route and class.',
    parameters: {
      type: 'object',
      properties: {
        trainNumberOrScheduleId: {
          type: 'string',
          description: 'Train number (e.g. "22436", "12301") or schedule ID',
        },
        fromStationCode: {
          type: 'string',
          description: 'Origin station railway code (e.g. "NDLS")',
        },
        toStationCode: {
          type: 'string',
          description: 'Destination station railway code (e.g. "BSB")',
        },
        classType: {
          type: 'string',
          description:
            'Class of travel (ONE_AC, TWO_AC, THREE_AC, SLEEPER, CHAIR_CAR, EXEC_CHAIR, SECOND)',
          enum: ['ONE_AC', 'TWO_AC', 'THREE_AC', 'SLEEPER', 'CHAIR_CAR', 'EXEC_CHAIR', 'SECOND'],
        },
        passengers: {
          type: 'integer',
          description: 'Number of passengers (1 to 6, default 1)',
        },
      },
      required: ['trainNumberOrScheduleId', 'fromStationCode', 'toStationCode', 'classType'],
    },
  },
  {
    name: 'get_booking_status',
    description:
      "Check reservation status, coach/seat allocation, and itinerary details for a 10-digit PNR. Requires authenticated user and strictly enforces passenger ownership isolation.",
    parameters: {
      type: 'object',
      properties: {
        pnr: {
          type: 'string',
          description: 'The 10-digit Passenger Name Record (PNR) number',
        },
      },
      required: ['pnr'],
    },
    requireAuth: true,
  },
  {
    name: 'get_my_bookings',
    description:
      "Retrieve the authenticated passenger's active and past train bookings and PNRs from RailFlow.",
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    requireAuth: true,
  },
  {
    name: 'get_train_running_status',
    description:
      'Get live or scheduled running status, delay information, and current station for a train using the ChukChuk tracking integration and timetable telemetry.',
    parameters: {
      type: 'object',
      properties: {
        trainNumber: {
          type: 'string',
          description: '4 or 5 digit train number (e.g. "22436", "12301")',
        },
        date: {
          type: 'string',
          description: 'Optional date for the train run (YYYY-MM-DD)',
        },
      },
      required: ['trainNumber'],
    },
  },
];

// ─── VALIDATION SCHEMAS ──────────────────────────────────────────────────────

const searchTrainsSchema = z.object({
  fromStation: z.string().min(2, 'Origin station is required'),
  toStation: z.string().min(2, 'Destination station is required'),
  date: z.string().optional().transform((val) => normalizeJourneyDate(val)),
  passengers: z.coerce.number().min(1).max(6).default(1),
});

const getFareSchema = z.object({
  trainNumberOrScheduleId: z.string().min(1),
  fromStationCode: z.string().min(2),
  toStationCode: z.string().min(2),
  classType: z.enum([
    'ONE_AC',
    'TWO_AC',
    'THREE_AC',
    'SLEEPER',
    'CHAIR_CAR',
    'EXEC_CHAIR',
    'SECOND',
  ]),
  passengers: z.coerce.number().min(1).max(6).default(1),
});

const getBookingSchema = z.object({
  pnr: z.string().regex(/^\d{10}$/, 'PNR must be exactly 10 digits'),
});

const getRunningStatusSchema = z.object({
  trainNumber: z.string().regex(/^\d{4,5}$/, 'Train number must be 4 or 5 digits'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── TOOL EXECUTION DISPATCHER ───────────────────────────────────────────────

export class ToolRegistry {
  public static getDefinitions(): ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  public static async executeTool(
    name: string,
    args: Record<string, any>,
    context: AiRequestContext
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    switch (name) {
      case 'search_trains':
        return await ToolRegistry.handleSearchTrains(args);
      case 'get_fare':
        return await ToolRegistry.handleGetFare(args);
      case 'get_booking_status':
        return await ToolRegistry.handleGetBookingStatus(args, context);
      case 'get_my_bookings':
        return await ToolRegistry.handleGetMyBookings(context);
      case 'get_train_running_status':
        return await ToolRegistry.handleGetRunningStatus(args);
      default:
        return {
          success: false,
          error: `Unknown tool "${name}". Only verified RailFlow tools are permitted.`,
        };
    }
  }

  private static async handleSearchTrains(rawArgs: Record<string, any>) {
    const parse = searchTrainsSchema.safeParse(rawArgs);
    if (!parse.success) {
      return { success: false, error: parse.error.errors.map((e) => e.message).join(', ') };
    }

    const { fromStation: fromQuery, toStation: toQuery, date, passengers } = parse.data;

    // Validate date is not in past
    const journeyDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (journeyDate < today) {
      return {
        success: false,
        error: `Journey date ${date} cannot be in the past. Today is ${today.toISOString().split('T')[0]}.`,
      };
    }

    const [fromStation, toStation] = await Promise.all([
      resolveStation(fromQuery),
      resolveStation(toQuery),
    ]);

    if (!fromStation) {
      return { success: false, error: `Origin station "${fromQuery}" could not be found in RailFlow master data.` };
    }
    if (!toStation) {
      return { success: false, error: `Destination station "${toQuery}" could not be found in RailFlow master data.` };
    }
    if (fromStation.id === toStation.id) {
      return { success: false, error: 'Origin and destination stations cannot be the same.' };
    }

    // Find routes containing both stations
    const routes = await prisma.route.findMany({
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
    });

    const validSchedules: Array<{
      schedule: (typeof routes)[0]['schedules'][0];
      route: (typeof routes)[0];
      fromRS: (typeof routes)[0]['stations'][0];
      toRS: (typeof routes)[0]['stations'][0];
    }> = [];

    for (const route of routes) {
      const fromRS = route.stations.find((rs) => rs.stationId === fromStation.id);
      const toRS = route.stations.find((rs) => rs.stationId === toStation.id);

      if (!fromRS || !toRS) continue;
      if (fromRS.sequence >= toRS.sequence) continue;

      for (const schedule of route.schedules) {
        if (scheduleRunsOnDate(schedule.runningDays, date)) {
          validSchedules.push({ schedule, route, fromRS, toRS });
        }
      }
    }

    if (validSchedules.length === 0) {
      return {
        success: true,
        data: {
          origin: { code: fromStation.code, name: fromStation.name },
          destination: { code: toStation.code, name: toStation.name },
          date,
          trainCount: 0,
          trains: [],
          message: `No trains operate between ${fromStation.name} (${fromStation.code}) and ${toStation.name} (${toStation.code}) on ${date}.`,
        },
      };
    }

    const trains = await Promise.all(
      validSchedules.map(async ({ schedule, fromRS, toRS }) => {
        const trainRun = await ensureTrainRunInventory(schedule.id, date);
        const now = new Date();
        const classAvailability: Record<string, { available: number; fareRupees: number }> = {};

        for (const coach of trainRun.coaches) {
          const existing = classAvailability[coach.classType] || { available: 0, fareRupees: 0 };
          for (const seat of coach.seats) {
            const isOccupied = seat.allocations.some((alloc) => {
              if (alloc.status === 'LOCKED' && alloc.lockedUntil && alloc.lockedUntil < now) return false;
              if (alloc.status === 'RELEASED') return false;
              return alloc.boardingSeq < toRS.sequence && alloc.alightingSeq > fromRS.sequence;
            });
            if (!isOccupied) existing.available++;
          }
          classAvailability[coach.classType] = existing;
        }

        // Calculate fares in ₹
        for (const fareRule of schedule.fareRules) {
          const distanceKm = toRS.distanceKm - fromRS.distanceKm;
          const baseFare = Math.round((fareRule.baseFarePaise * distanceKm) / 100);
          const charges = fareRule.reservationCharge + fareRule.superfastCharge + fareRule.cateringCharge;
          const subtotal = (baseFare + charges) * passengers;
          const gst = Math.round((subtotal * fareRule.gstPercent) / 100);
          const totalPaise = subtotal + gst;

          if (classAvailability[fareRule.classType]) {
            classAvailability[fareRule.classType].fareRupees = Math.round(totalPaise / 100);
          }
        }

        const depTime =
          fromRS.departureOffsetMin != null
            ? addMinutesToTime(schedule.departureTime, fromRS.departureOffsetMin)
            : schedule.departureTime;
        const arrTime =
          toRS.arrivalOffsetMin != null
            ? addMinutesToTime(schedule.departureTime, toRS.arrivalOffsetMin)
            : null;

        const durationMin = (toRS.arrivalOffsetMin ?? 0) - (fromRS.departureOffsetMin ?? 0);
        const durationHours = Math.floor(durationMin / 60);
        const durationRemMin = durationMin % 60;
        const durationFormatted = `${durationHours}h ${durationRemMin}m`;

        return {
          trainNumber: schedule.train.number,
          trainName: schedule.train.name,
          trainType: schedule.train.type,
          scheduleId: schedule.id,
          trainRunId: trainRun.id,
          fromStationCode: fromStation.code,
          toStationCode: toStation.code,
          journeyDate: date,
          departureTime: depTime,
          arrivalTime: arrTime,
          duration: durationFormatted,
          distanceKm: toRS.distanceKm - fromRS.distanceKm,
          classes: classAvailability,
        };
      })
    );

    trains.sort((a, b) => a.departureTime.localeCompare(b.departureTime));

    return {
      success: true,
      data: {
        origin: { code: fromStation.code, name: fromStation.name },
        destination: { code: toStation.code, name: toStation.name },
        date,
        passengers,
        trainCount: trains.length,
        trains,
      },
    };
  }

  private static async handleGetFare(rawArgs: Record<string, any>) {
    const parse = getFareSchema.safeParse(rawArgs);
    if (!parse.success) {
      return { success: false, error: parse.error.errors.map((e) => e.message).join(', ') };
    }

    const { trainNumberOrScheduleId, fromStationCode, toStationCode, classType, passengers } =
      parse.data;

    let scheduleId = trainNumberOrScheduleId;
    // If given a train number, look up the schedule
    if (/^\d{4,5}$/.test(trainNumberOrScheduleId)) {
      const train = await prisma.train.findUnique({
        where: { number: trainNumberOrScheduleId },
        include: { schedules: { where: { isActive: true }, take: 1 } },
      });
      if (!train || train.schedules.length === 0) {
        return { success: false, error: `Train ${trainNumberOrScheduleId} not found in active schedules.` };
      }
      scheduleId = train.schedules[0].id;
    }

    const fare = await calculateFare(scheduleId, fromStationCode, toStationCode, classType, passengers);
    if (!fare) {
      return {
        success: false,
        error: `Could not calculate fare for ${classType} from ${fromStationCode} to ${toStationCode}.`,
      };
    }

    return {
      success: true,
      data: {
        classType,
        passengers,
        distanceKm: fare.distanceKm,
        breakdownRupees: {
          baseFare: (fare.baseFarePaise / 100).toFixed(2),
          reservationCharge: (fare.reservationCharge / 100).toFixed(2),
          superfastCharge: (fare.superfastCharge / 100).toFixed(2),
          cateringCharge: (fare.cateringCharge / 100).toFixed(2),
          subtotal: (fare.subtotalPaise / 100).toFixed(2),
          gst: (fare.gstPaise / 100).toFixed(2),
          total: (fare.totalPaise / 100).toFixed(2),
        },
      },
    };
  }

  private static async handleGetBookingStatus(
    rawArgs: Record<string, any>,
    context: AiRequestContext
  ) {
    if (!context.userId) {
      return {
        success: false,
        error:
          'AUTHENTICATION_REQUIRED: You must be logged in to inspect personal booking details or PNR statuses. Please sign in to RailFlow first.',
      };
    }

    const parse = getBookingSchema.safeParse(rawArgs);
    if (!parse.success) {
      return { success: false, error: parse.error.errors.map((e) => e.message).join(', ') };
    }

    const { pnr } = parse.data;

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
      },
    });

    if (!booking) {
      return {
        success: false,
        error: `No booking found for PNR ${pnr}. Please check the 10-digit number.`,
      };
    }

    // Strict ownership verification: cannot view other users' bookings
    if (booking.userId !== context.userId && context.userRole !== 'ADMIN') {
      return {
        success: false,
        error: `No booking found for PNR ${pnr} on your account.`,
      };
    }

    const routeStations = booking.trainRun.schedule.route.stations;
    const fromStation = routeStations.find((rs) => rs.sequence === booking.fromRouteStationSeq)?.station;
    const toStation = routeStations.find((rs) => rs.sequence === booking.toRouteStationSeq)?.station;

    return {
      success: true,
      data: {
        pnr: booking.pnr,
        status: booking.status,
        journeyDate: booking.trainRun.runDate,
        train: {
          number: booking.trainRun.schedule.train.number,
          name: booking.trainRun.schedule.train.name,
        },
        fromStation: fromStation ? { code: fromStation.code, name: fromStation.name } : { code: 'NDLS', name: 'New Delhi' },
        toStation: toStation ? { code: toStation.code, name: toStation.name } : { code: 'BSB', name: 'Varanasi' },
        classType: booking.classType,
        totalFareRupees: Math.round(booking.totalFarePaise / 100),
        passengers: booking.passengers.map((p) => ({
          name: p.name,
          age: p.age,
          gender: p.gender,
          coach: p.allocation?.allocatedCoach || 'Unassigned',
          seatNumber: p.allocation?.allocatedSeatNumber || 'Unassigned',
          berth: p.berthPreference,
          allocationStatus: p.allocation?.status || 'PENDING',
        })),
        createdAt: booking.createdAt.toISOString(),
      },
    };
  }

  private static async handleGetMyBookings(context: AiRequestContext) {
    if (!context.userId) {
      return {
        success: false,
        error:
          'AUTHENTICATION_REQUIRED: You must be logged in to view your RailFlow bookings. Please sign in to RailFlow first.',
      };
    }

    const bookings = await prisma.booking.findMany({
      where: { userId: context.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        passengers: {
          include: { allocation: true },
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
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      data: {
        bookingCount: bookings.length,
        bookings: bookings.map((b) => {
          const rStations = b.trainRun.schedule.route.stations;
          const fStation = rStations.find((rs) => rs.sequence === b.fromRouteStationSeq)?.station;
          const tStation = rStations.find((rs) => rs.sequence === b.toRouteStationSeq)?.station;
          return {
            pnr: b.pnr,
            status: b.status,
            date: b.trainRun.runDate,
            train: `${b.trainRun.schedule.train.number} ${b.trainRun.schedule.train.name}`,
            route: `${fStation?.code || 'ORIGIN'} → ${tStation?.code || 'DEST'}`,
            passengersCount: b.passengers.length,
            totalFareRupees: Math.round(b.totalFarePaise / 100),
          };
        }),
      },
    };
  }

  private static async handleGetRunningStatus(rawArgs: Record<string, any>) {
    const parse = getRunningStatusSchema.safeParse(rawArgs);
    if (!parse.success) {
      return { success: false, error: parse.error.errors.map((e) => e.message).join(', ') };
    }

    const { trainNumber, date } = parse.data;

    try {
      const status = await trackingService.getRunningStatus(trainNumber, date);
      const isLate = status.delayMinutes != null && status.delayMinutes > 0;
      const stationInfo = status.lastReportedStation || (status.stops.length > 0 ? status.stops[0] : null);
      const stationName = stationInfo ? ('name' in stationInfo ? stationInfo.name : stationInfo.stationName) : 'En route';
      const stationCode = stationInfo ? ('code' in stationInfo ? stationInfo.code : stationInfo.stationCode) : '';

      return {
        success: true,
        data: {
          trainNumber: status.trainNumber,
          trainName: status.trainName,
          status: status.status,
          currentStation: stationInfo ? { code: stationCode, name: stationName } : null,
          delayMinutes: status.delayMinutes ?? 0,
          isDelayed: isLate,
          source: status.meta.source,
          providerName: status.meta.providerName,
          isRealtimeFeed: status.meta.isRealtimeFeed,
          lastUpdated: status.meta.observationTimestamp,
          statusSummary: isLate
            ? `Running ${status.delayMinutes} min late near ${stationName} (${stationCode})`
            : `Running on time near ${stationName} (${stationCode})`,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Unable to fetch running status for train ${trainNumber}: ${err.message}`,
      };
    }
  }
}
