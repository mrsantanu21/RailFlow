import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { prisma } from '../db/prisma';
import { cleanupExpiredHolds, stopHoldCleanupJob } from '../services/holdCleanupService';
import { ensureTrainRunInventory } from '../services/inventoryService';

describe('RailFlow Stage 2: Inventory Generation & Booking Reliability Tests', () => {
  let user1Agent: ReturnType<typeof request.agent>;
  let user2Agent: ReturnType<typeof request.agent>;
  let vbScheduleId: string;

  beforeAll(async () => {
    user1Agent = request.agent(app);
    user2Agent = request.agent(app);

    // Login user 1 (passenger)
    await user1Agent.post('/api/auth/login').send({
      email: 'passenger@railflow.in',
      password: 'Passenger@123',
    });

    // Register & login user 2 (fallback to login if already registered from prior test run)
    const regRes = await user2Agent.post('/api/auth/register').send({
      name: 'Stage2 Concurrency Tester',
      email: 'stage2.tester@railflow.in',
      password: 'Password123!',
    });
    if (regRes.status === 409) {
      await user2Agent.post('/api/auth/login').send({
        email: 'stage2.tester@railflow.in',
        password: 'Password123!',
      });
    }

    // Fetch Vande Bharat schedule
    const vbSchedule = await prisma.trainSchedule.findFirst({
      where: {
        train: { number: '22436' },
      },
    });
    expect(vbSchedule).toBeDefined();
    vbScheduleId = vbSchedule!.id;
  });

  afterAll(async () => {
    stopHoldCleanupJob();
  });

  async function deleteTrainRunCascade(trainRunId: string) {
    await prisma.seatAllocation.deleteMany({
      where: {
        OR: [
          { seat: { coach: { trainRunId } } },
          { bookingPassenger: { booking: { trainRunId } } },
        ],
      },
    });
    await prisma.paymentTransaction.deleteMany({
      where: { booking: { trainRunId } },
    });
    await prisma.cancellation.deleteMany({
      where: { booking: { trainRunId } },
    });
    await prisma.bookingPassenger.deleteMany({
      where: { booking: { trainRunId } },
    });
    await prisma.booking.deleteMany({
      where: { trainRunId },
    });
    await prisma.seat.deleteMany({
      where: { coach: { trainRunId } },
    });
    await prisma.coach.deleteMany({
      where: { trainRunId },
    });
    await prisma.trainRun.delete({
      where: { id: trainRunId },
    }).catch(() => {});
  }

  // ─── Test 1: Future-date search creates valid inventory ─────────────────────
  it('1. Future-date search creates valid inventory with coaches and seats beyond seed window', async () => {
    // 35 days in the future (well outside the 15-day seed window)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 35);
    const dateStr = futureDate.toISOString().split('T')[0];

    // Verify TrainRun does not exist prior to search
    const preExistingRun = await prisma.trainRun.findUnique({
      where: {
        scheduleId_runDate: {
          scheduleId: vbScheduleId,
          runDate: dateStr,
        },
      },
    });
    if (preExistingRun) {
      await deleteTrainRunCascade(preExistingRun.id);
    }

    // Execute train search
    const res = await user1Agent.get('/api/trains/search').query({
      from: 'NDLS',
      to: 'BSB',
      date: dateStr,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.trains.length).toBeGreaterThan(0);

    const vbResult = res.body.data.trains.find((t: any) => t.train.number === '22436');
    expect(vbResult).toBeDefined();
    expect(vbResult.trainRunId).toBeDefined();

    // Verify classes availability is non-empty and backed by inventory
    expect(vbResult.classes['EXEC_CHAIR']).toBeDefined();
    expect(vbResult.classes['CHAIR_CAR']).toBeDefined();
    expect(vbResult.classes['EXEC_CHAIR'].available).toBe(52); // E1 coach has 52 seats
    expect(vbResult.classes['CHAIR_CAR'].available).toBe(156); // C1 + C2 = 78 + 78 = 156 seats

    // Verify database rows actually exist
    const persistedRun = await prisma.trainRun.findUnique({
      where: { id: vbResult.trainRunId },
      include: {
        coaches: {
          include: { seats: true },
        },
      },
    });

    expect(persistedRun).toBeDefined();
    expect(persistedRun!.coaches.length).toBe(3); // E1, C1, C2
    const totalSeats = persistedRun!.coaches.reduce((acc, c) => acc + c.seats.length, 0);
    expect(totalSeats).toBe(208); // 52 + 78 + 78
  });

  // ─── Test 2: Repeated searches do not duplicate inventory ───────────────────
  it('2. Repeated searches do not duplicate coaches or seats', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 36);
    const dateStr = futureDate.toISOString().split('T')[0];

    // Search 1
    const res1 = await user1Agent.get('/api/trains/search').query({
      from: 'NDLS',
      to: 'BSB',
      date: dateStr,
    });
    expect(res1.status).toBe(200);
    const trainRunId1 = res1.body.data.trains[0].trainRunId;

    const coachCount1 = await prisma.coach.count({ where: { trainRunId: trainRunId1 } });
    const seatCount1 = await prisma.seat.count({ where: { coach: { trainRunId: trainRunId1 } } });

    // Search 2 (repeated)
    const res2 = await user1Agent.get('/api/trains/search').query({
      from: 'NDLS',
      to: 'BSB',
      date: dateStr,
    });
    expect(res2.status).toBe(200);
    const trainRunId2 = res2.body.data.trains[0].trainRunId;

    // Search 3 (concurrent burst)
    const [cResA, cResB] = await Promise.all([
      user1Agent.get('/api/trains/search').query({ from: 'NDLS', to: 'BSB', date: dateStr }),
      user2Agent.get('/api/trains/search').query({ from: 'NDLS', to: 'BSB', date: dateStr }),
    ]);
    expect(cResA.status).toBe(200);
    expect(cResB.status).toBe(200);

    expect(trainRunId1).toBe(trainRunId2);
    expect(cResA.body.data.trains[0].trainRunId).toBe(trainRunId1);
    expect(cResB.body.data.trains[0].trainRunId).toBe(trainRunId1);

    const coachCountAfter = await prisma.coach.count({ where: { trainRunId: trainRunId1 } });
    const seatCountAfter = await prisma.seat.count({ where: { coach: { trainRunId: trainRunId1 } } });

    expect(coachCountAfter).toBe(coachCount1);
    expect(seatCountAfter).toBe(seatCount1);
  });

  // ─── Test 3: Two simultaneous booking attempts for the final available seat ─
  it('3. Two simultaneous booking attempts for the final available seat result in exactly one winner and one 409', async () => {
    const raceDate = new Date();
    raceDate.setDate(raceDate.getDate() + 40);
    const dateStr = raceDate.toISOString().split('T')[0];

    // Clean up if existing
    const existing = await prisma.trainRun.findUnique({
      where: { scheduleId_runDate: { scheduleId: vbScheduleId, runDate: dateStr } },
    });
    if (existing) {
      await deleteTrainRunCascade(existing.id);
    }

    // Create a special test TrainRun with EXACTLY 1 seat in EXEC_CHAIR
    const raceRun = await prisma.trainRun.create({
      data: {
        scheduleId: vbScheduleId,
        runDate: dateStr,
        status: 'SCHEDULED',
        coaches: {
          create: [
            {
              coachNumber: 'EX1',
              classType: 'EXEC_CHAIR',
              totalSeats: 1,
              seats: {
                create: [{ seatNumber: 1, berthType: 'WINDOW' }],
              },
            },
          ],
        },
      },
    });

    const bookingPayload = {
      trainRunId: raceRun.id,
      scheduleId: vbScheduleId,
      fromStationCode: 'NDLS',
      toStationCode: 'BSB',
      classType: 'EXEC_CHAIR',
      passengers: [{ name: 'Contender', age: 30, gender: 'MALE' }],
    };

    // Both user1 and user2 attempt to book the final available seat simultaneously
    const [res1, res2] = await Promise.all([
      user1Agent.post('/api/bookings').send(bookingPayload),
      user2Agent.post('/api/bookings').send(bookingPayload),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winnerRes = res1.status === 201 ? res1 : res2;
    const loserRes = res1.status === 409 ? res1 : res2;

    expect(winnerRes.body.success).toBe(true);
    expect(winnerRes.body.data.booking.pnr).toBeDefined();

    expect(loserRes.body.success).toBe(false);
    expect(loserRes.body.code).toBe('INSUFFICIENT_SEATS');

    // Verify in DB that only 1 allocation exists for that seat
    const allocations = await prisma.seatAllocation.findMany({
      where: {
        seat: { coach: { trainRunId: raceRun.id } },
        status: { in: ['LOCKED', 'CONFIRMED'] },
      },
    });
    expect(allocations.length).toBe(1);
  });

  // ─── Test 4: An expired hold being released ─────────────────────────────────
  it('4. An expired hold is released by cleanupExpiredHolds and seat becomes available again', async () => {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 41);
    const dateStr = testDate.toISOString().split('T')[0];

    // Ensure inventory exists
    const run = await ensureTrainRunInventory(vbScheduleId, dateStr);

    // Book 1 seat to create a LOCKED allocation
    const bookRes = await user1Agent.post('/api/bookings').send({
      trainRunId: run.id,
      scheduleId: vbScheduleId,
      fromStationCode: 'NDLS',
      toStationCode: 'BSB',
      classType: 'EXEC_CHAIR',
      passengers: [{ name: 'Hold Pax', age: 28, gender: 'FEMALE' }],
    });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.data.booking.id;

    // Find the allocation
    const alloc = await prisma.seatAllocation.findFirst({
      where: { bookingPassenger: { bookingId } },
    });
    expect(alloc).toBeDefined();
    expect(alloc!.status).toBe('LOCKED');

    // Artificially expire the lock
    await prisma.seatAllocation.update({
      where: { id: alloc!.id },
      data: { lockedUntil: new Date(Date.now() - 5000) },
    });

    // Run cleanup
    const cleanupResult = await cleanupExpiredHolds();
    expect(cleanupResult.releasedAllocations).toBeGreaterThanOrEqual(1);

    // Verify allocation is RELEASED and booking is FAILED
    const updatedAlloc = await prisma.seatAllocation.findUnique({
      where: { id: alloc!.id },
    });
    expect(updatedAlloc!.status).toBe('RELEASED');

    const updatedBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });
    expect(updatedBooking!.status).toBe('FAILED');
  });

  // ─── Test 5: Payment failure releasing the appropriate hold ─────────────────
  it('5. Payment failure releases the appropriate seat hold immediately', async () => {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 42);
    const dateStr = testDate.toISOString().split('T')[0];

    const run = await ensureTrainRunInventory(vbScheduleId, dateStr);

    const bookRes = await user1Agent.post('/api/bookings').send({
      trainRunId: run.id,
      scheduleId: vbScheduleId,
      fromStationCode: 'NDLS',
      toStationCode: 'BSB',
      classType: 'EXEC_CHAIR',
      passengers: [{ name: 'FailPay Pax', age: 40, gender: 'MALE' }],
    });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.data.booking.id;

    // Initialize payment
    const initRes = await user1Agent.post('/api/payments/initialize').send({
      bookingId,
      method: 'UPI',
    });
    expect(initRes.status).toBe(200);
    const paymentId = initRes.body.data.paymentId;

    // Simulate payment failure
    const simRes = await user1Agent.post(`/api/payments/${paymentId}/simulate-result`).send({
      outcome: 'FAILED',
      failureReason: 'Bank network timeout',
    });
    expect(simRes.status).toBe(200);
    expect(simRes.body.success).toBe(false);

    // Verify seat allocation is RELEASED
    const allocs = await prisma.seatAllocation.findMany({
      where: { bookingPassenger: { bookingId } },
    });
    for (const a of allocs) {
      expect(a.status).toBe('RELEASED');
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking!.status).toBe('FAILED');
    expect(booking!.paymentStatus).toBe('FAILED');
  });

  // ─── Test 6: A confirmed seat is NEVER released by cleanup ──────────────────
  it('6. A confirmed seat is never released by cleanupExpiredHolds', async () => {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 43);
    const dateStr = testDate.toISOString().split('T')[0];

    const run = await ensureTrainRunInventory(vbScheduleId, dateStr);

    const bookRes = await user1Agent.post('/api/bookings').send({
      trainRunId: run.id,
      scheduleId: vbScheduleId,
      fromStationCode: 'NDLS',
      toStationCode: 'BSB',
      classType: 'EXEC_CHAIR',
      passengers: [{ name: 'Confirmed Pax', age: 33, gender: 'FEMALE' }],
    });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.data.booking.id;

    // Initialize & succeed payment
    const initRes = await user1Agent.post('/api/payments/initialize').send({
      bookingId,
      method: 'UPI',
    });
    const paymentId = initRes.body.data.paymentId;

    const simRes = await user1Agent.post(`/api/payments/${paymentId}/simulate-result`).send({
      outcome: 'SUCCESS',
    });
    expect(simRes.status).toBe(200);
    expect(simRes.body.success).toBe(true);

    // Verify allocation is CONFIRMED
    const allocBefore = await prisma.seatAllocation.findFirst({
      where: { bookingPassenger: { bookingId } },
    });
    expect(allocBefore!.status).toBe('CONFIRMED');

    // Run cleanup multiple times
    await cleanupExpiredHolds();
    await cleanupExpiredHolds();

    // Verify allocation remains CONFIRMED
    const allocAfter = await prisma.seatAllocation.findUnique({
      where: { id: allocBefore!.id },
    });
    expect(allocAfter!.status).toBe('CONFIRMED');

    const bookingAfter = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(bookingAfter!.status).toBe('CONFIRMED');
    expect(bookingAfter!.paymentStatus).toBe('SUCCESS');
  });

  // ─── Test 7: Repeated cleanup is idempotent ─────────────────────────────────
  it('7. Repeated cleanup is idempotent and produces zero side effects', async () => {
    // First run (cleans any existing expired holds)
    await cleanupExpiredHolds();

    // Second run
    const result2 = await cleanupExpiredHolds();
    expect(result2.releasedAllocations).toBe(0);
    expect(result2.failedBookings).toBe(0);

    // Third run
    const result3 = await cleanupExpiredHolds();
    expect(result3.releasedAllocations).toBe(0);
    expect(result3.failedBookings).toBe(0);
  });
});
