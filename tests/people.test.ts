import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as peopleRepo from '../src/repositories/people.repository.js';
import * as storageService from '../src/services/storage.service.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { signSessionId } from '../src/utils/crypto.js';
import { prisma } from '../src/repositories/prisma.js';

describe('Showcase Domain (People) Test Suite — ARCHITECTURE.md §3.5, ENGINEERING.md §6.4', () => {
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

  describe('GET /api/people (Public)', () => {
    it('lists people filtered by group', async () => {
      const mockPerson = {
        id: 'person-1',
        user_id: null,
        name: 'Jane Doe',
        role_title: 'Founder',
        group: 'founding',
        short_intro: 'Builder',
        skills: ['Leadership'],
        linkedin_url: null,
        photo_url: null,
        featured: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const listSpy = vi.spyOn(peopleRepo, 'listPeople').mockResolvedValue({ people: [mockPerson], total: 1 });

      const res = await request(app).get('/api/people?group=founding');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('person-1');
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ group: 'founding' }));
    });
  });

  describe('GET /api/people/:id (Public)', () => {
    it('returns 404 for a nonexistent person', async () => {
      vi.spyOn(peopleRepo, 'findPersonById').mockRejectedValue(
        new (await import('../src/utils/errors.js')).NotFoundError('Person not-found not found')
      );

      const res = await request(app).get('/api/people/not-found');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });
  });

  describe('Admin People CRUD', () => {
    it('creates a person', async () => {
      const createSpy = vi.spyOn(peopleRepo, 'createPerson').mockResolvedValue({
        id: 'person-2',
        name: 'New Person',
        role_title: 'Mentor',
        group: 'mentor',
      } as any);

      const res = await request(app)
        .post('/api/admin/people')
        .set('Cookie', adminSessionCookie)
        .send({ name: 'New Person', role_title: 'Mentor', group: 'mentor' });

      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Person', role_title: 'Mentor', group: 'mentor' })
      );
    });

    it('rejects an invalid group enum value', async () => {
      const res = await request(app)
        .post('/api/admin/people')
        .set('Cookie', adminSessionCookie)
        .send({ name: 'Bad Group', role_title: 'X', group: 'not-a-real-group' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('deletes a person', async () => {
      const deleteSpy = vi.spyOn(peopleRepo, 'deletePerson').mockResolvedValue(undefined);

      const res = await request(app).delete('/api/admin/people/person-1').set('Cookie', adminSessionCookie);

      expect(res.status).toBe(204);
      expect(deleteSpy).toHaveBeenCalledWith('person-1');
    });

    it('strips growth_level from PATCH /admin/people/:id — not editable via the generic route', async () => {
      const updateSpy = vi.spyOn(peopleRepo, 'updatePerson').mockResolvedValue({ id: 'person-1', name: 'Renamed' } as any);

      const res = await request(app)
        .patch('/api/admin/people/person-1')
        .set('Cookie', adminSessionCookie)
        .send({ name: 'Renamed', growth_level: 'lead' });

      expect(res.status).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith('person-1', { name: 'Renamed' });
      expect(updateSpy.mock.calls[0][1]).not.toHaveProperty('growth_level');
    });
  });

  describe('Photo Attach Flow (ENGINEERING.md §6.4)', () => {
    it('issues a signed upload URL for a person that exists', async () => {
      vi.spyOn(peopleRepo, 'findPersonById').mockResolvedValue({ id: 'person-1' } as any);
      const signSpy = vi.spyOn(storageService, 'createSignedUploadUrl').mockResolvedValue({
        upload_url: 'https://storage.example/bucket/xyz.jpg?stub-signed-put=true',
        object_key: 'xyz.jpg',
      });

      const res = await request(app)
        .post('/api/admin/people/person-1/photo')
        .set('Cookie', adminSessionCookie)
        .send({ filename: 'photo.jpg', mime_type: 'image/jpeg', size: 2048 });

      expect(res.status).toBe(200);
      expect(res.body.data.object_key).toBe('xyz.jpg');
      expect(signSpy).toHaveBeenCalledWith({ filename: 'photo.jpg', mime_type: 'image/jpeg', size: 2048 });
    });

    it('confirms an upload and sets photo_url when the object exists', async () => {
      vi.spyOn(storageService, 'verifyObjectExists').mockResolvedValue(true);
      const expectedUrl = storageService.publicUrlFor('xyz.jpg');
      const setSpy = vi.spyOn(peopleRepo, 'setPersonPhotoUrl').mockResolvedValue({
        id: 'person-1',
        photo_url: expectedUrl,
      } as any);

      const res = await request(app)
        .post('/api/admin/people/person-1/photo/confirm')
        .set('Cookie', adminSessionCookie)
        .send({ object_key: 'xyz.jpg' });

      expect(res.status).toBe(200);
      expect(res.body.data.photo_url).toBe(expectedUrl);
      expect(setSpy).toHaveBeenCalledWith('person-1', expectedUrl);
    });

    it('returns 422 and does not set photo_url when the object never landed in storage', async () => {
      vi.spyOn(storageService, 'verifyObjectExists').mockResolvedValue(false);
      const setSpy = vi.spyOn(peopleRepo, 'setPersonPhotoUrl');

      const res = await request(app)
        .post('/api/admin/people/person-1/photo/confirm')
        .set('Cookie', adminSessionCookie)
        .send({ object_key: 'never-uploaded.jpg' });

      expect(res.status).toBe(422);
      expect(setSpy).not.toHaveBeenCalled();
    });
  });

  describe('Parameterized 401/403 for Admin People Routes', () => {
    const adminRoutes = [
      { method: 'post', path: '/api/admin/people' },
      { method: 'patch', path: '/api/admin/people/placeholder-id' },
      { method: 'delete', path: '/api/admin/people/placeholder-id' },
      { method: 'post', path: '/api/admin/people/placeholder-id/photo' },
      { method: 'post', path: '/api/admin/people/placeholder-id/photo/confirm' },
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
});
