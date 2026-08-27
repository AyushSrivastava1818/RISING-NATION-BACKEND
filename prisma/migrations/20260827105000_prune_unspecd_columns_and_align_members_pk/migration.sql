-- AlterTable: categories
ALTER TABLE "categories" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "updated_at";

-- AlterTable: courses
ALTER TABLE "courses" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "courses" DROP COLUMN IF EXISTS "updated_at";

-- AlterTable: people_profiles
ALTER TABLE "people_profiles" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "people_profiles" DROP COLUMN IF EXISTS "updated_at";

-- AlterTable: projects
ALTER TABLE "projects" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "updated_at";

-- AlterTable: project_media
ALTER TABLE "project_media" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "project_media" DROP COLUMN IF EXISTS "updated_at";

-- AlterTable: project_members (drop surrogate id/created_at, composite PK on (project_id, profile_id))
ALTER TABLE "project_members" DROP COLUMN IF EXISTS "id";
ALTER TABLE "project_members" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "project_members" ADD PRIMARY KEY ("project_id", "profile_id");

-- AlterTable: enquiries
ALTER TABLE "enquiries" DROP COLUMN IF EXISTS "updated_at";
