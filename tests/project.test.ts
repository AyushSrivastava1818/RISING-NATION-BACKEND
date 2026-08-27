import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as projectRepo from '../src/repositories/project.repository.js';
import * as storageService from '../src/services/storage.service.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { signSessionId } from '../src/utils/crypto.js';
import { prisma } from '../src/repositories/prisma.js';

describe('Showcase Domain (Projects) Test Suite — ARCHITECTURE.md §3.5, ENGINEERING.md §6.4', () => {
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

  describe('GET /api/projects (Public)', () => {
    it('lists projects filtered by featured', async () => {
      const mockProject = {
        id: 'proj-1',
        name: 'Micro-Grid Dispatcher',
        client_or_category: 'Energy',
        problem: 'Load balancing',
        solution: 'Edge AI',
        result: null,
        technologies: ['IoT', 'Rust'],
        status: 'in_progress',
        featured: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as any;

      const listSpy = vi.spyOn(projectRepo, 'listProjects').mockResolvedValue({ projects: [mockProject], total: 1 });

      const res = await request(app).get('/api/projects?featured=true');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('proj-1');
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ featured: true }));
    });
  });

  describe('GET /api/projects/:id (Public — joined team + media, not N+1)', () => {
    it('returns a single batched detail read with media and team joined', async () => {
      const findSpy = vi.spyOn(projectRepo, 'findProjectById').mockResolvedValue({
        id: 'proj-1',
        name: 'Micro-Grid Dispatcher',
        client_or_category: 'Energy',
        problem: 'Load balancing',
        solution: 'Edge AI',
        result: null,
        technologies: ['IoT'],
        status: 'in_progress',
        featured: true,
        created_at: new Date(),
        updated_at: new Date(),
        media: [{ id: 'media-1', project_id: 'proj-1', media_url: 'https://cdn/img.png', media_type: 'image' }],
        members: [
          {
            project_id: 'proj-1',
            profile_id: 'profile-1',
            contribution_role: 'Lead Engineer',
            profile: {
              id: 'profile-1',
              user_id: null,
              name: 'Jane Doe',
              role_title: 'Engineer',
              group: 'core',
              short_intro: null,
              skills: [],
              linkedin_url: null,
              photo_url: null,
              featured: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          },
        ],
      } as any);

      const res = await request(app).get('/api/projects/proj-1');

      expect(res.status).toBe(200);
      expect(res.body.data.media).toHaveLength(1);
      expect(res.body.data.team).toHaveLength(1);
      expect(res.body.data.team[0]).toMatchObject({
        profile_id: 'profile-1',
        name: 'Jane Doe',
        contribution_role: 'Lead Engineer',
      });
      // Exactly one repository call for the whole detail read — no per-relation-row fan-out.
      expect(findSpy).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when the project does not exist', async () => {
      vi.spyOn(projectRepo, 'findProjectById').mockRejectedValue(
        new (await import('../src/utils/errors.js')).NotFoundError('Project not-found not found')
      );

      const res = await request(app).get('/api/projects/not-found');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });
  });

  describe('Admin Project CRUD', () => {
    it('creates a project', async () => {
      const createSpy = vi.spyOn(projectRepo, 'createProject').mockResolvedValue({
        id: 'proj-2',
        name: 'New Project',
        status: 'in_progress',
        featured: false,
      } as any);

      const res = await request(app)
        .post('/api/admin/projects')
        .set('Cookie', adminSessionCookie)
        .send({ name: 'New Project', status: 'in_progress' });

      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Project', status: 'in_progress' }));
    });

    it('rejects create with missing required fields', async () => {
      const res = await request(app)
        .post('/api/admin/projects')
        .set('Cookie', adminSessionCookie)
        .send({ name: 'Missing status' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('updates a project', async () => {
      vi.spyOn(projectRepo, 'updateProject').mockResolvedValue({ id: 'proj-1', name: 'Renamed' } as any);

      const res = await request(app)
        .patch('/api/admin/projects/proj-1')
        .set('Cookie', adminSessionCookie)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed');
    });

    it('deletes a project', async () => {
      const deleteSpy = vi.spyOn(projectRepo, 'deleteProject').mockResolvedValue(undefined);

      const res = await request(app).delete('/api/admin/projects/proj-1').set('Cookie', adminSessionCookie);

      expect(res.status).toBe(204);
      expect(deleteSpy).toHaveBeenCalledWith('proj-1');
    });
  });

  describe('Media Attach Flow (ENGINEERING.md §6.4)', () => {
    it('issues a signed upload URL for a project that exists', async () => {
      vi.spyOn(projectRepo, 'findProjectById').mockResolvedValue({ id: 'proj-1' } as any);
      const signSpy = vi.spyOn(storageService, 'createSignedUploadUrl').mockResolvedValue({
        upload_url: 'https://storage.example/bucket/abc.png?stub-signed-put=true',
        object_key: 'abc.png',
      });

      const res = await request(app)
        .post('/api/admin/projects/proj-1/media')
        .set('Cookie', adminSessionCookie)
        .send({ filename: 'screenshot.png', mime_type: 'image/png', size: 1024 });

      expect(res.status).toBe(200);
      expect(res.body.data.object_key).toBe('abc.png');
      expect(signSpy).toHaveBeenCalledWith({ filename: 'screenshot.png', mime_type: 'image/png', size: 1024 });
    });

    it('rejects an upload request for a disallowed mime type before touching storage', async () => {
      vi.spyOn(projectRepo, 'findProjectById').mockResolvedValue({ id: 'proj-1' } as any);

      const res = await request(app)
        .post('/api/admin/projects/proj-1/media')
        .set('Cookie', adminSessionCookie)
        .send({ filename: 'malware.exe', mime_type: 'application/x-msdownload', size: 1024 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('confirms an upload and persists the media row when the object exists', async () => {
      vi.spyOn(storageService, 'verifyObjectExists').mockResolvedValue(true);
      const addSpy = vi.spyOn(projectRepo, 'addProjectMedia').mockResolvedValue({
        id: 'media-2',
        project_id: 'proj-1',
        media_url: 'https://storage.example/bucket/abc.png',
        media_type: 'image',
      } as any);

      const res = await request(app)
        .post('/api/admin/projects/proj-1/media/confirm')
        .set('Cookie', adminSessionCookie)
        .send({ object_key: 'abc.png', media_type: 'image' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('media-2');
      expect(addSpy).toHaveBeenCalledWith('proj-1', expect.objectContaining({ media_type: 'image' }));
    });

    it('returns 422 and persists nothing when the object never landed in storage', async () => {
      vi.spyOn(storageService, 'verifyObjectExists').mockResolvedValue(false);
      const addSpy = vi.spyOn(projectRepo, 'addProjectMedia');

      const res = await request(app)
        .post('/api/admin/projects/proj-1/media/confirm')
        .set('Cookie', adminSessionCookie)
        .send({ object_key: 'never-uploaded.png', media_type: 'image' });

      expect(res.status).toBe(422);
      expect(addSpy).not.toHaveBeenCalled();
    });
  });

  describe('Parameterized 401/403 for Admin Project Routes', () => {
    const adminRoutes = [
      { method: 'post', path: '/api/admin/projects' },
      { method: 'patch', path: '/api/admin/projects/placeholder-id' },
      { method: 'delete', path: '/api/admin/projects/placeholder-id' },
      { method: 'post', path: '/api/admin/projects/placeholder-id/media' },
      { method: 'post', path: '/api/admin/projects/placeholder-id/media/confirm' },
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

  describe('Integration: real PostgreSQL join for GET /projects/:id', () => {
    it('returns media and team from a single detail read against the real database', async () => {
      vi.restoreAllMocks();

      const profile = await prisma.peopleProfile.create({
        data: { name: 'Real DB Person', role_title: 'Engineer', group: 'core' },
      });
      const project = await prisma.project.create({
        data: { name: 'Real DB Project', status: 'in_progress' },
      });
      await prisma.projectMedia.create({
        data: { project_id: project.id, media_url: 'https://cdn/real.png', media_type: 'image' },
      });
      await prisma.projectMember.create({
        data: { project_id: project.id, profile_id: profile.id, contribution_role: 'Contributor' },
      });

      const res = await request(app).get(`/api/projects/${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.media).toHaveLength(1);
      expect(res.body.data.team).toHaveLength(1);
      expect(res.body.data.team[0].name).toBe('Real DB Person');

      await prisma.projectMember.delete({ where: { project_id_profile_id: { project_id: project.id, profile_id: profile.id } } });
      await prisma.projectMedia.deleteMany({ where: { project_id: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.peopleProfile.delete({ where: { id: profile.id } });
    });
  });
});
