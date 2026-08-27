import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { publicIdeaRouter } from './idea.routes.js';
import { adminIdeaRouter } from './admin-idea.routes.js';
import { courseRouter, categoryRouter } from './course.routes.js';
import { adminCourseRouter } from './admin-course.routes.js';
import { projectRouter } from './project.routes.js';
import { adminProjectRouter } from './admin-project.routes.js';
import { peopleRouter } from './people.routes.js';
import { adminPeopleRouter } from './admin-people.routes.js';
import { adminGrowthRouter } from './admin-growth.routes.js';
import { publicEnquiryRouter } from './enquiry.routes.js';
import { adminEnquiryRouter } from './admin-enquiry.routes.js';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../repositories/prisma.js';

export const apiRouter = Router();

// Liveness — process responding (ENGINEERING.md §6.5).
apiRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness — database connection acquirable (ENGINEERING.md §6.5). Kept
// separate from /health since an instance can be alive but unable to serve
// requests; an orchestrator needs to know which is true.
apiRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});

// Auth routes
apiRouter.use('/auth', authRouter);

// Public idea routes (POST /ideas)
apiRouter.use(publicIdeaRouter);

// Public learning routes — no auth, zero runtime YouTube dependency
apiRouter.use('/courses', courseRouter);
apiRouter.use('/categories', categoryRouter);

// Public showcase routes — no auth
apiRouter.use('/projects', projectRouter);
apiRouter.use('/people', peopleRouter);

// Public enquiry routes (POST /enquiries) — same rate limiter as POST /ideas
apiRouter.use(publicEnquiryRouter);

// Admin routes with shared requireAdmin middleware
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/placeholder', (req: AuthenticatedRequest, res) => {
  res.status(200).json({
    data: {
      message: 'Admin access granted',
      admin_id: req.user?.id,
    },
  });
});

// Admin idea routes (GET/PATCH /admin/ideas)
adminRouter.use('/ideas', adminIdeaRouter);

// Admin course routes (POST/PATCH/DELETE /admin/courses)
adminRouter.use('/courses', adminCourseRouter);

// Admin project routes (CRUD + media attach)
adminRouter.use('/projects', adminProjectRouter);

// Admin people routes (CRUD + photo attach) — growth_level excluded, see below
adminRouter.use('/people', adminPeopleRouter);

// PATCH /admin/users/:id/growth-level — its own route, not folded into people-edit
adminRouter.use('/users', adminGrowthRouter);

// Admin enquiry routes (GET/PATCH /admin/enquiries)
adminRouter.use('/enquiries', adminEnquiryRouter);

apiRouter.use('/admin', adminRouter);
