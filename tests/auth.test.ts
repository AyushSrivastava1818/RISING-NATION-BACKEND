import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { hashPassword, createSessionToken, verifySessionToken } from '../src/utils/crypto.js';
import { config } from '../src/config/index.js';
import crypto from 'crypto';

describe('Auth & Parameterized 401/403 Test Harness', () => {
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

  beforeEach(async () => {
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

    it('rejects sessions expired due to 8-hour idle timeout with 401', async () => {
      const now = Date.now();
      const idleExpiredPayload = {
        userId: mockAdminUser.id,
        email: mockAdminUser.email,
        role: 'admin',
        createdAt: now - 9 * 60 * 60 * 1000,
        lastActiveAt: now - 8.5 * 60 * 60 * 1000, // >8h idle
      };
      const payloadEncoded = Buffer.from(JSON.stringify(idleExpiredPayload))
        .toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const sig = crypto.createHmac('sha256', config.SESSION_SECRET).update(payloadEncoded).digest('base64url');
      const token = `${payloadEncoded}.${sig}`;

      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects sessions expired due to 7-day absolute timeout with 401', async () => {
      const now = Date.now();
      const absoluteExpiredPayload = {
        userId: mockAdminUser.id,
        email: mockAdminUser.email,
        role: 'admin',
        createdAt: now - 8 * 24 * 60 * 60 * 1000, // >7 days
        lastActiveAt: now - 5 * 60 * 1000, // recent active
      };
      const payloadEncoded = Buffer.from(JSON.stringify(absoluteExpiredPayload))
        .toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const sig = crypto.createHmac('sha256', config.SESSION_SECRET).update(payloadEncoded).digest('base64url');
      const token = `${payloadEncoded}.${sig}`;

      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects authenticated non-admin users with 403 and forbidden code', async () => {
      const memberToken = createSessionToken({
        id: mockMemberUser.id,
        email: mockMemberUser.email,
        role: 'member',
      });

      const res = await (request(app) as any)[method](path)
        .set('Cookie', `rn_session=${memberToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('forbidden');
      expect(res.body.error.request_id).toBeDefined();
    });

    it('allows authenticated admin users with 200', async () => {
      const adminToken = createSessionToken({
        id: mockAdminUser.id,
        email: mockAdminUser.email,
        role: 'admin',
      });

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

    it('successfully logs in admin and sets session cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@risingnation.org', password: 'ValidAdminPass123!' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('admin@risingnation.org');
      expect(res.body.data.user.role).toBe('admin');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('rn_session=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session cookie on logout', async () => {
      const adminToken = createSessionToken({
        id: mockAdminUser.id,
        email: mockAdminUser.email,
        role: 'admin',
      });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `rn_session=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Logged out successfully');
      expect(res.headers['set-cookie'][0]).toContain('rn_session=;');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user details when authenticated', async () => {
      const adminToken = createSessionToken({
        id: mockAdminUser.id,
        email: mockAdminUser.email,
        role: 'admin',
      });

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

  describe('Password Reset Flow', () => {
    it('handles password reset request cleanly', async () => {
      const res = await request(app)
        .post('/api/auth/password-reset-request')
        .send({ email: 'admin@risingnation.org' });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBeDefined();
      expect(res.body.data.debug_token).toBeDefined();

      const resetToken = res.body.data.debug_token;

      // Try reset with password shorter than 12 chars
      const shortPassRes = await request(app)
        .post('/api/auth/password-reset')
        .send({ token: resetToken, new_password: 'short' });
      expect(shortPassRes.status).toBe(400);
      expect(shortPassRes.body.error.code).toBe('validation_error');

      // Reset with valid 12+ char password
      const resetRes = await request(app)
        .post('/api/auth/password-reset')
        .send({ token: resetToken, new_password: 'NewStrongAdminPassword123!' });
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.message).toContain('Password reset successfully');
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

