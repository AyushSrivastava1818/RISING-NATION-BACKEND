# API — Rising Nation

**Proposed** REST contract. No backend exists yet. Cross-references `DATABASE.md` (entities) and `ARCHITECTURE.md` §3.7 (full workflow reasoning for non-trivial writes).

## API Conventions

- **Base URL:** `/api/v1` — versioned from the first release so a future breaking change has a rollout path that doesn't require breaking the live frontend simultaneously.
- **Authentication:** session cookie (HTTP-only, `Secure`, `SameSite=Lax` — `ARCHITECTURE.md` §3.6). No API-key auth in V1 — no external consumer of this API is specified.
- **Authorization:** role-based, two roles in V1 (`public` implicit / `admin`). Every `/admin/*` route requires `role = admin`, checked in middleware before any resource lookup.
- **Content types:** `application/json` for all request/response bodies. File uploads use the signed-URL flow (`ENGINEERING.md` §6.4), not multipart bodies to this API.
- **Response envelope:** `{ data, meta }` for lists (`meta`: `page, limit, total`), `{ data }` for single resources, `{ error: { code, message, request_id } }` for failures.
- **Pagination:** `?page=` (1-indexed, default 1), `?limit=` (default 20, max 100, server-capped regardless of client request).
- **Filtering:** query params map to indexed columns only (`?category=`, `?status=`, `?type=`, `?open=`, `?featured=`, `?group=`) — see `DATABASE.md` Indexing Strategy for what's actually indexed.
- **Sorting:** fixed `created_at DESC` for all list endpoints in V1 — no client-specified `?sort=`, since nothing in `REQUIREMENTS.md` requires it; low-cost to add later if requested. **Open Decision if needed.**
- **Search:** not implemented in V1 — no full-text search requirement in `REQUIREMENTS.md`.
- **Rate limiting:** applied to the three public unauthenticated write endpoints (`POST /ideas`, `POST /enquiries`, `POST /opportunities/:id/apply`) and to `POST /auth/login` — full reasoning in `ENGINEERING.md` §6.1.
- **Idempotency:** `Idempotency-Key` header supported (not required) on the three public write endpoints above — replays the original response for a repeated key instead of creating a duplicate row, addressing double-submit-on-retry without a business-rule dedup check the spec doesn't ask for.

## Endpoint Documentation

### Learning — `REQ-LEARN`

**`GET /courses`**
- **Purpose:** list published courses. **Auth:** none. **Authorization:** none.
- **Query params:** `category` (slug), `level`, `page`, `limit`.
- **Response:** `200 { data: Course[], meta }`. `Course` DTO: `id, title, description, level, category, content_source, thumbnail_url, playback_ref` (a source-appropriate embed reference derived from `content_ref` — never the raw `content_ref` field name, which is an internal implementation detail).
- **DB interaction:** `SELECT ... FROM courses JOIN categories WHERE published=true AND category_id=$1 LIMIT $2 OFFSET $3`.
- **Example:** `GET /api/v1/courses?category=web-development&level=beginner` → `200 { "data": [{ "id": "...", "title": "Intro to HTML", "level": "beginner", "content_source": "youtube", "thumbnail_url": "..." }], "meta": { "page": 1, "limit": 20, "total": 8 } }`.

**`GET /courses/:id`** — single course detail. Same auth/response shape as above, singular.

**`GET /categories?type=learning`** — list learning categories. Public, no pagination (small, bounded set).

**`POST /admin/courses`** / **`PATCH /admin/courses/:id`**
- **Auth:** admin session required. **Authorization:** `role = admin`.
- **Request body:** `title, description, level, category_id, content_source, content_ref` (required); `thumbnail_url` (ignored on input — always server-derived, see Business rules).
- **Validation:** schema (required fields, `content_source` enum membership).
- **Business rules:** `content_source = native` → `400` in V1 (no `native_lessons` table exists yet, `ARCHITECTURE.md` §3.5). `content_source = youtube` → backend calls the YouTube Data API to confirm `content_ref` exists and fetch `title`/`thumbnail_url` for caching; failure → `502 upstream_error`.
- **Response:** `201`/`200` with the created/updated course.
- **Side effects:** YouTube Data API call (admin-time only — `ARCHITECTURE.md` §3.9).
- **Security:** admin-only; `content_ref` is validated server-side, never trusted as a raw client string persisted without verification.

**`DELETE /admin/courses/:id`** — admin only, hard delete (`DATABASE.md` — no soft delete).

### Idea Submission — `REQ-IDEA`

**`POST /ideas`**
- **Auth:** none. **Authorization:** none — public write.
- **Request body:** `title, problem, proposed_solution, target_users, why_it_matters, current_stage, contact_email` (required); `skills_team_required, document_url, demo_url, contact_phone` (optional).
- **Validation:** required-field presence, `contact_email` format, string length bounds.
- **Business rules:** no dedup/uniqueness check — see `ARCHITECTURE.md` §3.7.
- **Response:** `201 { data: { id, status: "submitted" } }`. Confirmation copy must not imply guaranteed funding/development (REQ-IDEA-005).
- **Error cases:** `400` missing/malformed field; `429` rate-limited.
- **DB interaction:** single `INSERT INTO ideas`.
- **Side effects:** admin notification email (best-effort, non-blocking).
- **Security:** rate-limited by IP; `document_url`/`demo_url` stored and only ever rendered as links to admin — **never fetched server-side** (SSRF avoidance, `ENGINEERING.md` §6.1).
- **Example:** `POST /api/v1/ideas` `{ "title": "Campus ride-share", "problem": "...", "proposed_solution": "...", "target_users": "...", "why_it_matters": "...", "current_stage": "concept", "contact_email": "a@b.com" }` → `201 { "data": { "id": "...", "status": "submitted" } }`.

**`GET /admin/ideas?status=`** — list for review, admin only, filtered/sorted by status.

**`GET /admin/ideas/:id`** — full detail for review, admin only.

**`PATCH /admin/ideas/:id`**
- **Auth:** admin. **Authorization:** `role = admin`.
- **Request body:** `{ status, notes?, version }` — `version` required (optimistic lock, `DATABASE.md`).
- **Validation:** `status` must be a known enum value; `version` must be present.
- **Business rules:** transition must be a legal edge in the state machine (`ARCHITECTURE.md` §3.7); illegal transition → `409`.
- **Response:** `200 { data: <updated idea, incl. new version> }`.
- **Error cases:** `404` not found; `409` illegal transition (body includes current status + allowed next statuses) or stale `version`; `400` unknown status value.
- **DB interaction:** transaction — `UPDATE ideas ... WHERE id=$1 AND version=$2` + `INSERT INTO ideas_status_history`.
- **Security:** `403` (not `404`) on non-admin — never leak idea existence to an unauthorized caller.

### Business Solutions — `REQ-BIZ` / Creator Support — `REQ-CREATOR`

**`GET /categories?type=service&group=business|creator`** — public service list.

**`POST /enquiries`**
- **Auth:** none. **Request body:** `type` (`business_solutions|creator_support`), `services_requested` (string[], validated against `categories`), `contact_name, contact_email` (required), `contact_phone, message` (optional).
- **Validation:** schema + `services_requested` values must exist in `categories(type='service')` → otherwise `422 unprocessable` (well-formed request, fails a business rule).
- **Response:** `201 { data: { id, status: "new" } }`.
- **Side effects:** admin notification.
- **Security:** same public-write rate-limiting as Idea Submission.

**`GET /admin/enquiries?type=&status=`** / **`PATCH /admin/enquiries/:id`** — admin only, status update.

### Projects — `REQ-PROJ`

**`GET /projects?featured=`** — public list. **`GET /projects/:id`** — public detail incl. media + team (joined, not N+1 — `DATABASE.md` Performance).

**`POST /admin/projects`** / **`PATCH /admin/projects/:id`** / **`DELETE /admin/projects/:id`** — admin CRUD.

**`POST /admin/projects/:id/media`** — issues a signed upload URL, confirmed via a follow-up call; full flow `ENGINEERING.md` §6.4.

### People & Network — `REQ-PEOPLE`

**`GET /people?group=`** — public list. **`GET /people/:id`** — public detail.

**`POST /admin/people`** / **`PATCH /admin/people/:id`** / **`DELETE /admin/people/:id`** — admin CRUD. `growth_level` is **not** edited here (see next).

**`PATCH /admin/users/:id/growth-level`**
- **Auth:** admin. **Request body:** `{ growth_level, reason }` — `reason` required.
- **Business rules:** no self-promotion; every change requires a stated reason (REQ-GROWTH-002).
- **Response:** `200`. **DB interaction:** transaction — `UPDATE users` + `INSERT growth_level_history`.
- Split into its own endpoint rather than folded into the generic people-edit route specifically so the audit-trail requirement is enforced at the route level, not left to hope in application code.

### Opportunities — `REQ-OPP`

**`GET /opportunities?type=&open=`** — public list. **`GET /opportunities/:id`** — public detail.

**`POST /opportunities/:id/apply`**
- **Auth:** none. **Request body:** `applicant_name, applicant_email` (required), `message` (optional).
- **Business rules:** opportunity must exist and be `open=true`.
- **Response:** `201 { data: { id, status: "received" } }`.
- **Error cases:** `404` opportunity doesn't exist; `409` opportunity closed (distinct from `404` so the frontend can show "this has closed" rather than a generic error).
- **DB interaction:** transaction, `SELECT ... FOR UPDATE` + conditional `INSERT` (`ARCHITECTURE.md` §3.8).
- **Security:** rate-limited, same class as Idea Submission.

**`POST /admin/opportunities`** / **`PATCH /admin/opportunities/:id`** — admin CRUD, incl. opening/closing.

**`GET /admin/applications?opportunity_id=&status=`** / **`PATCH /admin/applications/:id`** — admin review.

### Admin / Content Management — `REQ-ADMIN`

**`GET /announcements`** / **`GET /events`** — public lists.
**`/admin/announcements[/:id]`** / **`/admin/events[/:id]`** — admin CRUD.
**`PATCH /admin/content/:page_key`** — static CMS content edit; exact `page_key` set pending confirmation (Open Decision OD-5).

### Auth

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/login` | Admin login |
| POST | `/auth/logout` | Invalidate session |
| GET | `/auth/me` | Current identity + role |
| POST | `/auth/password-reset-request` | Start recovery (constant response regardless of email existence) |
| POST | `/auth/password-reset` | Complete recovery (single-use token) |

## Error Model

| Status | Code | Meaning |
|---|---|---|
| 400 | `validation_error` | Malformed/missing field |
| 401 | `unauthenticated` | No/invalid credentials |
| 403 | `forbidden` | Authenticated, wrong role |
| 404 | `not_found` | Genuinely doesn't exist — never used to mask a 403 |
| 409 | `conflict` | Illegal state transition, stale optimistic-lock version, closed-opportunity application |
| 422 | `unprocessable` | Well-formed request failing a business rule (e.g., invalid `services_requested` value) |
| 429 | `rate_limited` | Public submission rate limit hit |
| 502 | `upstream_error` | Dependent external service failed (YouTube validation) |
| 500 | `internal_error` | Unhandled — never includes a stack trace or query text |

Every error includes `request_id` for server-log correlation (`ENGINEERING.md` §6.5).

## API ↔ Requirement Traceability

| Requirement | Endpoint |
|---|---|
| REQ-LEARN-001/002/003/004 | `GET /courses`, `GET /categories?type=learning` |
| REQ-LEARN-005 / REQ-ADMIN-002 | `POST/PATCH /admin/courses` (content_source branch) |
| REQ-IDEA-001 | `POST /ideas` |
| REQ-IDEA-006 | `GET /admin/ideas`, `PATCH /admin/ideas/:id` |
| REQ-BIZ-002 | `POST /enquiries` (type=business_solutions) |
| REQ-CREATOR-002 | `POST /enquiries` (type=creator_support) |
| REQ-PROJ-001 | `/projects` CRUD, `/admin/projects/:id/media` |
| REQ-PEOPLE-001/002 | `/people` CRUD |
| REQ-GROWTH-001/002 | `PATCH /admin/users/:id/growth-level` |
| REQ-OPP-001/002 | `/opportunities` CRUD, `POST /opportunities/:id/apply` |
| REQ-ADMIN-001 (Events/Announcements) | `/events`, `/announcements` |
| REQ-HOME-003 | `GET /projects?featured=true`, `GET /people?featured=true` |

No endpoint in this document lacks a requirement row above — the reverse check (every requirement has an endpoint) is also satisfied except where a requirement is explicitly presentational (REQ-I2P reuses `POST /ideas`, no separate endpoint).

## API Design Review

**REST consistency:** resource-oriented throughout; the one deliberate deviation is `POST /opportunities/:id/apply` (an action, not a resource) — accepted because "apply" isn't meaningfully a sub-resource creation in the way `/admin/projects/:id/media` is.

**Naming:** consistent plural-noun collections (`/courses`, `/projects`, `/people`) except `/admin/content/:page_key`, which is deliberately singular/keyed since it addresses discrete content blocks, not a list.

**Resource boundaries:** `growth_level` was deliberately split off `PATCH /admin/people/:id` into its own endpoint (see People section) after review — the original combined design (carried from earlier iterations of this spec) would have let a generic field-patch bypass the audit-trail requirement. **Recommended improvement, now applied.**

**Pagination/filtering/sorting:** consistent across all list endpoints; sorting is fixed rather than client-specified — flagged as a possible future gap, not a current defect, since nothing in requirements asks for custom sort.

**Validation:** consistently schema-first, then business-rule (§ API Conventions, `ARCHITECTURE.md` §3.3) — no endpoint skips schema validation.

**Idempotency:** supported via header on public writes; **not** applied to admin writes, where the optimistic-lock `version` field serves an analogous but distinct purpose (preventing lost updates, not preventing duplicate creates).

**Status codes:** `422` was added specifically to distinguish "malformed" (400) from "well-formed but violates a business rule" (422) — the original draft of this API used 400 for both, collapsing a distinction the client-side error handling needs to render different messages.

**Security:** every admin route's authorization is checked before resource lookup (no 404-masks-403 anywhere) — verified as a cross-cutting rule, not endpoint-by-endpoint.

**Rate limiting:** applied narrowly (public writes + login) rather than globally — a global rate limit would be complexity without a corresponding risk on read-only public endpoints.

**Versioning:** `/api/v1` from day one — the one clear gap in an earlier draft of this contract, now closed.

**Recommended improvements not yet built:** client-specified sort (low priority, no current requirement); bulk admin operations (no workflow in the spec currently needs them — add only if that need materializes).
