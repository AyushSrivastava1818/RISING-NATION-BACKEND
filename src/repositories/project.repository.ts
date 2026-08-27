import { Project, ProjectMedia, ProjectMember, PeopleProfile, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface ListProjectsFilter {
  featured?: boolean;
  page?: number;
  limit?: number;
}

export async function listProjects(filter: ListProjectsFilter): Promise<{
  projects: Project[];
  total: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.ProjectWhereInput = {};
  if (filter.featured !== undefined) {
    where.featured = filter.featured;
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  return { projects, total };
}

export type ProjectMemberWithProfile = ProjectMember & { profile: PeopleProfile };
export type ProjectWithDetail = Project & {
  media: ProjectMedia[];
  members: ProjectMemberWithProfile[];
};

/**
 * Single detail read for a project, including media and team.
 * DATABASE.md flags GET /projects/:id as the N+1 risk to design against:
 * Prisma's `include` here issues one batched query per relation (media,
 * members, and members' profiles), not one query per related row.
 */
export async function findProjectById(id: string): Promise<ProjectWithDetail> {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      media: true,
      members: { include: { profile: true } },
    },
  });
  if (!project) throw new NotFoundError(`Project ${id} not found`);
  return project;
}

export interface CreateProjectInput {
  name: string;
  client_or_category?: string;
  problem?: string;
  solution?: string;
  result?: string;
  technologies?: string[];
  status: string;
  featured?: boolean;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return prisma.project.create({ data: input });
}

export interface UpdateProjectInput {
  name?: string;
  client_or_category?: string;
  problem?: string;
  solution?: string;
  result?: string;
  technologies?: string[];
  status?: string;
  featured?: boolean;
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Project ${id} not found`);

  return prisma.project.update({ where: { id }, data: input });
}

export async function deleteProject(id: string): Promise<void> {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Project ${id} not found`);
  await prisma.project.delete({ where: { id } });
}

export async function addProjectMedia(
  projectId: string,
  data: { media_url: string; media_type: string },
): Promise<ProjectMedia> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError(`Project ${projectId} not found`);

  return prisma.projectMedia.create({
    data: { project_id: projectId, media_url: data.media_url, media_type: data.media_type },
  });
}
