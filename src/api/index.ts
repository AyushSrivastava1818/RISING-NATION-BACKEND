import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { publicIdeaRouter } from './idea.routes.js';
import { adminIdeaRouter } from './admin-idea.routes.js';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

apiRouter.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready' });
});

// Auth routes
apiRouter.use('/auth', authRouter);

// Public idea routes (POST /ideas)
apiRouter.use(publicIdeaRouter);

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

apiRouter.use('/admin', adminRouter);
