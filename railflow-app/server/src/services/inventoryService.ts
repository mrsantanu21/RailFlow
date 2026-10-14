import { prisma } from '../db/prisma';

export interface SeatTemplate {
  seatNumber: number;
  berthType: string;
}

export interface CoachTemplate {
  coachNumber: string;
  classType: string;
  totalSeats: number;
  seats: SeatTemplate[];
}

/**
 * Checks whether a train schedule operates on a given date (YYYY-MM-DD).
 * runningDays is a 7-bit bitmask where bit 0 is Monday and bit 6 is Sunday.
 */
export function scheduleRunsOnDate(runningDays: number, dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const bitIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0 = Mon, ..., 6 = Sun
  return (runningDays & (1 << bitIndex)) !== 0;
}

/**
 * Returns human-readable representation of running days.
 */
export function formatRunningDays(runningDays: number): string {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const running = days.filter((_, i) => (runningDays & (1 << i)) !== 0);
  if (running.length === 7) return 'Runs Daily';
  if (running.length === 0) return 'Not scheduled';
  return `Runs: ${running.join(' ')}`;
}

const BERTH_TYPES_SLEEPER = ['LOWER', 'MIDDLE', 'UPPER', 'LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'];
const BERTH_TYPES_2A = ['LOWER', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'];
const BERTH_TYPES_1A = ['LOWER', 'UPPER'];
const BERTH_TYPES_CHAIR = ['WINDOW', 'AISLE'];

/**
 * Standard coach configurations by class type if no template TrainRun exists.
 */
function getStandardSeatsForClass(classType: string, seatCount: number): SeatTemplate[] {
  const seats: SeatTemplate[] = [];
  let berthList: string[];

  switch (classType) {
    case 'EXEC_CHAIR':
    case 'CHAIR_CAR':
    case 'SECOND':
      berthList = BERTH_TYPES_CHAIR;
      break;
    case 'ONE_AC':
      berthList = BERTH_TYPES_1A;
      break;
    case 'TWO_AC':
      berthList = BERTH_TYPES_2A;
      break;
    case 'THREE_AC':
    case 'SLEEPER':
    default:
      berthList = BERTH_TYPES_SLEEPER;
      break;
  }

  for (let sNum = 1; sNum <= seatCount; sNum++) {
    seats.push({
      seatNumber: sNum,
      berthType: berthList[(sNum - 1) % berthList.length],
    });
  }
  return seats;
}

/**
 * Retrieves the coach & seat layout template for a given schedule.
 * Strategy:
 * 1. Inspect existing TrainRuns for this schedule. If any run has seeded coaches,
 *    replicate its exact coach numbers, class types, seat counts, and berth assignments.
 * 2. If no existing run has coaches, generate coaches based on the schedule's active FareRules.
 */
export async function getCoachTemplateForSchedule(scheduleId: string): Promise<CoachTemplate[]> {
  // Strategy 1: Check existing TrainRun with coaches for this schedule
  const existingRunWithCoaches = await prisma.trainRun.findFirst({
    where: {
      scheduleId,
      coaches: { some: {} },
    },
    include: {
      coaches: {
        include: {
          seats: {
            orderBy: { seatNumber: 'asc' },
          },
        },
        orderBy: { coachNumber: 'asc' },
      },
    },
  });

  if (existingRunWithCoaches && existingRunWithCoaches.coaches.length > 0) {
    return existingRunWithCoaches.coaches.map((c) => ({
      coachNumber: c.coachNumber,
      classType: c.classType,
      totalSeats: c.totalSeats,
      seats: c.seats.map((s) => ({
        seatNumber: s.seatNumber,
        berthType: s.berthType,
      })),
    }));
  }

  // Strategy 2: Derive from schedule's FareRules
  const schedule = await prisma.trainSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      fareRules: { where: { isActive: true } },
      train: true,
    },
  });

  if (!schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  const coachTemplates: CoachTemplate[] = [];

  const classSeatCounts: Record<string, { prefix: string; count: number; totalSeats: number }> = {
    EXEC_CHAIR: { prefix: 'E', count: 1, totalSeats: 52 },
    CHAIR_CAR: { prefix: 'C', count: 2, totalSeats: 78 },
    ONE_AC: { prefix: 'H', count: 1, totalSeats: 24 },
    TWO_AC: { prefix: 'A', count: 1, totalSeats: 46 },
    THREE_AC: { prefix: 'B', count: 2, totalSeats: 64 },
    SLEEPER: { prefix: 'S', count: 2, totalSeats: 72 },
    SECOND: { prefix: 'D', count: 1, totalSeats: 108 },
  };

  const activeClasses = schedule.fareRules.map((fr) => fr.classType);
  const classesToConfigure = activeClasses.length > 0 ? activeClasses : ['CHAIR_CAR'];

  for (const classType of classesToConfigure) {
    const config = classSeatCounts[classType] || { prefix: 'C', count: 1, totalSeats: 72 };
    for (let cIdx = 1; cIdx <= config.count; cIdx++) {
      const coachNumber = `${config.prefix}${cIdx}`;
      coachTemplates.push({
        coachNumber,
        classType,
        totalSeats: config.totalSeats,
        seats: getStandardSeatsForClass(classType, config.totalSeats),
      });
    }
  }

  return coachTemplates;
}

/**
 * Ensures inventory (TrainRun, Coaches, Seats) exists for the given schedule and service date.
 * Guarantees:
 * - Schedule validity & operating day bitmask are verified.
 * - Concurrency safe: handles unique constraint collision (P2002) if multiple requests race.
 * - Repeated calls are idempotent and never create duplicate coaches or seats.
 * - If a TrainRun exists with 0 coaches (e.g. from an earlier empty run), its inventory is healed.
 */
export async function ensureTrainRunInventory(scheduleId: string, runDate: string) {
  // 1. Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    throw new Error('Invalid runDate format. Must be YYYY-MM-DD');
  }

  const journeyDate = new Date(runDate);
  if (isNaN(journeyDate.getTime())) {
    throw new Error('Invalid runDate');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (journeyDate < today) {
    throw new Error('Journey date cannot be in the past');
  }

  // 2. Validate Schedule and Train
  const schedule = await prisma.trainSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      train: true,
      route: true,
      fareRules: true,
    },
  });

  if (!schedule || !schedule.isActive) {
    throw new Error(`Schedule ${scheduleId} is inactive or does not exist`);
  }

  if (!schedule.train.isActive) {
    throw new Error(`Train ${schedule.train.number} is inactive`);
  }

  if (!scheduleRunsOnDate(schedule.runningDays, runDate)) {
    throw new Error(`Train ${schedule.train.number} does not operate on date ${runDate}`);
  }

  // 3. Concurrency-safe TrainRun check / creation
  let trainRun = await prisma.trainRun.findUnique({
    where: { scheduleId_runDate: { scheduleId, runDate } },
    include: {
      coaches: {
        include: { seats: { include: { allocations: true } } },
      },
    },
  });

  if (!trainRun) {
    const coachTemplates = await getCoachTemplateForSchedule(scheduleId);
    try {
      trainRun = await prisma.trainRun.create({
        data: {
          scheduleId,
          runDate,
          status: 'SCHEDULED',
          coaches: {
            create: coachTemplates.map((c) => ({
              coachNumber: c.coachNumber,
              classType: c.classType,
              totalSeats: c.totalSeats,
              seats: {
                create: c.seats.map((s) => ({
                  seatNumber: s.seatNumber,
                  berthType: s.berthType,
                })),
              },
            })),
          },
        },
        include: {
          coaches: {
            include: { seats: { include: { allocations: true } } },
          },
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === 'P2002') {
        // Concurrent request won the race; re-fetch the winner's record
        trainRun = await prisma.trainRun.findUnique({
          where: { scheduleId_runDate: { scheduleId, runDate } },
          include: {
            coaches: {
              include: { seats: { include: { allocations: true } } },
            },
          },
        });
        if (!trainRun) throw createErr;
      } else {
        throw createErr;
      }
    }
  }

  // 4. Defensive Healing: If TrainRun was previously created without coaches, populate them now
  if (trainRun && trainRun.coaches.length === 0) {
    const coachTemplates = await getCoachTemplateForSchedule(scheduleId);
    for (const c of coachTemplates) {
      const coach = await prisma.coach.upsert({
        where: {
          trainRunId_coachNumber: {
            trainRunId: trainRun.id,
            coachNumber: c.coachNumber,
          },
        },
        update: { totalSeats: c.totalSeats, classType: c.classType },
        create: {
          trainRunId: trainRun.id,
          coachNumber: c.coachNumber,
          classType: c.classType,
          totalSeats: c.totalSeats,
        },
      });

      const existingSeatCount = await prisma.seat.count({ where: { coachId: coach.id } });
      if (existingSeatCount < c.totalSeats) {
        await prisma.seat.createMany({
          data: c.seats.slice(existingSeatCount).map((s) => ({
            coachId: coach.id,
            seatNumber: s.seatNumber,
            berthType: s.berthType,
          })),
        });
      }
    }

    trainRun = await prisma.trainRun.findUnique({
      where: { id: trainRun.id },
      include: {
        coaches: {
          include: { seats: { include: { allocations: true } } },
        },
      },
    });
  }

  return trainRun!;
}
