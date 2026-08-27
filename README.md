# Rising Nation — Platform Documentation

> Status: **Pre-build / Planning phase.** No codebase exists yet. These documents translate the client requirements (`RN-START-UPDATED.pdf`) into an engineering plan: data model, API surface, architecture, and build sequence. Nothing here should be read as "already implemented" — see the labeling convention below.

## What Rising Nation is

Rising Nation is a technology/innovation organization platform combining four things in one system:

- **Student Innovation Hub** — free curated learning (YouTube-sourced now, swappable for native courses later) + real project contribution + a progression ladder (Learner → Contributor → Intern → Builder → Lead).
- **Idea Submission pipeline** — public idea intake → internal review/evaluation → recognition/credits → possible development. No funding or build is promised at submission.
- **Business Solutions** — a service-enquiry funnel (web/software/AI/automation/branding/marketing/etc.) for paying clients.
- **Creator Support** — a service-enquiry funnel for content creators (editing, strategy, growth, account management).

All four funnels feed a shared **Projects** and **People/Network** showcase, and are governed by a single **Admin/CMS** layer so non-engineers can manage content without redeploys.

## Labeling convention used across these documents

Every claim in this documentation set is tagged one of three ways:

| Tag | Meaning |
|---|---|
| **Confirmed (spec)** | Stated explicitly in `RN-START-UPDATED.pdf`. Not open to interpretation. |
| **Inferred** | Not explicitly stated, but a reasonable/necessary consequence of what *is* stated (e.g., "idea status must be updatable by admin" implies an `ideas.status` field and an admin write path). |
| **Recommended** | An engineering proposal to make the above buildable. Not requested by the client, not binding — flag for confirmation before building. |

Nothing below claims to describe existing code, because none exists yet.

## Documentation Index

| File | Purpose |
|---|---|
| [`REQUIREMENTS.md`](./REQUIREMENTS.md) | Structured, traceable breakdown of every section in the client PDF. Source of truth for scope. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Proposed system architecture, tech stack, request lifecycle, and the content-source abstraction that lets courses move from YouTube to native later without a rebuild. |
| [`DATABASE.md`](./DATABASE.md) | Proposed entities, fields, relationships, and ER diagram covering courses, ideas, projects, people, opportunities, and enquiries. |
| [`API.md`](./API.md) | Proposed REST endpoint surface: public read endpoints, submission/enquiry endpoints, and admin CRUD endpoints. |
| [`USER_FLOWS.md`](./USER_FLOWS.md) | The five core user journeys (Visitor, Student, Business, Creator, Innovator) as sequence/flow diagrams, traced to the screens and endpoints that implement them. |
| [`ROADMAP.md`](./ROADMAP.md) | Phased build plan (MVP → V2 → V3), with what's deferred and why. |

## How to use this set

1. **`REQUIREMENTS.md` is the contract.** If a later document disagrees with it, the requirements doc wins — flag the conflict, don't silently resolve it.
2. **`ARCHITECTURE.md` and `DATABASE.md` are the proposal to build against.** They need sign-off before implementation starts, since they contain judgment calls the PDF doesn't make (e.g., relational vs. document DB, auth provider, hosting).
3. Once a codebase exists, this set should be replaced by the "as-built" version of the same document types (`BACKEND.md`, `SECURITY.md`, `TESTING.md`, `DEPLOYMENT.md`, etc.), generated from the actual code — not from these planning docs.

## Explicitly out of scope for this document set

Because there is no code, backend, or infrastructure yet, the following documents from a typical audit are **not produced** here and should be generated post-implementation instead: `AUTHENTICATION.md` (mechanism TBD), `SECURITY.md` (nothing to audit), `ERROR_HANDLING.md`, `TESTING.md`, `DEPLOYMENT.md`, `OBSERVABILITY.md`, `SCALABILITY.md`. Where these topics require an upfront decision to make the system buildable at all (e.g., "will there be authentication and roles" — yes, the spec requires admin-only actions and a growth ladder), that decision is captured briefly in `ARCHITECTURE.md` and flagged as **Recommended**.
