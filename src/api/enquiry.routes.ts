import { Router } from 'express';
import { z } from 'zod';
import * as enquiryService from '../services/enquiry.service.js';
import { publicSubmissionRateLimiter } from '../middleware/rate-limit.js';
import { ValidationError } from '../utils/errors.js';

export const publicEnquiryRouter = Router();

const createEnquirySchema = z.object({
  type: z.enum(['business_solutions', 'creator_support'], { required_error: 'type is required' }),
  services_requested: z.array(z.string().min(1)).min(1, 'services_requested must contain at least one value'),
  contact_name: z.string().min(1, 'contact_name is required'),
  contact_email: z.string().email('Valid contact_email is required'),
  contact_phone: z.string().optional(),
  message: z.string().optional(),
});

// POST /enquiries — public, rate-limited, no auth. Same public-write
// rate-limiting as Idea Submission (API.md) — reuses the Slice 3 limiter.
publicEnquiryRouter.post('/enquiries', publicSubmissionRateLimiter, async (req, res, next) => {
  try {
    const parseResult = createEnquirySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.errors[0]?.message || 'Validation failed');
    }

    const result = await enquiryService.submitEnquiry(parseResult.data);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});
