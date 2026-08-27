# API — Rising Nation (Proposed)

> All endpoints below are **Recommended** — a proposal to satisfy `REQUIREMENTS.md`, designed against the schema in `DATABASE.md`. No backend exists yet; nothing here is implemented. Base path assumed: `/api`.

## Conventions

- Public GET endpoints: no auth, paginated (`?page=&limit=`), return only `published`/`open` records.
- Public POST endpoints (submissions): no auth required, server-side validated, rate-limited (see `ARCHITECTURE.md` §7).
- `/admin/*` endpoints: require `role = admin`, return 401/403 per standard convention below.
- Response envelope: `{ data, meta }` for lists, `{ data }` for single resources, `{ error: { code, message } }` for failures.

## 1. Learning (Section 3.1)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/courses` | List courses; filter by `?category=`, `?level=` | public |
| GET | `/courses/:id` | Single course detail (for embed/redirect) | public |
| GET | `/categories?type=learning` | List learning categories | public |
| POST | `/admin/courses` | Create course | admin |
| PATCH | `/admin/courses/:id` | Edit course (incl. `content_source`/`content_ref`) | admin |
| DELETE | `/admin/courses/:id` | Remove course | admin |

**Note:** `POST/PATCH /admin/courses` is where the content-source abstraction (`ARCHITECTURE.md` §4) surfaces in the API — the same endpoint accepts either a YouTube ref or a native ref via `content_source`, so adding native courses later requires no new endpoint.

## 2. Idea Submission (Section 4)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/ideas` | Submit an idea (fields per `REQUIREMENTS.md` §4) | public |
| GET | `/admin/ideas?status=` | List ideas for review, filterable by status | admin |
| GET | `/admin/ideas/:id` | Full idea detail for review | admin |
| PATCH | `/admin/ideas/:id` | Update status / add admin notes / mark credited | admin |

**Request body — `POST /ideas`:**
```json
{
  "title": "string, required",
  "problem": "string, required",
  "proposed_solution": "string, required",
  "target_users": "string, required",
  "why_it_matters": "string, required",
  "current_stage": "string, required",
  "skills_team_required": "string, optional",
  "document_url": "string, optional",
  "demo_url": "string, optional",
  "contact_email": "string, required",
  "contact_phone": "string, optional"
}
```
On success: `201`, body confirms receipt **without** promising development or funding — response copy is a product/legal concern flagged from `REQUIREMENTS.md` §4's explicit constraint, not just an engineering one.

## 3. Business Solutions (Section 5)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/categories?type=service&group=business` | List Business Solutions service list for the page | public |
| POST | `/enquiries` | Submit enquiry, `type: "business_solutions"` | public |
| GET | `/admin/enquiries?type=&status=` | List enquiries for review | admin |
| PATCH | `/admin/enquiries/:id` | Update enquiry status | admin |

## 4. Creator Support (Section 6)

Same endpoints as Business Solutions, `type: "creator_support"` — see unified `ENQUIRIES` table rationale in `DATABASE.md` §2.

## 5. Projects (Section 8)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/projects` | List projects; `?featured=true` for Home | public |
| GET | `/projects/:id` | Full project detail incl. media, team | public |
| POST | `/admin/projects` | Create project | admin |
| PATCH | `/admin/projects/:id` | Edit project | admin |
| DELETE | `/admin/projects/:id` | Remove project | admin |
| POST | `/admin/projects/:id/media` | Attach screenshot/media | admin |

## 6. People & Network (Section 9)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/people?group=` | List profiles, filterable by group (founding/core/mentor/etc.) | public |
| GET | `/people/:id` | Single profile | public |
| POST | `/admin/people` | Create profile | admin |
| PATCH | `/admin/people/:id` | Edit profile (incl. `featured`, `growth_level` if linked to a user) | admin |
| DELETE | `/admin/people/:id` | Remove profile | admin |

## 7. Opportunities (Section 10)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/opportunities?type=&open=true` | List open opportunities | public |
| GET | `/opportunities/:id` | Detail | public |
| POST | `/opportunities/:id/apply` | Submit application | public |
| POST | `/admin/opportunities` | Create opportunity | admin |
| PATCH | `/admin/opportunities/:id` | Edit / open / close | admin |
| GET | `/admin/applications?opportunity_id=&status=` | Review applications | admin |
| PATCH | `/admin/applications/:id` | Update application status | admin |

## 8. Admin / Content Management (Section 11)

Events and Announcements follow the same CRUD shape as Projects/People above:

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/announcements` | Public list | public |
| GET | `/events` | Public list | public |
| POST /PATCH /DELETE | `/admin/announcements[/:id]` | Manage announcements | admin |
| POST /PATCH /DELETE | `/admin/events[/:id]` | Manage events | admin |
| PATCH | `/admin/content/:page_key` | Edit static CMS content (Home intro, About page text, etc.) | admin |

`page_key` design (e.g., `home_intro`, `about_vision`) is a **Recommendation**, not a spec requirement — flagged since it's the mechanism for "Website content" editing in Section 11, which the spec doesn't otherwise define.

## 9. Auth

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/auth/login` | Admin (and member, if in scope) login | public |
| POST | `/auth/logout` | Invalidate session/token | authenticated |
| GET | `/auth/me` | Current user + role | authenticated |

## Error responses (proposed convention)

| Status | Meaning |
|---|---|
| 400 | Validation failure (missing required field, malformed input) |
| 401 | No/invalid credentials on an authenticated route |
| 403 | Authenticated but wrong role (e.g., `member` hitting `/admin/*`) |
| 404 | Resource not found |
| 429 | Rate limit hit on a public submission endpoint |
| 500 | Unhandled server error |

## Explicitly not designed here

- Payment endpoints — no commerce requirement (see `REQUIREMENTS.md` open items).
- Native course content endpoints (`native_lessons`) — deferred with the DB table it depends on.
- Real-time/WebSocket endpoints — nothing in the spec implies live updates.
