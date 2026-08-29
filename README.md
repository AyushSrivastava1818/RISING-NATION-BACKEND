# Rising Nation — Backend

Backend API for **Rising Nation**, a technology/innovation organization platform combining free technical education with real project experience, a public idea-intake and evaluation pipeline, service-enquiry funnels for business clients and content creators, and public Projects/People showcases — all managed through a single admin layer.

Built as a strict four-layer TypeScript/Express service (`api → middleware → services → repositories`) against PostgreSQL via Prisma, following a documentation-first process: every endpoint, schema field, and business rule traces back to a requirement in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) and is designed in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before being built.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime / API | Node.js, Express (TypeScript) |
| Database | PostgreSQL |
| ORM / Migrations | Prisma |
| Auth | Server-side sessions (HTTP-only, `SameSite=Lax` cookie), bcrypt |
| Object storage | S3-compatible, signed-upload flow (`@aws-sdk/client-s3`) |
| Validation | Zod |
| Testing | Vitest + Supertest (unit, service-mock, and real-database integration tests) |

Full rationale for each choice is in [`DECISIONS_LOG.md`](DECISIONS_LOG.md).

## What's implemented

| Domain | Status | Endpoints |
|---|---|---|
| Auth | ✅ | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, password reset |
| Idea pipeline | ✅ | `POST /ideas`, `GET/PATCH /admin/ideas` (reviewed state machine, optimistic locking) |
| Learning / Courses | ✅ | `GET /courses`, `GET /courses/:id`, `GET /categories`, `/admin/courses` CRUD (YouTube-validated content) |
| Showcase (Projects & People) | ✅ | `GET /projects(/:id)`, `GET /people(/:id)`, `/admin/projects`, `/admin/people` CRUD + signed media/photo upload |
| Growth ladder | ✅ | `PATCH /admin/users/:id/growth-level` (audited, no self-promotion) |
| Service intake (Enquiries) | ✅ | `POST /enquiries`, `GET/PATCH /admin/enquiries` |
| Observability & security hardening | ✅ | structured logging, `request_id` propagation, `/api/health` + `/api/ready`, threat-model audit |
| Deployment config | ✅ | Dockerfile, fail-fast env validation, CI pipeline — see [`DEPLOY.md`](DEPLOY.md) |
| Opportunities | ⏳ Post-MVP, not yet built | |
| Frontend | ⏳ out of scope for this repo — see [`DECISIONS_LOG.md`](DECISIONS_LOG.md) → "Delivery Scope: Backend-Only" | |

See [`PROGRESS.md`](PROGRESS.md) for the live build checklist and [`DECISIONS_LOG.md`](DECISIONS_LOG.md) for schema deviations, open decisions, and deliberately deferred hardening items.

## Project structure

```
src/
  api/            Route handlers — request parsing, validation, response shaping
  middleware/     Auth, rate limiting, request_id + structured logging, error handling
  services/       Business logic and orchestration (one file per domain)
  repositories/   All Prisma/database access — no raw SQL, no query logic elsewhere
  utils/          Crypto, structured logger, shared error types, state machines
  config/         Env var loading and validation (Zod)
  types/          Shared domain enums/types

prisma/
  schema.prisma   Data model
  migrations/     One migration per schema change, applied in order

tests/            Vitest suites — one file per domain, plus cross-cutting
                  admin-authz-audit.test.ts and migrations.test.ts

docs/             Requirements, architecture, database, API, and engineering specs
```

## Getting started

**Prerequisites:** Node.js 20+, a running PostgreSQL instance.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL and any real credentials
npx prisma migrate deploy   # applies the full migration history
npm run seed:admin          # creates the bootstrap admin account
npm run seed:categories     # populates categories (learning/business/creator) — idempotent, safe to re-run
npm run dev                 # starts the API with hot reload
```

Other scripts:

```bash
npm run build     # compile TypeScript
npm start         # run the compiled build
npm test          # run the full test suite (spins queries against a real DB)
npm run test:watch
npm run prisma:generate
npm run prisma:validate
```

## Testing

`npm test` runs the full Vitest suite: per-domain route/service tests (mocked repositories for fast unit coverage, plus real-Postgres integration tests for transaction/atomicity guarantees), a consolidated authorization audit that checks every `/admin/*` route for correct 401/403 behavior, and a migration-health check that deploys the entire migration history into a disposable schema from empty to catch replay-order bugs before they reach a fresh environment.

## API documentation

| Doc | Covers |
|---|---|
| [`HANDOFF.md`](HANDOFF.md) | Start here for team pickup — what's built, how to run/test/deploy, what's deferred |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Source functional spec, requirement IDs |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layering, request lifecycle, domain design, transactions |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Entity specification, indexing, data integrity |
| [`docs/API.md`](docs/API.md) | Endpoint-by-endpoint contract |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | Security, validation, error handling, observability, deployment |
| [`DECISIONS_LOG.md`](DECISIONS_LOG.md) | Resolved open decisions, schema deviations, deferred hardening items |
| [`DEPLOY.md`](DEPLOY.md) | Docker image, CI/CD pipeline, migration-before-deploy ordering |
| [`PROGRESS.md`](PROGRESS.md) | Build checklist |

## Security & observability

- Every error response is `{ error: { code, message, request_id } }` with the status/code pairing fixed by `docs/ENGINEERING.md` §6.3 — enforced by a single error-handling middleware, not per-route.
- Every request gets a `request_id`, propagated via `AsyncLocalStorage` into every structured log line for that request (no manual threading through function calls).
- `GET /api/health` (liveness) and `GET /api/ready` (readiness — verifies the database connection is acquirable) are separated per §6.5.
- Rate limiting on login and all public submission endpoints; admin authorization is checked in middleware before any resource lookup (`403`, never `404`, on a role mismatch).
- Signed-upload flow for all media (project screenshots, people photos): backend-validated MIME/size, backend-generated object keys, confirm-before-persist.
