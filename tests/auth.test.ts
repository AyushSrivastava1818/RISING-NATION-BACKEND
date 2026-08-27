import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { hashPassword, signSessionId } from '../src/utils/crypto.js';
import { config } from '../src/config/index.js';
import crypto from 'crypto';

describe('Auth & Server-side Session Invalidation Test Harness', () => {
  const app = createApp();

  const mockAdminUser = {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Admin User',
    email: 'admin@risingnation.org',
    password_hash: '',
    role: 'admin',
    growth_level: 'lead',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockMemberUser = {
    id: 'm0000000-0000-0000-0000-000000000002',
    name: 'Member User',
    email: 'member@risingnation.org',
    password_hash: '',
    role: 'member',
    growth_level: 'learner',
    created_at: new Date(),
    updated_at: new Date(),
  };

  let sessionsStore: Map<string, SessionWithUser>;

  beforeEach(async () => {
    sessionsStore = new Map();
    mockAdminUser.password_hash = await hashPassword('ValidAdminPass123!');
    mockMemberUser.password_hash = await hashPassword('ValidMemberPass123!');

    vi.spyOn(userRepository, 'findByEmail').mockImplementation(async (email: string) => {
      if (email.toLowerCase() === mockAdminUser.email) return mockAdminUser as any;
      if (email.toLowerCase() === mockMemberUser.email) return mockMemberUser as any;
      return null;
    });

    vi.spyOn(userRepository, 'findById').mockImplementation(async (id: string) => {
      if (id === mockAdminUser.id) return mockAdminUser as any;
      if (id === mockMemberUser.id) return mockMemberUser as any;
      return null;
    });

    vi.spyOn(userRepository, 'updatePassword').mockImplementation(async (id: string, hash: string) => {
      if (id === mockAdminUser.id) {
        mockAdminUser.password_hash = hash;
        return mockAdminUser as any;
      }
      throw new Error('User not found');
    });

    vi.spyOn(sessionRepository, 'createSession').mockImplementation(async (data) => {
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const user = (data.userId === mockAdminUser.id ? mockAdminUser : mockMemberUser) as any;
      const session: SessionWithUser = {
        id: sessionId,
        user_id: data.userId,
        expires_at: data.expiresAt,
        last_active_at: data.lastActiveAt || new Date(),
        created_at: new Date(),
        user,
      };
      sessionsStore.set(sessionId, session);
      return session;
    });

    vi.spyOn(sessionRepository, 'findSessionById').mockImplementation(async (id: string) => {
      return sessionsStore.get(id) || null;
    });

    vi.spyOn(sessionRepository, 'updateLastActive').mockImplementation(async (id: string, date: Date) => {
      const session = sessionsStore.get(id);
      if (session) {
        session.last_active_at = date;
        sessionsStore.set(id, session);
        return session;
      }
      throw new Error('Session not found');
    });

    vi.spyOn(sessionRepository, 'deleteSession').mockImplementation(async (id: string) => {
      const session = sessionsStore.get(id);
      if (session) {
        sessionsStore.delete(id);
        return session;
      }
      return null;
    });

    vi.spyOn(sessionRepository, 'deleteAllSessionsForUser').mockImplementation(async (userId: string) => {
      let count = 0;
      for (const [id, session] of sessionsStore.entries()) {
        if (session.user_id === userId) {
          sessionsStore.delete(id);
          count++;
        }
      }
      return { count };
    });
  });

  // Parameterized 401/403 pattern for admin routes
  const adminRoutes = [
    { method: 'get', path: '/api/admin/placeholder' },
  ];

  describe.each(adminRoutes)('Protected Route: $method $path', ({ method, path }) => {
    it('rejects unauthenticated requests with 401 and unauthenticated code', async () => {
      const res = await (request(app) as any)[method](path);
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('unauthenticated');
      expect(res.body.error.request_id).toBeDefined();
    });

    it('rejects invalid/tampered session tokens with 401', async () => {
      const res = await (request(app) as any)[method](path)
        .set('Cookie', 'rn_session=invalid.tampered_token');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects non-existent server-side sessions with 401', async () => {
      const ghostSessionToken = signSessionId('ghost_session_id');
      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${ghostSessionToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects sessions expired due to 8-hour idle timeout with 401', async () => {
      const now = Date.now();
      const session = await sessionRepository.createSession({
        userId: mockAdminUser.id,
        expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        lastActiveAt: new Date(now - 8.5 * 60 * 60 * 1000), // >8h idle
      });
      const token = signSessionId(session.id);

      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects sessions expired due to 7-day absolute timeout with 401', async () => {
      const now = Date.now();
      const session = await sessionRepository.createSession({
        userId: mockAdminUser.id,
        expiresAt: new Date(now - 1000), // absolute timeout expired
        lastActiveAt: new Date(now),
      });
      const token = signSessionId(session.id);

      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects authenticated non-admin users with 403 and forbidden code', async () => {
      const session = await sessionRepository.createSession({
        userId: mockMemberUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const memberToken = signSessionId(session.id);

      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${memberToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('forbidden');
      expect(res.body.error.request_id).toBeDefined();
    });

    it('allows authenticated admin users with 200', async () => {
      const session = await sessionRepository.createSession({
        userId: mockAdminUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const adminToken = signSessionId(session.id);

      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('fails on missing credentials with 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('fails on wrong password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@risingnation.org', password: 'WrongPassword!' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects non-admin users from logging in (OD-1)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'member@risingnation.org', password: 'ValidMemberPass123!' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('successfully logs in admin, creates server-side session, and sets cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@risingnation.org', password: 'ValidAdminPass123!' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('admin@risingnation.org');
      expect(res.body.data.user.role).toBe('admin');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('rn_session=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(sessionsStore.size).toBe(1);
    });
  });

  describe('Server-Side Invalidation Tests (ARCHITECTURE.md §3.6)', () => {
    it('Test 1: Login, then logout, then reuse the old cookie on an authenticated route -> must return 401', async () => {
      // 1. Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@risingnation.org', password: 'ValidAdminPass123!' });
      expect(loginRes.status).toBe(200);

      const cookieHeader = loginRes.headers['set-cookie'][0];
      const sessionCookie = cookieHeader.split(';')[0]; // rn_session=...

      // Verify access works before logout
      const beforeLogoutRes = await request(app)
        .get('/api/admin/placeholder')
        .set('Cookie', sessionCookie);
      expect(beforeLogoutRes.status).toBe(200);

      // 2. Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', sessionCookie);
      expect(logoutRes.status).toBe(200);

      // 3. Reuse old cookie on authenticated route
      const afterLogoutRes = await request(app)
        .get('/api/admin/placeholder')
        .set('Cookie', sessionCookie);
      expect(afterLogoutRes.status).toBe(401);
      expect(afterLogoutRes.body.error.code).toBe('unauthenticated');
    });

    it('Test 2: Login, then trigger a password change, then reuse original session cookie on authenticated route -> must return 401', async () => {
      // 1. Login to establish session
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@risingnation.org', password: 'ValidAdminPass123!' });
      expect(loginRes.status).toBe(200);

      const cookieHeader = loginRes.headers['set-cookie'][0];
      const sessionCookie = cookieHeader.split(';')[0]; // rn_session=...

      // Verify access works before password reset
      const beforeResetRes = await request(app)
        .get('/api/admin/placeholder')
        .set('Cookie', sessionCookie);
      expect(beforeResetRes.status).toBe(200);

      // 2. Request password reset and complete reset
      const resetReqRes = await request(app)
        .post('/api/auth/password-reset-request')
        .send({ email: 'admin@risingnation.org' });
      expect(resetReqRes.status).toBe(200);
      const resetToken = resetReqRes.body.data.debug_token;

      const resetRes = await request(app)
        .post('/api/auth/password-reset')
        .send({ token: resetToken, new_password: 'BrandNewAdminPassword123!' });
      expect(resetRes.status).toBe(200);

      // 3. Reuse original session cookie -> must return 401 because all sessions for that user were revoked
      const afterResetRes = await request(app)
        .get('/api/admin/placeholder')
        .set('Cookie', sessionCookie);
      expect(afterResetRes.status).toBe(401);
      expect(afterResetRes.body.error.code).toBe('unauthenticated');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user details when authenticated', async () => {
      const session = await sessionRepository.createSession({
        userId: mockAdminUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const adminToken = signSessionId(session.id);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `rn_session=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(mockAdminUser.id);
      expect(res.body.data.user.email).toBe(mockAdminUser.email);
      expect(res.body.data.user.role).toBe('admin');
      expect(res.body.data.user.password_hash).toBeUndefined();
    });
  });

  describe('Admin Bootstrap Script', () => {
    it('creates bootstrap admin if not exists, and skips if already created', async () => {
      const { bootstrapAdmin } = await import('../scripts/admin-bootstrap.js');
      const { prisma } = await import('../src/repositories/prisma.js');

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);
      const createSpy = vi.spyOn(prisma.user, 'create').mockResolvedValueOnce(mockAdminUser as any);

      const result1 = await bootstrapAdmin();
      expect(result1.created).toBe(true);
      expect(createSpy).toHaveBeenCalled();

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockAdminUser as any);
      const result2 = await bootstrapAdmin();
      expect(result2.created).toBe(false);
    });
  });
});
