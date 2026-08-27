/**
 * EnquiryService — ARCHITECTURE.md §3.5 (Service Intake), API.md Business
 * Solutions / Creator Support.
 *
 * Reuses Slice 3's infrastructure rather than duplicating it: rate-limiting
 * is applied at the route via publicSubmissionRateLimiter
 * (src/middleware/rate-limit.ts), and the admin-notification side effect
 * reuses notificationService (src/services/notification.service.ts) — a new
 * method on the same class, not a parallel notification system.
 */

import * as enquiryRepo from '../repositories/enquiry.repository.js';
import * as categoryRepo from '../repositories/course.repository.js';
import { notificationService } from './notification.service.js';
import { UnprocessableError } from '../utils/errors.js';
import type { Enquiry } from '@prisma/client';
import type { ListEnquiriesFilter } from '../repositories/enquiry.repository.js';

export interface SubmitEnquiryDto {
  type: string;
  services_requested: string[];
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  message?: string;
}

export interface SubmitEnquiryResponse {
  id: string;
  status: string;
}

/**
 * Validates services_requested against the curated categories(type='service')
 * list (matched by slug — the field DATABASE.md documents as the stable
 * filter key) rather than accepting user-invented values (REQ-BIZ-001).
 * A mismatch is a business-rule violation on an otherwise well-formed
 * request, so it's 422, not 400 (API.md).
 */
async function assertValidServiceCategories(slugs: string[]): Promise<void> {
  const matched = await categoryRepo.findServiceCategoriesBySlugs(slugs);
  const matchedSlugs = new Set(matched.map((c) => c.slug));
  const invalid = slugs.filter((slug) => !matchedSlugs.has(slug));

  if (invalid.length > 0) {
    throw new UnprocessableError(
      `services_requested contains values not found in categories(type='service'): ${invalid.join(', ')}`,
    );
  }
}

export async function submitEnquiry(input: SubmitEnquiryDto): Promise<SubmitEnquiryResponse> {
  await assertValidServiceCategories(input.services_requested);

  const created = await enquiryRepo.createEnquiry(input);

  // Synchronous notification with short timeout & swallowed failure, same as ideas (§3.3).
  try {
    await notificationService.notifyAdminOnEnquirySubmission({
      id: created.id,
      type: created.type,
      contact_email: created.contact_email,
    });
  } catch (err: any) {
    console.warn(`[NOTIFICATION_SWALLOWED] Notification failure swallowed for enquiry ${created.id}:`, err?.message || err);
  }

  return { id: created.id, status: created.status };
}

export async function listEnquiries(filter: ListEnquiriesFilter): Promise<{ enquiries: Enquiry[]; total: number }> {
  return enquiryRepo.listEnquiries(filter);
}

export async function getEnquiryById(id: string): Promise<Enquiry> {
  return enquiryRepo.findEnquiryById(id);
}

export async function updateEnquiryStatus(id: string, status: string): Promise<Enquiry> {
  return enquiryRepo.updateEnquiryStatus(id, status);
}
