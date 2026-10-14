// ChukChuk API Live Tracking Provider Adapter
// Integrates the open-source ChukChuk-API (FastAPI wrapper around Indian Railways NTES).
// Normalizes station arrival/departure milestones, timestamps, and delay minutes.
// Strictly adheres to project invariants: coordinates: null (no GPS fabrication).

import { prisma } from '../../../db/prisma';
import { NormalizedRunningStatus, StopProgress, TrainTrackingProvider } from '../types';

interface ChukChukEvent {
  raw: string;
  type: 'Arrived' | 'Departed' | null;
  station: string | null;
  code: string | null;
  datetime: string | null;
  delay: string | null;
}

interface ChukChukInstance {
  start_date: string | null;
  status: 'running' | 'completed' | 'scheduled' | 'unknown';
  is_today: boolean;
  last_update: string | null;
  events: ChukChukEvent[];
}

interface ChukChukResponse {
  train_number: number;
  start_date: string | null;
  status: 'running' | 'completed' | 'scheduled' | 'unknown';
  last_update: string | null;
  events: ChukChukEvent[];
  instances: ChukChukInstance[];
}

function parseDelayStringToMinutes(delayStr: string | null | undefined): number | null {
  if (!delayStr) return null;
  const trimmed = delayStr.trim();
  if (/on\s*time/i.test(trimmed)) return 0;

  // Format HH:MM e.g. "00:14" or "01:39"
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const mins = parseInt(colonMatch[2], 10);
    return hours * 60 + mins;
  }

  // Pure integer minutes
  const intMatch = trimmed.match(/^(\d+)$/);
  if (intMatch) {
    return parseInt(intMatch[1], 10);
  }

  return null;
}

function extractStationCodeFromRaw(raw: string): string | null {
  const codeMatch = raw.match(/\(([A-Z0-9]{2,6})\)/i);
  return codeMatch ? codeMatch[1].toUpperCase() : null;
}

export class ChukChukTrackingProvider implements TrainTrackingProvider {
  readonly name = 'UNOFFICIAL_CHUKCHUK_NTES';
  readonly isRealtimeFeed = true;

  private baseUrl: string | null;

  constructor() {
    this.baseUrl = process.env.CHUKCHUK_API_BASE_URL || null;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.trim().length > 0);
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  async getRunningStatus(trainNumber: string, requestedDate?: string): Promise<NormalizedRunningStatus> {
    if (!this.isConfigured()) {
      throw new Error('ChukChuk API base URL (CHUKCHUK_API_BASE_URL) not configured on server.');
    }

    const cleanTrainNumber = trainNumber.trim();
    if (!/^\d{5}$/.test(cleanTrainNumber)) {
      throw new Error(
        `ChukChuk API requires a 5-digit Indian Railways train number (received: ${cleanTrainNumber}).`
      );
    }

    const cleanBaseUrl = this.baseUrl!.replace(/\/+$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout guard

    let response: Response;
    try {
      response = await fetch(`${cleanBaseUrl}/train/${cleanTrainNumber}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RailFlow-Railway-Platform/2.0',
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('ChukChuk API upstream request timed out after 6000ms.');
      }
      throw new Error(`Failed to connect to ChukChuk API at ${cleanBaseUrl}: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status === 422) {
        throw new Error(`ChukChuk API rejected train ${cleanTrainNumber} (422 Unprocessable Entity).`);
      }
      if (response.status === 502) {
        throw new Error('ChukChuk API encountered an upstream NTES error (502 Bad Gateway).');
      }
      throw new Error(`ChukChuk API returned HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as ChukChukResponse;

    // Map journey status
    let mappedStatus: 'RUNNING' | 'NOT_STARTED' | 'COMPLETED' | 'UNKNOWN' = 'UNKNOWN';
    if (data.status === 'running') mappedStatus = 'RUNNING';
    else if (data.status === 'scheduled') mappedStatus = 'NOT_STARTED';
    else if (data.status === 'completed') mappedStatus = 'COMPLETED';

    // Collect all relevant events for today's run
    const todayInstance = data.instances?.find((i) => i.is_today);
    const activeEvents = (todayInstance && todayInstance.events?.length > 0)
      ? todayInstance.events
      : (data.events || []);

    // If ChukChuk reports unknown status with zero events, trigger fallback to timetable
    if (data.status === 'unknown' && activeEvents.length === 0) {
      throw new Error(`No active running journey found on ChukChuk API for train ${cleanTrainNumber}.`);
    }

    // Find latest event (last reported station)
    const latestEvent = activeEvents.length > 0 ? activeEvents[activeEvents.length - 1] : null;

    let lastReportedStation: NormalizedRunningStatus['lastReportedStation'] = null;
    let delayMinutes: number | null = null;

    if (latestEvent) {
      const code = latestEvent.code || extractStationCodeFromRaw(latestEvent.raw) || 'EN_ROUTE';
      const name = latestEvent.station || code;
      const parsedDelay = parseDelayStringToMinutes(latestEvent.delay);
      delayMinutes = parsedDelay;

      lastReportedStation = {
        code,
        name,
        actualArrival: latestEvent.type === 'Arrived' ? latestEvent.datetime : null,
        actualDeparture: latestEvent.type === 'Departed' ? latestEvent.datetime : null,
        departureTimestamp: latestEvent.datetime || null,
        platform: null, // NTES scraping does not return reliable platform numbers
      };
    }

    // Attempt to enrich with RailFlow's internal database for timetable stops & station details
    const dbTrain = await prisma.train.findFirst({
      where: { number: cleanTrainNumber, isActive: true },
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

    let trainName = dbTrain?.name || `Train ${cleanTrainNumber}`;
    let stops: StopProgress[] = [];
    let nextStation: NormalizedRunningStatus['nextStation'] = null;

    if (dbTrain && dbTrain.schedules.length > 0) {
      const schedule = dbTrain.schedules[0];
      const routeStations = schedule.route?.stations || [];

      let passedLastReported = false;
      const lastCode = lastReportedStation?.code;

      stops = routeStations.map((rs, idx) => {
        const stationCode = rs.station.code;
        const matchedEvent = activeEvents.find(
          (e) => (e.code || extractStationCodeFromRaw(e.raw)) === stationCode
        );

        let stopStatus: 'PASSED' | 'CURRENT' | 'UPCOMING' = 'UPCOMING';
        if (lastCode && stationCode === lastCode) {
          stopStatus = mappedStatus === 'RUNNING' ? 'CURRENT' : 'PASSED';
          passedLastReported = true;
        } else if (!passedLastReported && lastCode) {
          stopStatus = 'PASSED';
        } else if (matchedEvent) {
          stopStatus = 'PASSED';
        }

        return {
          sequence: rs.sequence,
          stationCode: rs.station.code,
          stationName: rs.station.name,
          distanceKm: rs.distanceKm,
          platform: rs.platformNumber || null,
          scheduledArrival: null,
          scheduledDeparture: null,
          actualArrival: matchedEvent?.type === 'Arrived' ? matchedEvent.datetime : null,
          actualDeparture: matchedEvent?.type === 'Departed' ? matchedEvent.datetime : null,
          status: stopStatus,
          delayMinutes: matchedEvent ? parseDelayStringToMinutes(matchedEvent.delay) : null,
        };
      });

      // Find next upcoming station in the sequence
      if (lastCode) {
        const lastIdx = routeStations.findIndex((rs) => rs.station.code === lastCode);
        if (lastIdx !== -1 && lastIdx + 1 < routeStations.length) {
          const nextRs = routeStations[lastIdx + 1];
          nextStation = {
            code: nextRs.station.code,
            name: nextRs.station.name,
            scheduledArrival: null,
            estimatedArrival: null,
            platform: nextRs.platformNumber || null,
            distanceKm: nextRs.distanceKm,
          };
        }
      }
    } else {
      // If train is not seeded in local database, construct stops from active ChukChuk events
      stops = activeEvents.map((ev, idx) => {
        const stationCode = ev.code || extractStationCodeFromRaw(ev.raw) || `STN-${idx + 1}`;
        const isLatest = idx === activeEvents.length - 1;
        return {
          sequence: idx + 1,
          stationCode,
          stationName: ev.station || stationCode,
          distanceKm: 0,
          platform: null,
          scheduledArrival: null,
          scheduledDeparture: null,
          actualArrival: ev.type === 'Arrived' ? ev.datetime : null,
          actualDeparture: ev.type === 'Departed' ? ev.datetime : null,
          status: isLatest && mappedStatus === 'RUNNING' ? 'CURRENT' : 'PASSED',
          delayMinutes: parseDelayStringToMinutes(ev.delay),
        };
      });
    }

    const operatingDate = data.start_date || requestedDate || new Date().toISOString().split('T')[0];

    return {
      trainNumber: cleanTrainNumber,
      trainName,
      operatingDate,
      status: mappedStatus,
      lastReportedStation,
      delayMinutes,
      nextStation,
      // INVARIANT: ChukChuk API does not provide GPS coordinates. MUST remain null.
      coordinates: null,
      stops,
      meta: {
        source: 'UNOFFICIAL_CHUKCHUK_NTES',
        providerName: 'ChukChuk API (Open-Source NTES Gateway)',
        isLiveGps: false,
        isRealtimeFeed: true,
        observationTimestamp: data.last_update || new Date().toISOString(),
        freshnessSeconds: 0,
        limitations: [
          'Raw GPS coordinates are not provided by NTES or ChukChuk API.',
          'Unofficial scraper of Indian Railways NTES (enquiry.indianrail.gov.in).',
          'Data frequency depends on station block signaling updates.',
          'Not officially endorsed by Indian Railways or CRIS.',
        ],
        message:
          'Live train status parsed from National Train Enquiry System (NTES) via the open-source ChukChuk API wrapper.',
      },
    };
  }
}
