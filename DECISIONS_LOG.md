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
