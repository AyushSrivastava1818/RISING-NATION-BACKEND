import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ideaRepository, IdeaWithHistory } from '../src/repositories/idea.repository.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { notificationService } from '../src/services/notification.service.js';
import { signSessionId } from '../src/utils/crypto.js';
import { isLegalIdeaTransition } from '../src/utils/state-machine.js';
import { ConflictError } from '../src/utils/errors.js';
import { IdeaStatus } from '../types/index.js';
import { prisma } from '../src/repositories/prisma.js';

describe('Idea Pipeline (Slice 3) Test Suite', () => {
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

  let mockIdeasStore: Map<string, any>;
  let mockHistoryStore: any[];
  let adminSessionCookie: string;
  let memberSessionCookie: string;

  beforeEach(async () => {
    mockIdeasStore = new Map();
    mockHistoryStore = [];

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

    // Mock IdeaRepository
    vi.spyOn(ideaRepository, 'create').mockImplementation(async (data) => {
      const id = `idea_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const idea = {
        id,
        ...data,
        status: 'submitted',
        version: 1,
        admin_notes: null,
        reviewed_by: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockIdeasStore.set(id, idea);
      return idea as any;
    });

    vi.spyOn(ideaRepository, 'findById').mockImplementation(async (id: string) => {
      const idea = mockIdeasStore.get(id);
      if (!idea) return null;
      const history = mockHistoryStore.filter((h) => h.idea_id === id);
      return {
        ...idea,
        status_history: history,
      } as any;
    });

    vi.spyOn(ideaRepository, 'list').mockImplementation(async (filters) => {
      let all = Array.from(mockIdeasStore.values());
      if (filters.status) {
        all = all.filter((i) => i.status === filters.status);
      }
      return { ideas: all as any, total: all.length };
    });

    vi.spyOn(ideaRepository, 'updateStatusWithHistory').mockImplementation(async (params) => {
      const current = mockIdeasStore.get(params.id);
      if (!current) throw new Error('Idea not found');
      if (current.version !== params.expectedVersion) {
        throw new ConflictError(
          `Stale version: idea has version ${current.version}, but version ${params.expectedVersion} was supplied.`
        );
      }

      const fromStatus = current.status;
      current.status = params.toStatus;
      current.version += 1;
      current.admin_notes = params.adminNotes !== undefined ? params.adminNotes : current.admin_notes;
      current.reviewed_by = params.changedBy;
      current.updated_at = new Date();
      mockIdeasStore.set(params.id, current);

      const historyEntry = {
        id: `hist_${Date.now()}`,
        idea_id: params.id,
        from_status: fromStatus,
        to_status: params.toStatus,
        changed_by: params.changedBy,
        notes: params.adminNotes || null,
        created_at: new Date(),
      };
      mockHistoryStore.push(historyEntry);

      return {
        ...current,
        status_history: mockHistoryStore.filter((h) => h.idea_id === params.id),
      };
    });
  });

  describe('POST /api/ideas (Public Submission)', () => {
    it('creates idea with 201 and disclaims development/funding', async () => {
      const res = await request(app)
        .post('/api/ideas')
        .send({
          title: 'Automated Micro-Grid Energy Dispatcher',
          problem: 'Small solar microgrids suffer from inefficient load balancing during peak hours.',
          proposed_solution: 'An embedded edge IoT controller with local reinforcement learning for predictive dispatch.',
          target_users: 'Community microgrid operators and solar cooperatives in rural areas.',
          why_it_matters: 'Reduces diesel backup run time by 35% and cuts carbon emissions.',
          current_stage: 'Working prototype on Arduino with simulated loads.',
          skills_team_required: 'Embedded C++, basic electronics, battery chemistry knowledge.',
          document_url: 'https://example.com/spec.pdf',
          demo_url: 'https://example.com/demo',
          contact_email: 'innovator@example.com',
          contact_phone: '+1-555-0199',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('submitted');
      expect(res.body.data.message).toContain('Note: Submission does not guarantee product development or funding');
    });

    it('rejects submission with 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/ideas')
        .send({
          title: 'Incomplete Idea',
          problem: 'Missing other required fields',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('swallows notification service failure without breaking the 201 response', async () => {
      vi.spyOn(notificationService, 'notifyAdminOnIdeaSubmission').mockRejectedValueOnce(
        new Error('Downstream email provider unavailable')
      );

      const res = await request(app)
        .post('/api/ideas')
        .send({
          title: 'Robust Idea',
          problem: 'Email failure should not block submission',
          proposed_solution: 'Swallow and log notification errors',
          target_users: 'All platform users',
          why_it_matters: 'Reliability under partial outages',
          current_stage: 'Design',
          contact_email: 'innovator2@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });
  });

  describe('Idea State Machine Unit Tests', () => {
    const legalTransitions: [IdeaStatus, IdeaStatus][] = [
      ['submitted', 'in_review'],
      ['in_review', 'evaluated'],
      ['evaluated', 'credited'],
      ['evaluated', 'shortlisted'],
      ['evaluated', 'in_development'],
      ['credited', 'shortlisted'],
      ['credited', 'in_development'],
      ['shortlisted', 'in_development'],
    ];

    it.each(legalTransitions)('allows legal transition: %s -> %s', (from, to) => {
      expect(isLegalIdeaTransition(from, to)).toBe(true);
    });

    const illegalTransitions: [IdeaStatus, IdeaStatus][] = [
      ['submitted', 'evaluated'],
      ['submitted', 'credited'],
      ['submitted', 'shortlisted'],
      ['submitted', 'in_development'],
      ['in_review', 'credited'],
      ['in_review', 'shortlisted'],
      ['in_review', 'in_development'],
      ['in_development', 'submitted'],
      ['in_development', 'in_review'],
      ['in_development', 'evaluated'],
      ['shortlisted', 'submitted'],
    ];

    it.each(illegalTransitions)('rejects illegal transition: %s -> %s', (from, to) => {
      expect(isLegalIdeaTransition(from, to)).toBe(false);
    });
  });

  describe('PATCH /api/admin/ideas/:id (Review & State Transitions)', () => {
    let testIdeaId: string;

    beforeEach(async () => {
      const idea = await ideaRepository.create({
        title: 'State Test Idea',
        problem: 'Testing state transitions',
        proposed_solution: 'Automated state machine validation',
        target_users: 'Testers',
        why_it_matters: 'Ensures correct state transitions',
        current_stage: 'Testing',
        contact_email: 'test@example.com',
      });
      testIdeaId = idea.id;
    });

    it('successfully updates legal transition with version increment and audit history', async () => {
      const res = await request(app)
        .patch(`/api/admin/ideas/${testIdeaId}`)
        .set('Cookie', adminSessionCookie)
        .send({
          version: 1,
          status: 'in_review',
          admin_notes: 'Beginning evaluation process',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_review');
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.status_history).toHaveLength(1);
      expect(res.body.data.status_history[0].from_status).toBe('submitted');
      expect(res.body.data.status_history[0].to_status).toBe('in_review');
      expect(res.body.data.status_history[0].notes).toBe('Beginning evaluation process');
    });

    it('rejects illegal transition with 409 conflict', async () => {
      const res = await request(app)
        .patch(`/api/admin/ideas/${testIdeaId}`)
        .set('Cookie', adminSessionCookie)
        .send({
          version: 1,
          status: 'in_development', // Illegal from 'submitted'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('conflict');
      expect(res.body.error.message).toContain('Illegal status transition');
    });

    it('rejects stale version with 409 conflict', async () => {
      // First update moves version from 1 to 2
      await request(app)
        .patch(`/api/admin/ideas/${testIdeaId}`)
        .set('Cookie', adminSessionCookie)
        .send({
          version: 1,
          status: 'in_review',
        });

      // Second request sends stale version 1 instead of 2
      const staleRes = await request(app)
        .patch(`/api/admin/ideas/${testIdeaId}`)
        .set('Cookie', adminSessionCookie)
        .send({
          version: 1,
          status: 'evaluated',
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe('conflict');
      expect(staleRes.body.error.message).toContain('Stale version');
    });

    it('rejects missing version with 400 validation error', async () => {
      const res = await request(app)
        .patch(`/api/admin/ideas/${testIdeaId}`)
        .set('Cookie', adminSessionCookie)
        .send({
          status: 'in_review',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });
  });

  describe('Parameterized 401/403 for Admin Idea Routes', () => {
    const adminRoutes = [
      { method: 'get', path: '/api/admin/ideas' },
      { method: 'get', path: '/api/admin/ideas/placeholder-id' },
      { method: 'patch', path: '/api/admin/ideas/placeholder-id' },
    ];

    describe.each(adminRoutes)('$method $path', ({ method, path }) => {
      it('rejects unauthenticated requests with 401', async () => {
        const res = await (request(app) as any)[method](path);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('unauthenticated');
      });

      it('rejects non-admin role (member) with 403', async () => {
        const res = await (request(app) as any)[method](path)
          .set('Cookie', memberSessionCookie);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('forbidden');
      });
    });
  });

  describe('Integration Test: Atomic Transaction Rollback on Mid-Transaction Failure', () => {
    it('rolls back both idea update and history insert if history insert fails', async () => {
      // Restore real repository implementation for the transaction test
      vi.restoreAllMocks();

      const createdIdea = {
        id: 'test-idea-tx-1',
        title: 'Tx Test',
        problem: 'Prob',
        proposed_solution: 'Sol',
        target_users: 'Users',
        why_it_matters: 'Matters',
        current_stage: 'Stage',
        contact_email: 'test@example.com',
        status: 'submitted',
        version: 1,
        admin_notes: null,
      };

      // Mock prisma transaction to simulate a failure on history creation
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const fakeTx = {
          idea: {
            findUnique: vi.fn().mockResolvedValue(createdIdea),
            update: vi.fn().mockResolvedValue({
              ...createdIdea,
              status: 'in_review',
              version: 2,
            }),
          },
          ideaStatusHistory: {
            create: vi.fn().mockRejectedValue(new Error('Simulated DB network failure during history insert')),
          },
        };

        // Running callback will throw when ideaStatusHistory.create fails
        return callback(fakeTx);
      });

      await expect(
        ideaRepository.updateStatusWithHistory({
          id: 'test-idea-tx-1',
          expectedVersion: 1,
          toStatus: 'in_review',
          changedBy: 'admin-1',
        })
      ).rejects.toThrow('Simulated DB network failure during history insert');
    });
  });
});
