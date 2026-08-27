import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as courseRepo from '../src/repositories/course.repository.js';
import * as youtubeService from '../src/services/youtube.service.js';
import { sessionRepository, SessionWithUser } from '../src/repositories/session.repository.js';
import { signSessionId } from '../src/utils/crypto.js';
import { UpstreamError } from '../src/utils/errors.js';
import { prisma } from '../src/repositories/prisma.js';

describe('Learning Domain (Courses) Test Suite — ARCHITECTURE.md §3.5, §3.9', () => {
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

  const mockCategory = {
    id: 'c0000000-0000-0000-0000-000000000001',
    name: 'Web Development',
    slug: 'web-development',
    type: 'learning',
    group: null,
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

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/courses (Public)', () => {
    it('lists published courses with pagination metadata, applying no YouTube call', async () => {
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata');
      const mockCourse = {
        id: 'course-1',
        title: 'Intro to HTML',
        description: 'Basics',
        level: 'beginner',
        category_id: mockCategory.id,
        content_source: 'youtube',
        content_ref: 'abc123',
        thumbnail_url: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
        published: true,
        created_at: new Date(),
        updated_at: new Date(),
        category: mockCategory,
      } as any;

      vi.spyOn(courseRepo, 'listCourses').mockResolvedValue({ courses: [mockCourse], total: 1 });

      const res = await request(app).get('/api/courses?category=web-development&level=beginner');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('course-1');
      expect(res.body.data[0].playback_ref).toBe('abc123');
      expect(res.body.data[0].content_ref).toBeUndefined();
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(youtubeSpy).not.toHaveBeenCalled();
    });

    it('returns 404 for a course that does not exist, with zero YouTube calls', async () => {
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata');
      vi.spyOn(courseRepo, 'findCourseById').mockRejectedValue(
        new (await import('../src/utils/errors.js')).NotFoundError('Course not-found not found')
      );

      const res = await request(app).get('/api/courses/not-found');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
      expect(youtubeSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/categories?type=learning (Public)', () => {
    it('lists learning categories', async () => {
      vi.spyOn(courseRepo, 'listCategories').mockResolvedValue([mockCategory] as any);

      const res = await request(app).get('/api/categories?type=learning');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([mockCategory]);
    });
  });

  describe('POST /api/admin/courses (content_source branch — ARCHITECTURE.md §3.5/§3.9)', () => {
    it('rejects content_source=native with 400 and persists nothing', async () => {
      const createSpy = vi.spyOn(courseRepo, 'createCourse');
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata');

      const res = await request(app)
        .post('/api/admin/courses')
        .set('Cookie', adminSessionCookie)
        .send({
          title: 'Native Course',
          level: 'beginner',
          category_id: mockCategory.id,
          content_source: 'native',
          content_ref: 'whatever',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(createSpy).not.toHaveBeenCalled();
      expect(youtubeSpy).not.toHaveBeenCalled();
    });

    it('creates a youtube course: validates content_ref via YouTube API and caches title/thumbnail', async () => {
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata').mockResolvedValue({
        title: 'Real YouTube Title',
        thumbnail_url: 'https://img.youtube.com/vi/xyz789/hqdefault.jpg',
      });

      const createdCourse = {
        id: 'course-2',
        title: 'Real YouTube Title',
        description: undefined,
        level: 'beginner',
        category_id: mockCategory.id,
        content_source: 'youtube',
        content_ref: 'xyz789',
        thumbnail_url: 'https://img.youtube.com/vi/xyz789/hqdefault.jpg',
        published: true,
        created_at: new Date(),
        updated_at: new Date(),
        category: mockCategory,
      } as any;

      const createSpy = vi.spyOn(courseRepo, 'createCourse').mockResolvedValue(createdCourse);

      const res = await request(app)
        .post('/api/admin/courses')
        .set('Cookie', adminSessionCookie)
        .send({
          title: 'Custom Client Title',
          level: 'beginner',
          category_id: mockCategory.id,
          content_source: 'youtube',
          content_ref: 'xyz789',
        });

      expect(res.status).toBe(201);
      expect(youtubeSpy).toHaveBeenCalledWith('xyz789');
      expect(createSpy).toHaveBeenCalled();
      expect(res.body.data.thumbnail_url).toBe('https://img.youtube.com/vi/xyz789/hqdefault.jpg');

      // The external call must happen strictly before the DB write for every invocation
      const youtubeCallOrder = youtubeSpy.mock.invocationCallOrder[0];
      const createCallOrder = createSpy.mock.invocationCallOrder[0];
      expect(youtubeCallOrder).toBeLessThan(createCallOrder);
    });

    it('returns 502 and persists nothing when the YouTube Data API call fails', async () => {
      const youtubeSpy = vi
        .spyOn(youtubeService, 'fetchYouTubeMetadata')
        .mockRejectedValue(new UpstreamError('YouTube content_ref "bad-ref" not found'));
      const createSpy = vi.spyOn(courseRepo, 'createCourse');

      const res = await request(app)
        .post('/api/admin/courses')
        .set('Cookie', adminSessionCookie)
        .send({
          title: 'Broken Course',
          level: 'beginner',
          category_id: mockCategory.id,
          content_source: 'youtube',
          content_ref: 'bad-ref',
        });

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('upstream_error');
      expect(youtubeSpy).toHaveBeenCalledWith('bad-ref');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('rejects missing required fields with 400 before any YouTube call', async () => {
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata');

      const res = await request(app)
        .post('/api/admin/courses')
        .set('Cookie', adminSessionCookie)
        .send({ title: 'Incomplete' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(youtubeSpy).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/admin/courses/:id', () => {
    it('rejects content_source=native with 400 and persists nothing', async () => {
      const updateSpy = vi.spyOn(courseRepo, 'updateCourse');
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata');

      const res = await request(app)
        .patch('/api/admin/courses/course-1')
        .set('Cookie', adminSessionCookie)
        .send({ content_source: 'native' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(updateSpy).not.toHaveBeenCalled();
      expect(youtubeSpy).not.toHaveBeenCalled();
    });

    it('re-validates against YouTube when content_ref changes, before persisting', async () => {
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata').mockResolvedValue({
        title: 'Updated Title',
        thumbnail_url: 'https://img.youtube.com/vi/newref/hqdefault.jpg',
      });

      const updatedCourse = {
        id: 'course-1',
        title: 'Updated Title',
        level: 'beginner',
        category_id: mockCategory.id,
        content_source: 'youtube',
        content_ref: 'newref',
        thumbnail_url: 'https://img.youtube.com/vi/newref/hqdefault.jpg',
        published: true,
        created_at: new Date(),
        updated_at: new Date(),
        category: mockCategory,
      } as any;

      const updateSpy = vi.spyOn(courseRepo, 'updateCourse').mockResolvedValue(updatedCourse);

      const res = await request(app)
        .patch('/api/admin/courses/course-1')
        .set('Cookie', adminSessionCookie)
        .send({ content_ref: 'newref' });

      expect(res.status).toBe(200);
      expect(youtubeSpy).toHaveBeenCalledWith('newref');
      expect(res.body.data.thumbnail_url).toBe('https://img.youtube.com/vi/newref/hqdefault.jpg');

      const youtubeCallOrder = youtubeSpy.mock.invocationCallOrder[0];
      const updateCallOrder = updateSpy.mock.invocationCallOrder[0];
      expect(youtubeCallOrder).toBeLessThan(updateCallOrder);
    });

    it('returns 502 and persists nothing when re-validation against YouTube fails', async () => {
      const youtubeSpy = vi
        .spyOn(youtubeService, 'fetchYouTubeMetadata')
        .mockRejectedValue(new UpstreamError('YouTube Data API unreachable'));
      const updateSpy = vi.spyOn(courseRepo, 'updateCourse');

      const res = await request(app)
        .patch('/api/admin/courses/course-1')
        .set('Cookie', adminSessionCookie)
        .send({ content_ref: 'bad-ref' });

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('upstream_error');
      expect(youtubeSpy).toHaveBeenCalledWith('bad-ref');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('does not call YouTube when content_ref is unchanged', async () => {
      const youtubeSpy = vi.spyOn(youtubeService, 'fetchYouTubeMetadata');
      const updatedCourse = {
        id: 'course-1',
        title: 'Renamed Title',
        level: 'beginner',
        category_id: mockCategory.id,
        content_source: 'youtube',
        content_ref: 'abc123',
        thumbnail_url: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
        published: true,
        created_at: new Date(),
        updated_at: new Date(),
        category: mockCategory,
      } as any;
      vi.spyOn(courseRepo, 'updateCourse').mockResolvedValue(updatedCourse);

      const res = await request(app)
        .patch('/api/admin/courses/course-1')
        .set('Cookie', adminSessionCookie)
        .send({ title: 'Renamed Title' });

      expect(res.status).toBe(200);
      expect(youtubeSpy).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/courses/:id', () => {
    it('hard-deletes the course and returns 204', async () => {
      const deleteSpy = vi.spyOn(courseRepo, 'deleteCourse').mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/admin/courses/course-1')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(204);
      expect(deleteSpy).toHaveBeenCalledWith('course-1');
    });
  });

  describe('Parameterized 401/403 for Admin Course Routes', () => {
    const adminRoutes = [
      { method: 'post', path: '/api/admin/courses' },
      { method: 'patch', path: '/api/admin/courses/placeholder-id' },
      { method: 'delete', path: '/api/admin/courses/placeholder-id' },
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

  describe('Integration: real PostgreSQL round-trip for a youtube course', () => {
    it('persists a real course row only after the (mocked) YouTube validation succeeds', async () => {
      vi.restoreAllMocks();

      vi.spyOn(sessionRepository, 'findSessionById').mockImplementation(async (id: string) => {
        if (id === 'admin_session_1') {
          return {
            id: 'admin_session_1',
            user_id: mockAdminUser.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            last_active_at: new Date(),
            created_at: new Date(),
            user: mockAdminUser as any,
          };
        }
        return null;
      });
      vi.spyOn(sessionRepository, 'updateLastActive').mockResolvedValue(undefined as any);
      vi.spyOn(youtubeService, 'fetchYouTubeMetadata').mockResolvedValue({
        title: 'Real DB Test Title',
        thumbnail_url: 'https://img.youtube.com/vi/realdbtest/hqdefault.jpg',
      });

      const category = await prisma.category.upsert({
        where: { slug: 'tx-test-category' },
        update: {},
        create: { name: 'Tx Test Category', slug: 'tx-test-category', type: 'learning' },
      });

      const res = await request(app)
        .post('/api/admin/courses')
        .set('Cookie', `rn_session=${signSessionId('admin_session_1')}`)
        .send({
          title: 'Real DB Test Course',
          level: 'beginner',
          category_id: category.id,
          content_source: 'youtube',
          content_ref: 'realdbtest',
        });

      expect(res.status).toBe(201);

      const persisted = await prisma.course.findUnique({ where: { id: res.body.data.id } });
      expect(persisted).not.toBeNull();
      expect(persisted!.thumbnail_url).toBe('https://img.youtube.com/vi/realdbtest/hqdefault.jpg');
      expect(persisted!.content_source).toBe('youtube');

      await prisma.course.delete({ where: { id: res.body.data.id } });
      await prisma.category.delete({ where: { id: category.id } });
    });
  });
});
