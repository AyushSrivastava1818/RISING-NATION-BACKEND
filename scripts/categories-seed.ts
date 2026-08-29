import { pathToFileURL } from 'node:url';
import { prisma } from '../src/repositories/prisma.js';

/**
 * Seeds ONLY the `categories` table, from the exact lists in
 * REQUIREMENTS.md (REQ-LEARN-003, REQ-BIZ-001, REQ-CREATOR-001). These are
 * fixed, spec-given taxonomies — not placeholder content — so they're safe
 * to seed mechanically.
 *
 * courses, projects, and people_profiles are deliberately NOT seeded here
 * (or anywhere in this repo): they need real content — actual course
 * material, actual project case studies, actual team bios — that isn't
 * specified in any doc and shouldn't be invented. Empty by design pending
 * real content from the Rising Nation team; see HANDOFF.md.
 */

interface CategorySeed {
  name: string;
  type: 'learning' | 'service';
  group?: 'business' | 'creator';
}

// Matches the slug shape already in use across the app (e.g. 'web-development',
// 'website-development' — see tests/course.test.ts, tests/enquiry.test.ts):
// lowercase, non-alphanumeric runs collapsed to a single hyphen, trimmed.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// REQ-LEARN-003
const LEARNING_CATEGORIES: CategorySeed[] = [
  { name: 'Web Development', type: 'learning' },
  { name: 'AI/ML', type: 'learning' },
  { name: 'DevOps', type: 'learning' },
  { name: 'Cybersecurity/Ethical Hacking', type: 'learning' },
  { name: 'Data', type: 'learning' },
  { name: 'Design', type: 'learning' },
  { name: 'Marketing', type: 'learning' },
  { name: 'Business', type: 'learning' },
];

// REQ-BIZ-001
const BUSINESS_SERVICE_CATEGORIES: CategorySeed[] = [
  'Website development',
  'Software development',
  'AI solutions',
  'Automation',
  'Digital solutions',
  'Branding',
  'Content',
  'Social media',
  'Marketing',
  'Product development',
  'Maintenance/support',
].map((name) => ({ name, type: 'service', group: 'business' }));

// REQ-CREATOR-001
const CREATOR_SERVICE_CATEGORIES: CategorySeed[] = [
  'Reels/video editing',
  'Content creation',
  'Content strategy',
  'Branding',
  'Instagram management',
  'Growth support',
  'Account management',
].map((name) => ({ name, type: 'service', group: 'creator' }));

const ALL_CATEGORIES: CategorySeed[] = [
  ...LEARNING_CATEGORIES,
  ...BUSINESS_SERVICE_CATEGORIES,
  ...CREATOR_SERVICE_CATEGORIES,
];

// `categories.slug` is UNIQUE across the whole table (DATABASE.md, no
// per-type/group scoping) — but the spec lists reuse the same name across
// different type/group combinations on purpose ("Marketing" is both a
// REQ-LEARN-003 learning topic and a REQ-BIZ-001 business service;
// "Branding" is both a REQ-BIZ-001 and a REQ-CREATOR-001 service). A plain
// slugify() would collide for those. Only names that actually repeat get a
// `-{group-or-type}` disambiguator; every other slug stays the plain form
// ('web-development', 'website-development', ...) so lookups by slug stay
// predictable for the common case.
function buildSlugs(categories: CategorySeed[]): Map<CategorySeed, string> {
  const nameCounts = new Map<string, number>();
  for (const c of categories) {
    nameCounts.set(c.name, (nameCounts.get(c.name) ?? 0) + 1);
  }

  const slugs = new Map<CategorySeed, string>();
  for (const c of categories) {
    const base = slugify(c.name);
    const isDuplicateName = (nameCounts.get(c.name) ?? 0) > 1;
    slugs.set(c, isDuplicateName ? `${base}-${c.group ?? c.type}` : base);
  }
  return slugs;
}

export async function seedCategories(): Promise<{ upserted: number }> {
  const slugs = buildSlugs(ALL_CATEGORIES);

  for (const category of ALL_CATEGORIES) {
    const slug = slugs.get(category)!;
    await prisma.category.upsert({
      where: { slug },
      update: {
        name: category.name,
        type: category.type,
        group: category.group ?? null,
      },
      create: {
        name: category.name,
        slug,
        type: category.type,
        group: category.group ?? null,
      },
    });
  }

  console.log(`Seeded ${ALL_CATEGORIES.length} categories.`);
  return { upserted: ALL_CATEGORIES.length };
}

// Run if executed directly. `pathToFileURL` (rather than manual string
// concatenation) is required here: on Windows, a path containing spaces
// needs percent-encoding to match `import.meta.url`, which a plain
// `file://${path}` template does not produce.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedCategories()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Category seed failed:', err);
      process.exit(1);
    });
}
