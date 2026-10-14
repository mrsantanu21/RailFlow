export interface ProvenanceMeta {
  provenance: 'LIVE_EXTERNAL' | 'STATIC_ROUTE' | 'TIMETABLE_ESTIMATE' | 'CACHED' | 'RAILFLOW_DEMO' | 'UNAVAILABLE';
  provenanceLabel: string;
  source: string;
  providerName?: string;
  isOfficial?: boolean;
  isLive?: boolean;
  cached?: boolean;
  fetchedAt?: string | null;
  freshnessSeconds?: number | null;
  limitations?: string[];
}

export interface Station {
  id: string;
  code: string;
  name: string;
  fullName: string;
  zone: string;
  state: string;
  isActive: boolean;
  provenance?: ProvenanceMeta;
}

export interface StopInfo {
  sequence: number;
  stationCode: string;
  stationName: string;
  arrivalOffset: number | null;
  departureOffset: number | null;
  distanceKm: number;
  platform: string | null;
}

export interface ClassAvailability {
  available: number;
  status: 'AVAILABLE' | 'WAITLIST' | 'NOT_AVAILABLE';
  fare: number; // in paise
}

export interface TrainSearchResult {
  scheduleId: string;
  trainRunId: string;
  bookable?: boolean;
  provenance?: ProvenanceMeta;
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
    stops: StopInfo[];
  };
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
  classes: Record<string, ClassAvailability>;
}

export interface FareQuote {
  distanceKm: number;
  passCount: number;
  classType: string;
  perPassenger: {
    baseFarePaise: number;
    reservationChargePaise: number;
    superfastChargePaise: number;
    cateringChargePaise: number;
    subtotalPaise: number;
  };
  total: {
    subtotalPaise: number;
    gstPaise: number;
    totalPaise: number;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
}

export interface PassengerInput {
  name: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  berthPreference?: string;
}

export interface BookingPassenger {
  id: string;
  passengerIndex: number;
  name: string;
  age: number;
  gender: string;
  berthPreference?: string | null;
  allocation?: {
    allocatedCoach: string;
    allocatedSeatNumber: number;
    status: string;
  } | null;
}

export interface Booking {
  id: string;
  pnr: string;
  userId: string;
  trainRunId: string;
  fromRouteStationSeq: number;
  toRouteStationSeq: number;
  classType: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'FAILED';
  paymentStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  totalFarePaise: number;
  quotaType: string;
  createdAt: string;
  passengers: BookingPassenger[];
  trainRun?: {
    runDate: string;
    schedule: {
      train: {
        number: string;
        name: string;
        type: string;
      };
      departureTime: string;
      route: {
        name: string;
        stations: Array<{
          sequence: number;
          station: {
            code: string;
            name: string;
          };
          departureOffsetMin: number | null;
          arrivalOffsetMin: number | null;
          distanceKm: number;
        }>;
      };
    };
  };
  cancellation?: {
    refundAmountPaise: number;
    deductionPercent: number;
    refundStatus: string;
  } | null;
}

export interface AdminSummary {
  totalUsers: number;
  totalTrains: number;
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  pendingBookings: number;
  totalRevenuePaise: number;
  note: string;
}

export interface StopProgress {
  sequence: number;
  stationCode: string;
  stationName: string;
  distanceKm: number;
  platform: string | null;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  actualArrival: string | null;
  actualDeparture: string | null;
  status: 'PASSED' | 'CURRENT' | 'UPCOMING';
  delayMinutes: number | null;
}

export interface NormalizedRunningStatus {
  trainNumber: string;
  trainName: string;
  operatingDate: string;
  status: 'RUNNING' | 'NOT_STARTED' | 'COMPLETED' | 'CANCELLED' | 'UNKNOWN';
  lastReportedStation: {
    code: string;
    name: string;
    actualArrival: string | null;
    actualDeparture: string | null;
    departureTimestamp: string | null;
    platform: string | null;
  } | null;
  delayMinutes: number | null;
  nextStation: {
    code: string;
    name: string;
    scheduledArrival: string | null;
    estimatedArrival: string | null;
    platform: string | null;
    distanceKm: number | null;
  } | null;
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
  stops: StopProgress[];
  meta: {
    source: string;
    providerName: string;
    isLiveGps: boolean;
    isRealtimeFeed: boolean;
    observationTimestamp: string;
    freshnessSeconds: number;
    limitations: string[];
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
      coordinates: Array<[number, number]>; // [lng, lat]
    };
  };
  meta: {
    source: string;
    cached: boolean;
    fetchedAt: string;
    provenance?: string;
    provenanceLabel?: string;
    limitations?: string[];
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
  status: string;
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
    provenance?: string;
    provenanceLabel?: string;
    limitations?: string[];
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

export interface TrackableTrain {
  number: string;
  name: string;
  type: string;
  departureTime: string;
  originStation: { code: string; name: string } | null;
  terminusStation: { code: string; name: string } | null;
  totalStops: number;
}

export interface CandidateSourceAudit {
  id: string;
  name: string;
  category: 'OFFICIAL_GOVERNMENT' | 'COMMERCIAL_AGGREGATOR' | 'OPEN_DATA_PORTAL';
  isOfficial: boolean;
  offersLiveStatus: boolean;
  providesRawGpsCoordinates: boolean;
  trackingGranularity: 'STATION_BLOCK' | 'DIVISION_SECTOR' | 'RAW_GPS_TELEMETRY';
  updateFrequency: string;
  documentationAvailable: boolean;
  authenticationMethod: string;
  costsAndPricing: string;
  studentSandboxAvailable: boolean;
  lawfulUseForCollegeProject: boolean;
  statusInRailFlow: 'ACTIVE_TIMETABLE_ENGINE' | 'ADAPTER_CONFIGURED_KEY_REQUIRED' | 'ADAPTER_CONFIGURED_CHUKCHUK' | 'ENTERPRISE_RESTRICTED' | 'STATIC_ONLY_UNSUITABLE';
  analysisNotes: string;
}

export interface TrackingAudit {
  liveProviderConfigured: boolean;
  activeProvider: string;
  quota?: {
    remainingMonth: number | null;
    remainingMin: number | null;
    isCooldown: boolean;
  };
  candidates: CandidateSourceAudit[];
  disclaimer: string;
}


