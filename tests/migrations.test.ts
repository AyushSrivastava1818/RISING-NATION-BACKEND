import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '../src/repositories/prisma.js';

/**
 * Migration-history health check — Slice 7, per the gap found in Slice 6: a
 * migration folder auto-named with a timestamp earlier than its dependencies
 * applied fine on an already-migrated database (prisma migrate dev trusts
 * recorded application order) but would break a genuine fresh
 * `git clone` + `prisma migrate deploy` bootstrap. `prisma migrate diff`
 * against the live database only proves end-state equality, not that a
 * from-scratch replay in migration-file order succeeds — that's the real bar.
 *
 * This test creates a disposable schema in the same Postgres instance,
 * deploys every migration into it from empty, and asserts success — the
 * actual scenario a fresh clone or CI bootstrap goes through. The schema is
 * dropped afterward regardless of outcome; nothing in the real dev database
 * is touched.
 */
describe('Migration History Health (ENGINEERING.md §6.5 / Slice 6 gap)', () => {
  const SCHEMA_NAME = 'verify_fresh_migrations_ci';
  const baseUrl = process.env.DATABASE_URL as string;

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA_NAME}" CASCADE`);
    await prisma.$disconnect();
  });

  it('replays every migration cleanly against a disposable schema, from empty', async () => {
    expect(baseUrl).toBeTruthy();

    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA_NAME}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA_NAME}"`);

    const freshSchemaUrl = new URL(baseUrl);
    freshSchemaUrl.searchParams.set('schema', SCHEMA_NAME);
    const finalUrl = freshSchemaUrl.toString();

    let output = '';
    try {
      output = execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
        env: { ...process.env, DATABASE_URL: finalUrl },
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      // Surface the actual prisma CLI output in the test failure, not just "exit 1".
      throw new Error(
        `prisma migrate deploy failed against a fresh schema:\n${err.stdout || ''}\n${err.stderr || ''}`
      );
    }

    expect(output).toContain('All migrations have been successfully applied');
  }, 30000);
});
