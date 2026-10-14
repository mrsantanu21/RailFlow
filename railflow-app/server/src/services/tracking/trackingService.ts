// Tracking Orchestration Service
// Handles caching, provider fallback, rate management, and data normalization.

import { prisma } from '../../db/prisma';
import { datameetService } from '../datameet';
import { CACHE_TTL_LIVE, trackingCache } from './cache';
import { DATA_SOURCE_AUDITS } from './dataSourceAudit';
import { ChukChukTrackingProvider } from './providers/chukChukProvider';
import { RailRadarTrackingProvider } from './providers/railRadarProvider';
import { RapidApiTrackingProvider } from './providers/rapidApiProvider';
import { TimetableTrackingProvider } from './providers/timetableProvider';
import {
  NormalizedRunningStatus,
  RailRadarRouteGeometry,
  StationLiveBoardResponse,
  TrainsBetweenResult,
} from './types';

export class TrackingService {
  private timetableProvider = new TimetableTrackingProvider();
  private rapidApiProvider = new RapidApiTrackingProvider();
  private chukChukProvider = new ChukChukTrackingProvider();
  private railRadarProvider = new RailRadarTrackingProvider();

  getRailRadarProvider(): RailRadarTrackingProvider {
    return this.railRadarProvider;
  }

  getChukChukProvider(): ChukChukTrackingProvider {
    return this.chukChukProvider;
  }

  getTimetableProvider(): TimetableTrackingProvider {
    return this.timetableProvider;
  }

  getRapidApiProvider(): RapidApiTrackingProvider {
    return this.rapidApiProvider;
  }

  async getRunningStatus(trainNumber: string, date?: string): Promise<NormalizedRunningStatus> {
    const todayStr = date || new Date().toISOString().split('T')[0];
    const cacheKey = `track:${trainNumber}:${todayStr}`;

    // 1. Check in-memory TTL cache
    const cached = trackingCache.get<NormalizedRunningStatus>(cacheKey);
    if (cached) {
      return {
        ...cached,
        meta: {
          ...cached.meta,
          freshnessSeconds: trackingCache.getAgeSeconds(cacheKey),
        },
      };
    }

    // 2. Try RailRadar provider if configured and enabled
    if (this.railRadarProvider.isEnabled()) {
      try {
        const rrResult = await this.railRadarProvider.getRunningStatus(trainNumber, todayStr);
        trackingCache.set(cacheKey, rrResult, CACHE_TTL_LIVE);
        return rrResult;
      } catch (rrErr) {
        console.warn(`[TrackingService] RailRadar provider failed for ${trainNumber}:`, (rrErr as Error).message);
        // Fall through to next available provider
      }
    }

    // 3. Try ChukChuk Open-Source NTES Provider if configured
    if (this.chukChukProvider.isConfigured()) {
      try {
        const chukChukResult = await this.chukChukProvider.getRunningStatus(trainNumber, todayStr);
        trackingCache.set(cacheKey, chukChukResult, CACHE_TTL_LIVE);
        return chukChukResult;
      } catch (chukChukErr) {
        console.warn(
          `[TrackingService] ChukChuk provider failed for ${trainNumber}:`,
          (chukChukErr as Error).message
        );
        // Fall through to next available provider
      }
    }

    // 4. Try RapidAPI commercial provider if configured
    if (this.rapidApiProvider.isConfigured()) {
      try {
        const liveResult = await this.rapidApiProvider.getRunningStatus(trainNumber, todayStr);
        trackingCache.set(cacheKey, liveResult, CACHE_TTL_LIVE);
        return liveResult;
      } catch (liveErr) {
        console.warn(`[TrackingService] Live RapidAPI provider failed for ${trainNumber}:`, (liveErr as Error).message);
        // Fall through to timetable provider
      }
    }

    // 5. Timetable fallback provider (deterministic schedule progress)
    const timetableResult = await this.timetableProvider.getRunningStatus(trainNumber, todayStr);
    trackingCache.set(cacheKey, timetableResult, CACHE_TTL_LIVE);
    return timetableResult;
  }

  /**
   * Route Geometry: queries RailRadar GeoJSON route, falling back to local database stops
   */
  async getRouteGeometry(trainNumber: string): Promise<RailRadarRouteGeometry> {
    if (this.railRadarProvider.isConfigured()) {
      try {
        return await this.railRadarProvider.getRouteGeometry(trainNumber);
      } catch (err) {
        console.warn(`[TrackingService] RailRadar route geometry failed for ${trainNumber}:`, (err as Error).message);
      }
    }

    try {
      const catalogGeometry = await datameetService.getRouteGeometry(trainNumber);
      if (catalogGeometry) {
        return catalogGeometry;
      }
    } catch (err) {
      console.warn(`[TrackingService] DataMeet route geometry failed for ${trainNumber}:`, (err as Error).message);
    }

    // Fallback: construct GeoJSON LineString from local seeded stations with known coordinates only.
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
      throw new Error(`Route geometry not found for train ${trainNumber}.`);
    }

    const stations = train.schedules[0].route.stations;
    const coordsMap: Record<string, [number, number]> = {
      NDLS: [77.22027, 28.64177],
      CNB: [80.3533, 26.4539],
      PRYJ: [81.8288, 25.4484],
      BSB: [82.9863, 25.3283],
      HWH: [88.34221, 22.58382],
      ASN: [86.9746, 23.6889],
      DHN: [86.4304, 23.7957],
      GAYA: [84.9994, 24.7955],
      DDU: [83.1235, 25.2818],
    };

    const stops = stations
      .map((rs) => {
        const coord = coordsMap[rs.station.code];
        if (!coord) return null;
        return {
          sequence: rs.sequence,
          code: rs.station.code,
          name: rs.station.name,
          lat: coord[1],
          lng: coord[0],
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (stops.length < 2) {
      throw new Error(`Route geometry not found for train ${trainNumber}.`);
    }

    const coordinates: Array<[number, number]> = stops.map((s) => [s.lng, s.lat]);

    return {
      trainNumber,
      format: 'geojson',
      stops,
      geojson: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
      meta: {
        source: 'LOCAL_DATABASE_FALLBACK',
        cached: true,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Station Live Board: queries RailRadar 4-hour departure board, falling back to local DB
   */
  async getStationLiveBoard(stationCode: string, hours: number = 4): Promise<StationLiveBoardResponse> {
    if (this.railRadarProvider.isConfigured()) {
      try {
        return await this.railRadarProvider.getStationLiveBoard(stationCode, hours);
      } catch (err) {
        console.warn(`[TrackingService] RailRadar station board failed for ${stationCode}:`, (err as Error).message);
      }
    }

    try {
      const catalogBoard = await datameetService.getScheduledStationBoard(stationCode);
      if (catalogBoard) {
        return {
          ...catalogBoard,
          windowHours: hours,
        };
      }
    } catch (err) {
      console.warn(`[TrackingService] DataMeet station board failed for ${stationCode}:`, (err as Error).message);
    }

    // Fallback: local DB search for scheduled trains passing through station
    const station = await prisma.station.findFirst({
      where: { code: stationCode.toUpperCase(), isActive: true },
    });

    if (!station) {
      throw new Error(`Station ${stationCode} not found.`);
    }

    const routeStations = await prisma.routeStation.findMany({
      where: { stationId: station.id },
      include: {
        route: {
          include: {
            schedules: {
              include: { train: true },
            },
          },
        },
      },
    });

    const trains = routeStations.flatMap((rs) =>
      rs.route.schedules.map((sch) => ({
        number: sch.train.number,
        name: sch.train.name,
        type: sch.train.type,
        source: 'Origin',
        destination: 'Terminus',
        platform: rs.platformNumber != null ? String(rs.platformNumber) : null,
        scheduledArrival: rs.arrivalOffsetMin !== null ? `${rs.arrivalOffsetMin}m offset` : null,
        scheduledDeparture: rs.departureOffsetMin !== null ? sch.departureTime : sch.departureTime,
        expectedDepartureTime: null,
        expectedArrivalTime: null,
        delayMinutes: null,
        status: 'scheduled',
      }))
    );

    return {
      station: {
        code: station.code,
        name: station.name,
        city: station.fullName,
      },
      windowHours: hours,
      count: trains.length,
      trains,
      meta: {
        source: 'LOCAL_TIMETABLE_FALLBACK',
        fetchedAt: new Date().toISOString(),
        quotaRemainingMonth: trackingCache.getQuota().remainingMonth,
      },
    };
  }

  /**
   * Trains Between Stations: queries RailRadar between-stations API or local database
   */
  async getTrainsBetweenStations(from: string, to: string): Promise<TrainsBetweenResult> {
    if (this.railRadarProvider.isConfigured()) {
      try {
        return await this.railRadarProvider.getTrainsBetweenStations(from, to);
      } catch (err) {
        console.warn(`[TrackingService] RailRadar trains between failed for ${from}->${to}:`, (err as Error).message);
      }
    }

    try {
      const catalog = await datameetService.getTrainsBetween(from, to);
      if (catalog.count > 0) {
        return catalog;
      }
    } catch (err) {
      console.warn(`[TrackingService] DataMeet trains between failed for ${from}->${to}:`, (err as Error).message);
    }

    return {
      from,
      to,
      count: 0,
      trains: [],
      meta: {
        source: 'UNAVAILABLE',
        quotaRemainingMonth: trackingCache.getQuota().remainingMonth,
      },
    };
  }

  async getActiveTrackableTrains() {
    const trains = await prisma.train.findMany({
      where: { isActive: true },
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

    return trains.map((t) => {
      const schedule = t.schedules[0];
      const route = schedule?.route;
      const stations = route?.stations || [];
      const origin = stations[0]?.station;
      const terminus = stations[stations.length - 1]?.station;

      return {
        number: t.number,
        name: t.name,
        type: t.type,
        departureTime: schedule?.departureTime || '06:00',
        originStation: origin ? { code: origin.code, name: origin.name } : null,
        terminusStation: terminus ? { code: terminus.code, name: terminus.name } : null,
        totalStops: stations.length,
      };
    });
  }

  getDataSourceAudit() {
    const railRadarConfigured = this.railRadarProvider.isConfigured();
    const railRadarEnabled = this.railRadarProvider.isEnabled();
    const chukChukConfigured = this.chukChukProvider.isConfigured();
    const rapidApiConfigured = this.rapidApiProvider.isConfigured();

    let activeProvider = 'OFFICIAL_CRIS_TIMETABLE_MASTER';
    if (railRadarEnabled) {
      activeProvider = 'RAILRADAR_API_LIVE';
    } else if (chukChukConfigured) {
      activeProvider = 'UNOFFICIAL_CHUKCHUK_NTES';
    } else if (rapidApiConfigured) {
      activeProvider = 'RAPIDAPI_INDIAN_RAIL_LIVE';
    }

    const quota = trackingCache.getQuota();

    return {
      liveProviderConfigured: railRadarEnabled || chukChukConfigured || rapidApiConfigured,
      activeProvider,
      quota: {
        remainingMonth: quota.remainingMonth,
        remainingMin: quota.remainingMin,
        isCooldown: trackingCache.isQuotaCooldown(),
      },
      providers: {
        railradar: {
          configured: railRadarConfigured,
          enabled: railRadarEnabled,
          baseUrl: this.railRadarProvider.getBaseUrl(),
        },
        chukchuk: {
          configured: chukChukConfigured,
          baseUrl: this.chukChukProvider.getBaseUrl(),
        },
        rapidapi: {
          configured: rapidApiConfigured,
        },
        timetable: {
          configured: true,
          status: 'Active Timetable Baseline',
        },
        datameet: {
          configured: datameetService.isEnabled(),
          status: 'Static CC0 catalog (stations/trains/schedules)',
          baseUrl: process.env.RAILWAY_API_BASE_URL || 'https://raw.githubusercontent.com/datameet/railways/master',
        },
      },
      candidates: DATA_SOURCE_AUDITS,
      disclaimer:
        'RailFlow strictly distinguishes verified timetable schedule progression from dynamic sensor telemetry. GPS satellite coordinates and delays are never simulated or fabricated.',
    };
  }
}

export const trackingService = new TrackingService();

