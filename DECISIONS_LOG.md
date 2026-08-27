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

## Resolved Open Decisions (ENGINEERING.md §6.13)

- **OD-1: Do students/creators/innovators need accounts?** → `(a) Admin-only V1` (source: ENGINEERING.md §6.13)
- **OD-3: Exact `ideas.status` values and legal transitions** → `Proposed set: submitted | in_review | evaluated | credited | shortlisted | in_development with version-based optimistic locking` (source: ENGINEERING.md §6.13)
- **OD-4: Block duplicate applications by email?** → `(a) Allow duplicates for V1` (source: ENGINEERING.md §6.13)
- **OD-5: Which static content blocks need CMS editing?** → `Default standard set of page keys (home_intro, about_vision, about_mission, about_what_we_believe, about_future_direction) managed via /admin/content/:page_key` (source: ENGINEERING.md §6.13)
- **OD-6: Hosting provider** → `Stateless containerized backend on Docker-compatible hosting with managed PostgreSQL and S3-compatible storage per §6.8 topology` (source: ENGINEERING.md §6.13)
- **OD-7: Do Events/Announcements need public pages, and what fields?** → `Ship placeholder schema, admin-only, until confirmed` (source: ENGINEERING.md §6.13)
- **OD-8: What does "Credits/Recognition" consist of?** → `Tracked via idea status (credited) and admin notes in MVP, no points ledger` (source: ENGINEERING.md §6.13)
- **OD-9: Is CAPTCHA needed on public forms?** → `(a) Not built for V1, rate-limiting only` (source: ENGINEERING.md §6.13)
- **OD-10: Data retention policy** → `Daily automated database backups with standard 30-day retention; private idea documents retained privately until review closure` (source: ENGINEERING.md §6.13)
- **OD-11: Individually-attributable admin accounts, or one shared login?** → `(a) Individual accounts` (source: ENGINEERING.md §6.13)
