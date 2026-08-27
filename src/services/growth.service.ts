/**
 * GrowthService — ARCHITECTURE.md §3.5 (Growth), API.md PATCH /admin/users/:id/growth-level.
 *
 * Deliberately its own route/service, not folded into people-edit, so the
 * audit trail (growth_level_history) is enforced structurally, not by
 * convention in application code.
 */

import * as growthRepo from '../repositories/growth.repository.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import type { GrowthLevelChangeResult } from '../repositories/growth.repository.js';

export const VALID_GROWTH_LEVELS = ['learner', 'contributor', 'intern', 'builder', 'lead'] as const;

export interface ChangeGrowthLevelInput {
  targetUserId: string;
  toLevel: string;
  reason: string;
  actorId: string;
}

export async function changeGrowthLevel(input: ChangeGrowthLevelInput): Promise<GrowthLevelChangeResult> {
  if (!VALID_GROWTH_LEVELS.includes(input.toLevel as (typeof VALID_GROWTH_LEVELS)[number])) {
    throw new ValidationError(
      `growth_level must be one of: ${VALID_GROWTH_LEVELS.join(', ')} (got "${input.toLevel}")`,
    );
  }

  // No self-promotion — REQ-GROWTH-002.
  if (input.actorId === input.targetUserId) {
    throw new ForbiddenError('Admins cannot change their own growth level');
  }

  return growthRepo.changeGrowthLevel({
    userId: input.targetUserId,
    toLevel: input.toLevel,
    reason: input.reason,
    actorId: input.actorId,
  });
}
