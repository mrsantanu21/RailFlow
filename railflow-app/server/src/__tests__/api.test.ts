import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { prisma } from '../db/prisma';
import { trackingService } from '../services/tracking/trackingService';

async function cleanTestFixtures() {
  const testUsers = await prisma.user.findMany({
    where: { email: { in: ['test.user@railflow.in', 'test.user2@railflow.in', 'dup.user@railflow.in'] } },
  });
  const testUserIds = testUsers.map(u => u.id);
  if (testUserIds.length > 0) {
    const bookings = await prisma.booking.findMany({ where: { userId: { in: testUserIds } } });
    const bookingIds = bookings.map(b => b.id);
    if (bookingIds.length > 0) {
      const passengers = await prisma.bookingPassenger.findMany({ where: { bookingId: { in: bookingIds } } });
      const passengerIds = passengers.map(p => p.id);
      await prisma.seatAllocation.deleteMany({ where: { bookingPassengerId: { in: passengerIds } } });
      await prisma.cancellation.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.paymentTransaction.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.bookingPassenger.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }

  const testTrain = await prisma.train.findUnique({ where: { number: '99999' } });
  if (testTrain) {
    const testSchedules = await prisma.trainSchedule.findMany({ where: { trainId: testTrain.id } });
    for (const ts of testSchedules) {
      await prisma.fareRule.deleteMany({ where: { scheduleId: ts.id } });
      await prisma.trainRun.deleteMany({ where: { scheduleId: ts.id } });
    }
    await prisma.trainSchedule.deleteMany({ where: { trainId: testTrain.id } });
    await prisma.train.delete({ where: { id: testTrain.id } });
  }

  const testRoute = await prisma.route.findFirst({ where: { name: 'Test Delhi to Howrah Route' } });
  if (testRoute) {
    await prisma.routeStation.deleteMany({ where: { routeId: testRoute.id } });
    await prisma.route.delete({ where: { id: testRoute.id } });
  }

  await prisma.station.deleteMany({ where: { code: { in: ['TST_NDLS', 'TST_HWH'] } } });
}

describe('RailFlow API — Verification & Integration Tests', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanTestFixtures();
  });

  afterAll(async () => {
    await cleanTestFixtures();
    await prisma.$disconnect();
  });

  describe('1. Health Endpoint', () => {
    it('GET /api/health returns 200 with active status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('RailFlow API is running');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('2. Request Validation Middleware', () => {
    it('POST /api/auth/register rejects invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Invalid User',
          email: 'not-an-email-address',
          password: 'short',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toBeDefined();
    });

    it('POST /api/auth/login rejects empty password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'valid@example.com',
          password: '',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toBeDefined();
    });
  });

  describe('3. Database Connectivity', () => {
    it('verifies connection and table accessibility via Prisma', async () => {
      const count = await prisma.user.count();
      expect(typeof count).toBe('number');
    });
  });

  describe('4. Registration and Authentication Flow', () => {
    it('POST /api/auth/register successfully registers a new user with hashed password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Passenger',
          email: 'test.user@railflow.in',
          password: 'Password123!',
          phone: '9876543210',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test.user@railflow.in');
      expect(res.body.data.user.role).toBe('USER');
      expect(res.body.data.user.passwordHash).toBeUndefined(); // Password hash must never be returned
    });

    it('POST /api/auth/register returns 409 on duplicate email registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate Passenger',
          email: 'test.user@railflow.in',
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMAIL_EXISTS');
    });

    it('POST /api/auth/login successfully authenticates valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test.user@railflow.in',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test.user@railflow.in');
    });

    it('POST /api/auth/login rejects incorrect password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test.user@railflow.in',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('5. Station Search', () => {
    beforeAll(async () => {
      await prisma.station.createMany({
        data: [
          {
            code: 'TST_NDLS',
            name: 'New Delhi Test',
            fullName: 'New Delhi Junction Test',
            zone: 'NR',
            state: 'Delhi',
          },
          {
            code: 'TST_HWH',
            name: 'Howrah Test',
            fullName: 'Howrah Junction Test',
            zone: 'ER',
            state: 'West Bengal',
          },
        ],
      });
    });

    it('GET /api/stations?q=TST_NDLS searches stations by code', async () => {
      const res = await request(app).get('/api/stations?q=TST_NDLS');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stations.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.stations[0].code).toBe('TST_NDLS');
    });

    it('GET /api/stations/:id finds station by code param', async () => {
      const res = await request(app).get('/api/stations/TST_HWH');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.station.name).toBe('Howrah Test');
    });
  });

  describe('6. Fare Calculation', () => {
    let scheduleId: string;

    beforeAll(async () => {
      const train = await prisma.train.create({
        data: {
          number: '99999',
          name: 'Test Superfast Express',
          type: 'SUPERFAST',
        },
      });

      const route = await prisma.route.create({
        data: { name: 'Test Delhi to Howrah Route' },
      });

      const st1 = await prisma.station.findUnique({ where: { code: 'TST_NDLS' } });
      const st2 = await prisma.station.findUnique({ where: { code: 'TST_HWH' } });

      await prisma.routeStation.createMany({
        data: [
          {
            routeId: route.id,
            stationId: st1!.id,
            sequence: 1,
            distanceKm: 0,
            departureOffsetMin: 0,
          },
          {
            routeId: route.id,
            stationId: st2!.id,
            sequence: 2,
            distanceKm: 1400,
            arrivalOffsetMin: 1200,
          },
        ],
      });

      const schedule = await prisma.trainSchedule.create({
        data: {
          trainId: train.id,
          routeId: route.id,
          runningDays: 127,
          departureTime: '16:55',
        },
      });
      scheduleId = schedule.id;

      await prisma.fareRule.create({
        data: {
          scheduleId: schedule.id,
          classType: 'THREE_AC',
          baseFarePaise: 150, // 150 paise/km
          reservationCharge: 4000, // Rs.40
          superfastCharge: 4500, // Rs.45
          cateringCharge: 0,
          gstPercent: 5,
        },
      });
    });

    it('GET /api/fares/quote calculates exact fare breakdown', async () => {
      const res = await request(app).get('/api/fares/quote').query({
        scheduleId,
        fromStationCode: 'TST_NDLS',
        toStationCode: 'TST_HWH',
        classType: 'THREE_AC',
        passengers: 2,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fare.distanceKm).toBe(1400);
      // baseFarePerPax = (150 * 1400) / 100 = 2100 paise
      // chargesPerPax = 4000 + 4500 + 0 = 8500 paise
      // subtotalPerPax = 10600 paise
      // 2 passengers = 21200 paise
      // 5% GST = 1060 paise
      // total = 22260 paise
      expect(res.body.data.fare.passCount).toBe(2);
      expect(res.body.data.fare.total.subtotalPaise).toBe(21200);
      expect(res.body.data.fare.total.gstPaise).toBe(1060);
      expect(res.body.data.fare.total.totalPaise).toBe(22260);
    });
  });

  describe('7. End-to-End Booking Lifecycle & Payment Simulation', () => {
    let passengerAgent: ReturnType<typeof request.agent>;
    let testBookingId: string;
    let testPNR: string;
    let testPaymentId: string;
    let scheduleId: string;
    let trainRunId: string;
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    beforeAll(async () => {
      passengerAgent = request.agent(app);
      // Authenticate test passenger
      await passengerAgent.post('/api/auth/login').send({
        email: 'test.user@railflow.in',
        password: 'Password123!',
      });

      // Find seeded Vande Bharat train run and schedule
      const searchRes = await passengerAgent.get('/api/trains/search').query({
        from: 'NDLS',
        to: 'BSB',
        date: tomorrowStr,
      });

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.trains.length).toBeGreaterThan(0);
      scheduleId = searchRes.body.data.trains[0].scheduleId;
      trainRunId = searchRes.body.data.trains[0].trainRunId;
    });

    it('POST /api/bookings successfully reserves seats with PENDING status and PNR', async () => {
      const res = await passengerAgent.post('/api/bookings').send({
        trainRunId,
        scheduleId,
        fromStationCode: 'NDLS',
        toStationCode: 'BSB',
        classType: 'CHAIR_CAR',
        quotaType: 'GENERAL',
        passengers: [
          {
            name: 'Ananya Sharma',
            age: 28,
            gender: 'FEMALE',
            berthPreference: 'WINDOW',
          },
        ],
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.booking.pnr).toHaveLength(10);
      expect(res.body.data.booking.status).toBe('PENDING');
      expect(res.body.data.booking.passengers[0].coach).toBeDefined();
      expect(res.body.data.booking.passengers[0].seatNumber).toBeDefined();

      testBookingId = res.body.data.booking.id;
      testPNR = res.body.data.booking.pnr;
    });

    it('POST /api/payments/initialize creates a payment intent transaction', async () => {
      const res = await passengerAgent.post('/api/payments/initialize').send({
        bookingId: testBookingId,
        method: 'UPI',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentId).toBeDefined();
      expect(res.body.data.simulatedGateway.orderId).toContain('RF_');

      testPaymentId = res.body.data.paymentId;
    });

    it('POST /api/payments/:id/simulate-result confirms booking and upgrades seats on SUCCESS', async () => {
      const res = await passengerAgent
        .post(`/api/payments/${testPaymentId}/simulate-result`)
        .send({ outcome: 'SUCCESS' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUCCESS');
      expect(res.body.data.pnr).toBe(testPNR);
    });

    it('GET /api/bookings/pnr/:pnr returns CONFIRMED ticket with allocation metadata', async () => {
      const res = await passengerAgent.get(`/api/bookings/pnr/${testPNR}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.booking.status).toBe('CONFIRMED');
      expect(res.body.data.booking.paymentStatus).toBe('SUCCESS');
      expect(res.body.data.booking.passengers[0].allocation.status).toBe('CONFIRMED');
    });

    it('Payment Idempotency: re-simulating payment on processed transaction returns alreadyProcessed', async () => {
      const res = await passengerAgent
        .post(`/api/payments/${testPaymentId}/simulate-result`)
        .send({ outcome: 'SUCCESS' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyProcessed).toBe(true);
    });

    it('POST /api/bookings/:id/cancel cancels confirmed ticket and releases seat allocations', async () => {
      const res = await passengerAgent.post(`/api/bookings/${testBookingId}/cancel`).send({
        reason: 'Change of schedule',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cancellation.pnr).toBe(testPNR);
      expect(res.body.data.cancellation.refundStatus).toBe('PROCESSED');
      expect(res.body.data.cancellation.refundAmountPaise).toBeGreaterThan(0);

      // Verify seat allocations are released in database
      const allocations = await prisma.seatAllocation.findMany({
        where: { bookingPassenger: { bookingId: testBookingId } },
      });
      for (const a of allocations) {
        expect(a.status).toBe('RELEASED');
      }
    });

    it('Cancellation Idempotency: re-cancelling already cancelled booking returns 400', async () => {
      const res = await passengerAgent.post(`/api/bookings/${testBookingId}/cancel`).send({
        reason: 'Duplicate cancellation attempt',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ALREADY_CANCELLED');
    });
  });

  describe('8. Security, Authorization & Ownership Controls', () => {
    let user1Agent: ReturnType<typeof request.agent>;
    let user2Agent: ReturnType<typeof request.agent>;
    let adminAgent: ReturnType<typeof request.agent>;
    let user1PNR: string;

    beforeAll(async () => {
      user1Agent = request.agent(app);
      user2Agent = request.agent(app);
      adminAgent = request.agent(app);

      // User 1 login
      await user1Agent.post('/api/auth/login').send({
        email: 'test.user@railflow.in',
        password: 'Password123!',
      });

      // Register and login User 2
      await user2Agent.post('/api/auth/register').send({
        name: 'Second User',
        email: 'test.user2@railflow.in',
        password: 'Password123!',
      });

      // Admin login (seeded account)
      await adminAgent.post('/api/auth/login').send({
        email: 'admin@railflow.in',
        password: 'Admin@123',
      });

      // User 1 books a ticket
      const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const searchRes = await user1Agent.get('/api/trains/search').query({
        from: 'NDLS',
        to: 'BSB',
        date: tomorrowStr,
      });

      const bookRes = await user1Agent.post('/api/bookings').send({
        trainRunId: searchRes.body.data.trains[0].trainRunId,
        scheduleId: searchRes.body.data.trains[0].scheduleId,
        fromStationCode: 'NDLS',
        toStationCode: 'BSB',
        classType: 'EXEC_CHAIR',
        quotaType: 'GENERAL',
        passengers: [{ name: 'User One Pax', age: 35, gender: 'MALE' }],
      });
      user1PNR = bookRes.body.data.booking.pnr;
    });

    it('Unauthenticated requests to protected endpoints return 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/bookings');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('Ownership Isolation: User 2 cannot access User 1 booking by PNR (returns 404)', async () => {
      const res = await user2Agent.get(`/api/bookings/pnr/${user1PNR}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PNR_NOT_FOUND');
    });

    it('Role-Based Access: Non-admin user cannot access /api/admin/summary (returns 403 FORBIDDEN)', async () => {
      const res = await user1Agent.get('/api/admin/summary');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('Admin Authorization: Seeded Admin can access /api/admin/summary and view operational KPIs', async () => {
      const res = await adminAgent.get('/api/admin/summary');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalStations).toBeGreaterThanOrEqual(8);
      expect(res.body.data.summary.totalTrains).toBeGreaterThanOrEqual(4);
      expect(res.body.data.summary.totalBookings).toBeGreaterThanOrEqual(1);
    });
  });

  describe('9. Segment-Aware Seat Reservation & Concurrency', () => {
    it('allows non-overlapping journey segments to share seat capacity on same train run', async () => {
      const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const agentA = request.agent(app);
      await agentA.post('/api/auth/login').send({
        email: 'test.user@railflow.in',
        password: 'Password123!',
      });

      const searchRes = await agentA.get('/api/trains/search').query({
        from: 'NDLS',
        to: 'BSB',
        date: tomorrowStr,
      });

      const { trainRunId, scheduleId } = searchRes.body.data.trains[0];

      // Segment 1: NDLS -> CNB (Stops 1 to 2)
      const resSeg1 = await agentA.post('/api/bookings').send({
        trainRunId,
        scheduleId,
        fromStationCode: 'NDLS',
        toStationCode: 'CNB',
        classType: 'EXEC_CHAIR',
        passengers: [{ name: 'Pax Segment 1', age: 30, gender: 'MALE' }],
      });
      expect(resSeg1.status).toBe(201);
      expect(resSeg1.body.success).toBe(true);

      // Segment 2: CNB -> BSB (Stops 2 to 3) - Non-overlapping segment!
      const resSeg2 = await agentA.post('/api/bookings').send({
        trainRunId,
        scheduleId,
        fromStationCode: 'CNB',
        toStationCode: 'BSB',
        classType: 'EXEC_CHAIR',
        passengers: [{ name: 'Pax Segment 2', age: 32, gender: 'FEMALE' }],
      });
      expect(resSeg2.status).toBe(201);
      expect(resSeg2.body.success).toBe(true);
    });
  });

  // ─── 10. Real Train Tracking & Data Source Provider Verification ─────────────
  describe('10. Real Train Tracking & Data Source Provider Verification', () => {
    it('GET /api/tracking/:number returns normalized timetable running status with truthful invariants', async () => {
      const res = await request(app).get('/api/tracking/22436');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const status = res.body.data.status;
      expect(status.trainNumber).toBe('22436');
      expect(status.trainName).toMatch(/Vande Bharat/);
      // Invariant: coordinates must be strictly null (never fabricated!)
      expect(status.coordinates).toBeNull();
      // Invariant: meta.isLiveGps must be false
      expect(status.meta.isLiveGps).toBe(false);
      expect([
        'OFFICIAL_CRIS_TIMETABLE_MASTER',
        'UNOFFICIAL_CHUKCHUK_NTES',
        'RAPIDAPI_INDIAN_RAILWAY_IRCTC',
        'RAPIDAPI_INDIAN_RAIL_LIVE',
        'RAILRADAR_API_LIVE',
      ]).toContain(status.meta.source);
      expect(status.meta.limitations).toBeInstanceOf(Array);
      expect(status.meta.limitations.length).toBeGreaterThan(0);
      // Stops progression
      expect(status.stops).toBeInstanceOf(Array);
      expect(status.stops.length).toBeGreaterThanOrEqual(3);
      expect(status.stops[0].stationCode).toBe('NDLS');
      expect(status.stops[status.stops.length - 1].stationCode).toBe('BSB');
    }, 15000);

    it('GET /api/tracking/active-trains returns seeded trackable trains', async () => {
      const res = await request(app).get('/api/tracking/active-trains');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.trains.length).toBeGreaterThanOrEqual(3);
      const vb = res.body.data.trains.find((t: any) => t.number === '22436');
      expect(vb).toBeDefined();
      expect(vb.name).toBe('Vande Bharat Express');
    });

    it('GET /api/tracking/audit returns comprehensive candidate feed audit', async () => {
      const res = await request(app).get('/api/tracking/audit');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const audit = res.body.data.audit;
      expect(audit.candidates).toBeInstanceOf(Array);
      expect(audit.candidates.length).toBeGreaterThanOrEqual(4);
      expect(audit.activeProvider).toBeDefined();
    });

    it('GET /api/tracking/77777 returns 404 TRAIN_NOT_FOUND', async () => {
      const res = await request(app).get('/api/tracking/77777');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('TRAIN_NOT_FOUND');
    }, 15000);

    it('GET /api/tracking/abc returns 400 INVALID_TRAIN_NUMBER', async () => {
      const res = await request(app).get('/api/tracking/abc');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TRAIN_NUMBER');
    });

    it('Caching Invariant: repeat query serves cached status without throwing', async () => {
      const res1 = await request(app).get('/api/tracking/12301');
      expect(res1.status).toBe(200);
      const res2 = await request(app).get('/api/tracking/12301');
      expect(res2.status).toBe(200);
      expect(res2.body.data.status.trainNumber).toBe('12301');
    }, 15000);
  });

  // ─── 11. ChukChuk API Provider & Integration Verification ────────────────────
  describe('11. ChukChuk API Provider & Integration Verification', () => {
    it('ChukChukTrackingProvider: validates configuration and base URL', () => {
      const provider = trackingService.getChukChukProvider();
      expect(provider.name).toBe('UNOFFICIAL_CHUKCHUK_NTES');
      expect(provider.isRealtimeFeed).toBe(true);
      expect(provider.isConfigured()).toBe(true);
      expect(provider.getBaseUrl()).toBeDefined();
    });

    it('ChukChukTrackingProvider: rejects non-5-digit numbers with informative validation error', async () => {
      const provider = trackingService.getChukChukProvider();
      await expect(provider.getRunningStatus('123')).rejects.toThrow(
        /5-digit Indian Railways train number/i
      );
    });

    it('GET /api/tracking/audit: reports ChukChuk-API candidate and configured provider', async () => {
      const res = await request(app).get('/api/tracking/audit');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const audit = res.body.data.audit;
      expect(audit.providers?.chukchuk?.configured).toBe(true);
      const chukChukCand = audit.candidates.find((c: any) => c.id === 'chukchuk-api');
      expect(chukChukCand).toBeDefined();
      expect(chukChukCand.statusInRailFlow).toBe('ADAPTER_CONFIGURED_CHUKCHUK');
      expect(chukChukCand.providesRawGpsCoordinates).toBe(false);
    });

    it('GET /api/tracking/:trainNumber: live ChukChuk query preserves coordinates: null invariant', async () => {
      const res = await request(app).get('/api/tracking/12301');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const status = res.body.data.status;
      expect(status.trainNumber).toBe('12301');
      expect(status.coordinates).toBeNull();
      expect(status.meta.isLiveGps).toBe(false);
      expect(status.meta.limitations).toBeInstanceOf(Array);
      expect(status.meta.limitations.length).toBeGreaterThanOrEqual(1);
    }, 15000);

    it('Fallback Resiliency: gracefully falls back to timetable when ChukChuk returns no active run for seeded train', async () => {
      // Train 22436 is in the local DB. If queried through tracking service, it resolves gracefully.
      const res = await request(app).get('/api/tracking/22436');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status.trainNumber).toBe('22436');
      expect(res.body.data.status.coordinates).toBeNull();
    }, 15000);
  });
});

