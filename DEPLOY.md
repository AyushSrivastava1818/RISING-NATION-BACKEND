# Deployment — Rising Nation Backend

Wires `ENGINEERING.md` §6.8 (Deployment) and §6.9 (Configuration) into an actual
Dockerfile, environment loader, and CI pipeline. This document describes what
was built, not new design — see `ENGINEERING.md` for the reasoning behind any
of the choices below.

## Container

`Dockerfile` is a two-stage build (`build` -> `runtime`) producing a stateless
image:

- No volumes, no local file writes outside stdout/stderr (structured JSON
  logs — `src/utils/logger.ts` — go to stdout only, nothing is written to
  local disk).
- No session state in the process — sessions live in Postgres
  (`ARCHITECTURE.md` §3.6) — so any number of replicas can run behind a load
  balancer without sticky sessions.
- Entirely environment-variable-configured (§6.9) — the same image is
  promotable dev -> staging -> production without a rebuild.
- Does **not** run migrations on startup or in its entrypoint. See
  "Migration-before-deploy ordering" below for why.

Build and run locally:

```bash
docker build -t rising-nation-backend .
docker run --rm -p 4000:4000 --env-file .env rising-nation-backend
```

## Environment variables (`ENGINEERING.md` §6.9)

`src/config/index.ts` validates `process.env` against a Zod schema **at
module-import time** — before `src/index.ts` calls `app.listen(...)`. A
missing or malformed "Required: Yes" variable throws immediately at process
startup, listing every missing/invalid variable, instead of surfacing as a
runtime `undefined` the first time some request path happens to touch it.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | Yes | `development` \| `test` \| `production` |
| `PORT` | Yes | |
| `DATABASE_URL` | Yes (sensitive) | |
| `SESSION_SECRET` | Yes (sensitive) | |
| `FRONTEND_URL` / `CORS_ORIGIN` | Yes | |
| `S3_ENDPOINT` / `S3_BUCKET` | Yes | |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Yes (sensitive) | |
| `YOUTUBE_API_KEY` | Yes (sensitive) | |
| `EMAIL_PROVIDER_API_KEY` | Yes (sensitive) | |
| `ADMIN_NOTIFICATION_EMAIL` | Yes | |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | First deploy only | Validated by `scripts/admin-bootstrap.ts` itself when run, not by the server's general startup — these are meant to be rotated/removed after first use, so requiring them on every boot would be wrong. |
| `RATE_LIMIT_PUBLIC_SUBMISSION_MAX` / `RATE_LIMIT_LOGIN_MAX` | No (sane default) | Defaults 10 / 5 |
| `SENTRY_DSN` | Recommended | Optional, defaults to empty (not yet wired to an error tracker) |

`S3_REGION` also exists (`storage.service.ts`) but isn't in the §6.9 table;
it keeps its pre-existing sane default (`us-east-1`) and isn't part of the
required set.

In non-production environments, `S3_ACCESS_KEY_ID`/`YOUTUBE_API_KEY` can be
left as the literal placeholder values from `.env.example` — the storage and
YouTube services already detect those exact strings and fall back to stub
mode (no real external call). CI's `test` and `migration-deploy-check` jobs
rely on this; it's pre-existing behavior, not something this change added.

## CI/CD pipeline (`.github/workflows/ci.yml`)

Implements the §6.8 sequence, each job gating the next via `needs`:

```
lint ──┬─────────────────────────────────────────────────┐
       │                                                  │
       └──> test ──> migration-deploy-check ──┐           │
                                               │           │
dependency-audit ──────────────────────────────┴──> build ──> staging-deploy ──> smoke-test ──> production-deploy
```

- **lint** — `npm run lint` (ESLint over `src/` and `scripts/`; see note below
  on why `tests/` is out of scope for this gate).
- **dependency-audit** — `npm audit --audit-level=high`, blocking, per the
  §6.1 threat-table row ("npm audit-equivalent in CI, blocking merge").
  **This currently fails on `main`** — see "Known-failing gate" below.
- **test** — spins up an ephemeral Postgres service container, runs
  `prisma migrate deploy` against it, then `vitest run --exclude
  tests/migrations.test.ts` (the rest of the suite).
- **migration-deploy-check** — its own named job, positioned before `build`,
  running only `vitest run tests/migrations.test.ts`. This is the
  disposable-schema check added in Slice 7: it replays every migration from
  empty against a fresh schema on the same Postgres instance, which is the
  actual bootstrap path a fresh clone or a real deploy goes through. It is
  deliberately **not** folded into the `test` job — Slice 6's gap was a
  migration that applied fine against an already-migrated dev database but
  would have broken a from-scratch `prisma migrate deploy`; giving it a
  separate, clearly-named gate means that failure mode shows up as its own
  red job, not buried inside a generic "tests failed".
- **build** — builds the Docker image; pushes to `ghcr.io/<repo>` (tagged
  `:<sha>` and `:latest`) only on pushes to `main`, not on pull requests.
- **staging-deploy** / **smoke-test** / **production-deploy** — see below.

### Migration-before-deploy ordering

Per §6.8: **migrate → deploy → verify readiness → shift traffic.** Both
`staging-deploy` and `production-deploy` run `prisma migrate deploy` against
the target environment's database as their first step, using that
environment's `DATABASE_URL` secret — before the "deploy image" step, and
before `verify readiness` polls `/api/ready`. Nothing shifts traffic to a new
revision until readiness (a live DB connection, not just process liveness —
`ENGINEERING.md` §6.5) is confirmed. This ordering is enforced by job step
order, not by anything inside the container: the image itself never runs
migrations (see Container section above) so that concurrently-starting
replicas can never race each other applying the same migration.

Migrations are additive-preferred (nullable column → backfill → tighten, per
§6.8) precisely so a rolling deploy's brief window of old-code-new-schema (or
vice versa) doesn't break — that's a migration-authoring discipline, not
something this pipeline enforces mechanically.

### Staging/production deploy: placeholder pending OD-6

`ENGINEERING.md` marks the hosting provider as **Open Decision OD-6** —
explicitly unresolved. Rather than invent a specific provider's deploy
command (which `ARCHITECTURE.md` elsewhere calls "fabrication, not design"
when applied to undecided questions), the `staging-deploy` and
`production-deploy` jobs implement the real, provider-independent parts —
migration, readiness verification, gating order — and leave the "push this
image to the host" step as a clearly labeled `TODO(OD-6)`. Once a provider is
chosen, replace that one step with the provider's deploy action/CLI call
against `${{ env.IMAGE_NAME }}:${{ github.sha }}`.

### API-level smoke test (no frontend)

This build is backend-only (frontend descoped). `smoke-test` runs `curl`
against real HTTP endpoints on the deployed staging instance — liveness,
readiness, an unauthenticated public list endpoint (`GET /api/courses`), and
confirming an admin route rejects an unauthenticated request with `401`. It
does not assume or exercise a browser-based frontend.

### Required GitHub configuration

- **Environments** `staging` and `production` (Settings → Environments).
  Add a required-reviewers rule on `production` for a manual approval gate —
  that can't be expressed in the workflow YAML itself.
- **Environment variables**: `STAGING_URL`, `PRODUCTION_URL` (the deployed
  base URL, used for readiness checks and smoke tests).
- **Environment secrets**: `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL`
  (used only by the `prisma migrate deploy` step, never logged). Whatever
  provider-specific deploy credentials OD-6's eventual choice needs.
- `GITHUB_TOKEN` (default, no setup needed) authenticates the `build` job's
  push to `ghcr.io`.

### Known-failing gate: dependency-audit

`npm audit` currently reports 5 pending vulnerabilities (4 high, 1 critical)
in transitive build/tooling dependencies of `prisma` (`deepmerge-ts`) and
`bcrypt` (`tar` via `node-pre-gyp`) — see `DECISIONS_LOG.md` → "Deferred
Hardening Items (Slice 7 audit)" for the full analysis of why these were left
open rather than force-upgraded. Wiring the CI gate faithfully (matching the
§6.1 threat table's "blocking merge" mitigation) means `dependency-audit`
**will fail on `main` today** until that dependency bump lands — this is the
gate correctly reporting a real, already-known, already-documented gap, not
a bug in this CI config.

## Testing note: no unit/integration test split yet

`ENGINEERING.md` §6.6 recommends organizing tests into unit (mocked
repository) / integration (real DB) / API / E2E tiers. As implemented, every
test file in `tests/` exercises the full HTTP stack against a real test
database (via `supertest` + Prisma) — there's no mocked-repository unit tier
yet. The `test` CI job therefore runs the whole non-migration suite as one
stage rather than as genuinely separate "unit" and "integration" jobs;
splitting the suite by §6.6's tiers is test-layer work, out of scope for this
deployment-config slice (no new business logic). `migration-deploy-check`
remains its own explicit gate regardless, per the specific gap it exists to
catch.
