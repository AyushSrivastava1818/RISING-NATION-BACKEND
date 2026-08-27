/**
 * Admin people routes — POST/PATCH/DELETE /admin/people, photo attach —
 * API.md People & Network, ENGINEERING.md §6.4. growth_level is intentionally
 * NOT editable here (see admin-growth.routes.ts). Mounted under adminRouter.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as peopleService from '../services/people.service.js';
import { ValidationError } from '../utils/errors.js';

export const adminPeopleRouter = Router();

const GROUPS = ['founding', 'core', 'contributor', 'builder', 'mentor', 'industry', 'partner'] as const;

const createPersonSchema = z.object({
  user_id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  role_title: z.string().min(1, 'role_title is required'),
  group: z.enum(GROUPS, { required_error: 'group is required' }),
  short_intro: z.string().optional(),
  skills: z.array(z.string()).optional(),
  linkedin_url: z.string().url('linkedin_url must be a valid URL').optional().or(z.literal('')),
  featured: z.boolean().optional(),
});

const updatePersonSchema = z.object({
  user_id: z.string().optional(),
  name: z.string().min(1).optional(),
  role_title: z.string().min(1).optional(),
  group: z.enum(GROUPS).optional(),
  short_intro: z.string().optional(),
  skills: z.array(z.string()).optional(),
  linkedin_url: z.string().url('linkedin_url must be a valid URL').optional().or(z.literal('')),
  featured: z.boolean().optional(),
});

const photoUploadSchema = z.object({
  filename: z.string().min(1, 'filename is required'),
  mime_type: z.string().min(1, 'mime_type is required'),
  size: z.number({ required_error: 'size is required' }).positive(),
});

const photoConfirmSchema = z.object({
  object_key: z.string().min(1, 'object_key is required'),
});

// POST /admin/people
adminPeopleRouter.post('/', async (req, res, next) => {
  try {
    const parseResult = createPersonSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const person = await peopleService.createPerson(parseResult.data);
    res.status(201).json({ data: person });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/people/:id
adminPeopleRouter.patch('/:id', async (req, res, next) => {
  try {
    const parseResult = updatePersonSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const person = await peopleService.updatePerson(req.params.id, parseResult.data);
    res.status(200).json({ data: person });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/people/:id
adminPeopleRouter.delete('/:id', async (req, res, next) => {
  try {
    await peopleService.deletePerson(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /admin/people/:id/photo — issues a signed upload URL (ENGINEERING.md §6.4)
adminPeopleRouter.post('/:id/photo', async (req, res, next) => {
  try {
    const parseResult = photoUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const result = await peopleService.issuePhotoUploadUrl(req.params.id, parseResult.data);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /admin/people/:id/photo/confirm — verifies the object exists, then persists photo_url
adminPeopleRouter.post('/:id/photo/confirm', async (req, res, next) => {
  try {
    const parseResult = photoConfirmSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const person = await peopleService.confirmPhoto(req.params.id, parseResult.data);
    res.status(200).json({ data: person });
  } catch (err) {
    next(err);
  }
});
