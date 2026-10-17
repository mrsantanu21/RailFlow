import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app, { getAllowedOrigins, isOriginAllowed } from '../index';

describe('CORS Security Policy Verification', () => {
  describe('Origin Authorization Logic', () => {
    it('accepts configured production origins (including comma-separated lists)', () => {
      const prodOrigins = 'https://railflow.pages.dev, https://railflow.santanu.dev';
      expect(isOriginAllowed('https://railflow.pages.dev', prodOrigins, true)).toBe(true);
      expect(isOriginAllowed('https://railflow.santanu.dev', prodOrigins, true)).toBe(true);
      // Handles trailing slashes gracefully
      expect(isOriginAllowed('https://railflow.pages.dev/', prodOrigins, true)).toBe(true);
    });

    it('rejects unapproved production origins', () => {
      const prodOrigins = 'https://railflow.pages.dev';
      expect(isOriginAllowed('https://malicious-site.com', prodOrigins, true)).toBe(false);
      expect(isOriginAllowed('http://localhost:5173', prodOrigins, true)).toBe(false);
    });

    it('rejects unapproved *.pages.dev origins', () => {
      const prodOrigins = 'https://railflow.pages.dev';
      // Arbitrary or spoofed pages.dev origins must not be trusted automatically
      expect(isOriginAllowed('https://evil.pages.dev', prodOrigins, true)).toBe(false);
      expect(isOriginAllowed('https://other-project.pages.dev', prodOrigins, true)).toBe(false);
      expect(isOriginAllowed('https://railflow-phishing.pages.dev', prodOrigins, true)).toBe(false);
    });

    it('supports configured local frontend in development mode', () => {
      expect(isOriginAllowed('http://localhost:5173', undefined, false)).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:5173', undefined, false)).toBe(true);
    });

    it('permits non-browser requests where Origin header is absent', () => {
      const prodOrigins = 'https://railflow.pages.dev';
      expect(isOriginAllowed(undefined, prodOrigins, true)).toBe(true);
      expect(isOriginAllowed('', prodOrigins, true)).toBe(true);
    });
  });

  describe('Express CORS Middleware Integration', () => {
    it('returns Access-Control-Allow-Origin for permitted local dev origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not authorize unapproved origins via CORS headers', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://unauthorized-attacker.com');

      expect(res.status).toBe(200);
      // Disallowed origins must not receive Access-Control-Allow-Origin
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not authorize arbitrary unapproved pages.dev origins', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://random-attacker.pages.dev');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('preserves login and session authentication flow', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: 'passenger@railflow.in',
          password: 'Passenger@123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});
