import { Response, NextFunction } from 'express';
import { RequestWithId } from './index.js';
import { verifySignedSessionId } from '../utils/crypto.js';
import { sessionRepository, SessionWithUser } from '../repositories/session.repository.js';
import { UnauthenticatedError, ForbiddenError } from '../utils/errors.js';
import { config } from '../config/index.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends RequestWithId {
  user?: AuthenticatedUser;
  session?: SessionWithUser;
}

export const SESSION_COOKIE_NAME = 'rn_session';
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

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

export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthenticatedError('Authentication required');
    }

    const verification = verifySignedSessionId(token);
    if (!verification.valid || !verification.sessionId) {
      throw new UnauthenticatedError(verification.error || 'Invalid session token');
    }

    // Look up session row directly in the database
    const session = await sessionRepository.findSessionById(verification.sessionId);
    if (!session || !session.user) {
      throw new UnauthenticatedError('Session invalid or revoked');
    }

    const now = Date.now();

    // Check absolute expiration from database record
    if (now > session.expires_at.getTime()) {
      await sessionRepository.deleteSession(session.id);
      throw new UnauthenticatedError('Session expired (absolute timeout)');
    }

    // Check 8-hour idle timeout from database record
    if (now - session.last_active_at.getTime() > IDLE_TIMEOUT_MS) {
      await sessionRepository.deleteSession(session.id);
      throw new UnauthenticatedError('Session expired (idle timeout)');
    }

    // Update last_active_at in database on active requests (skip logout)
    if (!req.path.includes('/logout')) {
      await sessionRepository.updateLastActive(session.id, new Date(now));
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };
    req.session = session;

    next();
  } catch (err) {
    next(err);
  }
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
