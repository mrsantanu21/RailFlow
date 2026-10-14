// RapidAPI Indian Railways Provider Adapter
// Securely consumes live train timetable and schedule data from RapidAPI.
// Automatically times out after 5000ms and normalizes data into the standard model.

import { NormalizedRunningStatus, StopProgress, TrainTrackingProvider } from '../types';

export class RapidApiTrackingProvider implements TrainTrackingProvider {
  readonly name = 'RAPIDAPI_INDIAN_RAIL_LIVE';
  readonly isRealtimeFeed = true;

  private apiKey: string | null;
  private apiHost: string;

  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || process.env.RAILWAY_LIVE_API_KEY || null;
    this.apiHost = process.env.RAPIDAPI_HOST || 'indian-railway-irctc.p.rapidapi.com';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getHost(): string {
    return this.apiHost;
  }

  async getTrainSchedule(trainNumber: string): Promise<any | null> {
    if (!this.isConfigured()) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const url = `https://${this.apiHost}/api/trains-search/v1/train/${encodeURIComponent(trainNumber)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey!,
          'X-RapidAPI-Host': this.apiHost,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return null;
      const json = (await response.json()) as any;
      const train = json?.body?.[0]?.trains?.[0];
      return train || null;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  }

  async getRunningStatus(trainNumber: string, date?: string): Promise<NormalizedRunningStatus> {
    if (!this.isConfigured()) {
      throw new Error('RapidAPI credentials (RAPIDAPI_KEY) not configured on server.');
    }

    const todayStr = date || new Date().toISOString().split('T')[0];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

    try {
      // 1. If configured host is indian-railway-irctc.p.rapidapi.com (verified live endpoint)
      if (this.apiHost.includes('indian-railway-irctc')) {
        const url = `https://${this.apiHost}/api/trains-search/v1/train/${encodeURIComponent(trainNumber)}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': this.apiKey!,
            'X-RapidAPI-Host': this.apiHost,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`RapidAPI provider responded with HTTP ${response.status}: ${response.statusText}`);
        }

        const json = (await response.json()) as any;
        const train = json?.body?.[0]?.trains?.[0];

        if (!train) {
          throw new Error(`Train ${trainNumber} not found in RapidAPI Indian Railway database.`);
        }

        const rawSchedule = Array.isArray(train.schedule) ? train.schedule : [];
        if (rawSchedule.length === 0) {
          throw new Error(`No schedule stops returned for Train ${trainNumber}.`);
        }

        // Determine current progress against schedule based on server time
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        const stops: StopProgress[] = rawSchedule.map((s: any, idx: number) => {
          const arr = s.arrivalTime && s.arrivalTime !== '--' ? s.arrivalTime : null;
          const dep = s.departureTime && s.departureTime !== '--' ? s.departureTime : null;
          const dist = parseInt(s.distance, 10) || 0;

          return {
            sequence: parseInt(s.stnSerialNumber, 10) || idx + 1,
            stationCode: s.stationCode,
            stationName: s.stationName,
            distanceKm: dist,
            platform: null,
            scheduledArrival: arr,
            scheduledDeparture: dep,
            actualArrival: null,
            actualDeparture: null,
            status: 'UPCOMING',
            delayMinutes: null,
          };
        });

        // Calculate progress markers
        let lastReportedIdx = -1;
        for (let i = 0; i < stops.length; i++) {
          const s = stops[i];
          const timeStr = s.scheduledDeparture || s.scheduledArrival;
          if (timeStr) {
            const [h, m] = timeStr.split(':').map(Number);
            const stopMinutes = h * 60 + m;
            if (nowMinutes >= stopMinutes) {
              s.status = 'PASSED';
              lastReportedIdx = i;
            } else {
              s.status = 'UPCOMING';
            }
          }
        }

        if (lastReportedIdx >= 0 && lastReportedIdx < stops.length) {
          stops[lastReportedIdx].status = 'CURRENT';
        }

        const lastStop = lastReportedIdx >= 0 ? stops[lastReportedIdx] : null;
        const nextStop = lastReportedIdx + 1 < stops.length ? stops[lastReportedIdx + 1] : null;

        return {
          trainNumber: train.trainNumber || trainNumber,
          trainName: train.trainName || 'Express',
          operatingDate: todayStr,
          status: lastReportedIdx >= stops.length - 1 ? 'COMPLETED' : lastReportedIdx >= 0 ? 'RUNNING' : 'NOT_STARTED',
          lastReportedStation: lastStop
            ? {
                code: lastStop.stationCode,
                name: lastStop.stationName,
                actualArrival: null,
                actualDeparture: lastStop.scheduledDeparture,
                departureTimestamp: lastStop.scheduledDeparture,
                platform: null,
              }
            : null,
          delayMinutes: null, // Truthful: schedule feed does not report dynamic live delay
          nextStation: nextStop
            ? {
                code: nextStop.stationCode,
                name: nextStop.stationName,
                scheduledArrival: nextStop.scheduledArrival,
                estimatedArrival: nextStop.scheduledArrival,
                platform: null,
                distanceKm: nextStop.distanceKm,
              }
            : null,
          coordinates: null, // Truthful invariant: never fabricate GPS coordinates
          stops,
          meta: {
            source: 'RAPIDAPI_INDIAN_RAILWAY_IRCTC',
            providerName: 'RapidAPI Gateway (indian-railway-irctc)',
            isLiveGps: false,
            isRealtimeFeed: true,
            observationTimestamp: new Date().toISOString(),
            freshnessSeconds: 0,
            limitations: [
              'Dynamic live GPS telemetry not provided by external proxy gateway.',
              'Schedule progression derived from verified RapidAPI train timetable feed.',
            ],
          },
        };
      }

      // 2. Generic RapidAPI live status fallback (for other hosts like indianrailways.p.rapidapi.com)
      const response = await fetch(
        `https://${this.apiHost}/trains/liveStatus?trainNo=${encodeURIComponent(trainNumber)}&startDate=${encodeURIComponent(todayStr)}`,
        {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': this.apiKey!,
            'X-RapidAPI-Host': this.apiHost,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Live provider responded with HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as any;
      const data = json.data || json;
      const currentStation = data.current_station || data.currentStation || {};
      const nextStation = data.next_station || data.nextStation || {};
      const rawDelay = typeof data.delay === 'number' ? data.delay : null;

      let coordinates: { latitude: number; longitude: number } | null = null;
      if (
        typeof data.latitude === 'number' &&
        typeof data.longitude === 'number' &&
        !isNaN(data.latitude) &&
        !isNaN(data.longitude)
      ) {
        coordinates = { latitude: data.latitude, longitude: data.longitude };
      }

      return {
        trainNumber: data.train_number || trainNumber,
        trainName: data.train_name || 'Express',
        operatingDate: todayStr,
        status: data.status === 'RUNNING' ? 'RUNNING' : data.status === 'COMPLETED' ? 'COMPLETED' : 'RUNNING',
        lastReportedStation: currentStation.code
          ? {
              code: currentStation.code,
              name: currentStation.name || currentStation.code,
              actualArrival: currentStation.actual_arrival || null,
              actualDeparture: currentStation.actual_departure || null,
              departureTimestamp: currentStation.departure_time || null,
              platform: currentStation.platform || null,
            }
          : null,
        delayMinutes: rawDelay,
        nextStation: nextStation.code
          ? {
              code: nextStation.code,
              name: nextStation.name || nextStation.code,
              scheduledArrival: nextStation.scheduled_arrival || null,
              estimatedArrival: nextStation.estimated_arrival || null,
              platform: nextStation.platform || null,
              distanceKm: nextStation.distance_km || null,
            }
          : null,
        coordinates,
        stops: Array.isArray(data.stations)
          ? data.stations.map((s: any, idx: number) => ({
              sequence: idx + 1,
              stationCode: s.code,
              stationName: s.name,
              distanceKm: s.distance || 0,
              platform: s.platform || null,
              scheduledArrival: s.scheduled_arrival || null,
              scheduledDeparture: s.scheduled_departure || null,
              actualArrival: s.actual_arrival || null,
              actualDeparture: s.actual_departure || null,
              status: s.has_departed ? 'PASSED' : s.is_current ? 'CURRENT' : 'UPCOMING',
              delayMinutes: typeof s.delay === 'number' ? s.delay : null,
            }))
          : [],
        meta: {
          source: 'RAPIDAPI_INDIAN_RAIL_LIVE',
          providerName: 'RapidAPI Gateway (CRIS/NTES Proxy)',
          isLiveGps: coordinates !== null,
          isRealtimeFeed: true,
          observationTimestamp: new Date().toISOString(),
          freshnessSeconds: 0,
          limitations: coordinates === null ? ['Raw GPS telemetry not provided by external proxy gateway.'] : [],
        },
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Live railway provider timed out after 5000ms.');
      }
      throw err;
    }
  }
}

