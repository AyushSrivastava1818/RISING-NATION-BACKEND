import { Router } from 'express';
import { z } from 'zod';
import { ideaService } from '../services/idea.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';
import { ALL_IDEA_STATUSES } from '../utils/state-machine.js';
import { IdeaStatus } from '../types/index.js';

export const adminIdeaRouter = Router();

const updateIdeaSchema = z.object({
  version: z.number({ required_error: 'version is required' }),
  status: z.enum(ALL_IDEA_STATUSES as [string, ...string[]]).optional(),
  admin_notes: z.string().optional(),
});

// GET /admin/ideas?status=&page=&limit=
adminIdeaRouter.get('/', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const { ideas, total } = await ideaService.listIdeas({ status, page, limit });
    res.status(200).json({
      data: ideas,
      meta: {
        total,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/ideas/:id
adminIdeaRouter.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const idea = await ideaService.getIdeaById(id);
    res.status(200).json({
      data: idea,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/ideas/:id
adminIdeaRouter.patch('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parseResult = updateIdeaSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const id = req.params.id as string;
    const { version, status, admin_notes } = parseResult.data;
    const updated = await ideaService.reviewIdea({
      id,
      version,
      status: status as IdeaStatus | undefined,
      admin_notes,
      adminId: req.user!.id,
    });

    res.status(200).json({
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});
