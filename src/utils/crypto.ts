import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

const BCRYPT_SALT_ROUNDS = 12;
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  createdAt: number;
  lastActiveAt: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function createSessionToken(user: { id: string; email: string; role: string }): string {
  const now = Date.now();
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    createdAt: now,
    lastActiveAt: now,
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(payloadEncoded)
    .digest('base64url');

  return `${payloadEncoded}.${signature}`;
}

export function refreshSessionToken(payload: SessionPayload): string {
  const refreshedPayload: SessionPayload = {
    ...payload,
    lastActiveAt: Date.now(),
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(refreshedPayload));
  const signature = crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(payloadEncoded)
    .digest('base64url');

  return `${payloadEncoded}.${signature}`;
}

export function verifySessionToken(token: string): { valid: boolean; payload?: SessionPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Malformed session token' };
    }

    const [payloadEncoded, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', config.SESSION_SECRET)
      .update(payloadEncoded)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid session signature' };
    }

    const payload: SessionPayload = JSON.parse(base64UrlDecode(payloadEncoded));
    const now = Date.now();

    // Check 7-day absolute timeout
    if (now - payload.createdAt > ABSOLUTE_TIMEOUT_MS) {
      return { valid: false, error: 'Session expired (absolute timeout)' };
    }

    // Check 8-hour idle timeout
    if (now - payload.lastActiveAt > IDLE_TIMEOUT_MS) {
      return { valid: false, error: 'Session expired (idle timeout)' };
    }

    return { valid: true, payload };
  } catch (_err) {
    return { valid: false, error: 'Failed to verify session' };
  }
}

export function createPasswordResetToken(userId: string, currentPasswordHash: string): string {
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  const payload = { userId, expiresAt };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const secret = `${config.SESSION_SECRET}:${currentPasswordHash}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadEncoded)
    .digest('base64url');

  return `${payloadEncoded}.${signature}`;
}

export function verifyPasswordResetToken(token: string, currentPasswordHash: string): { valid: boolean; userId?: string; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Malformed token' };
    }

    const [payloadEncoded, signature] = parts;
    const secret = `${config.SESSION_SECRET}:${currentPasswordHash}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadEncoded)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const payload = JSON.parse(base64UrlDecode(payloadEncoded));
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'Password reset token expired' };
    }

    return { valid: true, userId: payload.userId };
  } catch (_err) {
    return { valid: false, error: 'Failed to verify token' };
  }
}
