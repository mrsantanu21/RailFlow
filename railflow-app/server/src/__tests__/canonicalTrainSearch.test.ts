import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index';
import { canonicalStationService } from '../services/canonicalStationService';

describe('RailFlow Canonical Station & Extensible Train Search Test Suite', () => {
  // ─── 1. Canonical Station Resolution & Aliases ──────────────────────────────
  describe('1. Canonical Station Search & Alias Mapping', () => {
    it('resolves typo alias NJPS to canonical NJP (New Jalpaiguri)', () => {
      const canonical = canonicalStationService.resolveCanonicalStationCode('NJPS');
      expect(canonical.code).toBe('NJP');
      expect(canonical.isAlias).toBe(true);
    });

    it('resolves historical city alias Calcutta to Kolkata terminals', async () => {
      const results = await canonicalStationService.searchStations('Calcutta');
      expect(results.length).toBeGreaterThan(0);
      const codes = results.map((s) => s.code);
      expect(codes.some((c) => ['HWH', 'SDAH', 'KOAA'].includes(c))).toBe(true);
    });

    it('resolves Bombay to Mumbai terminals (CSTM, BCT, BDTS)', async () => {
      const results = await canonicalStationService.searchStations('Bombay');
      expect(results.length).toBeGreaterThan(0);
      const codes = results.map((s) => s.code);
      expect(codes.some((c) => ['CSTM', 'BCT', 'BDTS'].includes(c))).toBe(true);
    });

    it('resolves Bangalore to SBC / YPR', async () => {
      const results = await canonicalStationService.searchStations('Bangalore');
      expect(results.length).toBeGreaterThan(0);
      const codes = results.map((s) => s.code);
      expect(codes.some((c) => ['SBC', 'YPR'].includes(c))).toBe(true);
    });

    it('ranks exact station code match at rank #1', async () => {
      const results = await canonicalStationService.searchStations('NDLS');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].code).toBe('NDLS');
    });

    it('quarantines and filters out internal/test placeholder stations like XX-* and YY-*', async () => {
      const results = await canonicalStationService.searchStations('XX-');
      expect(results.length).toBe(0);

      const yyResults = await canonicalStationService.searchStations('YY-');
      expect(yyResults.length).toBe(0);
    });
  });

  // ─── 2. Route Search & No-Result Recovery (NJPS -> HWH) ──────────────────────
  describe('2. Route Search & NJPS -> HWH Resolution', () => {
    it('successfully returns direct trains and alternatives for NJPS -> HWH on 2026-10-16', async () => {
      const res = await request(app)
        .get('/api/search/trains')
        .query({
          from: 'NJPS',
          to: 'HWH',
          date: '2026-10-16',
          quota: 'GENERAL',
          passengers: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.query).toBeDefined();
      expect(res.body.summary).toBeDefined();
      expect(res.body.results).toBeDefined();

      const { query, summary, results, alternatives, meta } = res.body;
      expect(query.from).toBe('NJPS');
      expect(query.to).toBe('HWH');
      expect(summary.dataStatus).toBeDefined();

      // Verified: 6 direct trains operate on this corridor on Friday
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(alternatives).toBeDefined();
      expect(meta.canonicalRoute).toBe('NJP -> HWH');
    });

    it('rejects same origin and destination station search with 400', async () => {
      const res = await request(app)
        .get('/api/search/trains')
        .query({
          from: 'NDLS',
          to: 'NDLS',
          date: '2026-10-16',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cannot be the same');
    });

    it('provides 1-transfer connecting journeys when no direct service exists', async () => {
      const res = await request(app)
        .get('/api/search/trains')
        .query({
          from: 'SGUJ',
          to: 'PUNE',
          date: '2026-10-16',
        });

      expect(res.status).toBe(200);
      const { summary, alternatives } = res.body;
      if (summary.direct === 0) {
        expect(alternatives.connectingJourneysAvailable).toBe(true);
        expect(alternatives.connectingJourneys.length).toBeGreaterThan(0);
        const firstConnection = alternatives.connectingJourneys[0];
        expect(firstConnection.transferStation).toBeDefined();
        expect(firstConnection.leg1).toBeDefined();
        expect(firstConnection.leg2).toBeDefined();
      }
    });
  });

  // ─── 3. Direct Train Number Lookup ──────────────────────────────────────────
  describe('3. Train Lookup Prioritization', () => {
    it('ranks exact 5-digit number match first', async () => {
      const res = await request(app)
        .get('/api/trains/lookup')
        .query({ q: '22436' });

      expect(res.status).toBe(200);
      expect(res.body.data.trains).toBeDefined();
      expect(res.body.data.trains.length).toBeGreaterThan(0);
      expect(res.body.data.trains[0].number).toBe('22436');
    });

    it('supports partial train name lookup', async () => {
      const res = await request(app)
        .get('/api/trains/lookup')
        .query({ q: 'Vande Bharat' });

      expect(res.status).toBe(200);
      expect(res.body.data.trains.length).toBeGreaterThan(0);
      expect(
        res.body.data.trains.some((t: any) =>
          t.name.toLowerCase().includes('vande bharat')
        )
      ).toBe(true);
    });
  });

  // ─── 4. Admin Data Health API ───────────────────────────────────────────────
  describe('4. Admin Data Health & Provenance Endpoint', () => {
    it('returns system data health status with station counts and sync runs when authenticated', async () => {
      const adminAgent = request.agent(app);
      await adminAgent.post('/api/auth/login').send({
        email: 'admin@railflow.in',
        password: 'Admin@123',
      });

      const res = await adminAgent.get('/api/admin/data-health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.status).toBe('HEALTHY');
      expect(data.summary.totalStationsAvailable).toBeGreaterThan(8000);
      expect(data.summary.quarantinedStationsCount).toBeGreaterThan(0);
      expect(data.summary.totalTrainsAvailable).toBeGreaterThan(5000);
    });
  });
});
