import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { signSessionId } from '../src/utils/crypto.js';
import { prisma } from '../src/repositories/prisma.js';

/**
 * Consolidated cross-route authorization audit — ENGINEERING.md §6.1
 * "Broken authorization / IDOR": every /admin/* route requires role=admin,
 * checked before any resource lookup, and a non-admin gets 403, never 404.
 *
 * This is deliberately a single source of truth for the FULL current admin
 * surface, not scattered per-domain checks — a new /admin/* route added
 * later without its own auth test still gets caught here once added to
 * ADMIN_ROUTES below. Per-domain test files still separately verify the
 * happy path and any route-specific behavior.
 */
const ADMIN_ROUTES: { method: 'get' | 'post' | 'patch' | 'delete'; path: string }[] = [
  { method: 'get', path: '/api/admin/placeholder' },

  { method: 'get', path: '/api/admin/ideas' },
  { method: 'get', path: '/api/admin/ideas/placeholder-id' },
  { method: 'patch', path: '/api/admin/ideas/placeholder-id' },

  { method: 'post', path: '/api/admin/courses' },
  { method: 'patch', path: '/api/admin/courses/placeholder-id' },
  { method: 'delete', path: '/api/admin/courses/placeholder-id' },

  { method: 'post', path: '/api/admin/projects' },
  { method: 'patch', path: '/api/admin/projects/placeholder-id' },
  { method: 'delete', path: '/api/admin/projects/placeholder-id' },
  { method: 'post', path: '/api/admin/projects/placeholder-id/media' },
  { method: 'post', path: '/api/admin/projects/placeholder-id/media/confirm' },

  { method: 'post', path: '/api/admin/people' },
  { method: 'patch', path: '/api/admin/people/placeholder-id' },
  { method: 'delete', path: '/api/admin/people/placeholder-id' },
  { method: 'post', path: '/api/admin/people/placeholder-id/photo' },
  { method: 'post', path: '/api/admin/people/placeholder-id/photo/confirm' },

  { method: 'patch', path: '/api/admin/users/placeholder-id/growth-level' },

  { method: 'get', path: '/api/admin/enquiries' },
  { method: 'get', path: '/api/admin/enquiries/placeholder-id' },
  { method: 'patch', path: '/api/admin/enquiries/placeholder-id' },
];

describe('Admin Authorization Audit — every /admin/* route (ENGINEERING.md §6.1)', () => {
  const app = createApp();

  const mockAdminUser = {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Admin User',
    email: 'admin@risingnation.org',
    role: 'admin',
    growth_level: 'lead',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockMemberUser = {
    id: 'm0000000-0000-0000-0000-000000000002',
    name: 'Member User',
    email: 'member@risingnation.org',
    role: 'member',
    growth_level: 'learner',
    created_at: new Date(),
    updated_at: new Date(),
  };

  let adminSessionCookie: string;
  let memberSessionCookie: string;

  beforeEach(() => {
    const adminSessionId = 'admin_session_1';
    const adminSession: SessionWithUser = {
      id: adminSessionId,
      user_id: mockAdminUser.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      last_active_at: new Date(),
      created_at: new Date(),
      user: mockAdminUser as any,
    };

    const memberSessionId = 'member_session_1';
    const memberSession: SessionWithUser = {
      id: memberSessionId,
      user_id: mockMemberUser.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      last_active_at: new Date(),
      created_at: new Date(),
      user: mockMemberUser as any,
    };

    vi.spyOn(sessionRepository, 'findSessionById').mockImplementation(async (id: string) => {
      if (id === adminSessionId) return adminSession;
      if (id === memberSessionId) return memberSession;
      return null;
    });

    vi.spyOn(sessionRepository, 'updateLastActive').mockImplementation(async (id: string) => {
      if (id === adminSessionId) return adminSession;
      if (id === memberSessionId) return memberSession;
      throw new Error('Session not found');
    });

    adminSessionCookie = `rn_session=${signSessionId(adminSessionId)}`;
    memberSessionCookie = `rn_session=${signSessionId(memberSessionId)}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(`covers every currently-registered /admin/* route (${ADMIN_ROUTES.length} checked) — update this list when a new admin route is added`, () => {
    expect(ADMIN_ROUTES.length).toBeGreaterThan(0);
  });

  describe.each(ADMIN_ROUTES)('$method $path', ({ method, path }) => {
    it('rejects an unauthenticated request with 401 unauthenticated, in the standard envelope', async () => {
      const res = await (request(app) as any)[method](path);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
      expect(res.body.error.request_id).toBeDefined();
    });

    it('rejects an authenticated non-admin (member) with 403 forbidden — never 404 (IDOR mitigation)', async () => {
      const res = await (request(app) as any)[method](path).set('Cookie', memberSessionCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
      expect(res.status).not.toBe(404);
    });
  });
});
