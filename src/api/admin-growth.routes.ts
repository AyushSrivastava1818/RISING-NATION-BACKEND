/**
 * PATCH /admin/users/:id/growth-level — its own route per API.md, deliberately
 * not folded into the generic people-edit route so the growth_level_history
 * audit trail is enforced at the route/service level.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as growthService from '../services/growth.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

export const adminGrowthRouter = Router();

const changeGrowthLevelSchema = z.object({
  growth_level: z.enum(growthService.VALID_GROWTH_LEVELS, { required_error: 'growth_level is required' }),
  reason: z.string().min(1, 'reason is required'),
});

// PATCH /admin/users/:id/growth-level
adminGrowthRouter.patch('/:id/growth-level', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parseResult = changeGrowthLevelSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const result = await growthService.changeGrowthLevel({
      targetUserId: req.params.id as string,
      toLevel: parseResult.data.growth_level,
      reason: parseResult.data.reason,
      actorId: req.user!.id,
    });

    res.status(200).json({
      data: {
        id: result.user.id,
        growth_level: result.user.growth_level,
        history: {
          id: result.history.id,
          from_level: result.history.from_level,
          to_level: result.history.to_level,
          reason: result.history.reason,
          actor_id: result.history.actor_id,
          created_at: result.history.created_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
