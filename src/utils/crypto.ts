import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

const BCRYPT_SALT_ROUNDS = 12;

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

export function signSessionId(sessionId: string): string {
  const signature = crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(sessionId)
    .digest('base64url');

  return `${sessionId}.${signature}`;
}

export function verifySignedSessionId(signedToken: string): { valid: boolean; sessionId?: string; error?: string } {
  try {
    const parts = signedToken.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Malformed session token' };
    }

    const [sessionId, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', config.SESSION_SECRET)
      .update(sessionId)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid session signature' };
    }

    return { valid: true, sessionId };
  } catch (_err) {
    return { valid: false, error: 'Failed to verify session token' };
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
