-- Align projects.client_or_category / problem / solution with DATABASE.md
-- Entity Specification (all three are Nullable: Yes) — schema previously had
-- them NOT NULL, an unresolved deviation from a prior schema audit pass.
ALTER TABLE "projects" ALTER COLUMN "client_or_category" DROP NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "problem" DROP NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "solution" DROP NOT NULL;
