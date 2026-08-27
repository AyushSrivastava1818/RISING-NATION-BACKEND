-- DropIndex
-- IF EXISTS: on a fresh sequential replay, Postgres's ADD PRIMARY KEY in
-- prune_unspecd_columns_and_align_members_pk absorbs this pre-existing
-- unique index directly into project_members_pkey, so this name may already
-- be gone by the time this migration runs. Not conditional on the live
-- database this was originally authored against, where it still existed.
DROP INDEX IF EXISTS "project_members_project_id_profile_id_key";

-- AlterTable
ALTER TABLE "courses" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "people_profiles" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- RenameForeignKey
ALTER TABLE "ideas_status_history" RENAME CONSTRAINT "ideas_status_history_changed_by_fkey" TO "ideas_status_history_actor_id_fkey";
