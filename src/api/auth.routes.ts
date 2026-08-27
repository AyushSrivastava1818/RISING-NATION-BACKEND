import { Router, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import {
  authenticate,
  AuthenticatedRequest,
  SESSION_COOKIE_NAME,
  getCookieOptions,
} from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rate-limit.js';
import { ValidationError } from '../utils/errors.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  new_password: z.string().min(12, 'Password must be at least 12 characters'),
});

// POST /auth/login
authRouter.post('/login', loginRateLimiter, async (req, res, next) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Invalid input');
    }

    const { email, password } = parseResult.data;
    const { user, sessionToken } = await authService.login(email, password);

    res.cookie(SESSION_COOKIE_NAME, sessionToken, getCookieOptions());

    res.status(200).json({
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout
authRouter.post('/logout', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  res.cookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
  res.status(200).json({
    data: {
      message: 'Logged out successfully',
    },
  });
});

// GET /auth/me
authRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!req.user) {
      throw new ValidationError('User context missing');
    }
    const user = await authService.getMe(req.user.id);
    res.status(200).json({
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/password-reset-request
authRouter.post('/password-reset-request', async (req, res, next) => {
  try {
    const parseResult = passwordResetRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Invalid input');
    }

    const result = await authService.requestPasswordReset(parseResult.data.email);
    res.status(200).json({
      data: {
        message: 'If the email exists, password reset instructions have been sent.',
        ...(process.env.NODE_ENV !== 'production' && result.resetToken ? { debug_token: result.resetToken } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/password-reset
authRouter.post('/password-reset', async (req, res, next) => {
  try {
    const parseResult = passwordResetSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Invalid input');
    }

    await authService.resetPassword(parseResult.data.token, parseResult.data.new_password);
    res.status(200).json({
      data: {
        message: 'Password reset successfully. You may now log in.',
      },
    });
  } catch (err) {
    next(err);
  }
});
