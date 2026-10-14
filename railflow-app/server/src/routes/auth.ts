import { Router, Request, Response, NextFunction } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  phone: z.string().regex(/^\+?[6-9]\d{9}$/).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', validate(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, phone } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      next(createError('Email already registered', 409, 'EMAIL_EXISTS'));
      return;
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const user = await prisma.user.create({
      data: { name, email, passwordHash, phone },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });

    req.session.regenerate((err) => {
      if (err) {
        next(createError('Session initialization error', 500, 'SESSION_ERROR'));
        return;
      }
      req.session.userId = user.id;
      req.session.userRole = user.role;
      res.status(201).json({ success: true, data: { user } });
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      next(createError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
      return;
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      next(createError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
      return;
    }

    req.session.regenerate((err) => {
      if (err) {
        next(createError('Session regeneration error', 500, 'SESSION_ERROR'));
        return;
      }
      req.session.userId = user.id;
      req.session.userRole = user.role;

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            createdAt: user.createdAt,
          },
        },
      });
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.session.destroy((err) => {
    if (err) {
      next(createError('Logout failed', 500, 'LOGOUT_FAILED'));
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });

    if (!user) {
      req.session.destroy(() => {});
      next(createError('User not found', 404, 'USER_NOT_FOUND'));
      return;
    }

    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
});

export default router;
