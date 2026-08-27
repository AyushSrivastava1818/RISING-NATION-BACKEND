import { Router } from 'express';
import { z } from 'zod';
import { ideaService } from '../services/idea.service.js';
import { publicSubmissionRateLimiter } from '../middleware/rate-limit.js';
import { ValidationError } from '../utils/errors.js';

export const publicIdeaRouter = Router();

const createIdeaSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  problem: z.string().min(1, 'Problem description is required'),
  proposed_solution: z.string().min(1, 'Proposed solution is required'),
  target_users: z.string().min(1, 'Target users are required'),
  why_it_matters: z.string().min(1, 'Why it matters is required'),
  current_stage: z.string().min(1, 'Current stage is required'),
  skills_team_required: z.string().optional(),
  document_url: z.string().url('document_url must be a valid URL').optional().or(z.literal('')),
  demo_url: z.string().url('demo_url must be a valid URL').optional().or(z.literal('')),
  contact_email: z.string().email('Valid contact_email is required'),
  contact_phone: z.string().optional(),
});

// POST /ideas — public, rate-limited, no auth
publicIdeaRouter.post('/ideas', publicSubmissionRateLimiter, async (req, res, next) => {
  try {
    const parseResult = createIdeaSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const result = await ideaService.submitIdea(parseResult.data);
    res.status(201).json({
      data: result,
    });
  } catch (err) {
    next(err);
  }
});
