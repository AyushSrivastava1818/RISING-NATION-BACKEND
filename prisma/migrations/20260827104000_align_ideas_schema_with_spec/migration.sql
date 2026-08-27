-- AlterTable: Drop admin_notes and reviewed_by columns from ideas table
ALTER TABLE "ideas" DROP COLUMN IF EXISTS "admin_notes";
ALTER TABLE "ideas" DROP COLUMN IF EXISTS "reviewed_by";

-- AlterTable: Rename changed_by to actor_id in ideas_status_history table
ALTER TABLE "ideas_status_history" RENAME COLUMN "changed_by" TO "actor_id";
