import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import {
  indianRailwayService,
  calculateJourneyDuration,
} from '../services/indianRailwayService';

describe('Indian Railway Open Dataset & Station-to-Station Search', () => {
  beforeAll(async () => {
    await indianRailwayService.ensureLoaded();
  });

  describe('1. Dataset Ingestion and Indexing Verification', () => {
    it('successfully loads stations and trains from the local dataset', () => {
      const stationCount = indianRailwayService.getStationCount();
      const trainCount = indianRailwayService.getTrainCount();

      expect(stationCount).toBeGreaterThanOrEqual(8900);
      expect(trainCount).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('2. Station Lookup by Code and Name', () => {
    it('finds station by exact code with case-insensitivity', async () => {
      const hwhLower = await indianRailwayService.getStation('hwh');
      const hwhUpper = await indianRailwayService.getStation('HWH');

      expect(hwhLower).not.toBeNull();
      expect(hwhUpper).not.toBeNull();
      expect(hwhLower?.code).toBe('HWH');
      expect(hwhLower?.name).toContain('HOWRAH');
    });

    it('searches stations by partial name', async () => {
      const results = await indianRailwayService.searchStations('Sealdah', 10);
      expect(results.length).toBeGreaterThan(0);
      const sdah = results.find((s) => s.code === 'SDAH');
      expect(sdah).toBeDefined();
      expect(sdah?.name).toContain('SEALDAH');
    });

    it('searches stations by state filter', async () => {
      const results = await indianRailwayService.searchStations('West Bengal', 20);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((s) => s.state.toLowerCase().includes('west bengal'))).toBe(true);
    });

    it('returns null for unknown station code', async () => {
      const unknown = await indianRailwayService.getStation('XYZ9999');
      expect(unknown).toBeNull();
    });
  });

  describe('3. West Bengal Station Coverage', () => {
    it('verifies all required West Bengal stations exist in the dataset', () => {
      const wbCoverage = indianRailwayService.verifyWestBengalStations();
      const requiredCodes = ['HWH', 'SDAH', 'KOAA', 'NJP', 'SGUJ', 'MLDT', 'ASN', 'RGJ'];

      for (const code of requiredCodes) {
        expect(wbCoverage[code]).toBeDefined();
        expect(wbCoverage[code].present).toBe(true);
        expect(wbCoverage[code].station).not.toBeNull();
        expect(wbCoverage[code].station?.code).toBe(code);
      }
    });
  });

  describe('4. Route Order and Sequence Validation', () => {
    it('confirms source stop occurs strictly before destination stop in matched trains', async () => {
      const trains = await indianRailwayService.searchTrainsBetween('HWH', 'NDLS', '2026-10-18');
      expect(trains.length).toBeGreaterThan(0);

      for (const t of trains) {
        const fromSeq = t.fromStation.sequence;
        const toSeq = t.toStation.sequence;
        expect(fromSeq).toBeLessThan(toSeq);

        const stops = t.route.stops;
        const fromIndexInSlice = stops.findIndex((s) => s.stationCode === 'HWH');
        const toIndexInSlice = stops.findIndex((s) => s.stationCode === 'NDLS');
        expect(fromIndexInSlice).toBe(0);
        expect(toIndexInSlice).toBe(stops.length - 1);
      }
    });

    it('correctly calculates intermediate stop count', async () => {
      const trains = await indianRailwayService.searchTrainsBetween('RGJ', 'KOAA', '2026-10-18');
      expect(trains.length).toBeGreaterThan(0);

      const radhikapurExp = trains.find((t) => t.train.number === '13146');
      expect(radhikapurExp).toBeDefined();

      const expectedIntermediate = radhikapurExp!.toStation.sequence - radhikapurExp!.fromStation.sequence - 1;
      expect(radhikapurExp!.route.totalStops).toBe(expectedIntermediate);
      expect(radhikapurExp!.route.stops.length).toBe(expectedIntermediate + 2);
    });
  });

  describe('5. Reverse Direction Route Searches', () => {
    it('verifies bidirectional searches between Howrah and New Delhi', async () => {
      const forward = await indianRailwayService.searchTrainsBetween('HWH', 'NDLS', '2026-10-18');
      const reverse = await indianRailwayService.searchTrainsBetween('NDLS', 'HWH', '2026-10-18');

      expect(forward.length).toBeGreaterThan(0);
      expect(reverse.length).toBeGreaterThan(0);

      // Verify that forward trains have HWH before NDLS
      for (const t of forward) {
        expect(t.fromStation.code).toBe('HWH');
        expect(t.toStation.code).toBe('NDLS');
      }

      // Verify that reverse trains have NDLS before HWH
      for (const t of reverse) {
        expect(t.fromStation.code).toBe('NDLS');
        expect(t.toStation.code).toBe('HWH');
      }
    });

    it('verifies bidirectional searches between Sealdah and New Jalpaiguri', async () => {
      const forward = await indianRailwayService.searchTrainsBetween('SDAH', 'NJP', '2026-10-18');
      const reverse = await indianRailwayService.searchTrainsBetween('NJP', 'SDAH', '2026-10-18');

      expect(forward.length).toBeGreaterThan(0);
      expect(reverse.length).toBeGreaterThan(0);

      // Darjeeling Mail check
      expect(forward.some((t) => t.train.name.includes('Darjeeling'))).toBe(true);
      expect(reverse.some((t) => t.train.name.includes('Darjeeling'))).toBe(true);
    });

    it('verifies bidirectional searches between Raiganj and Kolkata Chitpur', async () => {
      const rgjToKoaa = await indianRailwayService.searchTrainsBetween('RGJ', 'KOAA', '2026-10-18');
      const koaaToRgj = await indianRailwayService.searchTrainsBetween('KOAA', 'RGJ', '2026-10-18');

      expect(rgjToKoaa.length).toBe(1);
      expect(koaaToRgj.length).toBe(1);

      expect(rgjToKoaa[0].train.number).toBe('13146');
      expect(koaaToRgj[0].train.number).toBe('13145');
    });
  });

  describe('6. Journey Duration and Overnight Calculation', () => {
    it('calculates same-day journey duration correctly', () => {
      // 06:00 to 14:30 on same day
      const duration = calculateJourneyDuration('06:00:00', '14:30:00', 1, 1);
      expect(duration).toBe(510); // 8h 30m = 510m
    });

    it('calculates overnight journey duration across day rollover correctly', () => {
      // Departs 20:00 Day 1, Arrives 06:00 Day 2
      const duration = calculateJourneyDuration('20:00:00', '06:00:00', 1, 2);
      expect(duration).toBe(600); // 10 hours = 600m
    });

    it('handles overnight departure crossing midnight with identical day index', () => {
      // Departs 23:30, Arrives 04:30 next morning
      const duration = calculateJourneyDuration('23:30:00', '04:30:00', 1, 1);
      expect(duration).toBe(300); // 5 hours = 300m
    });

    it('returns null safely for missing time values', () => {
      expect(calculateJourneyDuration(null, '06:00:00')).toBeNull();
      expect(calculateJourneyDuration('20:00:00', null)).toBeNull();
      expect(calculateJourneyDuration(null, null)).toBeNull();
    });
  });

  describe('7. Express API Endpoints Integration', () => {
    it('GET /api/stations returns West Bengal stations via dataset', async () => {
      const res = await request(app).get('/api/stations?q=Howrah&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stations.length).toBeGreaterThan(0);
      expect(res.body.data.stations.some((s: any) => s.code === 'HWH')).toBe(true);
    });

    it('GET /api/stations/:id finds station from dataset', async () => {
      const res = await request(app).get('/api/stations/SDAH');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.station.code).toBe('SDAH');
      expect(res.body.data.station.name).toContain('SEALDAH');
    });

    it('GET /api/trains returns real trains for HWH to NDLS', async () => {
      const res = await request(app).get('/api/trains?from=HWH&to=NDLS&date=2026-10-18');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.trains.length).toBeGreaterThan(0);
      expect(res.body.data.fromStation.code).toBe('HWH');
      expect(res.body.data.toStation.code).toBe('NDLS');
    });

    it('GET /api/trains returns 400 for same origin and destination', async () => {
      const res = await request(app).get('/api/trains?from=HWH&to=HWH&date=2026-10-18');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SAME_STATION');
    });

    it('GET /api/trains returns 404 for non-existent station', async () => {
      const res = await request(app).get('/api/trains?from=XYZ99&to=NDLS&date=2026-10-18');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('STATION_NOT_FOUND');
    });

    it('GET /api/trains/lookup autocompletes train by number from open dataset', async () => {
      const res = await request(app).get('/api/trains/lookup?q=12273');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.trains.length).toBeGreaterThan(0);
      expect(res.body.data.trains.some((t: any) => t.number === '12273')).toBe(true);
    });
  });
});
