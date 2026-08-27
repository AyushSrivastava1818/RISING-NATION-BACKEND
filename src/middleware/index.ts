import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { logger, runWithRequestId } from '../utils/logger.js';

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Assigns a request_id (ARCHITECTURE.md §3.4) and runs the rest of the
 * request-handling chain inside an AsyncLocalStorage scope keyed to it, so
 * every structured log line emitted anywhere during this request — including
 * deep in the service/repository layers — carries the same request_id without
 * threading it through every function signature (ENGINEERING.md §6.5).
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const requestId = incomingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}`);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  runWithRequestId(requestId, next);
}

/**
 * One structured log line per completed request (ENGINEERING.md §6.5) —
 * method, path, status, and latency, which metrics/error-rate-by-route
 * dashboards are built from. Never logs request bodies, so no PII risk here.
 */
export function accessLogMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('request_completed', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
    });
  });
  next();
}

export function errorHandler(
  err: Error & { statusCode?: number; code?: string; data?: any },
  req: RequestWithId,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError || (err.statusCode && err.statusCode < 500)) {
    res.status(err.statusCode || 400).json({
      error: {
        code: err.code || 'error',
        message: err.message,
        request_id: req.requestId,
      },
      ...(err.data ? { data: err.data } : {}),
    });
    return;
  }

  // Full detail (stack trace, message) server-side only, keyed by request_id
  // (ENGINEERING.md §6.3/§6.5) — the client never sees any of this.
  logger.error('unhandled_error', {
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack,
  });

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
