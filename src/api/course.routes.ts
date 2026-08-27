/**
 * Public course routes — GET /courses, GET /courses/:id, GET /categories
 * No auth required. Zero runtime YouTube dependency (reads only cached fields).
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as courseService from '../services/course.service.js';

export const courseRouter = Router();
export const categoryRouter = Router();

// ─── GET /courses ─────────────────────────────────────────────────────────────

courseRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? '20'), 10) || 20;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;

    const { courses, total } = await courseService.listCourses({ category, level, page, limit });

    res.status(200).json({
      data: courses.map(toCourseDto),
      meta: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /courses/:id ─────────────────────────────────────────────────────────

courseRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await courseService.getCourseById(req.params.id as string);
    res.status(200).json({ data: toCourseDto(course) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /categories ─────────────────────────────────────────────────────────

categoryRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const categories = await courseService.listCategories(type);
    res.status(200).json({ data: categories });
  } catch (err) {
    next(err);
  }
});

// ─── DTO ──────────────────────────────────────────────────────────────────────

import type { CourseWithCategory } from '../repositories/course.repository.js';

/**
 * Maps the internal Course row to the public API DTO.
 *
 * CRITICAL: `content_ref` (internal field name) is NEVER sent to the client
 * directly — it's exposed as `playback_ref` per API.md §Learning.
 * This also means the public read path exposes zero internal YouTube coupling.
 */
function toCourseDto(course: CourseWithCategory) {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    level: course.level,
    content_source: course.content_source,
    thumbnail_url: course.thumbnail_url,
    playback_ref: course.content_ref, // renamed in DTO — API.md spec
    published: course.published,
    created_at: course.created_at,
    updated_at: course.updated_at,
    category: {
      id: course.category.id,
      name: course.category.name,
      slug: course.category.slug,
      type: course.category.type,
    },
  };
}
