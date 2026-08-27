import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

apiRouter.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready' });
});

// Mount /auth routes
apiRouter.use('/auth', authRouter);

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

apiRouter.use('/admin', adminRouter);
