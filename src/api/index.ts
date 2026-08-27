import { Router } from 'express';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

apiRouter.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready' });
});
