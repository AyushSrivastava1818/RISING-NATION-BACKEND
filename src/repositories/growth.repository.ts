import { User, GrowthLevelHistory } from '@prisma/client';
import { prisma } from './prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface ChangeGrowthLevelParams {
  userId: string;
  toLevel: string;
  reason: string;
  actorId: string;
}

export interface GrowthLevelChangeResult {
  user: User;
  history: GrowthLevelHistory;
}

/**
 * Atomic per ARCHITECTURE.md §3.8 (same pattern as the idea status transition):
 * UPDATE users.growth_level + INSERT growth_level_history in one transaction.
 */
export async function changeGrowthLevel(params: ChangeGrowthLevelParams): Promise<GrowthLevelChangeResult> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: params.userId } });
    if (!current) {
      throw new NotFoundError(`User ${params.userId} not found`);
    }

    const fromLevel = current.growth_level;

    const user = await tx.user.update({
      where: { id: params.userId },
      data: { growth_level: params.toLevel },
    });

    const history = await tx.growthLevelHistory.create({
      data: {
        user_id: params.userId,
        from_level: fromLevel,
        to_level: params.toLevel,
        reason: params.reason,
        actor_id: params.actorId,
      },
    });

    return { user, history };
  });
}
