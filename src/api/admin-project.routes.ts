/**
 * Admin project routes — POST/PATCH/DELETE /admin/projects, media attach —
 * API.md Projects, ENGINEERING.md §6.4. Mounted under adminRouter (requireAdmin).
 */

import { Router } from 'express';
import { z } from 'zod';
import * as projectService from '../services/project.service.js';
import { ValidationError } from '../utils/errors.js';

export const adminProjectRouter = Router();

const createProjectSchema = z.object({
  name: z.string().min(1, 'name is required'),
  client_or_category: z.string().optional(),
  problem: z.string().optional(),
  solution: z.string().optional(),
  result: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  status: z.string().min(1, 'status is required'),
  featured: z.boolean().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  client_or_category: z.string().optional(),
  problem: z.string().optional(),
  solution: z.string().optional(),
  result: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  status: z.string().min(1).optional(),
  featured: z.boolean().optional(),
});

const mediaUploadSchema = z.object({
  filename: z.string().min(1, 'filename is required'),
  mime_type: z.string().min(1, 'mime_type is required'),
  size: z.number({ required_error: 'size is required' }).positive(),
});

const mediaConfirmSchema = z.object({
  object_key: z.string().min(1, 'object_key is required'),
  media_type: z.enum(['image', 'video'], { required_error: 'media_type is required' }),
});

// POST /admin/projects
adminProjectRouter.post('/', async (req, res, next) => {
  try {
    const parseResult = createProjectSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const project = await projectService.createProject(parseResult.data);
    res.status(201).json({ data: project });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/projects/:id
adminProjectRouter.patch('/:id', async (req, res, next) => {
  try {
    const parseResult = updateProjectSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const project = await projectService.updateProject(req.params.id, parseResult.data);
    res.status(200).json({ data: project });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/projects/:id
adminProjectRouter.delete('/:id', async (req, res, next) => {
  try {
    await projectService.deleteProject(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /admin/projects/:id/media — issues a signed upload URL (ENGINEERING.md §6.4)
adminProjectRouter.post('/:id/media', async (req, res, next) => {
  try {
    const parseResult = mediaUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const result = await projectService.issueMediaUploadUrl(req.params.id, parseResult.data);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /admin/projects/:id/media/confirm — verifies the object exists, then persists it
adminProjectRouter.post('/:id/media/confirm', async (req, res, next) => {
  try {
    const parseResult = mediaConfirmSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const media = await projectService.confirmMedia(req.params.id, parseResult.data);
    res.status(201).json({ data: media });
  } catch (err) {
    next(err);
  }
});
