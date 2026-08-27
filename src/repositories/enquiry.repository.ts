import { Enquiry, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface CreateEnquiryInput {
  type: string;
  services_requested: string[];
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  message?: string;
}

export async function createEnquiry(input: CreateEnquiryInput): Promise<Enquiry> {
  return prisma.enquiry.create({
    data: {
      type: input.type,
      services_requested: input.services_requested,
      contact_name: input.contact_name,
      contact_email: input.contact_email.toLowerCase(),
      contact_phone: input.contact_phone || null,
      message: input.message || null,
      status: 'new',
    },
  });
}

export interface ListEnquiriesFilter {
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listEnquiries(filter: ListEnquiriesFilter): Promise<{
  enquiries: Enquiry[];
  total: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.EnquiryWhereInput = {};
  if (filter.type) where.type = filter.type;
  if (filter.status) where.status = filter.status;

  const [enquiries, total] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.enquiry.count({ where }),
  ]);

  return { enquiries, total };
}

export async function findEnquiryById(id: string): Promise<Enquiry> {
  const enquiry = await prisma.enquiry.findUnique({ where: { id } });
  if (!enquiry) throw new NotFoundError(`Enquiry ${id} not found`);
  return enquiry;
}

export async function updateEnquiryStatus(id: string, status: string): Promise<Enquiry> {
  const existing = await prisma.enquiry.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Enquiry ${id} not found`);

  return prisma.enquiry.update({ where: { id }, data: { status } });
}
