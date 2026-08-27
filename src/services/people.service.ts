/**
 * PeopleService — ARCHITECTURE.md §3.5 (Showcase), API.md People & Network.
 *
 * Public reads: listPeople / getPersonById.
 * Admin writes: createPerson / updatePerson / deletePerson — growth_level is
 * deliberately NOT editable through this service (see growth.service.ts).
 * Photo attach: signed-upload flow per ENGINEERING.md §6.4 — issue then confirm.
 */

import * as peopleRepo from '../repositories/people.repository.js';
import * as storageService from './storage.service.js';
import { UnprocessableError } from '../utils/errors.js';
import type {
  ListPeopleFilter,
  CreatePersonInput,
  UpdatePersonInput,
} from '../repositories/people.repository.js';
import type { PeopleProfile } from '@prisma/client';

export async function listPeople(filter: ListPeopleFilter): Promise<{ people: PeopleProfile[]; total: number }> {
  return peopleRepo.listPeople(filter);
}

export async function getPersonById(id: string): Promise<PeopleProfile> {
  return peopleRepo.findPersonById(id);
}

export async function createPerson(input: CreatePersonInput): Promise<PeopleProfile> {
  return peopleRepo.createPerson(input);
}

export async function updatePerson(id: string, input: UpdatePersonInput): Promise<PeopleProfile> {
  return peopleRepo.updatePerson(id, input);
}

export async function deletePerson(id: string): Promise<void> {
  return peopleRepo.deletePerson(id);
}

export interface PhotoUploadRequest {
  filename: string;
  mime_type: string;
  size: number;
}

export async function issuePhotoUploadUrl(personId: string, input: PhotoUploadRequest) {
  await peopleRepo.findPersonById(personId);
  return storageService.createSignedUploadUrl(input);
}

export interface ConfirmPhotoInput {
  object_key: string;
}

export async function confirmPhoto(personId: string, input: ConfirmPhotoInput): Promise<PeopleProfile> {
  const exists = await storageService.verifyObjectExists(input.object_key);
  if (!exists) {
    throw new UnprocessableError(
      `Object "${input.object_key}" was not found in storage — the upload may not have completed`,
    );
  }

  const photoUrl = storageService.publicUrlFor(input.object_key);
  return peopleRepo.setPersonPhotoUrl(personId, photoUrl);
}
