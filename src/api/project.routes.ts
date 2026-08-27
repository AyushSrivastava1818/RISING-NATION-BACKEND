/**
 * Public project routes — GET /projects, GET /projects/:id. No auth required.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as projectService from '../services/project.service.js';
import type { Project } from '@prisma/client';
import type { ProjectWithDetail } from '../repositories/project.repository.js';

export const projectRouter = Router();

function parseFeaturedQuery(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

// ─── GET /projects ─────────────────────────────────────────────────────────

projectRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? '20'), 10) || 20;
    const featured = parseFeaturedQuery(req.query.featured);

    const { projects, total } = await projectService.listProjects({ featured, page, limit });

    res.status(200).json({
      data: projects.map(toProjectListDto),
      meta: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /projects/:id ──────────────────────────────────────────────────────

projectRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await projectService.getProjectById(req.params.id as string);
    res.status(200).json({ data: toProjectDetailDto(project) });
  } catch (err) {
    next(err);
  }
});

// ─── DTOs ───────────────────────────────────────────────────────────────────

function toProjectListDto(project: Project) {
  return {
    id: project.id,
    name: project.name,
    client_or_category: project.client_or_category,
    problem: project.problem,
    solution: project.solution,
    result: project.result,
    technologies: project.technologies,
    status: project.status,
    featured: project.featured,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

function toProjectDetailDto(project: ProjectWithDetail) {
  return {
    ...toProjectListDto(project),
    media: project.media.map((m) => ({
      id: m.id,
      media_url: m.media_url,
      media_type: m.media_type,
    })),
    team: project.members.map((m) => ({
      profile_id: m.profile_id,
      name: m.profile.name,
      role_title: m.profile.role_title,
      photo_url: m.profile.photo_url,
      contribution_role: m.contribution_role,
    })),
  };
}
