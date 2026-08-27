/**
 * Admin course routes — POST/PATCH/DELETE /admin/courses — ARCHITECTURE.md §3.5, §3.9, API.md Learning.
 * Mounted under adminRouter, which already applies requireAdmin.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as courseService from '../services/course.service.js';
import { ValidationError } from '../utils/errors.js';

export const adminCourseRouter = Router();

const createCourseSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  level: z.string().min(1, 'level is required'),
  category_id: z.string().min(1, 'category_id is required'),
  content_source: z.string().min(1, 'content_source is required'),
  content_ref: z.string().min(1, 'content_ref is required'),
  published: z.boolean().optional(),
});

const updateCourseSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  level: z.string().min(1).optional(),
  category_id: z.string().min(1).optional(),
  content_source: z.string().min(1).optional(),
  content_ref: z.string().min(1).optional(),
  published: z.boolean().optional(),
});

// POST /admin/courses
adminCourseRouter.post('/', async (req, res, next) => {
  try {
    const parseResult = createCourseSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const course = await courseService.createCourse(parseResult.data);
    res.status(201).json({ data: course });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/courses/:id
adminCourseRouter.patch('/:id', async (req, res, next) => {
  try {
    const parseResult = updateCourseSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const course = await courseService.updateCourse(req.params.id, parseResult.data);
    res.status(200).json({ data: course });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/courses/:id — hard delete, no soft delete (DATABASE.md)
adminCourseRouter.delete('/:id', async (req, res, next) => {
  try {
    await courseService.deleteCourse(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
