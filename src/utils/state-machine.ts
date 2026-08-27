import { IdeaStatus } from '../types/index.js';

export const ALL_IDEA_STATUSES: IdeaStatus[] = [
  'submitted',
  'in_review',
  'evaluated',
  'credited',
  'shortlisted',
  'in_development',
];

/**
 * State machine transitions for Ideas per ARCHITECTURE.md §3.7:
 * submitted -> in_review -> evaluated -> credited | shortlisted
 * credited -> shortlisted
 * shortlisted -> in_development
 * Reopens: in_review -> submitted, evaluated -> in_review
 */
export const LEGAL_IDEA_TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = {
  submitted: ['in_review'],
  in_review: ['evaluated', 'submitted'],
  evaluated: ['credited', 'shortlisted', 'in_review'],
  credited: ['shortlisted'],
  shortlisted: ['in_development'],
  in_development: [],
};

export function isLegalIdeaTransition(currentStatus: IdeaStatus, nextStatus: IdeaStatus): boolean {
  if (currentStatus === nextStatus) {
    return true; // No status change is allowed (e.g. updating notes only)
  }
  const legalNextList = LEGAL_IDEA_TRANSITIONS[currentStatus] || [];
  return legalNextList.includes(nextStatus);
}
