import { Request, Response, NextFunction } from 'express';

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

export function errorHandler(err: Error & { status?: number; code?: string }, req: RequestWithId, res: Response, _next: NextFunction): void {
  const status = err.status || 500;
  const code = err.code || (status === 500 ? 'internal_error' : 'error');
  const message = status === 500 ? 'An unexpected error occurred' : err.message;

  res.status(status).json({
    error: {
      code,
      message,
      request_id: req.requestId,
    },
  });
}
