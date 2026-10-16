import fs from 'node:fs/promises';
import path from 'node:path';
import { ProvenanceMeta } from './datameet/types';

export interface IRStation {
  code: string;
  name: string;
  state: string;
  zone: string;
  address: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface IRRouteStop {
  sequence: number;
  stationCode: string;
  stationName: string;
  arrivalTime: string | null;
  departureTime: string | null;
  journeyDay: number;
  distance: number;
}

export interface IRTrain {
  trainNumber: string;
  trainName: string;
  type: string;
  source: {
    code: string;
    name: string;
  };
  destination: {
    code: string;
    name: string;
  };
  runningDays: Record<string, boolean>;
  overallDistanceKm: number;
  completeOrderedRoute: IRRouteStop[];
}

export interface StationSearchResult {
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

export interface TrainSearchResultItem {
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
      distanceKm: number;
      platform: string | null;
      arrivalTime?: string | null;
      departureTime?: string | null;
      journeyDay?: number;
    }>;
  };
  fromStation: { code: string; name: string; sequence: number };
  toStation: { code: string; name: string; sequence: number };
  journey: {
    fromStation: string;
    toStation: string;
    fromStationName: string;
    toStationName: string;
    departureTime: string;
    arrivalTime: string | null;
    durationMinutes: number | null;
    distanceKm: number | null;
    runDate: string | null;
  };
  departureTime: string;
  arrivalTime: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  runningDays: string;
  classes: Record<string, { available: number; status: 'AVAILABLE' | 'WAITLIST' | 'NOT_AVAILABLE'; fare: number }>;
  journeyDate: string | null;
}

export const IR_DATASET_LIMITATIONS = [
  'Indian Railway open schedule dataset (prasenjit-27/Indian-Railway-Data, MIT License).',
  'Scheduled timetable data; does not provide real-time GPS telemetry, live delays, or platform changes.',
  'Live seat inventory, IRCTC PRS waitlist status, and official reservations require official Indian Railways PRS gateway.',
  'Sandbox bookings on static catalogue trains are simulated demonstrations.',
];

function buildIRProvenance(): ProvenanceMeta {
  return {
    provenance: 'STATIC_ROUTE',
    provenanceLabel: 'Static Timetable Data',
    source: 'INDIAN_RAILWAY_OPEN_DATA',
    providerName: 'Indian Railway Data (prasenjit-27/Indian-Railway-Data, MIT License)',
    isOfficial: false,
    isLive: false,
    cached: true,
    fetchedAt: new Date().toISOString(),
    freshnessSeconds: 0,
    limitations: IR_DATASET_LIMITATIONS,
  };
}

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const DAY_LABELS: Record<string, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

export class IndianRailwayService {
  private stations: IRStation[] = [];
  private stationsByCode = new Map<string, IRStation>();
  private trains: IRTrain[] = [];
  private trainsByNumber = new Map<string, IRTrain>();
  private stationToTrainIndices = new Map<string, number[]>();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  private dataDir(): string {
    return process.env.IR_DATA_DIR || path.join(process.cwd(), 'data', 'indian-railways');
  }

  async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadData()
      .catch((err) => {
        this.loadPromise = null;
        console.error('[IndianRailwayService] Failed to load dataset:', err.message);
        throw err;
      })
      .then(() => {
        this.isLoaded = true;
        this.loadPromise = null;
      });

    return this.loadPromise;
  }

  private async loadData(): Promise<void> {
    const dir = this.dataDir();
    const stationsPath = path.join(dir, 'stations.json');
    const trainsPath = path.join(dir, 'trains.json');

    const [stationsRaw, trainsRaw] = await Promise.all([
      fs.readFile(stationsPath, 'utf8'),
      fs.readFile(trainsPath, 'utf8'),
    ]);

    const parsedStations: any[] = JSON.parse(stationsRaw);
    const parsedTrains: any[] = JSON.parse(trainsRaw);

    const stationsList: IRStation[] = [];
    const stationsMap = new Map<string, IRStation>();

    for (const item of parsedStations) {
      if (!item || !item.code) continue;
      const code = String(item.code).trim().toUpperCase();
      if (!code) continue;

      const station: IRStation = {
        code,
        name: String(item.name || code).trim(),
        state: String(item.state || '').trim(),
        zone: String(item.zone || '').trim(),
        address: String(item.address || '').trim(),
        coordinates: item.coordinates && typeof item.coordinates === 'object'
          ? {
              latitude: Number(item.coordinates.latitude) || 0,
              longitude: Number(item.coordinates.longitude) || 0,
            }
          : undefined,
      };

      if (!stationsMap.has(code)) {
        stationsMap.set(code, station);
        stationsList.push(station);
      }
    }

    const trainsList: IRTrain[] = [];
    const trainsMap = new Map<string, IRTrain>();
    const stationIndex = new Map<string, number[]>();

    for (const t of parsedTrains) {
      if (!t || !t.trainNumber) continue;
      const trainNumber = String(t.trainNumber).trim();
      if (!trainNumber) continue;

      const rawStops: any[] = Array.isArray(t.completeOrderedRoute) ? t.completeOrderedRoute : [];
      const routeStops: IRRouteStop[] = rawStops.map((s, idx) => ({
        sequence: typeof s.sequence === 'number' ? s.sequence : idx + 1,
        stationCode: String(s.stationCode || '').trim().toUpperCase(),
        stationName: String(s.stationName || s.stationCode || '').trim(),
        arrivalTime: s.arrivalTime ? String(s.arrivalTime).trim() : null,
        departureTime: s.departureTime ? String(s.departureTime).trim() : null,
        journeyDay: typeof s.journeyDay === 'number' ? s.journeyDay : 1,
        distance: typeof s.distance === 'number' ? s.distance : 0,
      }));

      const train: IRTrain = {
        trainNumber,
        trainName: String(t.trainName || `Train ${trainNumber}`).trim(),
        type: String(t.type || 'EXPRESS').trim(),
        source: {
          code: String(t.source?.code || '').trim().toUpperCase(),
          name: String(t.source?.name || '').trim(),
        },
        destination: {
          code: String(t.destination?.code || '').trim().toUpperCase(),
          name: String(t.destination?.name || '').trim(),
        },
        runningDays: typeof t.runningDays === 'object' && t.runningDays !== null ? t.runningDays : {},
        overallDistanceKm: typeof t.overallDistanceKm === 'number' ? t.overallDistanceKm : 0,
        completeOrderedRoute: routeStops,
      };

      const trainIdx = trainsList.length;
      trainsList.push(train);
      trainsMap.set(trainNumber, train);

      // Inverted index for fast lookup
      for (const stop of routeStops) {
        if (!stop.stationCode) continue;
        let list = stationIndex.get(stop.stationCode);
        if (!list) {
          list = [];
          stationIndex.set(stop.stationCode, list);
        }
        list.push(trainIdx);
      }
    }

    this.stations = stationsList;
    this.stationsByCode = stationsMap;
    this.trains = trainsList;
    this.trainsByNumber = trainsMap;
    this.stationToTrainIndices = stationIndex;

    console.log(
      `[IndianRailwayService] Successfully loaded & indexed ${this.stations.length} stations and ${this.trains.length} trains.`
    );
  }

  getStationCount(): number {
    return this.stations.length;
  }

  getTrainCount(): number {
    return this.trains.length;
  }

  getAllStations(): IRStation[] {
    return this.stations;
  }

  getStationSync(code: string): IRStation | null {
    return this.stationsByCode.get(code.trim().toUpperCase()) || null;
  }

  getAllTrains(): IRTrain[] {
    return this.trains;
  }

  getTrainSync(trainNumber: string): IRTrain | null {
    return this.trainsByNumber.get(trainNumber.trim().toUpperCase()) || null;
  }

  async searchStations(query: string, limit = 20): Promise<StationSearchResult[]> {
    await this.ensureLoaded();
    const q = query.trim().toUpperCase();

    if (!q) {
      return this.stations.slice(0, limit).map(this.mapToStationResult);
    }

    const exactCode: IRStation[] = [];
    const prefixCode: IRStation[] = [];
    const containsCode: IRStation[] = [];
    const prefixName: IRStation[] = [];
    const containsName: IRStation[] = [];
    const containsState: IRStation[] = [];
    const seen = new Set<string>();

    for (const s of this.stations) {
      const code = s.code;
      const nameUpper = s.name.toUpperCase();
      const stateUpper = s.state.toUpperCase();

      if (code === q) {
        exactCode.push(s);
        seen.add(code);
      } else if (code.startsWith(q)) {
        prefixCode.push(s);
        seen.add(code);
      } else if (code.includes(q)) {
        containsCode.push(s);
        seen.add(code);
      }
    }

    for (const s of this.stations) {
      if (seen.has(s.code)) continue;
      const nameUpper = s.name.toUpperCase();
      if (nameUpper.startsWith(q)) {
        prefixName.push(s);
        seen.add(s.code);
      } else if (nameUpper.includes(q)) {
        containsName.push(s);
        seen.add(s.code);
      } else if (s.state && s.state.toUpperCase().includes(q)) {
        containsState.push(s);
        seen.add(s.code);
      }
    }

    const merged = [
      ...exactCode,
      ...prefixCode,
      ...containsCode,
      ...prefixName,
      ...containsName,
      ...containsState,
    ];

    return merged.slice(0, limit).map(this.mapToStationResult);
  }

  async getStation(codeOrId: string): Promise<StationSearchResult | null> {
    await this.ensureLoaded();
    const code = codeOrId.replace(/^ir:/i, '').trim().toUpperCase();
    const s = this.stationsByCode.get(code);
    return s ? this.mapToStationResult(s) : null;
  }

  async lookupTrains(query: string, limit = 10): Promise<IRTrain[]> {
    await this.ensureLoaded();
    const q = query.trim().toUpperCase().replace(/\s+/g, '');
    if (!q) return [];

    const exactNumber: IRTrain[] = [];
    const prefixNumber: IRTrain[] = [];
    const containsNumber: IRTrain[] = [];
    const prefixName: IRTrain[] = [];
    const containsName: IRTrain[] = [];
    const seen = new Set<string>();

    for (const t of this.trains) {
      const num = t.trainNumber.toUpperCase();
      const name = t.trainName.toUpperCase();

      if (num === q) {
        exactNumber.push(t);
        seen.add(t.trainNumber);
      } else if (num.startsWith(q)) {
        prefixNumber.push(t);
        seen.add(t.trainNumber);
      } else if (num.includes(q)) {
        containsNumber.push(t);
        seen.add(t.trainNumber);
      }
    }

    for (const t of this.trains) {
      if (seen.has(t.trainNumber)) continue;
      const name = t.trainName.toUpperCase();
      if (name.startsWith(q)) {
        prefixName.push(t);
        seen.add(t.trainNumber);
      } else if (name.includes(q)) {
        containsName.push(t);
        seen.add(t.trainNumber);
      }
    }

    const merged = [
      ...exactNumber,
      ...prefixNumber,
      ...prefixName,
      ...containsNumber,
      ...containsName,
    ];

    return merged.slice(0, limit);
  }

  async searchTrainsBetween(
    fromCode: string,
    toCode: string,
    dateStr: string | null = null
  ): Promise<TrainSearchResultItem[]> {
    await this.ensureLoaded();

    const from = fromCode.trim().toUpperCase();
    const to = toCode.trim().toUpperCase();

    if (!from || !to || from === to) {
      return [];
    }

    const fromIndices = this.stationToTrainIndices.get(from);
    const toIndices = this.stationToTrainIndices.get(to);

    if (!fromIndices || !toIndices) {
      return [];
    }

    const toSet = new Set(toIndices);
    const candidateIndices = fromIndices.filter((idx) => toSet.has(idx));

    // Determine day of week if travel date provided
    let dayKey: string | null = null;
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      if (!isNaN(dateObj.getTime())) {
        dayKey = DAY_KEYS[dateObj.getUTCDay()];
      }
    }

    const results: TrainSearchResultItem[] = [];

    for (const idx of candidateIndices) {
      const train = this.trains[idx];
      const stops = train.completeOrderedRoute;

      const fromIdx = stops.findIndex((s) => s.stationCode === from);
      const toIdx = stops.findIndex((s) => s.stationCode === to);

      // Validate route order: source stop must occur strictly BEFORE destination stop
      if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) {
        continue;
      }

      // Check running days if schedule specifies active days
      if (dayKey && train.runningDays && Object.keys(train.runningDays).length > 0) {
        if (train.runningDays[dayKey] === false) {
          continue;
        }
      }

      const fromStop = stops[fromIdx];
      const toStop = stops[toIdx];

      // Scheduled departure and arrival times
      const depTime = fromStop.departureTime || fromStop.arrivalTime || 'Not available';
      const arrTime = toStop.arrivalTime || toStop.departureTime || 'Not available';

      // Duration calculation with overnight support
      const durationMin = calculateJourneyDuration(
        depTime !== 'Not available' ? depTime : null,
        arrTime !== 'Not available' ? arrTime : null,
        fromStop.journeyDay || 1,
        toStop.journeyDay || fromStop.journeyDay || 1
      );

      // Intermediate stops count from route sequence
      const intermediateStops = Math.max(0, toIdx - fromIdx - 1);

      // Distance derivation: use verified source data only
      let distanceKm: number | null = null;
      if (fromIdx === 0 && toIdx === stops.length - 1 && train.overallDistanceKm > 0) {
        distanceKm = train.overallDistanceKm;
      } else if (toStop.distance > 0 && fromStop.distance >= 0 && toStop.distance > fromStop.distance) {
        distanceKm = toStop.distance - fromStop.distance;
      }

      // Route stops segment for inspection
      const segmentStops = stops.slice(fromIdx, toIdx + 1).map((s) => ({
        sequence: s.sequence,
        stationCode: s.stationCode,
        stationName: s.stationName,
        arrivalOffset: null,
        departureOffset: null,
        distanceKm: s.distance || 0,
        platform: null,
        arrivalTime: s.arrivalTime,
        departureTime: s.departureTime,
        journeyDay: s.journeyDay,
      }));

      // Running days human text
      const runningDaysText = formatRunningDaysRecord(train.runningDays);

      // Default mock classes for static catalogue
      const defaultClasses = generateClassesForTrainType(train.type, distanceKm);

      results.push({
        scheduleId: `ir-sched-${train.trainNumber}`,
        trainRunId: `ir-run-${train.trainNumber}-${dateStr || 'all'}`,
        bookable: false,
        provenance: buildIRProvenance(),
        train: {
          id: `ir-${train.trainNumber}`,
          number: train.trainNumber,
          name: train.trainName,
          type: train.type || 'EXPRESS',
        },
        route: {
          id: `ir-route-${train.trainNumber}`,
          name: `${train.source.name} → ${train.destination.name}`,
          totalStops: intermediateStops,
          stops: segmentStops,
        },
        fromStation: {
          code: fromStop.stationCode,
          name: fromStop.stationName,
          sequence: fromStop.sequence,
        },
        toStation: {
          code: toStop.stationCode,
          name: toStop.stationName,
          sequence: toStop.sequence,
        },
        journey: {
          fromStation: fromStop.stationCode,
          toStation: toStop.stationCode,
          fromStationName: fromStop.stationName,
          toStationName: toStop.stationName,
          departureTime: depTime,
          arrivalTime: arrTime,
          durationMinutes: durationMin,
          distanceKm,
          runDate: dateStr,
        },
        departureTime: depTime,
        arrivalTime: arrTime,
        durationMin,
        distanceKm,
        runningDays: runningDaysText,
        classes: defaultClasses,
        journeyDate: dateStr,
      });
    }

    // Sort by scheduled departure time
    results.sort((a, b) => {
      const aTime = a.departureTime === 'Not available' ? '99:99' : a.departureTime;
      const bTime = b.departureTime === 'Not available' ? '99:99' : b.departureTime;
      return aTime.localeCompare(bTime);
    });

    return results;
  }

  verifyWestBengalStations(): Record<string, { present: boolean; station: IRStation | null }> {
    const wbCodes = ['HWH', 'SDAH', 'KOAA', 'NJP', 'SGUJ', 'MLDT', 'ASN', 'RGJ'];
    const report: Record<string, { present: boolean; station: IRStation | null }> = {};
    for (const code of wbCodes) {
      const found = this.stationsByCode.get(code) || null;
      report[code] = {
        present: Boolean(found),
        station: found,
      };
    }
    return report;
  }

  private mapToStationResult = (s: IRStation): StationSearchResult => ({
    id: `ir:${s.code}`,
    code: s.code,
    name: s.name,
    fullName: s.address || s.name,
    zone: s.zone || 'UNKNOWN',
    state: s.state || 'UNKNOWN',
    isActive: true,
    latitude: s.coordinates?.latitude ?? null,
    longitude: s.coordinates?.longitude ?? null,
    provenance: buildIRProvenance(),
  });
}

export function calculateJourneyDuration(
  depTime: string | null,
  arrTime: string | null,
  depDay = 1,
  arrDay = 1
): number | null {
  if (!depTime || !arrTime) return null;
  const depParts = depTime.split(':').map(Number);
  const arrParts = arrTime.split(':').map(Number);
  if (depParts.length < 2 || arrParts.length < 2) return null;

  const [dh, dm] = depParts;
  const [ah, am] = arrParts;
  if (isNaN(dh) || isNaN(dm) || isNaN(ah) || isNaN(am)) return null;

  const depTotalMin = (depDay - 1) * 1440 + dh * 60 + dm;
  let arrTotalMin = (arrDay - 1) * 1440 + ah * 60 + am;

  // Handle journeys arriving next morning on the same recorded day counter
  if (arrTotalMin <= depTotalMin && arrDay === depDay) {
    arrTotalMin += 1440;
  }

  const diff = arrTotalMin - depTotalMin;
  return diff >= 0 ? diff : null;
}

function formatRunningDaysRecord(days: Record<string, boolean> = {}): string {
  const active = Object.entries(days)
    .filter(([_, run]) => run)
    .map(([d]) => DAY_LABELS[d] || d);

  if (active.length === 7) return 'Runs Daily';
  if (active.length === 0) return 'Runs Daily';
  return `Runs: ${active.join(' ')}`;
}

function generateClassesForTrainType(
  type: string = '',
  distanceKm: number | null = null
): Record<string, { available: number; status: 'AVAILABLE'; fare: number }> {
  const t = type.toUpperCase();
  const dist = distanceKm && distanceKm > 0 ? distanceKm : 500;

  if (t === 'RAJ' || t.includes('RAJDHANI')) {
    return {
      THREE_AC: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 2.2 * 100) },
      TWO_AC: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 3.1 * 100) },
      ONE_AC: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 4.8 * 100) },
    };
  }

  if (t === 'SHATABDI' || t === 'VB' || t.includes('VANDE')) {
    return {
      CHAIR_CAR: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 1.8 * 100) },
      EXEC_CHAIR: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 3.4 * 100) },
    };
  }

  if (t === 'PASS' || t === 'MEMU' || t === 'DEMU') {
    return {
      SECOND: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 0.4 * 100) },
    };
  }

  return {
    SLEEPER: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 0.65 * 100) },
    THREE_AC: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 1.75 * 100) },
    TWO_AC: { available: 0, status: 'AVAILABLE', fare: Math.round(dist * 2.5 * 100) },
  };
}

export const indianRailwayService = new IndianRailwayService();
