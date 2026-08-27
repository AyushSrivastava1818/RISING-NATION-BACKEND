import { Session, User } from '@prisma/client';
import { prisma } from './prisma.js';

export interface CreateSessionData {
  userId: string;
  expiresAt: Date;
  lastActiveAt?: Date;
}

export type SessionWithUser = Session & { user: User };

export class SessionRepository {
  async createSession(data: CreateSessionData): Promise<Session> {
    return prisma.session.create({
      data: {
        user_id: data.userId,
        expires_at: data.expiresAt,
        last_active_at: data.lastActiveAt || new Date(),
      },
    });
  }

  async findSessionById(id: string): Promise<SessionWithUser | null> {
    return prisma.session.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
  }

  async updateLastActive(id: string, lastActiveAt: Date): Promise<Session> {
    return prisma.session.update({
      where: { id },
      data: {
        last_active_at: lastActiveAt,
      },
    });
  }

  async deleteSession(id: string): Promise<Session | null> {
    try {
      return await prisma.session.delete({
        where: { id },
      });
    } catch {
      return null;
    }
  }

  async deleteAllSessionsForUser(userId: string): Promise<{ count: number }> {
    return prisma.session.deleteMany({
      where: { user_id: userId },
    });
  }
}

export const sessionRepository = new SessionRepository();
