import { IdeaRepository, ideaRepository, CreateIdeaInput, ListIdeasFilter, IdeaWithHistory } from '../repositories/idea.repository.js';
import { NotificationService, notificationService } from './notification.service.js';
import { isLegalIdeaTransition } from '../utils/state-machine.js';
import { IdeaStatus } from '../types/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

export interface SubmitIdeaDto extends CreateIdeaInput {}

export interface SubmitIdeaResponse {
  id: string;
  title: string;
  status: string;
  message: string;
}

export interface UpdateIdeaReviewInput {
  id: string;
  version: number;
  status?: IdeaStatus;
  admin_notes?: string;
  adminId: string;
}

export class IdeaService {
  constructor(
    private ideaRepo: IdeaRepository = ideaRepository,
    private notificationSvc: NotificationService = notificationService
  ) {}

  async submitIdea(input: SubmitIdeaDto): Promise<SubmitIdeaResponse> {
    if (!input.title || !input.problem || !input.proposed_solution || !input.target_users || !input.why_it_matters || !input.current_stage || !input.contact_email) {
      throw new ValidationError('Missing required fields for idea submission');
    }

    const created = await this.ideaRepo.create(input);

    // Synchronous notification with short timeout & swallowed failure per ARCHITECTURE.md §3.3
    try {
      await this.notificationSvc.notifyAdminOnIdeaSubmission({
        id: created.id,
        title: created.title,
        contact_email: created.contact_email,
      });
    } catch (err: any) {
      console.warn(`[NOTIFICATION_SWALLOWED] Notification failure swallowed for idea ${created.id}:`, err?.message || err);
    }

    return {
      id: created.id,
      title: created.title,
      status: created.status,
      message: 'Thank you for submitting your idea. Your submission has been received and queued for review. Note: Submission does not guarantee product development or funding.',
    };
  }

  async listIdeas(filters: ListIdeasFilter) {
    return this.ideaRepo.list(filters);
  }

  async getIdeaById(id: string): Promise<IdeaWithHistory> {
    const idea = await this.ideaRepo.findById(id);
    if (!idea) {
      throw new NotFoundError(`Idea with ID ${id} not found`);
    }
    return idea;
  }

  async reviewIdea(input: UpdateIdeaReviewInput): Promise<IdeaWithHistory> {
    if (input.version === undefined || typeof input.version !== 'number') {
      throw new ValidationError('The version field is required for optimistic concurrency control');
    }

    const current = await this.ideaRepo.findById(input.id);
    if (!current) {
      throw new NotFoundError(`Idea with ID ${input.id} not found`);
    }

    const targetStatus = (input.status || current.status) as IdeaStatus;

    // Validate state transition
    if (input.status && input.status !== current.status) {
      const isLegal = isLegalIdeaTransition(current.status as IdeaStatus, targetStatus);
      if (!isLegal) {
        throw new ConflictError(
          `Illegal status transition from '${current.status}' to '${targetStatus}'.`,
          current
        );
      }
    }

    // Atomic transaction: status update + audit history insert
    return this.ideaRepo.updateStatusWithHistory({
      id: input.id,
      expectedVersion: input.version,
      toStatus: targetStatus,
      notes: input.admin_notes,
      actorId: input.adminId,
    });
  }
}

export const ideaService = new IdeaService();
