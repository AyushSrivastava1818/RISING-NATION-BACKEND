-- Remove enquiries.user_id: not in DATABASE.md Entity Specification, no code reads or writes it.
-- Enquiry submission is public/anonymous per REQ-BIZ-002, REQ-CREATOR-002.
ALTER TABLE "enquiries" DROP COLUMN IF EXISTS "user_id";
