import { Course, Category, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ─── Category Repository ──────────────────────────────────────────────────────

export type CategoryRow = Category;

export async function listCategories(type?: string): Promise<CategoryRow[]> {
  return prisma.category.findMany({
    where: type ? { type } : undefined,
    orderBy: { name: 'asc' },
  });
}

export async function findCategoryById(id: string): Promise<CategoryRow> {
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) throw new NotFoundError(`Category ${id} not found`);
  return cat;
}

// ─── Course Repository ────────────────────────────────────────────────────────

export interface ListCoursesFilter {
  category?: string;   // category slug
  level?: string;
  page?: number;
  limit?: number;
}

export type CourseWithCategory = Course & { category: Category };

export async function listCourses(filter: ListCoursesFilter): Promise<{
  courses: CourseWithCategory[];
  total: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.CourseWhereInput = { published: true };

  if (filter.category) {
    const cat = await prisma.category.findUnique({ where: { slug: filter.category } });
    if (cat) where.category_id = cat.id;
    else where.category_id = 'no-match'; // guarantees 0 results, not an error
  }

  if (filter.level) {
    where.level = { equals: filter.level, mode: 'insensitive' };
  }

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      include: { category: true },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.course.count({ where }),
  ]);

  return { courses, total };
}

export async function findCourseById(id: string): Promise<CourseWithCategory> {
  const course = await prisma.course.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!course || !course.published) throw new NotFoundError(`Course ${id} not found`);
  return course;
}

export interface CreateCourseInput {
  title: string;
  description?: string;
  level: string;
  category_id: string;
  content_source: string;
  content_ref: string;
  thumbnail_url?: string;
  published?: boolean;
}

export async function createCourse(input: CreateCourseInput): Promise<CourseWithCategory> {
  // Verify the category exists before inserting
  await findCategoryById(input.category_id);

  const course = await prisma.course.create({
    data: {
      title: input.title,
      description: input.description,
      level: input.level,
      category_id: input.category_id,
      content_source: input.content_source,
      content_ref: input.content_ref,
      thumbnail_url: input.thumbnail_url,
      published: input.published ?? true,
    },
    include: { category: true },
  });

  return course;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  level?: string;
  category_id?: string;
  content_source?: string;
  content_ref?: string;
  thumbnail_url?: string;
  published?: boolean;
}

export async function updateCourse(
  id: string,
  input: UpdateCourseInput,
): Promise<CourseWithCategory> {
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Course ${id} not found`);

  if (input.category_id) await findCategoryById(input.category_id);

  const course = await prisma.course.update({
    where: { id },
    data: input,
    include: { category: true },
  });

  return course;
}

export async function deleteCourse(id: string): Promise<void> {
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Course ${id} not found`);
  await prisma.course.delete({ where: { id } });
}
