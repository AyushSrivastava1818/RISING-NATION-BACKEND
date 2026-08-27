import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as enquiryRepo from '../src/repositories/enquiry.repository.js';
import * as categoryRepo from '../src/repositories/course.repository.js';
import { notificationService } from '../src/services/notification.service.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { signSessionId } from '../src/utils/crypto.js';
import { prisma } from '../src/repositories/prisma.js';

describe('Service Intake (Enquiries) Test Suite — ARCHITECTURE.md §3.5, API.md Business/Creator', () => {
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

  const serviceCategory = {
    id: 'svc-1',
    name: 'Website Development',
    slug: 'website-development',
    type: 'service',
    group: 'business',
  };

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

  describe('GET /api/categories?type=service&group= (Public)', () => {
    it('lists service categories filtered by group', async () => {
      const listSpy = vi.spyOn(categoryRepo, 'listCategories').mockResolvedValue([serviceCategory] as any);

      const res = await request(app).get('/api/categories?type=service&group=business');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([serviceCategory]);
      expect(listSpy).toHaveBeenCalledWith({ type: 'service', group: 'business' });
    });
  });

  describe('POST /api/enquiries (Public)', () => {
    it('creates an enquiry with 201 and { id, status: "new" } when services_requested is valid', async () => {
      vi.spyOn(categoryRepo, 'findServiceCategoriesBySlugs').mockResolvedValue([serviceCategory] as any);
      const createSpy = vi.spyOn(enquiryRepo, 'createEnquiry').mockResolvedValue({
        id: 'enq-1',
        type: 'business_solutions',
        services_requested: ['website-development'],
        contact_name: 'Jane Doe',
        contact_email: 'jane@example.com',
        contact_phone: null,
        message: null,
        status: 'new',
        created_at: new Date(),
      } as any);

      const res = await request(app)
        .post('/api/enquiries')
        .send({
          type: 'business_solutions',
          services_requested: ['website-development'],
          contact_name: 'Jane Doe',
          contact_email: 'jane@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ id: 'enq-1', status: 'new' });
      expect(createSpy).toHaveBeenCalled();
    });

    it('returns 422 unprocessable (not 400) when services_requested contains a value not in categories(type=service), and persists nothing', async () => {
      vi.spyOn(categoryRepo, 'findServiceCategoriesBySlugs').mockResolvedValue([serviceCategory] as any);
      const createSpy = vi.spyOn(enquiryRepo, 'createEnquiry');

      const res = await request(app)
        .post('/api/enquiries')
        .send({
          type: 'business_solutions',
          services_requested: ['website-development', 'not-a-real-service'],
          contact_name: 'Jane Doe',
          contact_email: 'jane@example.com',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('unprocessable');
      expect(res.body.error.message).toContain('not-a-real-service');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('rejects malformed requests with 400 validation_error, not 422 (missing required fields)', async () => {
      const res = await request(app).post('/api/enquiries').send({
        type: 'business_solutions',
        services_requested: ['website-development'],
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('rejects an invalid type discriminator with 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .send({
          type: 'not_a_real_type',
          services_requested: ['website-development'],
          contact_name: 'Jane Doe',
          contact_email: 'jane@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('rejects an empty services_requested array with 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .send({
          type: 'creator_support',
          services_requested: [],
          contact_name: 'Jane Doe',
          contact_email: 'jane@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('reuses notificationService and swallows a notification failure without breaking the 201 response', async () => {
      vi.spyOn(categoryRepo, 'findServiceCategoriesBySlugs').mockResolvedValue([serviceCategory] as any);
      vi.spyOn(enquiryRepo, 'createEnquiry').mockResolvedValue({
        id: 'enq-2',
        type: 'creator_support',
        services_requested: ['website-development'],
        contact_name: 'Jane Doe',
        contact_email: 'jane@example.com',
        contact_phone: null,
        message: null,
        status: 'new',
        created_at: new Date(),
      } as any);
      const notifySpy = vi
        .spyOn(notificationService, 'notifyAdminOnEnquirySubmission')
        .mockRejectedValueOnce(new Error('Downstream email provider unavailable'));

      const res = await request(app)
        .post('/api/enquiries')
        .send({
          type: 'creator_support',
          services_requested: ['website-development'],
          contact_name: 'Jane Doe',
          contact_email: 'jane@example.com',
        });

      expect(res.status).toBe(201);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'enq-2', type: 'creator_support', contact_email: 'jane@example.com' })
      );
    });
  });

  describe('Admin Enquiry Routes', () => {
    it('lists enquiries with type/status filters', async () => {
      const listSpy = vi.spyOn(enquiryRepo, 'listEnquiries').mockResolvedValue({
        enquiries: [{ id: 'enq-1', type: 'business_solutions', status: 'new' } as any],
        total: 1,
      });

      const res = await request(app)
        .get('/api/admin/enquiries?type=business_solutions&status=new')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'business_solutions', status: 'new' })
      );
    });

    it('returns 404 for a nonexistent enquiry', async () => {
      vi.spyOn(enquiryRepo, 'findEnquiryById').mockRejectedValue(
        new (await import('../src/utils/errors.js')).NotFoundError('Enquiry not-found not found')
      );

      const res = await request(app).get('/api/admin/enquiries/not-found').set('Cookie', adminSessionCookie);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });

    it('updates an enquiry status', async () => {
      const updateSpy = vi.spyOn(enquiryRepo, 'updateEnquiryStatus').mockResolvedValue({
        id: 'enq-1',
        status: 'contacted',
      } as any);

      const res = await request(app)
        .patch('/api/admin/enquiries/enq-1')
        .set('Cookie', adminSessionCookie)
        .send({ status: 'contacted' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('contacted');
      expect(updateSpy).toHaveBeenCalledWith('enq-1', 'contacted');
    });

    it('rejects an invalid status value with 400', async () => {
      const res = await request(app)
        .patch('/api/admin/enquiries/enq-1')
        .set('Cookie', adminSessionCookie)
        .send({ status: 'not_a_real_status' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });
  });

  describe('Parameterized 401/403 for Admin Enquiry Routes', () => {
    const adminRoutes = [
      { method: 'get', path: '/api/admin/enquiries' },
      { method: 'get', path: '/api/admin/enquiries/placeholder-id' },
      { method: 'patch', path: '/api/admin/enquiries/placeholder-id' },
    ];

    describe.each(adminRoutes)('$method $path', ({ method, path }) => {
      it('rejects unauthenticated requests with 401', async () => {
        const res = await (request(app) as any)[method](path);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('unauthenticated');
      });

      it('rejects non-admin role (member) with 403', async () => {
        const res = await (request(app) as any)[method](path).set('Cookie', memberSessionCookie);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('forbidden');
      });
    });
  });

  describe('Integration: real PostgreSQL validation against categories(type=service)', () => {
    it('persists a real enquiry only when services_requested matches real service categories', async () => {
      vi.restoreAllMocks();

      const category = await prisma.category.upsert({
        where: { slug: 'tx-test-website-development' },
        update: {},
        create: { name: 'Website Development', slug: 'tx-test-website-development', type: 'service', group: 'business' },
      });

      const res = await request(app)
        .post('/api/enquiries')
        .send({
          type: 'business_solutions',
          services_requested: [category.slug],
          contact_name: 'Real DB Test',
          contact_email: 'real-db-test@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('new');

      const persisted = await prisma.enquiry.findUnique({ where: { id: res.body.data.id } });
      expect(persisted).not.toBeNull();
      expect(persisted!.services_requested).toEqual([category.slug]);

      await prisma.enquiry.delete({ where: { id: res.body.data.id } });
      await prisma.category.delete({ where: { id: category.id } });
    });

    it('rejects and persists nothing for a real database lookup against a nonexistent service slug', async () => {
      const beforeCount = await prisma.enquiry.count();

      const res = await request(app)
        .post('/api/enquiries')
        .send({
          type: 'business_solutions',
          services_requested: ['definitely-not-a-real-service-slug'],
          contact_name: 'Real DB Test',
          contact_email: 'real-db-test-2@example.com',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('unprocessable');

      const afterCount = await prisma.enquiry.count();
      expect(afterCount).toBe(beforeCount);
    });
  });
});
