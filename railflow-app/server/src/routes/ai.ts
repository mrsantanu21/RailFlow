import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { aiService } from '../services/ai/aiService';

const router = Router();

// Rate limiter for AI chat: 30 requests per minute
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'AI assistant rate limit exceeded. Please wait a moment before sending another message.',
    code: 'RATE_LIMIT',
  },
});

const chatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(1000, 'Message cannot exceed 1000 characters'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .max(15)
    .optional(),
});

// ─── GET /api/ai/status ───────────────────────────────────────────────────────
router.get('/status', (req: Request, res: Response) => {
  const isAvailable = aiService.isAvailable();
  res.json({
    success: true,
    data: {
      available: isAvailable,
      provider: 'gemini',
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      freeTierEligible: true,
      hasSession: Boolean(req.session?.userId),
    },
  });
});

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
router.post('/chat', aiLimiter, validate(chatSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, history } = req.body;
    const context = {
      userId: req.session?.userId,
      userRole: req.session?.userRole,
    };

    const response = await aiService.chat(message, history, context);

    res.json({
      success: true,
      data: response,
    });
  } catch (err: any) {
    if (err.code === 'AI_QUOTA_EXHAUSTED') {
      res.status(429).json({
        success: false,
        error: 'Google Gemini free-tier quota has been exhausted. Please try again later or use the standard train search.',
        code: 'QUOTA_EXHAUSTED',
      });
      return;
    }

    if (err.code === 'AI_INVALID_KEY') {
      res.status(503).json({
        success: false,
        error: 'AI service is temporarily unavailable due to provider key configuration.',
        code: 'AI_UNAVAILABLE',
      });
      return;
    }

    next(err);
  }
});

export default router;
