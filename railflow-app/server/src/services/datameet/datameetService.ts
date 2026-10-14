import { datameetCatalog } from './catalogStore';
import { minutesBetween } from './mappers';
import {
  DATAMEET_LIMITATIONS,
  DatameetCatalogSnapshot,
  DatameetScheduleStop,
  DatameetStation,
  DatameetTrain,
  DataProvenance,
  PROVENANCE_LABELS,
  ProvenanceMeta,
} from './types';

export interface CatalogStationResult {
  id: string;
  code: string;
  name: string;
  fullName: string;
  zone: string;
  state: string;
  isActive: boolean;
  latitude: number | null;
  longitude: number | null;
  provenance: ProvenanceMeta;
}

export interface CatalogTrainSearchResult {
  scheduleId: string;
  trainRunId: string;
  bookable: false;
  provenance: ProvenanceMeta;
  train: {
    id: string;
    number: string;
    name: string;
    type: string;
  };
  route: {
    id: string;
    name: string;
    totalStops: number;
    stops: Array<{
      sequence: number;
      stationCode: string;
      stationName: string;
      arrivalOffset: number | null;
      departureOffset: number | null;
      distanceKm: number | null;
      platform: string | null;
    }>;
  };
  fromStation: { code: string; name: string; sequence: number };
  toStation: { code: string; name: string; sequence: number };
  journey: {
    fromStation: string;
    toStation: string;
    fromStationName: string;
    toStationName: string;
    departureTime: string | null;
    arrivalTime: string | null;
    durationMinutes: number | null;
    distanceKm: number | null;
    runDate: string | null;
  };
  departureTime: string | null;
  arrivalTime: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  runningDays: string;
  classes: Record<string, never>;
  journeyDate: string | null;
}

function buildProvenance(snapshotCached: boolean, extra?: Partial<ProvenanceMeta>): ProvenanceMeta {
  const provenance: DataProvenance = snapshotCached ? 'CACHED' : 'STATIC_ROUTE';
  return {
    provenance,
    provenanceLabel: PROVENANCE_LABELS[provenance],
    source: 'DATAMEET_OPEN_DATA',
    providerName: 'DataMeet Indian Railways JSON (GitHub)',
    isOfficial: false,
    isLive: false,
    cached: snapshotCached,
    fetchedAt: extra?.fetchedAt ?? datameetCatalog.getSnapshot()?.loadedAt ?? null,
    freshnessSeconds: extra?.freshnessSeconds ?? null,
    limitations: DATAMEET_LIMITATIONS,
    ...extra,
  };
}

function mapRailflowStation(station: DatameetStation, cached: boolean): CatalogStationResult {
  return {
    id: `datameet:${station.code}`,
    code: station.code,
    name: station.name,
    fullName: station.address || station.name,
    zone: station.zone || 'UNKNOWN',
    state: station.state || 'UNKNOWN',
    isActive: true,
    latitude: station.latitude,
    longitude: station.longitude,
    provenance: buildProvenance(cached),
  };
}

export class DatameetService {
  isEnabled(): boolean {
    return datameetCatalog.isEnabled();
  }

  getProvenance(): ProvenanceMeta {
    const snap = datameetCatalog.getSnapshot();
    return buildProvenance(Boolean(snap?.cached), { fetchedAt: snap?.loadedAt ?? null });
  }

  hydrateForTests(payload: { stations?: any; trains?: any; schedules?: any }): void {
    datameetCatalog.hydrate(payload, true);
  }

  resetForTests(): void {
    datameetCatalog.reset();
  }

  async searchStations(query: string, limit = 20): Promise<CatalogStationResult[]> {
    const snap = await datameetCatalog.ensureLoaded(['stations']);
    if (!snap) return [];
    const q = query.trim().toUpperCase();
    const matches = q
      ? snap.stations.filter(
          (s) =>
            s.code.includes(q) ||
            s.name.toUpperCase().includes(q) ||
            (s.state && s.state.toUpperCase().includes(q))
        )
      : snap.stations;
    return matches.slice(0, limit).map((s) => mapRailflowStation(s, snap.cached));
  }

  async getStation(code: string): Promise<CatalogStationResult | null> {
    const snap = await datameetCatalog.ensureLoaded(['stations']);
    if (!snap) return null;
    const station = snap.stationsByCode.get(code.toUpperCase());
    return station ? mapRailflowStation(station, snap.cached) : null;
  }

  async lookupTrains(query: string, limit = 10): Promise<DatameetTrain[]> {
    const snap = await datameetCatalog.ensureLoaded(['trains']);
    if (!snap) return [];
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return snap.trains
      .filter((t) => t.number.toUpperCase().includes(q) || t.name.toUpperCase().includes(q))
      .slice(0, limit);
  }

  async searchTrainsBetween(from: string, to: string, date: string | null): Promise<CatalogTrainSearchResult[]> {
    const snap = await datameetCatalog.ensureLoaded(['stations', 'trains', 'schedules']);
    if (!snap) return [];
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();
    const results: CatalogTrainSearchResult[] = [];
    const seen = new Set<string>();

    for (const [trainNumber, stops] of snap.schedulesByTrain.entries()) {
      const fromIdx = stops.findIndex((s) => s.stationCode === fromCode);
      const toIdx = stops.findIndex((s) => s.stationCode === toCode);
      if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;
      const mapped = this.toSearchResult(trainNumber, fromIdx, toIdx, stops, snap, date);
      if (mapped) {
        results.push(mapped);
        seen.add(trainNumber);
      }
    }

    for (const train of snap.trains) {
      if (seen.has(train.number)) continue;
      if (train.fromStationCode === fromCode && train.toStationCode === toCode) {
        const mapped = this.toSearchResultFromTrainMaster(train, snap, date);
        if (mapped) results.push(mapped);
      }
    }

    return results;
  }

  async getRouteGeometry(trainNumber: string) {
    const snap = await datameetCatalog.ensureLoaded(['stations', 'trains', 'schedules']);
    if (!snap) return null;
    const train = snap.trainsByNumber.get(trainNumber) || snap.trainsByNumber.get(trainNumber.padStart(5, '0'));
    const stops = snap.schedulesByTrain.get(trainNumber) || snap.schedulesByTrain.get(trainNumber.padStart(5, '0')) || [];

    const stopPoints = stops
      .map((stop, index) => {
        const station = snap.stationsByCode.get(stop.stationCode);
        if (!station || station.latitude == null || station.longitude == null) return null;
        return {
          sequence: index + 1,
          code: stop.stationCode,
          name: stop.stationName || station.name,
          lat: station.latitude,
          lng: station.longitude,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const line = train?.coordinates && train.coordinates.length >= 2 ? train.coordinates : stopPoints.map((s) => [s.lng, s.lat] as [number, number]);
    if (!line || line.length < 2) return null;

    return {
      trainNumber,
      format: 'geojson',
      stops: stopPoints,
      geojson: {
        type: 'Feature' as const,
        properties: {
          number: train?.number ?? trainNumber,
          name: train?.name ?? null,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: line,
        },
      },
      meta: {
        source: 'DATAMEET_OPEN_DATA',
        cached: snap.cached,
        fetchedAt: snap.loadedAt,
        provenance: snap.cached ? 'CACHED' : 'STATIC_ROUTE',
        provenanceLabel: snap.cached ? PROVENANCE_LABELS.CACHED : PROVENANCE_LABELS.STATIC_ROUTE,
        limitations: DATAMEET_LIMITATIONS,
      },
    };
  }

  async getScheduledStationBoard(stationCode: string) {
    const snap = await datameetCatalog.ensureLoaded(['stations', 'trains', 'schedules']);
    if (!snap) return null;
    const code = stationCode.toUpperCase();
    const station = snap.stationsByCode.get(code);
    const movements = snap.schedulesByStation.get(code) || [];
    if (!station && movements.length === 0) return null;

    const trains = movements.slice(0, 80).map((row) => {
      const train = snap.trainsByNumber.get(row.trainNumber);
      return {
        number: row.trainNumber,
        name: row.trainName || train?.name || `Train ${row.trainNumber}`,
        type: train?.type || 'UNKNOWN',
        source: train?.fromStationCode || 'UNKNOWN',
        destination: train?.toStationCode || 'UNKNOWN',
        platform: null,
        scheduledArrival: row.arrival,
        scheduledDeparture: row.departure,
        expectedDepartureTime: null,
        expectedArrivalTime: null,
        delayMinutes: null,
        status: 'scheduled',
      };
    });

    return {
      station: {
        code,
        name: station?.name || code,
        city: station?.address || undefined,
        lat: station?.latitude ?? undefined,
        lng: station?.longitude ?? undefined,
      },
      windowHours: 0,
      trains,
      count: trains.length,
      meta: {
        source: 'DATAMEET_OPEN_DATA',
        fetchedAt: snap.loadedAt,
        provenance: snap.cached ? 'CACHED' : 'STATIC_ROUTE',
        provenanceLabel: snap.cached ? PROVENANCE_LABELS.CACHED : PROVENANCE_LABELS.STATIC_ROUTE,
        limitations: DATAMEET_LIMITATIONS,
        quotaRemainingMonth: null,
      },
    };
  }

  async getTrainsBetween(from: string, to: string) {
    const results = await this.searchTrainsBetween(from, to, null);
    const snap = datameetCatalog.getSnapshot();
    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      count: results.length,
      trains: results.map((r) => ({
        number: r.train.number,
        name: r.train.name,
        type: r.train.type,
        runDays: [] as string[],
        departure: r.departureTime || '',
        arrival: r.arrivalTime || '',
        durationMinutes: r.durationMin ?? 0,
        distanceKm: r.distanceKm ?? 0,
        totalHalts: r.route.totalStops,
      })),
      meta: {
        source: 'DATAMEET_OPEN_DATA',
        provenance: snap?.cached ? 'CACHED' : 'STATIC_ROUTE',
        provenanceLabel: snap?.cached ? PROVENANCE_LABELS.CACHED : PROVENANCE_LABELS.STATIC_ROUTE,
        limitations: DATAMEET_LIMITATIONS,
        quotaRemainingMonth: null,
      },
    };
  }

  private toSearchResult(
    trainNumber: string,
    fromIdx: number,
    toIdx: number,
    stops: DatameetScheduleStop[],
    snap: DatameetCatalogSnapshot,
    date: string | null
  ): CatalogTrainSearchResult | null {
    const train = snap.trainsByNumber.get(trainNumber);
    const fromStop = stops[fromIdx];
    const toStop = stops[toIdx];
    const duration = minutesBetween(fromStop.departure || fromStop.arrival, fromStop.day, toStop.arrival || toStop.departure, toStop.day);
    const routeStops = stops.map((stop, index) => ({
      sequence: index + 1,
      stationCode: stop.stationCode,
      stationName: stop.stationName || stop.stationCode,
      arrivalOffset: null,
      departureOffset: null,
      distanceKm: null as number | null,
      platform: null as string | null,
    }));

    return {
      scheduleId: `datameet:${trainNumber}`,
      trainRunId: `datameet:${trainNumber}:${fromStop.stationCode}:${toStop.stationCode}:${date || 'na'}`,
      bookable: false,
      provenance: buildProvenance(snap.cached, { fetchedAt: snap.loadedAt }),
      train: {
        id: `datameet:${trainNumber}`,
        number: trainNumber,
        name: train?.name || fromStop.trainName || `Train ${trainNumber}`,
        type: train?.type || 'UNKNOWN',
      },
      route: {
        id: `datameet-route:${trainNumber}`,
        name: `${fromStop.stationCode} – ${toStop.stationCode}`,
        totalStops: stops.length,
        stops: routeStops,
      },
      fromStation: { code: fromStop.stationCode, name: fromStop.stationName || fromStop.stationCode, sequence: fromIdx + 1 },
      toStation: { code: toStop.stationCode, name: toStop.stationName || toStop.stationCode, sequence: toIdx + 1 },
      journey: {
        fromStation: fromStop.stationCode,
        toStation: toStop.stationCode,
        fromStationName: fromStop.stationName || fromStop.stationCode,
        toStationName: toStop.stationName || toStop.stationCode,
        departureTime: fromStop.departure,
        arrivalTime: toStop.arrival,
        durationMinutes: duration,
        distanceKm: train?.distanceKm ?? null,
        runDate: date,
      },
      departureTime: fromStop.departure,
      arrivalTime: toStop.arrival,
      durationMin: duration,
      distanceKm: train?.distanceKm ?? null,
      runningDays: 'Unknown (static catalog has no running-days field)',
      classes: {},
      journeyDate: date,
    };
  }

  private toSearchResultFromTrainMaster(
    train: DatameetTrain,
    snap: DatameetCatalogSnapshot,
    date: string | null
  ): CatalogTrainSearchResult {
    return {
      scheduleId: `datameet:${train.number}`,
      trainRunId: `datameet:${train.number}:${train.fromStationCode}:${train.toStationCode}:${date || 'na'}`,
      bookable: false,
      provenance: buildProvenance(snap.cached, { fetchedAt: snap.loadedAt }),
      train: {
        id: `datameet:${train.number}`,
        number: train.number,
        name: train.name,
        type: train.type || 'UNKNOWN',
      },
      route: {
        id: `datameet-route:${train.number}`,
        name: `${train.fromStationCode} – ${train.toStationCode}`,
        totalStops: train.coordinates?.length || 2,
        stops: [
          {
            sequence: 1,
            stationCode: train.fromStationCode || 'UNKNOWN',
            stationName: train.fromStationName || train.fromStationCode || 'UNKNOWN',
            arrivalOffset: null,
            departureOffset: null,
            distanceKm: 0,
            platform: null,
          },
          {
            sequence: 2,
            stationCode: train.toStationCode || 'UNKNOWN',
            stationName: train.toStationName || train.toStationCode || 'UNKNOWN',
            arrivalOffset: null,
            departureOffset: null,
            distanceKm: train.distanceKm,
            platform: null,
          },
        ],
      },
      fromStation: {
        code: train.fromStationCode || 'UNKNOWN',
        name: train.fromStationName || train.fromStationCode || 'UNKNOWN',
        sequence: 1,
      },
      toStation: {
        code: train.toStationCode || 'UNKNOWN',
        name: train.toStationName || train.toStationCode || 'UNKNOWN',
        sequence: 2,
      },
      journey: {
        fromStation: train.fromStationCode || 'UNKNOWN',
        toStation: train.toStationCode || 'UNKNOWN',
        fromStationName: train.fromStationName || train.fromStationCode || 'UNKNOWN',
        toStationName: train.toStationName || train.toStationCode || 'UNKNOWN',
        departureTime: train.departure,
        arrivalTime: train.arrival,
        durationMinutes: train.durationMinutes,
        distanceKm: train.distanceKm,
        runDate: date,
      },
      departureTime: train.departure,
      arrivalTime: train.arrival,
      durationMin: train.durationMinutes,
      distanceKm: train.distanceKm,
      runningDays: 'Unknown (static catalog has no running-days field)',
      classes: {},
      journeyDate: date,
    };
  }
}

export const datameetService = new DatameetService();
