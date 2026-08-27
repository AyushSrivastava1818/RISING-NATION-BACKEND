import { Router } from 'express';
import { z } from 'zod';
import * as enquiryService from '../services/enquiry.service.js';
import { ValidationError } from '../utils/errors.js';

export const adminEnquiryRouter = Router();

const updateEnquirySchema = z.object({
  status: z.enum(['new', 'contacted', 'closed'], { required_error: 'status is required' }),
});

// GET /admin/enquiries?type=&status=&page=&limit=
adminEnquiryRouter.get('/', async (req, res, next) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const { enquiries, total } = await enquiryService.listEnquiries({ type, status, page, limit });
    res.status(200).json({ data: enquiries, meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

// GET /admin/enquiries/:id
adminEnquiryRouter.get('/:id', async (req, res, next) => {
  try {
    const enquiry = await enquiryService.getEnquiryById(req.params.id);
    res.status(200).json({ data: enquiry });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/enquiries/:id — status update
adminEnquiryRouter.patch('/:id', async (req, res, next) => {
  try {
    const parseResult = updateEnquirySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const enquiry = await enquiryService.updateEnquiryStatus(req.params.id, parseResult.data.status);
    res.status(200).json({ data: enquiry });
  } catch (err) {
    next(err);
  }
});
