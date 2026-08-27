import { PeopleProfile, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface ListPeopleFilter {
  group?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
}

export async function listPeople(filter: ListPeopleFilter): Promise<{
  people: PeopleProfile[];
  total: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.PeopleProfileWhereInput = {};
  if (filter.group) where.group = filter.group;
  if (filter.featured !== undefined) where.featured = filter.featured;

  const [people, total] = await Promise.all([
    prisma.peopleProfile.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.peopleProfile.count({ where }),
  ]);

  return { people, total };
}

export async function findPersonById(id: string): Promise<PeopleProfile> {
  const person = await prisma.peopleProfile.findUnique({ where: { id } });
  if (!person) throw new NotFoundError(`Person ${id} not found`);
  return person;
}

export interface CreatePersonInput {
  user_id?: string;
  name: string;
  role_title: string;
  group: string;
  short_intro?: string;
  skills?: string[];
  linkedin_url?: string;
  featured?: boolean;
}

export async function createPerson(input: CreatePersonInput): Promise<PeopleProfile> {
  return prisma.peopleProfile.create({ data: input });
}

export interface UpdatePersonInput {
  user_id?: string;
  name?: string;
  role_title?: string;
  group?: string;
  short_intro?: string;
  skills?: string[];
  linkedin_url?: string;
  featured?: boolean;
}

export async function updatePerson(id: string, input: UpdatePersonInput): Promise<PeopleProfile> {
  const existing = await prisma.peopleProfile.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Person ${id} not found`);

  return prisma.peopleProfile.update({ where: { id }, data: input });
}

export async function deletePerson(id: string): Promise<void> {
  const existing = await prisma.peopleProfile.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Person ${id} not found`);
  await prisma.peopleProfile.delete({ where: { id } });
}

export async function setPersonPhotoUrl(id: string, photoUrl: string): Promise<PeopleProfile> {
  const existing = await prisma.peopleProfile.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Person ${id} not found`);

  return prisma.peopleProfile.update({ where: { id }, data: { photo_url: photoUrl } });
}
