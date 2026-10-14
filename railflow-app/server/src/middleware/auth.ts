import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler';

// Extend Express Request to include session user
declare module 'express-session' {
  interface SessionData {
    userId: string;
    userRole: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    next(createError('Authentication required', 401, 'UNAUTHENTICATED'));
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    next(createError('Authentication required', 401, 'UNAUTHENTICATED'));
    return;
  }
  if (req.session.userRole !== 'ADMIN') {
    next(createError('Admin access required', 403, 'FORBIDDEN'));
    return;
  }
  next();
}
