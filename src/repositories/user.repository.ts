import { User } from '@prisma/client';
import { prisma } from './prisma.js';

export interface CreateUserData {
  name: string;
  email: string;
  password_hash?: string;
  role?: string;
  growth_level?: string;
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        ...data,
        email: data.email.toLowerCase(),
      },
    });
  }

  async updatePassword(id: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { password_hash: passwordHash },
    });
  }
}

export const userRepository = new UserRepository();
