import { Idea, IdeaStatusHistory, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export interface CreateIdeaInput {
  title: string;
  problem: string;
  proposed_solution: string;
  target_users: string;
  why_it_matters: string;
  current_stage: string;
  skills_team_required?: string;
  document_url?: string;
  demo_url?: string;
  contact_email: string;
  contact_phone?: string;
  submitted_by?: string;
}

export interface ListIdeasFilter {
  status?: string;
  page?: number;
  limit?: number;
}

export type IdeaWithHistory = Idea & {
  status_history: IdeaStatusHistory[];
};

export class IdeaRepository {
  async create(data: CreateIdeaInput): Promise<Idea> {
    return prisma.idea.create({
      data: {
        title: data.title,
        problem: data.problem,
        proposed_solution: data.proposed_solution,
        target_users: data.target_users,
        why_it_matters: data.why_it_matters,
        current_stage: data.current_stage,
        skills_team_required: data.skills_team_required || null,
        document_url: data.document_url || null,
        demo_url: data.demo_url || null,
        contact_email: data.contact_email.toLowerCase(),
        contact_phone: data.contact_phone || null,
        submitted_by: data.submitted_by || null,
        status: 'submitted',
        version: 1,
      },
    });
  }

  async findById(id: string): Promise<IdeaWithHistory | null> {
    return prisma.idea.findUnique({
      where: { id },
      include: {
        status_history: {
          orderBy: { created_at: 'asc' },
          include: {
            actor: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        submitter: {
          select: { id: true, name: true, email: true },
        },
        reviewer: {
          select: { id: true, name: true, email: true },
        },
      },
    }) as Promise<IdeaWithHistory | null>;
  }

  async list(filters: ListIdeasFilter): Promise<{ ideas: Idea[]; total: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.IdeaWhereInput = {};
    if (filters.status) {
      where.status = filters.status;
    }

    const [total, ideas] = await Promise.all([
      prisma.idea.count({ where }),
      prisma.idea.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return { ideas, total };
  }

  /**
   * Atomic Transaction Requirement (ARCHITECTURE.md §3.8):
   * Status UPDATE and ideas_status_history INSERT must happen atomically in one transaction.
   * Optimistic lock on idea.version prevents race conditions.
   */
  async updateStatusWithHistory(params: {
    id: string;
    expectedVersion: number;
    toStatus: string;
    adminNotes?: string;
    changedBy: string;
  }): Promise<IdeaWithHistory> {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch current idea inside transaction
      const current = await tx.idea.findUnique({
        where: { id: params.id },
      });

      if (!current) {
        throw new NotFoundError('Idea not found');
      }

      // 2. Optimistic locking verification (DATABASE.md Data Integrity)
      if (current.version !== params.expectedVersion) {
        throw new ConflictError(
          `Stale version: idea has version ${current.version}, but version ${params.expectedVersion} was supplied. Please reload and retry.`
        );
      }

      const fromStatus = current.status;
      const nextVersion = current.version + 1;

      // 3. Update Idea
      const updatedIdea = await tx.idea.update({
        where: {
          id: params.id,
          version: params.expectedVersion, // Double lock check at SQL level
        },
        data: {
          status: params.toStatus,
          admin_notes: params.adminNotes !== undefined ? params.adminNotes : current.admin_notes,
          reviewed_by: params.changedBy,
          version: nextVersion,
        },
      });

      // 4. Insert into ideas_status_history atomically
      await tx.ideaStatusHistory.create({
        data: {
          idea_id: params.id,
          from_status: fromStatus,
          to_status: params.toStatus,
          changed_by: params.changedBy,
          notes: params.adminNotes || null,
        },
      });

      // 5. Return updated idea with history
      const result = await tx.idea.findUnique({
        where: { id: params.id },
        include: {
          status_history: {
            orderBy: { created_at: 'asc' },
          },
        },
      });

      return result as IdeaWithHistory;
    });
  }
}

export const ideaRepository = new IdeaRepository();
