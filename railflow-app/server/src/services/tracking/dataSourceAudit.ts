// Audit of candidate Indian Railways running status data sources

export interface CandidateSourceAudit {
  id: string;
  name: string;
  category: 'OFFICIAL_GOVERNMENT' | 'COMMERCIAL_AGGREGATOR' | 'OPEN_DATA_PORTAL';
  isOfficial: boolean;
  offersLiveStatus: boolean;
  providesRawGpsCoordinates: boolean; // exact lat/long vs station-based progress
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

export const DATA_SOURCE_AUDITS: CandidateSourceAudit[] = [
  {
    id: 'cris-ntes',
    name: 'CRIS / Indian Railways NTES (National Train Enquiry System)',
    category: 'OFFICIAL_GOVERNMENT',
    isOfficial: true,
    offersLiveStatus: true,
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: '2–5 minutes (upon station departure / block clearance)',
    documentationAvailable: false,
    authenticationMethod: 'Enterprise B2B IP Whitelisting + Mutual TLS + PSP Credentials',
    costsAndPricing: 'Commercial licensing, high bank guarantees (₹5L+), security deposit',
    studentSandboxAvailable: false,
    lawfulUseForCollegeProject: false,
    statusInRailFlow: 'ENTERPRISE_RESTRICTED',
    analysisNotes:
      'Official Indian Railways system maintained by CRIS. Internal locomotive RTIS (Real-Time Train Information System) communicates via ISRO satellite transponders to the Control Office Application (COA), but the public NTES API is strictly walled behind enterprise agreements. Web scraping ntes.indianrail.gov.in violates terms of service and Section 43/66 of the Information Technology Act 2000.',
  },
  {
    id: 'data-gov-in',
    name: 'data.gov.in (Open Government Data - OGD Platform India)',
    category: 'OPEN_DATA_PORTAL',
    isOfficial: true,
    offersLiveStatus: false,
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: 'Quarterly / Static release',
    documentationAvailable: true,
    authenticationMethod: 'API Key (Free registration for Indian citizens/students)',
    costsAndPricing: 'Free (under National Data Sharing and Accessibility Policy - NDSAP)',
    studentSandboxAvailable: true,
    lawfulUseForCollegeProject: true,
    statusInRailFlow: 'STATIC_ONLY_UNSUITABLE',
    analysisNotes:
      'Official government open data catalog. Provides static schedules, train master lists, and station coordinates. Does NOT provide real-time running feeds or live delay streams.',
  },
  {
    id: 'irctc-psp',
    name: 'IRCTC Principal Service Provider (PSP) Web Services',
    category: 'OFFICIAL_GOVERNMENT',
    isOfficial: true,
    offersLiveStatus: true,
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: 'Real-time via SOAP/REST Gateway',
    documentationAvailable: true,
    authenticationMethod: 'Signed Digital Certificate (DSC) + Static IP + Token Auth',
    costsAndPricing: 'Heavy setup fee, annual maintenance, and rolling booking quotas',
    studentSandboxAvailable: false,
    lawfulUseForCollegeProject: false,
    statusInRailFlow: 'ENTERPRISE_RESTRICTED',
    analysisNotes:
      'Commercial booking and inquiry gateway for verified ticketing agents (MakeMyTrip, EaseMyTrip, etc.). Not accessible for academic projects.',
  },
  {
    id: 'rapidapi-indian-rail',
    name: 'RapidAPI Indian Railways / IRCTC Live Running Gateway',
    category: 'COMMERCIAL_AGGREGATOR',
    isOfficial: false,
    offersLiveStatus: true,
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: 'Real-time query via RapidAPI gateway',
    documentationAvailable: true,
    authenticationMethod: 'X-RapidAPI-Key Header',
    costsAndPricing: 'Freemium / Paid Tier (authenticated via RAPIDAPI_KEY)',
    studentSandboxAvailable: true,
    lawfulUseForCollegeProject: true,
    statusInRailFlow: 'ADAPTER_CONFIGURED_KEY_REQUIRED',
    analysisNotes:
      'Verified with active RapidAPI host indian-railway-irctc.p.rapidapi.com. Tested endpoint /api/trains-search/v1/train/{trainNumber} delivers genuine IRCTC train schedule routes, stop sequences, and distances. Dynamic live delay feed is unsupported on basic subscription; yields truthful station progression with NO raw GPS coordinates.',
  },
  {
    id: 'railflow-timetable-engine',
    name: 'RailFlow CRIS Timetable Progression Engine (Active Fallback)',
    category: 'OFFICIAL_GOVERNMENT',
    isOfficial: true,
    offersLiveStatus: false, // scheduled progress, not dynamic GPS
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: 'Deterministic calculation synchronized with server clock',
    documentationAvailable: true,
    authenticationMethod: 'Internal Database (Prisma Master Schedule)',
    costsAndPricing: 'Zero cost / Open Source',
    studentSandboxAvailable: true,
    lawfulUseForCollegeProject: true,
    statusInRailFlow: 'ACTIVE_TIMETABLE_ENGINE',
    analysisNotes:
      'Computes scheduled train progression based on official CRIS master schedule offsets, route sequences, and current wall-clock time. Honestly declares coordinates: null and delayMinutes: null to prevent deceptive simulation.',
  },
  {
    id: 'chukchuk-api',
    name: 'ChukChuk-API (Open-Source NTES FastAPI Gateway)',
    category: 'COMMERCIAL_AGGREGATOR',
    isOfficial: false,
    offersLiveStatus: true,
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: 'On demand (real-time query to NTES web session)',
    documentationAvailable: true,
    authenticationMethod: 'None / Self-Hosted REST (Configurable via CHUKCHUK_API_BASE_URL)',
    costsAndPricing: 'Free & Open Source (MIT License)',
    studentSandboxAvailable: true,
    lawfulUseForCollegeProject: true,
    statusInRailFlow: 'ADAPTER_CONFIGURED_CHUKCHUK',
    analysisNotes:
      'Open-source FastAPI wrapper by manansethia that bootstraps a session with NTES (enquiry.indianrail.gov.in), fetches running instance HTML, and parses arrival/departure events, delay strings, and timestamps. Returns station codes and delays, but NO GPS coordinates. Sensitive to upstream NTES HTML layout changes or IP rate-limiting.',
  },
  {
    id: 'datameet-railways',
    name: 'DataMeet Indian Railways JSON (GitHub static dump)',
    category: 'OPEN_DATA_PORTAL',
    isOfficial: false,
    offersLiveStatus: false,
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: 'Static historical snapshot (community dump, circa 2016)',
    documentationAvailable: true,
    authenticationMethod: 'None (public CC0 JSON files; optional unused RAILWAY_API_KEY)',
    costsAndPricing: 'Free (CC0). GitHub/raw CDN rate limits apply.',
    studentSandboxAvailable: true,
    lawfulUseForCollegeProject: true,
    statusInRailFlow: 'STATIC_ONLY_UNSUITABLE',
    analysisNotes:
      'Not a live REST API and not IRCTC. Provides GeoJSON stations, GeoJSON train paths, and halt schedules. Suitable for station autocomplete, catalog train search, static route polylines, and scheduled stop lists. Explicitly does not provide live tracking, PNR, availability, fares, or booking.',
  },
  {
    id: 'railradar-api',
    name: 'RailRadar Indian Railways Live REST API',
    category: 'COMMERCIAL_AGGREGATOR',
    isOfficial: false,
    offersLiveStatus: true,
    providesRawGpsCoordinates: false,
    trackingGranularity: 'STATION_BLOCK',
    updateFrequency: 'Real-time telemetry / hybrid NTES & crowd signaling',
    documentationAvailable: true,
    authenticationMethod: 'Bearer Token (RAILRADAR_API_KEY)',
    costsAndPricing: 'Free Tier (1,000 req/month, 10 req/min)',
    studentSandboxAvailable: true,
    lawfulUseForCollegeProject: true,
    statusInRailFlow: 'ADAPTER_CONFIGURED_KEY_REQUIRED',
    analysisNotes:
      'High-performance Indian Railways live tracking API providing live status, delay in minutes, segment progression, GeoJSON route geometry, and 4-hour station departure boards. Provenance: hybrid signaling/crowd feeds without raw satellite GPS coordinates.',
  },
];

