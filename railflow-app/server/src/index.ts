import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { prisma } from './db/prisma';
import { PrismaSessionStore } from './db/sessionStore';
import { openApiSpec } from './docs/openapi';
import { errorHandler, notFound } from './middleware/errorHandler';
import authRouter from './routes/auth';
import stationsRouter from './routes/stations';
import trainsRouter from './routes/trains';
import faresRouter from './routes/fares';
import bookingsRouter from './routes/bookings';
import paymentsRouter from './routes/payments';
import adminRouter from './routes/admin';
import trackingRouter from './routes/tracking';
import aiRouter from './routes/ai';
import searchRouter from './routes/search';
import { startHoldCleanupJob, stopHoldCleanupJob } from './services/holdCleanupService';
import { indianRailwayService } from './services/indianRailwayService';

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// ─── Trust proxy for secure cookies behind reverse proxies (Render / Cloudflare)
if (isProd) {
  app.set('trust proxy', 1);
}

// ─── Security middleware ─────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", process.env.CLIENT_URL || 'http://localhost:5173'],
          },
        }
      : false, // relaxed in dev for Swagger UI & Vite HMR
  })
);

export const getAllowedOrigins = (
  clientUrlEnv?: string,
  isProduction: boolean = isProd
): string[] => {
  const configured = (clientUrlEnv !== undefined ? clientUrlEnv : (process.env.CLIENT_URL || ''))
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (!isProduction) {
    const devDefaults = ['http://localhost:5173', 'http://127.0.0.1:5173'];
    return configured.length > 0 ? Array.from(new Set([...configured, ...devDefaults])) : devDefaults;
  }

  return configured;
};

export const isOriginAllowed = (
  origin: string | undefined,
  clientUrlEnv?: string,
  isProduction: boolean = isProd
): boolean => {
  if (!origin) return true; // Same-origin or non-browser request
  const normalized = origin.trim().replace(/\/$/, '');
  const allowed = getAllowedOrigins(clientUrlEnv, isProduction);
  return allowed.includes(normalized);
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Request logging (Structured, Non-Test) ───────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip || req.socket.remoteAddress,
      };
      if (res.statusCode >= 400) {
        console.warn(`[HTTP ${logEntry.status}] ${logEntry.method} ${logEntry.path} (${duration}ms)`);
      } else {
        console.log(`[HTTP ${logEntry.status}] ${logEntry.method} ${logEntry.path} (${duration}ms)`);
      }
    });
    next();
  });
}

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Persistent Session Store ─────────────────────────────────────────────────
const sessionStore = new PrismaSessionStore();

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'railflow-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ─── Rate limiting ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: 'Too many requests, please try again later.', code: 'RATE_LIMIT' },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200,
  message: { success: false, error: 'Too many requests, please try again later.', code: 'RATE_LIMIT' },
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ─── API Documentation (Swagger / OpenAPI) ────────────────────────────────────
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'RailFlow API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  })
);
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/stations', stationsRouter);
app.use('/api/trains', trainsRouter);
app.use('/api/fares', faresRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/ai', aiRouter);
app.use('/api/search', searchRouter);

// ─── System Health Check ──────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'UP';
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch {
    dbStatus = 'DOWN';
  }

  const memory = process.memoryUsage();
  res.json({
    success: true,
    message: 'RailFlow API is running',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    status: dbStatus === 'UP' ? 'HEALTHY' : 'DEGRADED',
    services: {
      database: dbStatus,
      sessionStore: 'ACTIVE',
    },
    memory: {
      rssMb: Math.round(memory.rss / (1024 * 1024)),
      heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
    },
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`🚂 RailFlow API Server running on http://localhost:${PORT}`);
    console.log(`   API Documentation: http://localhost:${PORT}/api/docs`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Database: ${process.env.DATABASE_URL || 'file:./dev.db (SQLite)'}`);

    // Initialize periodic expired seat hold cleanup
    startHoldCleanupJob();

    // Pre-load Indian Railway dataset in background
    indianRailwayService.ensureLoaded().catch((err) => {
      console.warn('[Server] Pre-loading Indian Railway dataset encountered error:', err.message);
    });
  });

  const handleShutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down RailFlow API gracefully...`);
    stopHoldCleanupJob();
    server.close(() => {
      console.log('✅ Server closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

export default app;
