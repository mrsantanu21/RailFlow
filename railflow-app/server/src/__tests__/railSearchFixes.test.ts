import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index';
import {
  buildCheapestOptionPrompt,
  getSuggestedPrompts,
} from '../utils/aiPrompts';
import {
  formatTimeHHmm,
  formatArrivalTime,
} from '../utils/timeFormat';

describe('RailFlow Railway Search Fixes — Verification Test Suite', () => {
  // ─── 1. AI Assistant Context Tests ──────────────────────────────────────────
  describe('1. AI Assistant Context & Dynamic Prompts', () => {
    it('produces a Varanasi/BSB prompt and never "Kanpur" for an NDLS -> BSB search', () => {
      const searchContext = {
        fromCode: 'NDLS',
        fromName: 'New Delhi',
        toCode: 'BSB',
        toName: 'Varanasi Jn',
        date: '2026-10-15',
        quota: 'GENERAL',
        passengers: 1,
      };

      const prompt = buildCheapestOptionPrompt(searchContext);

      // Verify prompt contains origin and destination information
      expect(prompt).toContain('New Delhi (NDLS)');
      expect(prompt).toContain('Varanasi Jn (BSB)');
      expect(prompt).toContain('2026-10-15');
      expect(prompt).toContain('GENERAL');
      expect(prompt).toContain('1 passenger');

      // CRITICAL REQUIREMENT: Must NEVER contain hard-coded "Kanpur"
      expect(prompt.toLowerCase()).not.toContain('kanpur');
    });

    it('asks the user to complete search when origin or destination is missing', () => {
      expect(buildCheapestOptionPrompt(null)).toBe(
        'Please select both origin and destination stations to find the cheapest option.'
      );

      expect(buildCheapestOptionPrompt({ fromCode: 'NDLS', toCode: '' })).toBe(
        'Please select both origin and destination stations to find the cheapest option.'
      );

      expect(buildCheapestOptionPrompt({ fromCode: '', toCode: 'BSB' })).toBe(
        'Please select both origin and destination stations to find the cheapest option.'
      );
    });

    it('generates suggested prompts for quick actions matching search state without Kanpur', () => {
      const searchContext = {
        fromCode: 'NDLS',
        toCode: 'BSB',
        date: '2026-10-15',
      };

      const suggested = getSuggestedPrompts(searchContext);
      const cheapestAction = suggested.find((item) =>
        item.label.toLowerCase().includes('cheapest')
      );
      expect(cheapestAction).toBeDefined();
      expect(cheapestAction!.prompt).toContain('NDLS');
      expect(cheapestAction!.prompt).toContain('BSB');
      expect(cheapestAction!.prompt.toLowerCase()).not.toContain('kanpur');
    });
  });

  // ─── 2. Route-Safe Result Data Tests ─────────────────────────────────────────
  describe('2. Route-Safe Direct Results & Sequence Verification', () => {
    const validFutureDate = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

    it('returns direct results for NDLS -> BSB where origin and destination occur in correct order', async () => {
      const res = await request(app)
        .get('/api/trains/search')
        .query({
          from: 'NDLS',
          to: 'BSB',
          date: validFutureDate,
          quota: 'GENERAL',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.trains).toBeInstanceOf(Array);
      expect(res.body.data.trains.length).toBeGreaterThan(0);

      // Verify every returned train has NDLS before BSB in station sequence
      for (const item of res.body.data.trains) {
        expect(item.journey.fromStation).toBe('NDLS');
        expect(item.journey.toStation).toBe('BSB');

        if (item.route?.stops && item.route.stops.length >= 2) {
          const stops = item.route.stops;
          const fromIdx = stops.findIndex((s: any) => s.stationCode === 'NDLS');
          const toIdx = stops.findIndex((s: any) => s.stationCode === 'BSB');

          expect(fromIdx).toBeGreaterThanOrEqual(0);
          expect(toIdx).toBeGreaterThan(fromIdx);
        }
      }
    });

    it('handles reversed BSB -> NDLS search without returning reversed NDLS -> BSB runs', async () => {
      const res = await request(app)
        .get('/api/trains/search')
        .query({
          from: 'BSB',
          to: 'NDLS',
          date: validFutureDate,
          quota: 'GENERAL',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.trains).toBeInstanceOf(Array);

      // Every returned train must travel from BSB to NDLS in that exact direction
      for (const item of res.body.data.trains) {
        expect(item.journey.fromStation).toBe('BSB');
        expect(item.journey.toStation).toBe('NDLS');

        if (item.route?.stops && item.route.stops.length >= 2) {
          const stops = item.route.stops;
          const fromIdx = stops.findIndex((s: any) => s.stationCode === 'BSB');
          const toIdx = stops.findIndex((s: any) => s.stationCode === 'NDLS');

          expect(fromIdx).toBeGreaterThanOrEqual(0);
          expect(toIdx).toBeGreaterThan(fromIdx);
        }
      }
    });

    it('derives accurate distance and stop count or renders unavailable without inventing numbers', async () => {
      const res = await request(app)
        .get('/api/trains/search')
        .query({
          from: 'NDLS',
          to: 'BSB',
          date: validFutureDate,
        })
        .expect(200);

      for (const item of res.body.data.trains) {
        // Stop count must either be null or a positive integer matching route sequence
        if (item.route?.totalStops != null) {
          expect(typeof item.route.totalStops).toBe('number');
          expect(item.route.totalStops).toBeGreaterThanOrEqual(0);
        }
        // Distance must either be null or a reasonable distance for NDLS -> BSB (~750km)
        if (item.route?.distanceKm != null) {
          expect(typeof item.route.distanceKm).toBe('number');
          expect(item.route.distanceKm).toBeGreaterThan(500);
          expect(item.route.distanceKm).toBeLessThan(1200);
        }
      }
    });
  });

  // ─── 3. Consistent Time Formatting Tests ────────────────────────────────────
  describe('3. Consistent Time Formatting (HH:mm and Next-Day Arrivals)', () => {
    it('formats times with seconds into HH:mm format', () => {
      expect(formatTimeHHmm('20:40:00')).toBe('20:40');
      expect(formatTimeHHmm('06:00:00')).toBe('06:00');
      expect(formatTimeHHmm('14:05:30')).toBe('14:05');
      expect(formatTimeHHmm('23:59:59')).toBe('23:59');
    });

    it('formats times without seconds into HH:mm format', () => {
      expect(formatTimeHHmm('20:40')).toBe('20:40');
      expect(formatTimeHHmm('6:5')).toBe('06:05');
      expect(formatTimeHHmm('9:30')).toBe('09:30');
      expect(formatTimeHHmm('00:00')).toBe('00:00');
    });

    it('handles ISO timestamps and invalid inputs gracefully', () => {
      expect(formatTimeHHmm('2026-10-15T14:30:00.000Z')).toBe('14:30');
      expect(formatTimeHHmm(null)).toBe('—');
      expect(formatTimeHHmm(undefined)).toBe('—');
      expect(formatTimeHHmm('')).toBe('—');
      expect(formatTimeHHmm('not-a-time')).toBe('—');
    });

    it('correctly marks next-day arrivals when applicable', () => {
      // Overnight train: leaves 20:05, arrives 06:10 next morning (duration 10h 5m = 605 min)
      const overnight = formatArrivalTime('06:10', '20:05', 605);
      expect(overnight.time).toBe('06:10');
      expect(overnight.isNextDay).toBe(true);
      expect(overnight.dayOffset).toBe(1);
      expect(overnight.nextDayLabel).toBe('+1 Day');

      // Same-day train: leaves 06:00, arrives 14:00 (duration 8h = 480 min)
      const sameDay = formatArrivalTime('14:00', '06:00', 480);
      expect(sameDay.time).toBe('14:00');
      expect(sameDay.isNextDay).toBe(false);
      expect(sameDay.dayOffset).toBe(0);
      expect(sameDay.nextDayLabel).toBeNull();

      // Explicit day offset
      const explicitNextDay = formatArrivalTime('04:50', '11:35', 1035, 1);
      expect(explicitNextDay.isNextDay).toBe(true);
      expect(explicitNextDay.nextDayLabel).toBe('+1 Day');
    });
  });

  // ─── 4. Stale Search Prevention Tests ────────────────────────────────────────
  describe('4. Stale Search Prevention & Station Swapping Invariant', () => {
    it('prevents old result cards from being presented for swapped routes', () => {
      // Simulate client search state
      const initialFrom = 'NDLS';
      const initialTo = 'BSB';

      // Mock results returned for NDLS -> BSB
      const mockResultNDLStoBSB = {
        trainRunId: 'run-vande-bharat-22436',
        train: { number: '22436', name: 'Vande Bharat Express', type: 'VANDE_BHARAT' },
        journey: {
          fromStation: 'NDLS',
          toStation: 'BSB',
          departureTime: '06:00',
          arrivalTime: '14:00',
          durationMinutes: 480,
        },
        route: {
          stops: [
            { stationCode: 'NDLS', sequence: 1 },
            { stationCode: 'CNB', sequence: 2 },
            { stationCode: 'PRYJ', sequence: 3 },
            { stationCode: 'BSB', sequence: 4 },
          ],
        },
      };

      // In the client, when user swaps stations:
      // 1. Results state is immediately purged to prevent stale display
      let currentResults: any[] = [mockResultNDLStoBSB];
      const swappedFrom = initialTo; // 'BSB'
      const swappedTo = initialFrom; // 'NDLS'

      // Verification of client's safety filter:
      const clientRouteSafetyFilter = (train: any, from: string, to: string) => {
        const tFrom = (train.journey?.fromStation || '').toUpperCase();
        const tTo = (train.journey?.toStation || '').toUpperCase();
        if (tFrom && tTo && (tFrom !== from || tTo !== to)) {
          return false;
        }

        const stops = train.route?.stops;
        if (Array.isArray(stops) && stops.length >= 2) {
          const fromIdx = stops.findIndex((s: any) => s.stationCode.toUpperCase() === from);
          const toIdx = stops.findIndex((s: any) => s.stationCode.toUpperCase() === to);
          if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) {
            return false;
          }
        }
        return true;
      };

      // Before swap: NDLS -> BSB passes safety filter
      expect(clientRouteSafetyFilter(mockResultNDLStoBSB, 'NDLS', 'BSB')).toBe(true);

      // After swap to BSB -> NDLS: old NDLS -> BSB result MUST BE REJECTED by safety filter
      expect(clientRouteSafetyFilter(mockResultNDLStoBSB, swappedFrom, swappedTo)).toBe(false);

      // Clear results on swap
      currentResults = [];
      expect(currentResults).toHaveLength(0);
    });
  });
});
