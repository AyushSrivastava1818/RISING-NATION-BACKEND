/**
 * ProjectService — ARCHITECTURE.md §3.5 (Showcase), API.md Projects.
 *
 * Public reads: listProjects / getProjectById.
 * Admin writes: createProject / updateProject / deleteProject.
 * Media attach: signed-upload flow per ENGINEERING.md §6.4 — issue then confirm.
 */

import * as projectRepo from '../repositories/project.repository.js';
import * as storageService from './storage.service.js';
import { UnprocessableError } from '../utils/errors.js';
import type {
  ListProjectsFilter,
  ProjectWithDetail,
  CreateProjectInput,
  UpdateProjectInput,
} from '../repositories/project.repository.js';
import type { Project, ProjectMedia } from '@prisma/client';

export async function listProjects(filter: ListProjectsFilter): Promise<{ projects: Project[]; total: number }> {
  return projectRepo.listProjects(filter);
}

export async function getProjectById(id: string): Promise<ProjectWithDetail> {
  return projectRepo.findProjectById(id);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return projectRepo.createProject(input);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return projectRepo.updateProject(id, input);
}

export async function deleteProject(id: string): Promise<void> {
  return projectRepo.deleteProject(id);
}

export interface MediaUploadRequest {
  filename: string;
  mime_type: string;
  size: number;
}

export async function issueMediaUploadUrl(projectId: string, input: MediaUploadRequest) {
  // Confirms the project exists before an upload is issued against it.
  await projectRepo.findProjectById(projectId);
  return storageService.createSignedUploadUrl(input);
}

export interface ConfirmMediaInput {
  object_key: string;
  media_type: string;
}

export async function confirmMedia(projectId: string, input: ConfirmMediaInput): Promise<ProjectMedia> {
  const exists = await storageService.verifyObjectExists(input.object_key);
  if (!exists) {
    throw new UnprocessableError(
      `Object "${input.object_key}" was not found in storage — the upload may not have completed`,
    );
  }

  const media_url = storageService.publicUrlFor(input.object_key);
  return projectRepo.addProjectMedia(projectId, { media_url, media_type: input.media_type });
}
