import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/repositories/prisma.js';

describe('Scaffold & Health Check Harness', () => {
  const app = createApp();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/health returns 200 with ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/ready returns 200 with ready status when the database is reachable', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('GET /api/ready returns 503 when the database connection cannot be acquired (ENGINEERING.md §6.5)', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready' });
  });

  it('assigns x-request-id to responses', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('propagates the same request_id into the structured access log for that request (ENGINEERING.md §6.5)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await request(app).get('/api/health');
    const requestId = res.headers['x-request-id'];

    const accessLogLine = logSpy.mock.calls
      .map((call) => call[0])
      .find((line) => typeof line === 'string' && line.includes('request_completed'));

    expect(accessLogLine).toBeDefined();
    const parsed = JSON.parse(accessLogLine as string);
    expect(parsed.request_id).toBe(requestId);
    expect(parsed.path).toBe('/api/health');
    expect(parsed.status).toBe(200);
  });

  it('honors a client-supplied x-request-id header instead of generating a new one', async () => {
    const res = await request(app).get('/api/health').set('x-request-id', 'client-supplied-id-123');
    expect(res.headers['x-request-id']).toBe('client-supplied-id-123');
  });
});
