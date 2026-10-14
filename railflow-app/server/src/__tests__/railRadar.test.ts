import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { RailRadarTrackingProvider } from '../services/tracking/providers/railRadarProvider';
import { trackingCache } from '../services/tracking/cache';

describe('RailRadar Provider & Endpoints Verification', () => {
  beforeEach(() => {
    trackingCache.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    trackingCache.clear();
    vi.restoreAllMocks();
  });

  describe('1. RailRadarTrackingProvider Unit Tests (Mocked Upstream)', () => {
    it('validates train number format and rejects non-numeric input', async () => {
      const provider = new RailRadarTrackingProvider();
      await expect(provider.getRunningStatus('invalid')).rejects.toThrow('Invalid train number format');
      await expect(provider.getRunningStatus('12')).rejects.toThrow('Invalid train number format');
    });

    it('handles 401 Unauthorized from upstream honestly', async () => {
      const provider = new RailRadarTrackingProvider();
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid API Key' },
          }),
          { status: 401, statusText: 'Unauthorized' }
        )
      );

      await expect(provider.getRunningStatus('12301')).rejects.toThrow(/authentication failed/i);
    });

    it('handles 429 Rate Limit from upstream, triggers cooldown, and throws', async () => {
      const provider = new RailRadarTrackingProvider();
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Monthly quota exhausted' },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: {
              'x-ratelimit-remaining-min': '0',
              'x-ratelimit-remaining-month': '0',
            },
          }
        )
      );

      await expect(provider.getRunningStatus('12301')).rejects.toThrow(/rate limit/i);
      expect(trackingCache.isQuotaCooldown()).toBe(true);
    });

    it('handles upstream timeout gracefully', async () => {
      const provider = new RailRadarTrackingProvider();
      vi.spyOn(global, 'fetch').mockImplementationOnce(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(provider.getRunningStatus('12301')).rejects.toThrow(/timed out/i);
    });

    it('normalizes valid live status response with honest invariants (coordinates: null)', async () => {
      const provider = new RailRadarTrackingProvider();
      const mockPayload = {
        success: true,
        data: {
          trainNumber: '12301',
          trainName: 'Howrah - New Delhi Rajdhani Express',
          startDate: '2026-10-12',
          lastUpdatedAt: '2026-10-12T17:00:00+05:30',
          status: 'running',
          delayMinutes: 15,
          currentLocation: {
            stationCode: 'DKAE',
            stationName: 'Dankuni',
            sequence: 8,
            status: 'departed',
            distanceFromOriginKm: 16,
            segmentProgress: 0.5,
            speedToNextStationKmph: 110,
          },
          previousHalt: { code: 'HWH', name: 'Howrah Jn' },
          nextHalt: { code: 'ASN', name: 'Asansol Jn', scheduledArrival: '2026-10-12T18:47:00+05:30' },
          route: [
            {
              sequence: 1,
              stationCode: 'HWH',
              stationName: 'Howrah Jn',
              status: 'departed',
              scheduledDeparture: '16:50',
              platform: '9',
              distance: 0,
            },
            {
              sequence: 2,
              stationCode: 'ASN',
              stationName: 'Asansol Jn',
              status: 'upcoming',
              scheduledArrival: '18:47',
              platform: '4',
              distance: 200,
            },
          ],
        },
        meta: { source: 'hybrid', timestamp: '2026-10-12T17:00:00+05:30' },
      };

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockPayload), {
          status: 200,
          headers: {
            'x-ratelimit-remaining-min': '9',
            'x-ratelimit-remaining-month': '980',
          },
        })
      );

      const status = await provider.getRunningStatus('12301');
      expect(status.trainNumber).toBe('12301');
      expect(status.trainName).toBe('Howrah - New Delhi Rajdhani Express');
      expect(status.status).toBe('RUNNING');
      expect(status.delayMinutes).toBe(15);
      // Invariant: coordinates must be strictly null (never fabricated!)
      expect(status.coordinates).toBeNull();
      expect(status.meta.isLiveGps).toBe(false);
      expect(status.meta.source).toBe('RAILRADAR_API_LIVE');
      expect(status.lastReportedStation?.code).toBe('DKAE');
      expect(status.nextStation?.code).toBe('ASN');
      expect(status.stops.length).toBe(2);
      expect(status.stops[0].status).toBe('PASSED');
      expect(status.stops[1].status).toBe('UPCOMING');
    });

    it('normalizes GeoJSON route geometry preserving standard [lng, lat] coordinate order', async () => {
      const provider = new RailRadarTrackingProvider();
      const mockRoute = {
        success: true,
        data: {
          trainNumber: '12301',
          format: 'geojson',
          stops: [
            { sequence: 1, code: 'HWH', name: 'Howrah Jn', lat: 22.58382, lng: 88.34221 },
            { sequence: 2, code: 'NDLS', name: 'New Delhi', lat: 28.64177, lng: 77.22027 },
          ],
          geojson: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [88.34221, 22.58382],
                [77.22027, 28.64177],
              ],
            },
          },
        },
      };

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockRoute), { status: 200 })
      );

      const geom = await provider.getRouteGeometry('12301');
      expect(geom.trainNumber).toBe('12301');
      expect(geom.stops.length).toBe(2);
      expect(geom.geojson.geometry.type).toBe('LineString');
      // Verify GeoJSON standard: [longitude, latitude]
      expect(geom.geojson.geometry.coordinates[0][0]).toBe(88.34221); // lng
      expect(geom.geojson.geometry.coordinates[0][1]).toBe(22.58382); // lat
    });
  });

  describe('2. Express Tracking Routes Integration', () => {
    it('GET /api/tracking/:trainNumber/route returns route geometry', async () => {
      const res = await request(app).get('/api/tracking/22436/route');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.geometry).toBeDefined();
      expect(res.body.data.geometry.trainNumber).toBe('22436');
      expect(res.body.data.geometry.geojson.geometry.coordinates.length).toBeGreaterThan(0);
    });

    it('GET /api/tracking/stations/:code/live returns live station departure board', async () => {
      const res = await request(app).get('/api/tracking/stations/NDLS/live?hours=4');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.board).toBeDefined();
      expect(res.body.data.board.station.code).toBe('NDLS');
      expect(Array.isArray(res.body.data.board.trains)).toBe(true);
    });

    it('GET /api/tracking/between/:from/:to returns train connectivity', async () => {
      const res = await request(app).get('/api/tracking/between/NDLS/BSB');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.from).toBe('NDLS');
      expect(res.body.data.result.to).toBe('BSB');
    });

    it('GET /api/tracking/audit reports RailRadar configuration and quota status', async () => {
      const res = await request(app).get('/api/tracking/audit');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const audit = res.body.data.audit;
      expect(audit.providers.railradar).toBeDefined();
      expect(audit.providers.railradar.configured).toBe(true);
      expect(audit.quota).toBeDefined();
    });
  });
});
