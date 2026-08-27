/**
 * Structured logging — ENGINEERING.md §6.5.
 *
 * JSON, one line per event, to stdout. Every log line emitted during request
 * handling carries the request's request_id automatically (via AsyncLocalStorage,
 * set once in requestIdMiddleware) so a request_id in an error response can be
 * traced straight to the matching server log lines.
 *
 * PII (contact_email, contact_phone, applicant_email) must never be passed in
 * `meta` or `message` at info level — callers are responsible for that; this
 * module only adds structure, it doesn't scrub content.
 */

import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    message,
    request_id: getRequestId(),
    timestamp: new Date().toISOString(),
    ...meta,
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
