import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { prisma } from '../db/prisma';
import { ToolRegistry } from '../services/ai/toolRegistry';
import { aiService } from '../services/ai/aiService';
import { GeminiProvider } from '../services/ai/providers/geminiProvider';
import { AiProvider, AiProviderResponse, ChatMessage, ToolDefinition } from '../services/ai/types';

// Mock Provider for testing tool-calling loop without requiring live Gemini API key
class MockAiProvider implements AiProvider {
  public name = 'mock';
  public responsesToReturn: AiProviderResponse[] = [];

  constructor(responses: AiProviderResponse[] = []) {
    this.responsesToReturn = responses;
  }

  public async generateResponse(
    _messages: ChatMessage[],
    _tools: ToolDefinition[],
    _systemInstruction?: string
  ): Promise<AiProviderResponse> {
    const next = this.responsesToReturn.shift();
    if (next) return next;
    return {
      text: 'Mock response from RailFlow AI assistant.',
    };
  }
}

describe('RailFlow AI Journey Assistant — Verification & Security Tests', () => {
  let testUserId1: string;
  let testUserId2: string;
  let testUser1Cookie: string;
  let testBookingPnr: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Create 2 test users for ownership verification
    const [user1, user2] = await Promise.all([
      prisma.user.upsert({
        where: { email: 'ai.test.user1@railflow.in' },
        update: {},
        create: {
          email: 'ai.test.user1@railflow.in',
          name: 'AI Test Passenger 1',
          passwordHash: 'dummyhash',
          role: 'PASSENGER',
        },
      }),
      prisma.user.upsert({
        where: { email: 'ai.test.user2@railflow.in' },
        update: {},
        create: {
          email: 'ai.test.user2@railflow.in',
          name: 'AI Test Passenger 2',
          passwordHash: 'dummyhash',
          role: 'PASSENGER',
        },
      }),
    ]);
    testUserId1 = user1.id;
    testUserId2 = user2.id;

    // Login user 1 to get session cookie
    // We can register or login with valid argon2 password if needed, or check existing booking
    const existingBooking = await prisma.booking.findFirst({
      where: { userId: testUserId1 },
    });

    if (existingBooking) {
      testBookingPnr = existingBooking.pnr;
    } else {
      // Find a train run to create a test booking
      const trainRun = await prisma.trainRun.findFirst({
        include: { schedule: true },
      });
      if (trainRun) {
        const b = await prisma.booking.create({
          data: {
            pnr: '9988776655',
            userId: testUserId1,
            trainRunId: trainRun.id,
            fromRouteStationSeq: 1,
            toRouteStationSeq: 3,
            classType: 'CHAIR_CAR',
            quotaType: 'GENERAL',
            totalFarePaise: 156000,
            status: 'CONFIRMED',
          },
        });
        testBookingPnr = b.pnr;
      }
    }
  });

  afterAll(async () => {
    if (testBookingPnr) {
      await prisma.booking.deleteMany({ where: { pnr: testBookingPnr } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: ['ai.test.user1@railflow.in', 'ai.test.user2@railflow.in'] } },
    });
    await prisma.$disconnect();
  });

  describe('1. AI Assistant Status & Configuration Endpoint', () => {
    it('GET /api/ai/status returns provider metadata and availability', async () => {
      const res = await request(app).get('/api/ai/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('available');
      expect(res.body.data.provider).toBe('gemini');
      expect(res.body.data.model).toBeDefined();
      expect(res.body.data.freeTierEligible).toBe(true);
    });
  });

  describe('2. Request Validation Middleware', () => {
    it('POST /api/ai/chat rejects empty message with 400', async () => {
      const res = await request(app).post('/api/ai/chat').send({ message: '' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/ai/chat rejects message exceeding character limit with 400', async () => {
      const longMessage = 'A'.repeat(1005);
      const res = await request(app).post('/api/ai/chat').send({ message: longMessage });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Graceful Handling When API Key Is Missing', () => {
    it('returns polite unavailable response without crashing server when GEMINI_API_KEY is not configured', async () => {
      // Explicitly set unconfigured provider
      aiService.setProvider(new GeminiProvider(''));

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Find trains from Delhi to Varanasi' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reply).toContain('GEMINI_API_KEY');

      // Restore active provider
      aiService.setProvider(new GeminiProvider());
    });
  });

  describe('4. ToolRegistry — Search Trains Tool Integration', () => {
    it('search_trains returns real train inventory and fares between NDLS and BSB', async () => {
      // Future date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      const dateStr = futureDate.toISOString().split('T')[0];

      const result = await ToolRegistry.executeTool(
        'search_trains',
        {
          fromStation: 'NDLS',
          toStation: 'BSB',
          date: dateStr,
          passengers: 1,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.origin.code).toBe('NDLS');
      expect(result.data.destination.code).toBe('BSB');
      expect(result.data.trains.length).toBeGreaterThan(0);

      // Verify truthful data invariants
      const firstTrain = result.data.trains[0];
      expect(firstTrain).toHaveProperty('trainNumber');
      expect(firstTrain).toHaveProperty('trainName');
      expect(firstTrain).toHaveProperty('departureTime');
      expect(firstTrain).toHaveProperty('classes');
      expect(typeof firstTrain.departureTime).toBe('string');
    });

    it('search_trains rejects past journey date with clear error', async () => {
      const result = await ToolRegistry.executeTool(
        'search_trains',
        {
          fromStation: 'NDLS',
          toStation: 'BSB',
          date: '2020-01-01',
        },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be in the past');
    });

    it('search_trains rejects unknown stations', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const result = await ToolRegistry.executeTool(
        'search_trains',
        {
          fromStation: 'NON_EXISTENT_STATION_XYZ',
          toStation: 'BSB',
          date: futureDate.toISOString().split('T')[0],
        },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('could not be found');
    });
  });

  describe('5. ToolRegistry — Authoritative Fare Calculation Tool', () => {
    it('get_fare returns exact fare breakdown calculated by backend fareService', async () => {
      const result = await ToolRegistry.executeTool(
        'get_fare',
        {
          trainNumberOrScheduleId: '22436', // Vande Bharat Express
          fromStationCode: 'NDLS',
          toStationCode: 'BSB',
          classType: 'CHAIR_CAR',
          passengers: 1,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.classType).toBe('CHAIR_CAR');
      expect(result.data.breakdownRupees).toHaveProperty('baseFare');
      expect(result.data.breakdownRupees).toHaveProperty('total');
      expect(parseFloat(result.data.breakdownRupees.total)).toBeGreaterThan(0);
    });
  });

  describe('6. ToolRegistry — Security, Authentication & Ownership Isolation', () => {
    it('get_booking_status rejects unauthenticated requests', async () => {
      const result = await ToolRegistry.executeTool(
        'get_booking_status',
        { pnr: '9988776655' },
        {} // unauthenticated: no userId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('AUTHENTICATION_REQUIRED');
    });

    it('get_my_bookings rejects unauthenticated requests', async () => {
      const result = await ToolRegistry.executeTool(
        'get_my_bookings',
        {},
        {} // unauthenticated
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('AUTHENTICATION_REQUIRED');
    });

    it('get_booking_status prevents User 2 from inspecting User 1 booking (ownership isolation)', async () => {
      const result = await ToolRegistry.executeTool(
        'get_booking_status',
        { pnr: testBookingPnr },
        { userId: testUserId2, userRole: 'PASSENGER' } // User 2 trying to read User 1's PNR
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No booking found');
    });

    it('get_booking_status allows User 1 to inspect their own booking', async () => {
      const result = await ToolRegistry.executeTool(
        'get_booking_status',
        { pnr: testBookingPnr },
        { userId: testUserId1, userRole: 'PASSENGER' } // User 1 inspecting own PNR
      );

      expect(result.success).toBe(true);
      expect(result.data.pnr).toBe(testBookingPnr);
      expect(result.data.fromStation.code).toBe('NDLS');
    });

    it('rejects unknown or unapproved tools', async () => {
      const result = await ToolRegistry.executeTool(
        'cancel_ticket_now', // Unauthorized tool
        {},
        { userId: testUserId1 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  describe('7. End-to-End AI Service Tool Execution Loop with Mock Provider', () => {
    it('executes tool call and synthesizes final response with real train results', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      const dateStr = futureDate.toISOString().split('T')[0];

      // Setup MockProvider that requests search_trains tool call first, then returns text
      const mockProvider = new MockAiProvider([
        {
          text: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'search_trains',
              args: {
                fromStation: 'NDLS',
                toStation: 'BSB',
                date: dateStr,
                passengers: 1,
              },
            },
          ],
        },
        {
          text: `Found trains from New Delhi (NDLS) to Varanasi (BSB) on ${dateStr}: Vande Bharat Express is available.`,
        },
      ]);

      aiService.setProvider(mockProvider);

      const response = await aiService.chat(
        `Find trains from New Delhi to Varanasi on ${dateStr}`,
        [],
        { userId: testUserId1 }
      );

      expect(response.reply).toContain('New Delhi');
      expect(response.trainResults).toBeDefined();
      expect(response.trainResults!.length).toBeGreaterThan(0);
      expect(response.toolExecutions).toEqual([
        { tool: 'search_trains', success: true },
      ]);
    });
  });
});
