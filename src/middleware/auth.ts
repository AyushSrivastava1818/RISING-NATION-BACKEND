import { Response, NextFunction } from 'express';
import { RequestWithId } from './index.js';
import { verifySessionToken, refreshSessionToken, SessionPayload } from '../utils/crypto.js';
import { UnauthenticatedError, ForbiddenError } from '../utils/errors.js';
import { config } from '../config/index.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends RequestWithId {
  user?: AuthenticatedUser;
  session?: SessionPayload;
}

export const SESSION_COOKIE_NAME = 'rn_session';

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days max
  };
}

export function extractToken(req: AuthenticatedRequest): string | null {
  // 1. Check cookies
  if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    return req.cookies[SESSION_COOKIE_NAME];
  }

  // 2. Check Authorization header: Bearer <token>
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    throw new UnauthenticatedError('Authentication required');
  }

  const result = verifySessionToken(token);
  if (!result.valid || !result.payload) {
    throw new UnauthenticatedError(result.error || 'Invalid or expired session');
  }

  req.user = {
    id: result.payload.userId,
    email: result.payload.email,
    role: result.payload.role,
  };
  req.session = result.payload;

  // Refresh active timestamp cookie for regular active requests (skip logout)
  if (!req.path.includes('/logout')) {
    const refreshedToken = refreshSessionToken(result.payload);
    res.cookie(SESSION_COOKIE_NAME, refreshedToken, getCookieOptions());
  }

  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthenticatedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError('Access forbidden: insufficient permissions');
    }

    next();
  };
}

export const requireAdmin = [authenticate, requireRole(['admin'])];
