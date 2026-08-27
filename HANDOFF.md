# Handoff — Rising Nation Backend

Start here. This is a **backend-only deliverable** — the frontend was never built (see "Scope" below); `docs/` is the original product specification a separate frontend effort should build against, not documentation of something this repo implements.

## What's built

All MVP backend work per `ENGINEERING.md` §6.11 is complete: auth, the idea-submission/review pipeline, Learning/Courses, the Projects/People showcase and growth ladder, service-intake Enquiries, signed-upload media handling, observability (structured logging, `request_id` propagation, health/readiness checks), a security-hardening pass, and deployment/CI config.

- [`PROGRESS.md`](PROGRESS.md) — the live build checklist, domain by domain.
- [`README.md`](README.md) — tech stack, project structure, endpoint summary, "What's implemented" table.
- `opportunities` is **Post-MVP scope** (`ENGINEERING.md` §6.11) — not a gap, just not part of this MVP build. No schema, routes, or tests exist for it yet.

## Decisions made, and why

Every non-obvious call made during this build — resolved Open Decisions (OD-1 through OD-11), schema deviations from `docs/DATABASE.md`'s original spec, deliberately deferred hardening items, tooling-scope choices, and the backend-only delivery scope itself — is recorded in [`DECISIONS_LOG.md`](DECISIONS_LOG.md), with the reasoning, not just the outcome. Read it before assuming something in the code is arbitrary; it usually traces back to a specific requirement, spec gap, or tradeoff recorded there.

## Running things locally

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL and any real credentials
npx prisma migrate deploy   # applies the full migration history
npm run seed:admin          # creates the bootstrap admin account (first run only)
npm run dev                 # starts the API with hot reload
```

**Full test suite** (requires a real Postgres instance — most tests exercise the full HTTP stack against it, not mocks; see `DEPLOY.md` → "Testing note" for why there's no separate unit/integration split yet):

```bash
npm test
```

**Migration-replay check on its own** — the specific check that deploys every migration from empty into a disposable schema on the same Postgres instance, catching a migration that applies fine against an already-migrated dev database but would break a genuine fresh `prisma migrate deploy` (the Slice 6/7 gap `tests/migrations.test.ts` exists to prevent):

```bash
npm run test:migrations
```

**Lint and the dependency-audit gate**, matching what CI runs:

```bash
npm run lint          # ESLint over src/ and scripts/ — see DECISIONS_LOG.md "Tooling Scope Decisions" for why not tests/
npm run audit:check   # npm audit, allowlisted against known-accepted advisories — see DECISIONS_LOG.md
```

## Building and running the Docker image

```bash
docker build -t rising-nation-backend .
docker run --rm -p 4000:4000 --env-file .env rising-nation-backend
```

Full details — the two-stage stateless build, fail-fast environment validation, the CI/CD pipeline (`lint → dependency-audit → test → migration-deploy-check → build → staging-deploy → smoke-test → production-deploy`), and migration-before-deploy ordering — are in [`DEPLOY.md`](DEPLOY.md).

**One correction worth knowing before configuring a load balancer or orchestrator health check**: `ENGINEERING.md` §6.5 phrases the health checks as bare `GET /health` and `GET /ready`. As actually implemented, both are mounted under the API's `/api` base path — **`GET /api/health` and `GET /api/ready`** — like every other route. Point any real health-check config at the `/api/` versions; see `DEPLOY.md` → "Health-check endpoint paths" for the full note. `DEPLOY.md` also documents two `docker run --env-file` gotchas (quoting, `localhost` vs `host.docker.internal`) hit and fixed during a manual end-to-end verification pass, and that pass caught and fixed a real bug — the runtime image needed `openssl` installed for Prisma's query engine to start at all.

## Before production traffic: three deferred hardening items

`DECISIONS_LOG.md` → "Deferred Hardening Items (Slice 7 audit)" has the full reasoning for each; summarized here because they specifically should be resolved **before this service takes production traffic**, not left indefinitely:

1. **CSRF token defense-in-depth not built.** `SameSite=Lax` (the primary, already-verified mitigation) is in place; the CSRF token is the documented defense-in-depth layer on top of it, not yet added.
2. **`Idempotency-Key` header support not built.** Per-IP rate limiting is in place on public submission endpoints; this is the accidental-double-submit safeguard on top of it, not yet added.
3. **13 pending high/critical `npm audit` advisories**, in transitive build/tooling dependencies of `prisma` (`deepmerge-ts`) and `bcrypt` (`tar`, via its native build toolchain) — not runtime-shipped code, but real advisories with no fix available short of a breaking major-version bump to `prisma` and/or `bcrypt`. The CI `dependency-audit` gate currently allowlists these exact, reviewed advisory IDs (see `DEPLOY.md` → "Audit gate policy") so the gate stays meaningful for *new* issues — but the allowlist is a way of tracking the debt, not resolving it.

None of these block MVP functionality or this handoff; all three are real, scoped, and already fully documented — they just weren't fixed because closing them each requires new functionality or a breaking dependency bump, out of scope for the slices that identified them.

## Scope: this is a backend-only deliverable

Frontend was never built in this repo (`frontend/` is a stub). `docs/` — `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `ENGINEERING.md` — is the original specification for the full product, including frontend-facing requirements and the API contract, and is what a separate frontend team should build against; where this backend's actual implemented behavior differs from that spec (schema deviations, `opportunities` not yet built), `DECISIONS_LOG.md` and `PROGRESS.md` are the authoritative record of what's real versus what's still proposed.
