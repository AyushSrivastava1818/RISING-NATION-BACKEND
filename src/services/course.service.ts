/**
 * CourseService — ARCHITECTURE.md §3.5, §3.7 (Course Access workflow), §3.9
 *
 * Public reads:  listCourses / getCourseById — zero YouTube dependency.
 * Admin writes:  createCourse / updateCourse — YouTube call BEFORE DB transaction.
 */

import * as courseRepo from '../repositories/course.repository.js';
import { fetchYouTubeMetadata } from './youtube.service.js';
import { ValidationError } from '../utils/errors.js';
import type { CourseWithCategory, ListCoursesFilter } from '../repositories/course.repository.js';

// ─── Public read paths ────────────────────────────────────────────────────────
// These functions deliberately have no import-time or call-time dependency on
// fetchYouTubeMetadata — that's the implementation guarantee of §3.9.

export async function listCourses(filter: ListCoursesFilter): Promise<{
  courses: CourseWithCategory[];
  total: number;
}> {
  return courseRepo.listCourses(filter);
}

export async function getCourseById(id: string): Promise<CourseWithCategory> {
  return courseRepo.findCourseById(id);
}

export async function listCategories(type?: string) {
  return courseRepo.listCategories(type);
}

// ─── Admin write paths ────────────────────────────────────────────────────────

export interface AdminCourseWriteInput {
  title: string;
  description?: string;
  level: string;
  category_id: string;
  content_source: string;
  content_ref: string;
  published?: boolean;
  // thumbnail_url is intentionally excluded from input — always server-derived
}

/**
 * Validates content_source branch, calls YouTube API *before* any DB write
 * (per ARCHITECTURE.md §3.9 — slow external call must never hold a DB lock),
 * then persists.
 */
export async function createCourse(input: AdminCourseWriteInput): Promise<CourseWithCategory> {
  // content_source = native rejected in V1 per ARCHITECTURE.md §3.5
  if (input.content_source === 'native') {
    throw new ValidationError(
      'content_source "native" is not supported in V1 — native_lessons table does not exist yet',
    );
  }

  if (input.content_source !== 'youtube') {
    throw new ValidationError(
      `content_source must be "youtube" (got "${input.content_source}")`,
    );
  }

  // YouTube validation BEFORE DB — §3.9 / DATABASE.md Performance
  const { title, thumbnail_url } = await fetchYouTubeMetadata(input.content_ref);

  // Use YouTube-fetched title/thumbnail — client-supplied title overrides only if given
  return courseRepo.createCourse({
    title: input.title || title,
    description: input.description,
    level: input.level,
    category_id: input.category_id,
    content_source: input.content_source,
    content_ref: input.content_ref,
    thumbnail_url,
    published: input.published,
  });
}

export interface AdminCourseUpdateInput {
  title?: string;
  description?: string;
  level?: string;
  category_id?: string;
  content_source?: string;
  content_ref?: string;
  published?: boolean;
}

export async function updateCourse(
  id: string,
  input: AdminCourseUpdateInput,
): Promise<CourseWithCategory> {
  // If content_source or content_ref is being updated, re-validate
  const effectiveSource = input.content_source;

  if (effectiveSource !== undefined) {
    if (effectiveSource === 'native') {
      throw new ValidationError(
        'content_source "native" is not supported in V1 — native_lessons table does not exist yet',
      );
    }
    if (effectiveSource !== 'youtube') {
      throw new ValidationError(
        `content_source must be "youtube" (got "${effectiveSource}")`,
      );
    }
  }

  let thumbnail_url: string | undefined;

  // Only call YouTube API if content_ref is being changed — §3.9
  if (input.content_ref !== undefined) {
    const meta = await fetchYouTubeMetadata(input.content_ref);
    thumbnail_url = meta.thumbnail_url;
    // Override title too if not explicitly supplied
    if (!input.title) {
      input = { ...input, title: meta.title };
    }
  }

  return courseRepo.updateCourse(id, {
    ...input,
    thumbnail_url,
  });
}

export async function deleteCourse(id: string): Promise<void> {
  return courseRepo.deleteCourse(id);
}
