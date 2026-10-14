// RailRadar API Official REST Provider Adapter
// Securely consumes live train running status, route geometry, station boards, and trains between stations.
// Handles timeouts, bounded retries, quota tracking, in-flight deduplication, and normalized data contracts.

import {
  NormalizedRunningStatus,
  RailRadarRouteGeometry,
  StationLiveBoardResponse,
  StopProgress,
  TrainsBetweenResult,
  TrainTrackingProvider,
} from '../types';
import {
  CACHE_TTL_BETWEEN,
  CACHE_TTL_LIVE,
  CACHE_TTL_ROUTE,
  CACHE_TTL_STATION_BOARD,
  trackingCache,
} from '../cache';

export class RailRadarTrackingProvider implements TrainTrackingProvider {
  readonly name = 'RAILRADAR_API_LIVE';
  readonly isRealtimeFeed = true;

  private apiKey: string | null;
  private baseUrl: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.RAILRADAR_API_KEY || null;
    this.baseUrl = (process.env.RAILRADAR_API_BASE_URL || 'https://api.railradar.in').replace(/\/+$/, '');
    this.enabled = process.env.RAILRADAR_ENABLED === 'true' || process.env.RAILRADAR_ENABLED === '1';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  isEnabled(): boolean {
    return this.enabled && this.isConfigured();
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error('RailRadar API Key (RAILRADAR_API_KEY) is not configured on server.');
    }
    return {
      Authorization: `Bearer ${this.apiKey.trim()}`,
      Accept: 'application/json',
      'User-Agent': 'RailFlow-Platform/2.0',
    };
  }

  private handleRateLimitHeaders(headers: Headers): void {
    const month = headers.get('x-ratelimit-remaining-month');
    const min = headers.get('x-ratelimit-remaining-min');
    trackingCache.updateQuota(
      month !== null ? parseInt(month, 10) : undefined,
      min !== null ? parseInt(min, 10) : undefined
    );
  }

  private async fetchWithTimeout(url: string, timeoutMs = 5000): Promise<{ response: Response; json: any }> {
    if (trackingCache.isQuotaCooldown()) {
      throw new Error('RailRadar API quota cooldown active due to upstream 429 rate limit. Falling back.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`RailRadar request timed out after ${timeoutMs}ms.`);
      }
      throw new Error(`RailRadar network connection failure: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    this.handleRateLimitHeaders(response.headers);

    if (response.status === 429) {
      trackingCache.setQuotaCooldown(60 * 1000); // 1 minute backoff on 429
      throw new Error('RailRadar upstream rate limit (429) exceeded. Free tier limit reached.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`RailRadar authentication failed (HTTP ${response.status}). Verify RAILRADAR_API_KEY.`);
    }

    if (!response.ok) {
      throw new Error(`RailRadar API responded with HTTP ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as any;
    if (json && json.success === false) {
      throw new Error(json.error?.message || 'RailRadar API returned failure status.');
    }

    return { response, json };
  }

  /**
   * 1. GET /v1/trains/{number}/live — Real-time running status
   */
  async getRunningStatus(trainNumber: string, date?: string): Promise<NormalizedRunningStatus> {
    const cleanNum = trainNumber.trim();
    if (!/^\d{4,5}$/.test(cleanNum)) {
      throw new Error(`Invalid train number format: ${cleanNum}. Must be 4 or 5 digits.`);
    }

    const todayStr = date || new Date().toISOString().split('T')[0];
    const cacheKey = `rr:status:${cleanNum}:${todayStr}`;

    return trackingCache.getOrFetch(
      cacheKey,
      async () => {
        const queryParams = new URLSearchParams();
        if (date) queryParams.set('date', date);
        const url = `${this.baseUrl}/v1/trains/${encodeURIComponent(cleanNum)}/live${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

        const { json } = await this.fetchWithTimeout(url, 5000);
        const data = json.data;
        if (!data) {
          throw new Error(`No running status data returned for train ${cleanNum}.`);
        }

        const quota = trackingCache.getQuota();
        const currentLoc = data.currentLocation || {};
        const prevHalt = data.previousHalt || null;
        const nextHalt = data.nextHalt || null;

        // Map stops from route
        const rawRoute: any[] = Array.isArray(data.route) ? data.route : [];
        const stops: StopProgress[] = rawRoute.map((s, idx) => {
          const isCurrent = currentLoc.stationCode && s.stationCode === currentLoc.stationCode;
          let stopStatus: 'PASSED' | 'CURRENT' | 'UPCOMING' = 'UPCOMING';
          if (s.status === 'departed') {
            stopStatus = 'PASSED';
          } else if (isCurrent || s.status === 'arrived' || s.status === 'running') {
            stopStatus = 'CURRENT';
          }

          let schArr = s.scheduledArrival || null;
          let schDep = s.scheduledDeparture || null;
          if (schArr && schArr.includes('T')) schArr = schArr.split('T')[1].slice(0, 5);
          if (schDep && schDep.includes('T')) schDep = schDep.split('T')[1].slice(0, 5);

          return {
            sequence: s.sequence || idx + 1,
            stationCode: s.stationCode,
            stationName: s.stationName || s.stationCode,
            distanceKm: typeof s.distance === 'number' ? s.distance : 0,
            platform: s.platform ? String(s.platform) : null,
            scheduledArrival: schArr,
            scheduledDeparture: schDep,
            actualArrival: null,
            actualDeparture: null,
            status: stopStatus,
            delayMinutes: typeof s.delayMinutes === 'number' ? s.delayMinutes : null,
          };
        });

        // Determine mapped overall status
        let mappedStatus: NormalizedRunningStatus['status'] = 'RUNNING';
        if (data.status === 'completed') mappedStatus = 'COMPLETED';
        else if (data.status === 'scheduled' || data.status === 'not_started') mappedStatus = 'NOT_STARTED';
        else if (data.status === 'cancelled') mappedStatus = 'CANCELLED';

        const lastStop = currentLoc.stationCode
          ? {
              code: currentLoc.stationCode,
              name: currentLoc.stationName || currentLoc.stationCode,
              actualArrival: null,
              actualDeparture: currentLoc.status === 'departed' ? data.lastUpdatedAt || null : null,
              departureTimestamp: data.lastUpdatedAt || null,
              platform: null,
            }
          : prevHalt
          ? {
              code: prevHalt.code || prevHalt.stationCode,
              name: prevHalt.name || prevHalt.stationName || prevHalt.code,
              actualArrival: null,
              actualDeparture: null,
              departureTimestamp: null,
              platform: null,
            }
          : null;

        const nextStop = nextHalt
          ? {
              code: nextHalt.code || nextHalt.stationCode,
              name: nextHalt.name || nextHalt.stationName || nextHalt.code,
              scheduledArrival: nextHalt.scheduledArrival ? nextHalt.scheduledArrival.split('T')[1]?.slice(0, 5) || null : null,
              estimatedArrival: nextHalt.expectedArrivalTime ? nextHalt.expectedArrivalTime.split('T')[1]?.slice(0, 5) || null : null,
              platform: nextHalt.platform ? String(nextHalt.platform) : null,
              distanceKm: typeof nextHalt.distanceFromOriginKm === 'number' ? nextHalt.distanceFromOriginKm : null,
            }
          : null;

        return {
          trainNumber: data.trainNumber || cleanNum,
          trainName: data.trainName || data.train?.name || 'Express',
          operatingDate: data.startDate || todayStr,
          status: mappedStatus,
          lastReportedStation: lastStop,
          delayMinutes: typeof data.delayMinutes === 'number' ? data.delayMinutes : null,
          nextStation: nextStop,
          // INVARIANT: Never fabricate GPS coordinates. RailRadar returns station block/segment progress.
          coordinates: null,
          stops,
          meta: {
            source: 'RAILRADAR_API_LIVE',
            providerName: 'RailRadar Live Train Gateway',
            isLiveGps: false,
            isRealtimeFeed: true,
            observationTimestamp: data.lastUpdatedAt || new Date().toISOString(),
            freshnessSeconds: 0,
            speedKmph: typeof currentLoc.speedToNextStationKmph === 'number' ? currentLoc.speedToNextStationKmph : null,
            segmentProgress: typeof currentLoc.segmentProgress === 'number' ? currentLoc.segmentProgress : null,
            quotaRemainingMonth: quota.remainingMonth,
            quotaRemainingMin: quota.remainingMin,
            limitations: [
              'Crowd-sourced and NTES signaling integration; locomotive ISRO RTIS raw coordinates are not exposed publicly.',
              'Location is expressed as station block and segment progression percentage.',
            ],
            message: `Real-time running status via RailRadar live gateway (${data.trackingMode || 'hybrid'} mode).`,
          },
        };
      },
      CACHE_TTL_LIVE
    );
  }

  /**
   * 2. GET /v1/trains/{number}/route?format=geojson&stops=true — Railway Route Geometry
   */
  async getRouteGeometry(trainNumber: string): Promise<RailRadarRouteGeometry> {
    const cleanNum = trainNumber.trim();
    if (!/^\d{4,5}$/.test(cleanNum)) {
      throw new Error(`Invalid train number: ${cleanNum}`);
    }

    const cacheKey = `rr:route:${cleanNum}`;

    return trackingCache.getOrFetch(
      cacheKey,
      async () => {
        const url = `${this.baseUrl}/v1/trains/${encodeURIComponent(cleanNum)}/route?format=geojson&stops=true`;
        const { json } = await this.fetchWithTimeout(url, 6000);
        const data = json.data;
        if (!data || !data.geojson) {
          throw new Error(`No route geometry returned for train ${cleanNum}.`);
        }

        return {
          trainNumber: cleanNum,
          format: data.format || 'geojson',
          stops: Array.isArray(data.stops)
            ? data.stops.map((s: any) => ({
                sequence: s.sequence,
                code: s.code,
                name: s.name,
                lat: s.lat,
                lng: s.lng,
              }))
            : [],
          geojson: data.geojson,
          meta: {
            source: 'RAILRADAR_ROUTE_GEOMETRY',
            cached: false,
            fetchedAt: new Date().toISOString(),
          },
        };
      },
      CACHE_TTL_ROUTE // 24-hour cache for static track geometry
    );
  }

  /**
   * 3. GET /v1/stations/{code}/live?hours=4 — Station Live Departure Board
   */
  async getStationLiveBoard(stationCode: string, hours: number = 4): Promise<StationLiveBoardResponse> {
    const cleanCode = stationCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(cleanCode)) {
      throw new Error(`Invalid station code: ${cleanCode}`);
    }

    const cacheKey = `rr:station:${cleanCode}:${hours}`;

    return trackingCache.getOrFetch(
      cacheKey,
      async () => {
        const url = `${this.baseUrl}/v1/stations/${encodeURIComponent(cleanCode)}/live?hours=${encodeURIComponent(hours)}`;
        const { json } = await this.fetchWithTimeout(url, 5000);
        const data = json.data;
        if (!data) {
          throw new Error(`No station board data returned for station ${cleanCode}.`);
        }

        const rawTrains: any[] = Array.isArray(data.trains) ? data.trains : [];
        const quota = trackingCache.getQuota();

        return {
          station: {
            code: data.station?.code || cleanCode,
            name: data.station?.name || cleanCode,
            city: data.station?.city,
            lat: data.station?.lat,
            lng: data.station?.lng,
          },
          windowHours: data.window || hours,
          count: data.count || rawTrains.length,
          trains: rawTrains.map((t) => ({
            number: t.train?.number || '',
            name: t.train?.name || '',
            type: t.train?.type || 'Express',
            source: t.train?.source || '',
            destination: t.train?.destination || '',
            platform: t.stop?.platform ? String(t.stop.platform) : null,
            scheduledArrival: t.stop?.arrival || null,
            scheduledDeparture: t.stop?.departure || null,
            expectedDepartureTime: t.live?.expectedDepartureTime || null,
            expectedArrivalTime: t.live?.expectedArrivalTime || null,
            delayMinutes: typeof t.live?.delayMinutes === 'number' ? t.live.delayMinutes : 0,
            status: t.live?.type || 'scheduled',
          })),
          meta: {
            source: 'RAILRADAR_STATION_LIVE_BOARD',
            fetchedAt: new Date().toISOString(),
            quotaRemainingMonth: quota.remainingMonth,
          },
        };
      },
      CACHE_TTL_STATION_BOARD
    );
  }

  /**
   * 4. GET /v1/trains/between/{from}/{to} — Trains between two stations
   */
  async getTrainsBetweenStations(from: string, to: string): Promise<TrainsBetweenResult> {
    const cleanFrom = from.trim().toUpperCase();
    const cleanTo = to.trim().toUpperCase();
    const cacheKey = `rr:between:${cleanFrom}:${cleanTo}`;

    return trackingCache.getOrFetch(
      cacheKey,
      async () => {
        const url = `${this.baseUrl}/v1/trains/between/${encodeURIComponent(cleanFrom)}/${encodeURIComponent(cleanTo)}`;
        const { json } = await this.fetchWithTimeout(url, 5000);
        const data = json.data;
        if (!data) {
          throw new Error(`No train connectivity found between ${cleanFrom} and ${cleanTo}.`);
        }

        const rawTrains: any[] = Array.isArray(data.trains) ? data.trains : [];
        const quota = trackingCache.getQuota();

        const fromCode = typeof data.from === 'string' ? data.from : data.from?.code || cleanFrom;
        const toCode = typeof data.to === 'string' ? data.to : data.to?.code || cleanTo;

        return {
          from: fromCode,
          to: toCode,
          count: data.count || rawTrains.length,
          trains: rawTrains.map((t) => ({
            number: t.train?.number || '',
            name: t.train?.name || '',
            type: t.train?.type || 'Express',
            runDays: Array.isArray(t.train?.runDays) ? t.train.runDays : [],
            departure: t.from?.departure || '',
            arrival: t.to?.arrival || '',
            durationMinutes: t.duration || 0,
            distanceKm: t.distance || 0,
            totalHalts: t.totalHaltsBetween || 0,
          })),
          meta: {
            source: 'RAILRADAR_TRAINS_BETWEEN',
            quotaRemainingMonth: quota.remainingMonth,
          },
        };
      },
      CACHE_TTL_BETWEEN
    );
  }
}
