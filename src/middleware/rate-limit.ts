import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config/index.js';
import { RequestWithId } from './index.js';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.RATE_LIMIT_LOGIN_MAX, // from config matching ENGINEERING.md §6.9
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const requestId = (req as RequestWithId).requestId;
    res.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Too many login attempts, please try again later',
        request_id: requestId,
      },
    });
  },
});
