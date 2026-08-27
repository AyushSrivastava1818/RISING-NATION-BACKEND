# Engineering — Rising Nation

Production engineering layer: security, validation, error handling, media, observability, testing, performance, deployment, configuration, workflow, roadmap, risks, and open decisions. All **Recommended** design; nothing here is implemented. Cross-references `ARCHITECTURE.md` §3 (layers, workflows) and `DATABASE.md`.

## 6.1 Security

Design-time threat model — identifies what could go wrong if built carelessly, not a report against an existing system.

| Threat | Attack Surface | Impact | Mitigation | Priority |
|---|---|---|---|---|
| Unauthorized admin access | `POST /auth/login` | Full content-management compromise, altered idea-review outcomes | Rate-limit + backoff on login; bcrypt hashing; 12-char minimum password (`ARCHITECTURE.md` §3.6) | Critical |
| Broken authorization / IDOR | Any `/admin/*` route | Non-admin accesses admin-only data by guessing IDs | Authorization checked before resource lookup, in middleware; `403` never `404` on role mismatch | Critical |
| SQL injection | Any user-input endpoint | Data exfiltration/corruption | Parameterized queries only, enforced at the Repository layer — no string-concatenated SQL, including admin routes | Critical |
| Malicious file upload | Signed-upload flow (§6.4) | Stored XSS via mistyped content-type, malware distribution | Server-declared MIME allowlist before signed-URL issuance; storage serves non-image types with forced `Content-Disposition` | High |
| Stored XSS via submitted content | Idea/Enquiry/Project free-text fields, rendered later in admin panel and (Projects) publicly | Script execution in admin's/visitor's browser | Output-encode all user-submitted text at render time; never `dangerouslySetInnerHTML` on user content | High |
| CSRF | Admin panel (cookie-based auth) | Logged-in admin tricked into a state-changing request | `SameSite=Lax` mitigates the common case; CSRF token on state-changing admin requests as defense-in-depth | Medium |
| Abuse of public submission endpoints | `POST /ideas`, `/enquiries`, `/opportunities/:id/apply` | Review queue flooded, notification/storage cost | Per-IP rate limiting; `Idempotency-Key` reduces accidental duplicates; CAPTCHA deferred to Post-MVP pending real spam evidence (OD-9) | Medium |
| Rate-limit bypass via IP rotation | Any rate-limited endpoint | Reduces mitigation effectiveness | Accepted residual risk for V1 — defeating distributed abuse needs infrastructure disproportionate to this project's threat profile; revisit if observed | Low |
| Sensitive data exposure | Public GET responses accidentally including `contact_email`/`applicant_email` | Harvestable contact list for spam/phishing | DTOs explicitly allow-listed per endpoint at the Service layer — never a serialized `SELECT *`; public DTOs never include contact fields | High |
| Credential/secret leakage | Source control, logs, error responses | Full backend compromise | Env-var-only secrets (§6.9), never committed; `500` responses never include stack traces or raw exception text | Critical |
| Unsafe external URLs (SSRF) | `ideas.document_url`/`demo_url` | Attacker-controlled URL targets internal infra if ever fetched server-side | **Rule, not just a mitigation:** these are stored and rendered only as `<a href>` links for a human admin — never fetched server-side, ever | High (as a design rule) |
| Dependency vulnerabilities | npm packages | Supply-chain compromise | `npm audit`-equivalent in CI, blocking merge | Medium |
| Excessive error disclosure | Any `500` | Internal detail leaks, aids further attack | Generic client-facing body; full detail server-side only, keyed by `request_id` | High |
| YouTube API key exposure | Admin-time metadata fetch | Key theft, quota abuse | Server-side only, never sent to frontend (playback needs no key) | Medium |

**Distinguishing design consideration from confirmed vulnerability:** every row above is a *design consideration* — a property the eventual implementation must have. None describes a vulnerability in an existing system, because no system exists yet. This table is the acceptance criteria a security review should check the implementation against, not an incident report.

## 6.2 Validation

```text
HTTP request
  → Transport validation (schema: types, required fields, string lengths, enum membership — API layer, cheapest, no I/O)
  → Business validation (state-machine legality, uniqueness, cross-entity rules — Service layer, e.g., is this idea-status transition legal, is this opportunity open)
  → Database constraints (NOT NULL, FK, UNIQUE, CHECK — last line of defense, catches anything the application layer missed or a concurrent write introduced)
```

Each layer catches a different failure class: transport validation rejects malformed input before touching the database; business validation rejects well-formed-but-illegal requests the schema can't express; database constraints catch what a concurrent write slipped past the application layer (this is exactly what the optimistic-lock/row-lock mechanisms in `ARCHITECTURE.md` §3.8 rely on as a backstop).

## 6.3 Error Handling

Response format (also specified in `API.md`): `{ error: { code, message, request_id } }`.

| Category | HTTP status | `code` |
|---|---|---|
| Validation error | 400 | `validation_error` |
| Authentication error | 401 | `unauthenticated` |
| Authorization error | 403 | `forbidden` |
| Not found | 404 | `not_found` |
| Conflict (illegal transition, stale lock, closed resource) | 409 | `conflict` |
| Business-rule failure on well-formed input | 422 | `unprocessable` |
| Rate limited | 429 | `rate_limited` |
| External dependency failure | 502 | `upstream_error` |
| Internal/unexpected | 500 | `internal_error` |

`message` is always safe for client display — no stack traces, no raw SQL, no internal file paths, ever, at any status code. `request_id` ties a user-visible error to the corresponding server log entry (§6.5) so a support conversation can go straight to root cause instead of starting from "what were you doing when it broke."

## 6.4 File / Media Security

Covers: Project screenshots, Course thumbnails, People photos, Idea Submission documents.

```mermaid
sequenceDiagram
    participant C as Admin/Client
    participant API as Backend
    participant S3 as Object Storage

    C->>API: POST .../media {filename, mime_type, size}
    API->>API: validate mime_type allowlist, size limit
    API->>S3: generate signed PUT URL (short TTL)
    API-->>C: { upload_url, object_key }
    C->>S3: PUT file bytes directly
    S3-->>C: 200
    C->>API: POST .../media/confirm {object_key}
    API->>API: HEAD object to verify it exists
    API->>API: persist media row (media_url from object_key)
```

**File size:** e.g., 5MB images, 10MB documents — enforced backend-side (reject request) and bucket-side (reject upload) since the client's declared size can be lied about; the bucket policy is the real enforcement.

**MIME validation:** allowlist only — `image/jpeg`, `image/png`, `image/webp` for thumbnails/screenshots/photos; additionally `application/pdf` for idea documents. No other types in V1.

**File type:** the backend generates the storage `object_key` (UUID-based path) — the client's original filename is never used as the storage path, preventing path traversal and avoiding storing potentially sensitive original filenames.

**Access control / public vs. private objects:**

| Content | Visibility | Mechanism |
|---|---|---|
| Project screenshots, Course thumbnails, People photos | Public-read | Direct bucket/CDN URL |
| Idea Submission documents | Private | Signed *read* URL, generated on-demand only for an authenticated admin viewing the idea — never a public URL, since these may contain unpublished business ideas the submitter never intended to expose publicly |

**Signed URLs:** short TTL (e.g., 5 minutes) on upload URLs; read URLs for private objects generated per-view, not cached long-term.

**Orphan cleanup:** **Gap, explicitly flagged rather than silently ignored** — an upload request that never completes (or fails the confirm step) can leave an unreferenced object in storage. Accepted as a low-cost gap for V1 (storage cost, not a security issue); Recommended Post-MVP: a periodic job comparing bucket contents against database references and removing unreferenced objects older than 24 hours.

**Not built for V1:** malware/virus scanning (bounded risk given admin-only or admin-reviewed upload paths), image resizing/processing (premature against hypothetical file sizes).

## 6.5 Observability

- **Structured logging:** JSON, one line per event, to stdout. Every request gets a `request_id` (assigned at the API layer, `ARCHITECTURE.md` §3.4), attached to every log line for that request and returned in error responses. PII (`contact_email`, `contact_phone`, `applicant_email`) never logged at info level.
- **Error tracking:** `500`/`502`-level errors reported to an error-tracking service with `request_id`, stack trace, route, and actor role if authenticated — this is where the detail omitted from client responses (§6.3) actually lives.
- **Health checks:** `GET /health` (liveness — process responding) and `GET /ready` (readiness — database connection acquirable), kept separate since an instance can be alive but unable to serve requests, and an orchestrator needs to know which is true to make the right routing/restart decision.
- **Metrics:** request rate/error rate by route and status code; latency (p50/p95/p99); public submission volume (both a product signal and, per §6.1, the first sign of a spam spike).
- **Database monitoring:** slow-query logging (threshold ~500ms) from launch — the fastest way to catch a missing-index regression before it's a page-load complaint.
- **External-service monitoring:** YouTube Data API failures logged with enough context to distinguish "YouTube is down" (operational alert) from "this specific ID is invalid" (expected user/admin error, no alert); password-reset email failures alerted on (a broken reset flow silently locks admins out), notification email failures logged but not alerted (non-critical, `ARCHITECTURE.md` AD-8).
- **Deliberately not built:** distributed tracing (single backend service, nothing to trace across — `ARCHITECTURE.md` §3.2), background-job monitoring (no job queue exists).

## 6.6 Testing

Organized by the layers in `ARCHITECTURE.md` §3.2–3.3, since that layering is what makes most of this testable without a live database.

**Unit (Service layer, mocked repository):** highest-value tests in the suite. Priority: every legal/illegal edge in the idea-status state machine; idea transition with a stale `version` rejected; opportunity application to a closed/nonexistent opportunity rejected; course write with `content_source=native` rejected; growth-level change with missing `reason` rejected.

**Integration (real test database):** idea status transition's two-write transaction rolls back fully on simulated mid-transaction failure (no orphaned history row); opportunity apply-vs-close race — concurrent requests resolve to exactly one consistent outcome; cascade behavior (`DATABASE.md`) — deleting a project removes its media, deleting a user with a linked profile sets `user_id` null rather than deleting the profile; unique constraints (duplicate email, duplicate category slug) rejected.

**API (full HTTP stack, test database):** every `/admin/*` route rejects unauthenticated (`401`) and non-admin (`403`) requests — run as one parameterized test across every admin route, not written per-route, so a newly added route can't ship without the check; every public submission endpoint's required-field validation; `Idempotency-Key` replay behavior; pagination bounds clamped not rejected; every error response includes `code`, `message`, `request_id`.

**End-to-End (critical journeys):** Innovator flow — submit → appears in admin queue → admin transitions status → reflected; Student flow — browse Learning by category → open course → YouTube embed renders; Business/Creator flow — submit enquiry → appears in admin list with correct `type`.

**Priority order if time-constrained:** Unit → Integration → API → E2E. The unit tests on the idea state machine and the opportunity-application race condition catch the two highest-consequence bugs in the system (an unaudited status change, a double-booked opportunity) for the least effort — write those before exhaustive CRUD coverage on comparatively low-risk entities like Courses/Projects/People, where a bad write is caught by an admin looking at the result rather than a silent data-integrity failure.

**Out of scope for V1 automated testing:** load/performance testing (no traffic baseline exists to test against yet), visual regression, YouTube API contract testing beyond mocking.

## 6.7 Performance & Scalability

- **Pagination:** every list endpoint paginated, server-capped at 100 (`API.md`).
- **Indexing:** reasoned against actual query patterns, not guessed (`DATABASE.md` Indexing Strategy).
- **Connection pooling:** recommended once more than one backend instance runs concurrently — not needed at single-instance launch scale, but the design doesn't preclude it.
- **Caching:** YouTube metadata cached at admin-write time rather than fetched per page view (`ARCHITECTURE.md` §3.9) — the platform's one clear caching win, and it's already load-bearing for the "no redesign" content-source constraint, not an afterthought.
- **CDN / object storage:** public media served directly from storage/CDN, never proxied through the backend.
- **Rate limiting:** narrow — public writes and login only (§6.1), not applied globally to read traffic.
- **External API caching:** covered above (YouTube).
- **Background processing:** deliberately absent (`ARCHITECTURE.md` §3.3, AD-8) — no queue, no Redis, no Kafka. Justified, not just asserted: the only candidate async operation (notification email) is low-volume and non-critical.
- **Horizontal scaling:** the backend is stateless by design (sessions in the database, not in-process memory) specifically so more than one instance can run behind a load balancer without sticky sessions — not needed at launch traffic, but not precluded either.

**Explicitly not introduced, and why:** microservices (one backend service is sufficient — nothing in the domain justifies splitting it), Kubernetes (deployment topology in §6.8 is orchestrator-agnostic; K8s is a valid choice but not a requirement), Redis (no caching need beyond what's already solved by the YouTube-metadata-cache-in-Postgres approach), Kafka/event-driven architecture (write volume and workflow complexity don't warrant it — an audit-history table, not event sourcing, satisfies the accountability requirement).

## 6.8 Deployment

Provider-neutral — hosting provider is an Open Decision (OD-6).

```mermaid
flowchart TD
    subgraph Edge
        CDN[CDN / frontend hosting]
        LB[Load balancer / HTTPS termination]
    end
    subgraph Compute
        BE1[Backend instance]
        BE2[Backend instance - horizontally scaled]
    end
    subgraph Data
        PG[(PostgreSQL - managed)]
        S3[(Object storage)]
    end

    CDN --> BE1
    LB --> BE1
    LB --> BE2
    BE1 --> PG
    BE2 --> PG
    BE1 --> S3
    BE2 --> S3
```

- **Frontend:** Next.js, static/SSR-hostable on most providers.
- **Backend:** containerized, stateless, entirely environment-variable-configured (§6.9) — the same image is promotable across environments without a rebuild.
- **PostgreSQL:** managed (not self-hosted) — no dedicated infra team to own backup/patching/failover operations.
- **Object storage:** any S3-compatible provider — the signed-URL pattern (§6.4) isn't a lock-in decision.
- **HTTPS:** terminated at the load balancer/edge via the provider's managed certificate.
- **Environment variables / secrets:** injected via the hosting platform's secret manager, never committed, never baked into the image.
- **Database migrations:** versioned, applied as a discrete deploy step before the new version receives traffic. Deploy order: **migrate → deploy → verify readiness → shift traffic.** Additive migrations preferred (nullable column → backfill → tighten) to avoid a rolling-deploy window of schema/code incompatibility.
- **Backups:** daily automated, managed-provider feature; retention period unresolved (Open Decision OD-10).
- **CI/CD:** `lint → unit tests → integration tests → build container → (staging deploy → smoke test) → production deploy` — each step gates the next; dependency vulnerability scan (§6.1) runs here, not as a separate manual process.
- **Rollback:** application code rolls back via redeploying the previous image (fast if images are retained). Database migrations are written forward-only once real production data exists — a bad migration is corrected with a new migration, not reverse-migrated, except pre-launch when no data exists to protect.

## 6.9 Configuration

| Variable | Purpose | Required | Sensitive | Example | Consumer |
|---|---|---|---|---|---|
| `NODE_ENV` | Runtime mode | Yes | No | `production` | Backend |
| `PORT` | Listen port | Yes | No | `4000` | Backend |
| `DATABASE_URL` | Postgres connection | Yes | **Yes** | `postgresql://user:YOUR_SECRET_HERE@host:5432/risingnation` | Backend |
| `SESSION_SECRET` | Signs session cookies | Yes | **Yes** | `YOUR_SECRET_HERE` | Backend |
| `FRONTEND_URL` / `CORS_ORIGIN` | Allowed origin, reset-link generation | Yes | No | `https://risingnation.org` | Backend |
| `S3_ENDPOINT` / `S3_BUCKET` | Object storage location | Yes | No | `risingnation-media` | Backend |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Object storage credentials | Yes | **Yes** | `YOUR_SECRET_HERE` | Backend |
| `YOUTUBE_API_KEY` | Admin-time course validation | Yes | **Yes** | `YOUR_SECRET_HERE` | Backend |
| `EMAIL_PROVIDER_API_KEY` | Notifications, password reset | Yes | **Yes** | `YOUR_SECRET_HERE` | Backend |
| `ADMIN_NOTIFICATION_EMAIL` | Notification destination | Yes | No | `team@risingnation.org` | Backend |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | First-admin seed, first-run only | First deploy only | Password: **Yes** | `admin@risingnation.org` | Seed script |
| `RATE_LIMIT_PUBLIC_SUBMISSION_MAX` | Requests/window on public writes | No (sane default) | No | `10` | Backend |
| `RATE_LIMIT_LOGIN_MAX` | Login attempts/window | No (sane default) | No | `5` | Backend |
| `SENTRY_DSN` (or equivalent) | Error-tracker destination | Recommended | **Yes** | `YOUR_SECRET_HERE` | Backend |

No real credential ever appears in this document or anywhere in this documentation set. `ADMIN_BOOTSTRAP_*` should be rotated/removed after first use.

## 6.10 Development Workflow

**Recommended conventions** — none of this exists yet; stated as the intended process, not a description of an existing repo.

- **Branching:** trunk-based with short-lived feature branches, one branch per requirement/REQ-ID or fix.
- **Pull requests:** required for every change to `main`; PR description references the REQ-ID or Open Decision it addresses where applicable, so `git blame` and the traceability matrix (`API.md`) stay connected over time.
- **Code review:** at least one approval required, with particular scrutiny on any change touching a `/admin/*` route (authorization) or a transaction boundary (§ Data Integrity, `DATABASE.md`) — these are the two places `ARCHITECTURE.md` §3.11 identifies as highest-risk.
- **Testing expectations:** a PR introducing a new Service-layer method includes its unit tests in the same PR, not a follow-up (§6.6 priority order).
- **Migration review:** any migration is reviewed by someone other than its author, specifically checking `ON DELETE` behavior and nullability against `DATABASE.md`'s stated design — a silent deviation here is the kind of thing code review exists to catch.
- **API changes:** a change to a response DTO shape or a new endpoint is reflected in `API.md` in the same PR — this document set is meant to stay authoritative, not become stale documentation of a v1 design nobody updates.
- **Documentation updates:** any change to a business rule (e.g., the idea-status state machine) updates the corresponding section of `ARCHITECTURE.md`/`DATABASE.md` in the same PR.

## 6.11 Implementation Roadmap

### Phase 0 — MVP-blocking decisions
The subset of §6.13's register that changes MVP schema/API shape: **OD-1** (admin-only auth, default yes), **OD-3** (exact idea-status values), **OD-11** (individually-attributable admin accounts vs. shared login, default: individual).

### MVP
- **Backend work:** all four layers (`ARCHITECTURE.md` §3.3) for Learning, Idea Pipeline, Showcase (Projects/People), Service Intake domains.
- **Database work:** full schema for `users, people_profiles, courses, categories, projects, project_media, project_members, ideas, ideas_status_history, enquiries` (`DATABASE.md`); indexes for these tables.
- **API work:** all MVP-entity routes in `API.md`, admin auth routes.
- **Frontend dependencies:** Home, About, Learning browsing, Business/Creator pages + forms, Projects/People showcase, Idea submission form, admin panel shell + CRUD screens for MVP entities.
- **Testing:** unit tests on the idea state machine before anything else; parameterized admin-route auth test; E2E on Innovator and Business/Creator flows.
- **Security:** rate limiting on the two public write endpoints that exist at this stage (Ideas, Enquiries); full admin auth per `ARCHITECTURE.md` §3.6.
- **Exit criteria:** every Home requirement renders from real admin-entered data; an idea can be submitted and moved through every confirmed state with a visible audit trail; every `/admin/*` route rejects unauthenticated/non-admin requests; backups running.

### Post-MVP
- **Backend/DB/API work:** `opportunities`, `applications`, `growth_level_history` tables and routes; apply-vs-close race-condition handling; `events`/`announcements` schema revised per OD-7's resolution; member-account auth flow if OD-1 resolves to "yes."
- **Frontend dependencies:** Opportunities listing + application UI, growth-ladder admin UI, Events/Announcements pages (shape pending OD-7).
- **Testing:** integration test for the opportunity apply-vs-close race is the highest-priority new test.
- **Security:** duplicate-application policy per OD-4; CAPTCHA per OD-9 if warranted by observed spam.
- **Exit criteria:** a candidate can apply to an open opportunity and the system correctly rejects applications to a concurrently-closed one under concurrent-request testing.

### Future
- **Backend/DB work:** `native_lessons` table + player integration (Post-MVP's content-source abstraction pays off here — this is its concrete test, `ARCHITECTURE.md` AD-3); Credits/Recognition mechanism per OD-8; student portfolio pages per OD-1.
- **Exit criteria:** a native course can be added and played without any change to Learning's category/browsing/admin-list code.

## 6.12 Engineering Risks

### Critical
- Idea status change with no corresponding audit-history row, if the transaction boundary is implemented incorrectly — breaks the accountability REQ-IDEA-006 implies. *Mitigation:* integration test explicitly simulating mid-transaction failure (§6.6). *Owner:* backend lead, pre-launch.
- Admin authorization implemented per-handler instead of shared middleware — one forgotten check is a full content-management compromise. *Mitigation:* parameterized cross-route auth test (§6.6); code-review checklist item (§6.10). *Owner:* backend lead.

### High
- Opportunity application race condition implemented as read-then-write instead of a locked transaction — allows a late application to beat a concurrent close. *Mitigation:* integration test for concurrent apply-vs-close (§6.6). *Likelihood:* moderate if not explicitly tested — this class of bug is easy to miss without a targeted test. *Owner:* backend lead.
- Idea-status/growth-level audit trails rendered meaningless by a shared/unattributed admin login. *Mitigation:* resolve OD-11 before building admin account creation. *Owner:* client decision, blocks Phase 0.

### Medium
- Course write accepting an unvalidated YouTube ID — produces a broken embed for every visitor who opens that course. *Mitigation:* fail loudly (`502`) on Data-API validation failure at write time, never save unvalidated data (`ARCHITECTURE.md` §3.7). *Owner:* backend lead.
- Member accounts (OD-1) built prematurely without client confirmation — largest unrequested scope item, real risk of wasted engineering effort. *Mitigation:* Phase 0 gate; don't start Post-MVP member-account work without explicit sign-off. *Owner:* client decision.
- Hosting/provider decision (OD-6) deferred too long, blocking real deployment testing before launch. *Mitigation:* resolve before MVP's final weeks, not at the end. *Owner:* client decision.

### Low
- Rate-limit bypass via IP rotation. *Mitigation:* accepted residual risk for V1; revisit if abuse is actually observed. *Owner:* backend lead, post-launch monitoring.

## 6.13 Open Decisions

| Decision | Why it matters | Options | Recommended Default | Blocks |
|---|---|---|---|---|
| OD-1: Do students/creators/innovators need accounts? | Determines `submitted_by`/`applicant_id` usage, portfolio feature buildability, registration/reset engineering scope | (a) Admin-only V1 (b) Build member accounts into V1 | (a) — every MVP feature works without it | Post-MVP start |
| OD-3: Exact `ideas.status` values and legal transitions | Drives the admin review UI and state-machine validation directly | Use the proposed set as-is, or confirm the client's actual review process differs | Proposed set, pending confirmation with the review team | MVP admin idea-review UI |
| OD-4: Block duplicate applications by email? | Affects `applications` insert logic and possible uniqueness constraint | (a) Allow duplicates (b) Block by email (spoofable) (c) Block by `applicant_id` if OD-1 is "yes" | (a) for V1 | Post-MVP opportunity build |
| OD-5: Which static content blocks need CMS editing? | Determines the full `page_key` list for `/admin/content/:page_key` | Enumerate with the client's content team | N/A — needs a working session, not an engineering default | MVP admin CMS build |
| OD-6: Hosting provider | Determines the concrete mapping onto §6.8's topology | Any provider satisfying the topology | No default — genuinely open | Any deployment work |
| OD-7: Do Events/Announcements need public pages, and what fields? | Current schema is placeholder-minimal, no field list in the spec beyond the admin CRUD mention | Confirm actual purpose (internal calendar? public updates?) | Ship placeholder schema, admin-only, until confirmed | Post-MVP |
| OD-8: What does "Credits/Recognition" consist of? | Determines whether a points/credit ledger is needed at all | No default proposed — spec states the outcome, not the mechanism | N/A | Future phase |
| OD-9: Is CAPTCHA needed on public forms? | Friction vs. spam protection | (a) Not built for V1, rate-limiting only (b) Build proactively | (a) — no evidence of spam as a known concern | Anytime, data-driven |
| OD-10: Data retention policy (idea documents, backups, member PII if applicable) | Affects backup config and storage lifecycle; potential compliance obligation | No default — policy decision, not engineering | N/A | Backup configuration |
| OD-11: Individually-attributable admin accounts, or one shared login? | The audit-trail design (`DATABASE.md` `ideas_status_history`/`growth_level_history`) is only meaningful with real per-actor attribution | (a) Individual accounts (b) Shared account | (a) — the audit design already assumes it | MVP admin account creation, Phase 0 |

Grouping by blast radius: OD-1, OD-3, OD-11 block MVP schema/API shape (Phase 0, §6.11); OD-4, OD-5, OD-9 block MVP/Post-MVP UI work but not the initial schema; OD-6, OD-10 are infrastructure decisions needed before real deployment; OD-7, OD-8 are scoped entirely to Post-MVP/Future and don't block MVP at all. This is why MVP is buildable now despite eleven open questions — none of MVP's actual deliverables depend on the ones deferred to later phases.
