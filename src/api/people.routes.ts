/**
 * Public people routes — GET /people, GET /people/:id. No auth required.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as peopleService from '../services/people.service.js';
import type { PeopleProfile } from '@prisma/client';

export const peopleRouter = Router();

function parseFeaturedQuery(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

// ─── GET /people ────────────────────────────────────────────────────────────

peopleRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? '20'), 10) || 20;
    const group = typeof req.query.group === 'string' ? req.query.group : undefined;
    const featured = parseFeaturedQuery(req.query.featured);

    const { people, total } = await peopleService.listPeople({ group, featured, page, limit });

    res.status(200).json({
      data: people.map(toPersonDto),
      meta: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /people/:id ────────────────────────────────────────────────────────

peopleRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const person = await peopleService.getPersonById(req.params.id as string);
    res.status(200).json({ data: toPersonDto(person) });
  } catch (err) {
    next(err);
  }
});

// ─── DTO ────────────────────────────────────────────────────────────────────

function toPersonDto(person: PeopleProfile) {
  return {
    id: person.id,
    name: person.name,
    role_title: person.role_title,
    group: person.group,
    short_intro: person.short_intro,
    skills: person.skills,
    linkedin_url: person.linkedin_url,
    photo_url: person.photo_url,
    featured: person.featured,
    created_at: person.created_at,
    updated_at: person.updated_at,
  };
}
