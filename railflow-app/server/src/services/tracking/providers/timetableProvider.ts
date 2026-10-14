// Official CRIS Timetable Progression Provider
// Computes verified schedule progression from database route offsets and server wall-clock time.
// Adheres strictly to the invariant: NEVER manufacture fake GPS coordinates, speeds, or delays.

import { prisma } from '../../../db/prisma';
import { NormalizedRunningStatus, StopProgress, TrainTrackingProvider } from '../types';

function addMinutesToTime(baseTime: string, offsetMin: number): string {
  const [hours, mins] = baseTime.split(':').map(Number);
  const totalMins = hours * 60 + mins + offsetMin;
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export class TimetableTrackingProvider implements TrainTrackingProvider {
  readonly name = 'OFFICIAL_CRIS_TIMETABLE_MASTER';
  readonly isRealtimeFeed = false;

  async getRunningStatus(trainNumber: string, requestedDate?: string): Promise<NormalizedRunningStatus> {
    const todayStr = requestedDate || new Date().toISOString().split('T')[0];

    // Find the train and its active schedule
    const train = await prisma.train.findFirst({
      where: { number: trainNumber, isActive: true },
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

    if (!train || train.schedules.length === 0) {
      throw new Error(`Train ${trainNumber} not found in timetable master.`);
    }

    const schedule = train.schedules[0];
    const route = schedule.route;
    const baseDepTime = schedule.departureTime; // e.g. "06:00"

    // Current time on server
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Build stops list with scheduled times
    const stops: StopProgress[] = route.stations.map((rs) => {
      const schArr = rs.arrivalOffsetMin !== null ? addMinutesToTime(baseDepTime, rs.arrivalOffsetMin) : null;
      const schDep = rs.departureOffsetMin !== null ? addMinutesToTime(baseDepTime, rs.departureOffsetMin) : null;

      return {
        sequence: rs.sequence,
        stationCode: rs.station.code,
        stationName: rs.station.name,
        distanceKm: rs.distanceKm,
        platform: rs.platformNumber || '1',
        scheduledArrival: schArr,
        scheduledDeparture: schDep,
        actualArrival: null, // Timetable has no live sensors
        actualDeparture: null,
        status: 'UPCOMING',
        delayMinutes: null, // Unknown without live NTES feed
      };
    });

    // Determine train progress based on schedule offsets
    const originDepMins = timeStringToMinutes(baseDepTime);
    const lastStop = route.stations[route.stations.length - 1];
    const terminusArrMins = lastStop.arrivalOffsetMin !== null
      ? originDepMins + lastStop.arrivalOffsetMin
      : originDepMins + 300;

    let overallStatus: NormalizedRunningStatus['status'] = 'NOT_STARTED';
    let lastPassedStop: StopProgress | null = null;
    let nextUpcomingStop: StopProgress | null = null;

    if (currentMins < originDepMins) {
      overallStatus = 'NOT_STARTED';
      nextUpcomingStop = stops[0];
    } else if (currentMins >= terminusArrMins) {
      overallStatus = 'COMPLETED';
      stops.forEach((s) => (s.status = 'PASSED'));
      lastPassedStop = stops[stops.length - 1];
    } else {
      overallStatus = 'RUNNING';
      // Traverse route stations to find the current segment
      for (let i = 0; i < route.stations.length; i++) {
        const rs = route.stations[i];
        const stopArrMins = rs.arrivalOffsetMin !== null ? originDepMins + rs.arrivalOffsetMin : originDepMins;
        const stopDepMins = rs.departureOffsetMin !== null ? originDepMins + rs.departureOffsetMin : stopArrMins;

        if (currentMins >= stopDepMins) {
          stops[i].status = 'PASSED';
          lastPassedStop = stops[i];
        } else if (currentMins >= stopArrMins && currentMins < stopDepMins) {
          stops[i].status = 'CURRENT';
          lastPassedStop = stops[i];
          nextUpcomingStop = stops[i + 1] || null;
          break;
        } else {
          stops[i].status = 'UPCOMING';
          if (!nextUpcomingStop) {
            nextUpcomingStop = stops[i];
          }
        }
      }
    }

    if (!lastPassedStop && stops.length > 0) {
      lastPassedStop = stops[0];
    }
    if (!nextUpcomingStop && stops.length > 1) {
      nextUpcomingStop = stops[1];
    }

    return {
      trainNumber: train.number,
      trainName: train.name,
      operatingDate: todayStr,
      status: overallStatus,
      lastReportedStation: lastPassedStop
        ? {
            code: lastPassedStop.stationCode,
            name: lastPassedStop.stationName,
            actualArrival: null,
            actualDeparture: null,
            departureTimestamp: lastPassedStop.scheduledDeparture
              ? `${todayStr}T${lastPassedStop.scheduledDeparture}:00Z`
              : null,
            platform: lastPassedStop.platform,
          }
        : null,
      delayMinutes: null, // Strictly null: no fake delay
      nextStation: nextUpcomingStop
        ? {
            code: nextUpcomingStop.stationCode,
            name: nextUpcomingStop.stationName,
            scheduledArrival: nextUpcomingStop.scheduledArrival,
            estimatedArrival: nextUpcomingStop.scheduledArrival,
            platform: nextUpcomingStop.platform,
            distanceKm: nextUpcomingStop.distanceKm,
          }
        : null,
      coordinates: null, // Strictly null: no fake GPS coordinates
      stops,
      meta: {
        source: 'OFFICIAL_CRIS_TIMETABLE_MASTER',
        providerName: 'RailFlow CRIS Timetable Engine',
        isLiveGps: false,
        isRealtimeFeed: false,
        observationTimestamp: new Date().toISOString(),
        freshnessSeconds: 0,
        limitations: [
          'Live GPS satellite coordinates are not published by Indian Railways public gateways.',
          'Delay telemetry is not available without an authorized CRIS/RapidAPI live gateway key.',
          'Progression is calculated from verified timetable schedules and route station sequence offsets.',
        ],
        message:
          'Operating on verified timetable schedule progression. GPS coordinates and dynamic delays require an enterprise CRIS or RapidAPI live feed key.',
      },
    };
  }
}
