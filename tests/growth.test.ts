import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as growthRepo from '../src/repositories/growth.repository.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { signSessionId } from '../src/utils/crypto.js';
import { prisma } from '../src/repositories/prisma.js';

describe('Growth Ladder Test Suite — ARCHITECTURE.md §3.5/§3.8, API.md PATCH /admin/users/:id/growth-level', () => {
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

  const targetUserId = 't0000000-0000-0000-0000-000000000003';

  let adminSessionCookie: string;
  let memberSessionCookie: string;

  beforeEach(async () => {
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

  describe('PATCH /api/admin/users/:id/growth-level', () => {
    it('changes a growth level and writes an audit history row atomically', async () => {
      const repoSpy = vi.spyOn(growthRepo, 'changeGrowthLevel').mockResolvedValue({
        user: { ...mockMemberUser, id: targetUserId, growth_level: 'contributor' } as any,
        history: {
          id: 'hist-1',
          user_id: targetUserId,
          from_level: 'learner',
          to_level: 'contributor',
          reason: 'Shipped the onboarding flow',
          actor_id: mockAdminUser.id,
          created_at: new Date(),
        } as any,
      });

      const res = await request(app)
        .patch(`/api/admin/users/${targetUserId}/growth-level`)
        .set('Cookie', adminSessionCookie)
        .send({ growth_level: 'contributor', reason: 'Shipped the onboarding flow' });

      expect(res.status).toBe(200);
      expect(res.body.data.growth_level).toBe('contributor');
      expect(res.body.data.history.from_level).toBe('learner');
      expect(res.body.data.history.to_level).toBe('contributor');
      expect(repoSpy).toHaveBeenCalledWith({
        userId: targetUserId,
        toLevel: 'contributor',
        reason: 'Shipped the onboarding flow',
        actorId: mockAdminUser.id,
      });
    });

    it('rejects a missing reason with 400 before touching the repository', async () => {
      const repoSpy = vi.spyOn(growthRepo, 'changeGrowthLevel');

      const res = await request(app)
        .patch(`/api/admin/users/${targetUserId}/growth-level`)
        .set('Cookie', adminSessionCookie)
        .send({ growth_level: 'contributor' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(repoSpy).not.toHaveBeenCalled();
    });

    it('rejects an invalid growth_level enum value with 400', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${targetUserId}/growth-level`)
        .set('Cookie', adminSessionCookie)
        .send({ growth_level: 'ceo', reason: 'Self-appointed' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('rejects self-promotion with 403 and never touches the repository (REQ-GROWTH-002)', async () => {
      const repoSpy = vi.spyOn(growthRepo, 'changeGrowthLevel');

      const res = await request(app)
        .patch(`/api/admin/users/${mockAdminUser.id}/growth-level`)
        .set('Cookie', adminSessionCookie)
        .send({ growth_level: 'lead', reason: 'I deserve it' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
      expect(repoSpy).not.toHaveBeenCalled();
    });
  });

  describe('Parameterized 401/403 for Admin Growth Route', () => {
    const path = `/api/admin/users/${targetUserId}/growth-level`;

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).patch(path).send({ growth_level: 'contributor', reason: 'x' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('rejects non-admin role (member) with 403', async () => {
      const res = await request(app)
        .patch(path)
        .set('Cookie', memberSessionCookie)
        .send({ growth_level: 'contributor', reason: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    });
  });

  describe('Integration: real PostgreSQL transaction atomicity (ARCHITECTURE.md §3.8)', () => {
    it('rolls back the growth_level update when the history insert fails mid-transaction', async () => {
      vi.restoreAllMocks();

      const testUser = await prisma.user.upsert({
        where: { email: 'growth-tx-target@risingnation.org' },
        update: { growth_level: 'learner' },
        create: {
          name: 'Growth Tx Target',
          email: 'growth-tx-target@risingnation.org',
          role: 'member',
          growth_level: 'learner',
        },
      });

      const nonExistentActorId = '00000000-0000-0000-0000-000000000999';

      await expect(
        growthRepo.changeGrowthLevel({
          userId: testUser.id,
          toLevel: 'contributor',
          reason: 'This should roll back completely',
          actorId: nonExistentActorId,
        })
      ).rejects.toThrow();

      const userAfterRollback = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(userAfterRollback!.growth_level).toBe('learner');

      const historyRows = await prisma.growthLevelHistory.findMany({ where: { user_id: testUser.id } });
      expect(historyRows).toHaveLength(0);

      await prisma.user.delete({ where: { id: testUser.id } });
    });

    it('persists both the user update and the audit row together on success', async () => {
      const actor = await prisma.user.upsert({
        where: { email: 'growth-tx-actor@risingnation.org' },
        update: {},
        create: { name: 'Growth Tx Actor', email: 'growth-tx-actor@risingnation.org', role: 'admin' },
      });
      const target = await prisma.user.upsert({
        where: { email: 'growth-tx-target-2@risingnation.org' },
        update: { growth_level: 'learner' },
        create: {
          name: 'Growth Tx Target 2',
          email: 'growth-tx-target-2@risingnation.org',
          role: 'member',
          growth_level: 'learner',
        },
      });

      const result = await growthRepo.changeGrowthLevel({
        userId: target.id,
        toLevel: 'builder',
        reason: 'Real transaction success path',
        actorId: actor.id,
      });

      expect(result.user.growth_level).toBe('builder');
      expect(result.history.from_level).toBe('learner');
      expect(result.history.to_level).toBe('builder');

      const persistedUser = await prisma.user.findUnique({ where: { id: target.id } });
      expect(persistedUser!.growth_level).toBe('builder');

      const historyRows = await prisma.growthLevelHistory.findMany({ where: { user_id: target.id } });
      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].reason).toBe('Real transaction success path');

      await prisma.growthLevelHistory.deleteMany({ where: { user_id: target.id } });
      await prisma.user.delete({ where: { id: target.id } });
      await prisma.user.delete({ where: { id: actor.id } });
    });
  });
});
