# Decisions Log — Rising Nation

This document records architectural, stack, and specification decisions resolved for the Rising Nation platform build.

## Tech Stack Choices

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | Next.js (React) | Provides fast SSR/SSG for marketing pages, seamless mobile-first responsiveness, and a unified React component model. |
| **Backend** | Node.js / Express (TypeScript) | Provides a clean, strict four-layer architecture (`api` → `middleware` → `services` → `repositories`) matching `ARCHITECTURE.md` §3.3 with clear transaction boundaries. |
| **Database** | PostgreSQL | Robust relational data integrity, strong foreign key constraints, and transactional consistency required for multi-table audit histories. |
| **ORM / Migrations** | Prisma ORM | Delivers type-safe database queries, declarative migrations, native interactive transaction support (`prisma.$transaction`), and seamless optimistic concurrency locking. |
| **Object Storage** | S3-compatible Object Storage | Secure, scalable storage for project media, thumbnails, and profile photos via direct signed-upload and signed-read URLs. |
| **Testing** | Vitest + Supertest | Blazing fast TypeScript test runner supporting unit, service mock, database integration, and parameterized HTTP route tests. |

---

## Open Decisions (ENGINEERING.md §6.13)

- **OD-1: Do students/creators/innovators need accounts?** → `(a) Admin-only V1` (source: ENGINEERING.md §6.13)
- **OD-3: Exact `ideas.status` values and legal transitions** → `Proposed set: submitted | in_review | evaluated | credited | shortlisted | in_development with version-based optimistic locking` (source: ENGINEERING.md §6.13)
- **OD-4: Block duplicate applications by email?** → `(a) Allow duplicates for V1` (source: ENGINEERING.md §6.13)
- **OD-5: Which static content blocks need CMS editing?** → `PROVISIONAL — placeholder page_keys [home_intro, about_vision, about_mission, about_what_we_believe, about_future_direction] managed via /admin/content/:page_key — NOT a confirmed default, needs client/product confirmation before this is treated as final. Flagged because this requires enumeration with the client's content team and cannot use a made-up default (ENGINEERING.md §6.13: "N/A — needs a working session, not an engineering default"); any admin content-CRUD built against these keys (page_key column, validation enums) may need a migration once real keys are confirmed.`
- **OD-6: Hosting provider** → `Stateless containerized backend on Docker-compatible hosting with managed PostgreSQL and S3-compatible storage per §6.8 topology` (source: ENGINEERING.md §6.13)
- **OD-7: Do Events/Announcements need public pages, and what fields?** → `Ship placeholder schema, admin-only, until confirmed` (source: ENGINEERING.md §6.13)
- **OD-8: What does "Credits/Recognition" consist of?** → `PROVISIONAL — no credits/points mechanism or ledger implemented in MVP (deferred entirely to Future scope) — NOT a confirmed default, needs client/product confirmation before this is treated as final. Flagged because spec describes the outcome only without defining a mechanism (ENGINEERING.md §6.13: "No default proposed — spec states the outcome, not the mechanism / N/A") and REQUIREMENTS.md places this in Future; no code or ledger will be built for this in MVP slices.`
- **OD-9: Is CAPTCHA needed on public forms?** → `(a) Not built for V1, rate-limiting only` (source: ENGINEERING.md §6.13)
- **OD-10: Data retention policy (idea documents, backups, member PII if applicable)** → `PROVISIONAL — placeholder 30-day automated backup retention and private idea document retention — NOT a confirmed default, needs client/product confirmation before this is treated as final. Flagged because this is a policy decision and potential compliance obligation, not an engineering one (ENGINEERING.md §6.13: "No default — policy decision, not engineering / N/A"); retention windows in deployment/infrastructure config (Slice 8) are placeholders pending confirmation, not final infrastructure configuration.`
- **OD-11: Individually-attributable admin accounts, or one shared login?** → `(a) Individual accounts` (source: ENGINEERING.md §6.13)

---

## Schema Deviations from DATABASE.md

- **SCHEMA-DEVIATION**: `categories.group` added beyond DATABASE.md spec. Reason: Required by `API.md` §3 endpoint `GET /categories?type=service&group=business` to filter business vs. creator services. Not present in original spec because: `DATABASE.md` ERD only listed `type` without the `group` sub-classifier required by the public API.
- **SCHEMA-DEVIATION**: `categories.slug` added beyond DATABASE.md spec. Reason: URL-safe unique identifier for clean web routing. Not present in original spec because: `DATABASE.md` ERD used `name` as the sole text attribute.
- **SCHEMA-DEVIATION**: `users.password_hash` added beyond DATABASE.md spec. Reason: Secure bcrypt authentication for admin accounts per `ARCHITECTURE.md` §3.6. Not present in original spec because: `DATABASE.md` ERD omitted authentication credential fields.
- **SCHEMA-DEVIATION**: `users.updated_at` added beyond DATABASE.md spec. Reason: Track account password and profile update timestamps. Not present in original spec because: `DATABASE.md` ERD omitted lifecycle timestamp columns.
- **SCHEMA-DEVIATION**: `sessions` table added beyond DATABASE.md spec. Reason: Server-side invalidatable session storage required by `ARCHITECTURE.md` §3.6. Not present in original spec because: `DATABASE.md` modeled core domain entities rather than ephemeral auth session state.
- **SCHEMA-DEVIATION**: `users.name` added beyond DATABASE.md spec. Reason: The idea-review audit trail (`ideas_status_history.actor_id` → `users`) needs a human-readable display name for the admin UI. Not every admin account is guaranteed to have a linked `people_profiles` row — `DATABASE.md`'s `user_id` FK on `people_profiles` is nullable/optional in both directions, and an admin created via the bootstrap script has no profile at all. Pulling the name from `people_profiles` would require making that link mandatory for admin accounts, which `DATABASE.md` does not specify and is not worth introducing for this alone. The field is also load-bearing in `scripts/admin-bootstrap.ts` and any actor-display join from `ideas_status_history`.
- **SCHEMA-DEVIATION**: `enquiries.user_id` **REMOVED** — was added speculatively (no code in `src/` ever reads or writes it). `DATABASE.md`'s Entity Specification for `enquiries` does not list this field. Enquiry submission is public/anonymous per `REQUIREMENTS.md` (`REQ-BIZ-002`, `REQ-CREATOR-002`) and `ARCHITECTURE.md` §3.7 (no auth on submission). Removed via migration rather than logged as a kept deviation.
- **SCHEMA-DEVIATION**: `projects.client_or_category` / `projects.problem` / `projects.solution` **CORRECTED** to nullable — were `NOT NULL`, an unresolved deviation from `DATABASE.md`'s Entity Specification for `projects` (all three listed `Nullable: Yes`). Corrected via migration during the Projects/People slice rather than kept.
- **SCHEMA-DEVIATION**: `enquiries.message` **CORRECTED** to nullable — was `NOT NULL`, an unresolved deviation from `DATABASE.md`'s Entity Specification for `enquiries` (`message | text | Nullable: Yes`). Corrected via migration during the Enquiries slice rather than kept.

---

## Deferred Hardening Items (Slice 7 audit)

Slice 7 (`chore: observability + security hardening pass`) audited `ENGINEERING.md` §6.1's threat table row by row against what's built. Two real findings were fixed in that slice (PII logged at info level in the notification stub; a raw password-reset token and email logged in the auth stub — see commit `82d1adc`). The three items below were identified as not (fully) mitigated but deliberately **not** fixed, since Slice 7 was scoped to hardening existing code with no new features, and each of these requires new functionality, a new CI pipeline, or a breaking dependency bump to close. Recorded here so they're discoverable without grepping commit history.

- **DEFERRED-HARDENING**: CSRF token defense-in-depth not built.
  - **§6.1 row quoted**: `| CSRF | Admin panel (cookie-based auth) | Logged-in admin tricked into a state-changing request | SameSite=Lax mitigates the common case; CSRF token on state-changing admin requests as defense-in-depth | Medium |`
  - **Why deferred**: the row's primary, documented mitigation (`SameSite=Lax` on the session cookie, `ARCHITECTURE.md` §3.6) is in place and verified. The CSRF token is explicitly framed as defense-in-depth on top of that, not the sole mitigation. Adding it means new middleware plus a token-issuance/validation flow across every state-changing admin route — new functionality, not a fix to something already built, and out of scope for a hardening-only slice.

- **DEFERRED-HARDENING**: `Idempotency-Key` header support not built.
  - **§6.1 row quoted**: `| Abuse of public submission endpoints | POST /ideas, /enquiries, /opportunities/:id/apply | Review queue flooded, notification/storage cost | Per-IP rate limiting; Idempotency-Key reduces accidental duplicates; CAPTCHA deferred to Post-MVP pending real spam evidence (OD-9) | Medium |`
  - **Why deferred**: the row's other two mitigations are in place — per-IP rate limiting (`publicSubmissionRateLimiter`) is wired to `POST /ideas` and `POST /enquiries`, and CAPTCHA is already an accepted V1 gap per OD-9. `ARCHITECTURE.md` §3.8 itself describes `Idempotency-Key` as "a UX safeguard against double-submit-on-retry," not required for V1 correctness, and distinct from the concurrency guarantees that section covers. Implementing it requires a new header-parsing/dedup-store mechanism — new functionality, not a hardening fix.

- **DEFERRED-HARDENING**: 13 pending high/critical `npm audit` advisories (across 5 flagged packages).
  - **§6.1 row quoted**: `| Dependency vulnerabilities | npm packages | Supply-chain compromise | npm audit-equivalent in CI, blocking merge | Medium |`
  - **Why deferred**: `npm audit` reports `deepmerge-ts` (via `@prisma/config` → `prisma`) and `tar` (via `@mapbox/node-pre-gyp` → `bcrypt`'s native build toolchain) as vulnerable. Both are transitive build/tooling dependencies of `prisma` and `bcrypt`, not code introduced by any slice. `npm audit fix` (non-force) resolves nothing — closing them requires a breaking major-version bump to `prisma` and/or `bcrypt`, which risks breaking migrations tooling and password hashing and needs its own testing pass. Left open rather than force-upgraded without being asked.
  - **Update (deployment/CI slice)**: a CI pipeline now exists (`.github/workflows/ci.yml`) and does enforce this row's mitigation, via an explicit GHSA-ID allowlist rather than a bare `npm audit --audit-level=high` — see `DEPLOY.md` → "Audit gate policy" and `scripts/check-audit.mjs` for the full reasoning. The gate is green today because these exact, reviewed IDs are allowlisted; it fails the build the moment any other high/critical advisory appears. This paragraph's "no CI pipeline exists" is no longer true and is kept above only as a record of the state at the time this item was first deferred.

---

## Tooling Scope Decisions

Records decisions about the scope/configuration of build/CI tooling itself (as opposed to application behavior) where the reason isn't obvious from the tooling config alone.

- **TOOLING-SCOPE**: ESLint scoped to `src/` only (`npm run lint` runs `eslint src scripts`), excluding `tests/`.
  - **Why**: ESLint was introduced in the deployment/CI slice specifically to give `.github/workflows/ci.yml`'s `lint` stage something real to run — no linter existed in this repo before. Linting `tests/` as well surfaced pre-existing issues in test files (unused variables/imports in `tests/auth.test.ts` and `tests/admin-authz-audit.test.ts`, a couple of stylistic findings in `tests/migrations.test.ts`) that predate this slice. Fixing those means editing test logic/assertions to understand whether each is genuinely dead code or a latent test bug — that's test-layer work, out of scope for a deployment-config slice scoped to "no new business logic." Narrowing lint to `src/`/`scripts/` (the actual application/tooling code this slice touches) ships a real, immediately-clean lint gate without silently rewriting test files no one asked to have touched.
  - **Revisit**: before enabling lint enforcement repo-wide (i.e., before removing this scoping and running `eslint .` unrestricted), someone should go through the current `tests/` lint findings file-by-file, fix or intentionally suppress each, and only then widen `npm run lint`'s scope.
