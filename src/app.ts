import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { apiRouter } from './api/index.js';
import { errorHandler, requestIdMiddleware, accessLogMiddleware } from './middleware/index.js';
import { config } from './config/index.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(accessLogMiddleware);

  app.use('/api', apiRouter);

  app.use(errorHandler);

  return app;
}
