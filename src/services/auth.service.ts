import { UserRepository, userRepository } from '../repositories/user.repository.js';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
} from '../utils/crypto.js';
import {
  UnauthenticatedError,
  ValidationError,
  NotFoundError,
} from '../utils/errors.js';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  growth_level: string | null;
  created_at: Date;
}

export interface LoginResult {
  user: UserDto;
  sessionToken: string;
}

export class AuthService {
  constructor(private userRepo: UserRepository = userRepository) {}

  async login(email: string, password: string): Promise<LoginResult> {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user || !user.password_hash) {
      throw new UnauthenticatedError('Invalid email or password');
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      throw new UnauthenticatedError('Invalid email or password');
    }

    // OD-1: Admin-only auth for V1
    if (user.role !== 'admin') {
      throw new UnauthenticatedError('Admin login access required');
    }

    const sessionToken = createSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        growth_level: user.growth_level,
        created_at: user.created_at,
      },
      sessionToken,
    };
  }

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      growth_level: user.growth_level,
      created_at: user.created_at,
    };
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; resetToken?: string }> {
    if (!email) {
      throw new ValidationError('Email is required');
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user || !user.password_hash || user.role !== 'admin') {
      // Return success to avoid email enumeration
      return { success: true };
    }

    const resetToken = createPasswordResetToken(user.id, user.password_hash);

    // Stub email sender: in production/Slice 9 email is sent via EMAIL_PROVIDER_API_KEY
    console.log(`[STUB EMAIL] Password reset token generated for ${user.email}: ${resetToken}`);

    return { success: true, resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    if (!token || !newPassword) {
      throw new ValidationError('Token and new password are required');
    }

    if (newPassword.length < 12) {
      throw new ValidationError('Password must be at least 12 characters');
    }

    // Token verification requires decoding user ID first
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new ValidationError('Invalid reset token');
    }

    let payload: { userId: string; expiresAt: number };
    try {
      let base64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    } catch {
      throw new ValidationError('Invalid reset token payload');
    }

    const user = await this.userRepo.findById(payload.userId);
    if (!user || !user.password_hash) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const verification = verifyPasswordResetToken(token, user.password_hash);
    if (!verification.valid || !verification.userId) {
      throw new ValidationError(verification.error || 'Invalid or expired reset token');
    }

    const newHash = await hashPassword(newPassword);
    await this.userRepo.updatePassword(user.id, newHash);

    return { success: true };
  }
}

export const authService = new AuthService();
