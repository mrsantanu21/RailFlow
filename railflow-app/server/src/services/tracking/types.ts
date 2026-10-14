// RailFlow Railway Running Data - Typed Provider Interface & Common Model

export interface StopProgress {
  sequence: number;
  stationCode: string;
  stationName: string;
  distanceKm: number;
  platform: string | null;
  scheduledArrival: string | null;     // e.g. "10:00" or null for origin
  scheduledDeparture: string | null;   // e.g. "10:05" or null for terminus
  actualArrival: string | null;        // null if not reported or not reached
  actualDeparture: string | null;      // null if not departed
  status: 'PASSED' | 'CURRENT' | 'UPCOMING';
  delayMinutes: number | null;         // null if delay unknown
}

export interface NormalizedRunningStatus {
  trainNumber: string;
  trainName: string;
  operatingDate: string;               // YYYY-MM-DD
  status: 'RUNNING' | 'NOT_STARTED' | 'COMPLETED' | 'CANCELLED' | 'UNKNOWN';
  lastReportedStation: {
    code: string;
    name: string;
    actualArrival: string | null;
    actualDeparture: string | null;
    departureTimestamp: string | null;
    platform: string | null;
  } | null;
  delayMinutes: number | null;         // null if delay unknown/not reported
  nextStation: {
    code: string;
    name: string;
    scheduledArrival: string | null;
    estimatedArrival: string | null;
    platform: string | null;
    distanceKm: number | null;
  } | null;
  // Raw GPS coordinates - MUST be null when not provided by provider! Never fabricated!
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
  stops: StopProgress[];
  meta: {
    source: string;                    // e.g. 'OFFICIAL_CRIS_TIMETABLE_MASTER' | 'RAPIDAPI_INDIAN_RAIL_LIVE'
    providerName: string;
    isLiveGps: boolean;                // false if only station-progress or timetable
    isRealtimeFeed: boolean;           // true if live dynamic API was queried
    observationTimestamp: string;      // ISO 8601
    freshnessSeconds: number;
    limitations: string[];             // explicit list of unavailable capabilities
    message?: string;
    speedKmph?: number | null;
    segmentProgress?: number | null;
    quotaRemainingMonth?: number | null;
    quotaRemainingMin?: number | null;
  };
}

export interface RailRadarRouteGeometry {
  trainNumber: string;
  format: string;
  stops: Array<{
    sequence: number;
    code: string;
    name: string;
    lat: number;
    lng: number;
  }>;
  geojson: {
    type: 'Feature';
    properties?: any;
    geometry: {
      type: 'LineString';
      coordinates: Array<[number, number]>; // [lng, lat] GeoJSON standard
    };
  };
  meta: {
    source: string;
    cached: boolean;
    fetchedAt: string;
  };
}

export interface StationBoardTrain {
  number: string;
  name: string;
  type: string;
  source: string;
  destination: string;
  platform: string | null;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  expectedDepartureTime: string | null;
  expectedArrivalTime: string | null;
  delayMinutes: number | null;
  status: string; // 'at-station' | 'in-transit' | etc.
}

export interface StationLiveBoardResponse {
  station: {
    code: string;
    name: string;
    city?: string;
    lat?: number;
    lng?: number;
  };
  windowHours: number;
  trains: StationBoardTrain[];
  count: number;
  meta: {
    source: string;
    fetchedAt: string;
    quotaRemainingMonth?: number | null;
  };
}

export interface TrainsBetweenResult {
  from: string;
  to: string;
  count: number;
  trains: Array<{
    number: string;
    name: string;
    type: string;
    runDays: string[];
    departure: string;
    arrival: string;
    durationMinutes: number;
    distanceKm: number;
    totalHalts: number;
  }>;
  meta: {
    source: string;
    quotaRemainingMonth?: number | null;
  };
}

export interface TrainTrackingProvider {
  readonly name: string;
  readonly isRealtimeFeed: boolean;
  getRunningStatus(trainNumber: string, date?: string): Promise<NormalizedRunningStatus>;
}

