import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const requestId = incomingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}`);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

export function errorHandler(
  err: Error & { statusCode?: number; code?: string },
  req: RequestWithId,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        request_id: req.requestId,
      },
    });
    return;
  }

  // Handle unexpected errors (never leak stack trace or internal details)
  console.error(`[INTERNAL_ERROR] ${req.requestId}:`, err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected internal error occurred',
      request_id: req.requestId,
    },
  });
}

export * from './auth.js';
export * from './rate-limit.js';
