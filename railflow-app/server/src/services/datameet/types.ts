export type DataProvenance =
  | 'LIVE_EXTERNAL'
  | 'STATIC_ROUTE'
  | 'TIMETABLE_ESTIMATE'
  | 'CACHED'
  | 'RAILFLOW_DEMO'
  | 'UNAVAILABLE';

export const PROVENANCE_LABELS: Record<DataProvenance, string> = {
  LIVE_EXTERNAL: 'Live External Data',
  STATIC_ROUTE: 'Static Route Data',
  TIMETABLE_ESTIMATE: 'Timetable Estimate',
  CACHED: 'Cached Data',
  RAILFLOW_DEMO: 'RailFlow Demo Data',
  UNAVAILABLE: 'Unavailable',
};

export interface ProvenanceMeta {
  provenance: DataProvenance;
  provenanceLabel: string;
  source: string;
  providerName: string;
  isOfficial: boolean;
  isLive: boolean;
  cached: boolean;
  fetchedAt: string | null;
  freshnessSeconds: number | null;
  limitations: string[];
}

export interface DatameetStation {
  code: string;
  name: string;
  state: string | null;
  zone: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
}

export interface DatameetTrain {
  number: string;
  name: string;
  type: string | null;
  zone: string | null;
  fromStationCode: string | null;
  fromStationName: string | null;
  toStationCode: string | null;
  toStationName: string | null;
  departure: string | null;
  arrival: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  returnTrain: string | null;
  classes: string[];
  coordinates: Array<[number, number]> | null;
}

export interface DatameetScheduleStop {
  id: number | null;
  trainNumber: string;
  trainName: string | null;
  stationCode: string;
  stationName: string | null;
  arrival: string | null;
  departure: string | null;
  day: number | null;
}

export interface DatameetCatalogSnapshot {
  stations: DatameetStation[];
  stationsByCode: Map<string, DatameetStation>;
  trains: DatameetTrain[];
  trainsByNumber: Map<string, DatameetTrain>;
  schedulesByTrain: Map<string, DatameetScheduleStop[]>;
  schedulesByStation: Map<string, DatameetScheduleStop[]>;
  loadedAt: string;
  sourceBaseUrl: string;
  cached: boolean;
  datasets: Array<'stations' | 'trains' | 'schedules'>;
}

export const DATAMEET_LIMITATIONS = [
  'DataMeet/railways is a community-collected static JSON dump (CC0), not an official IRCTC or CRIS API.',
  'Files are historical (circa 2016) and are not a live running-status feed.',
  'No PNR status, seat availability, fare quotes, or booking/payment are published.',
  'No platform numbers, delay minutes, or live GPS telemetry are published.',
  'GitHub raw file hosting is not a documented REST API; treat responses as cached open data.',
];
