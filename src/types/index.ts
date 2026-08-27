export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    request_id?: string;
  };
}

export interface ApiResponseEnvelope<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  };
}

export type Role = 'public' | 'member' | 'admin';
export type GrowthLevel = 'learner' | 'contributor' | 'intern' | 'builder' | 'lead';
export type CategoryType = 'learning' | 'service';
export type ContentSource = 'youtube' | 'native';
export type IdeaStatus = 'submitted' | 'in_review' | 'evaluated' | 'credited' | 'shortlisted' | 'in_development';
export type EnquiryType = 'business_solutions' | 'creator_support';
export type EnquiryStatus = 'new' | 'contacted' | 'closed';
export type OpportunityType = 'learner' | 'contributor' | 'internship' | 'project' | 'mentorship' | 'industry' | 'open_position';
export type ApplicationStatus = 'received' | 'reviewed' | 'accepted' | 'rejected';
