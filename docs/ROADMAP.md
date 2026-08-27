# Roadmap — Rising Nation (Proposed)

> Entirely **Recommended** — a sequencing proposal, not a client-approved plan. Goal: reach a professional-feeling, mobile-first launch (per `REQUIREMENTS.md` Final Requirement) without building the parts of the spec that are underspecified (Events, Announcements, Credits mechanism, native courses) before they're confirmed.

## Phase 0 — Decisions blocking any build

Must be resolved before writing schema/API code, since they change the shape of `DATABASE.md`/`API.md`:

1. Does the platform need user accounts for students/creators, or is admin the only authenticated role for V1? (`REQUIREMENTS.md` open item #2)
2. What are the exact `ideas.status` values the admin team wants in their review UI? (`DATABASE.md` §2)
3. Are Events and Announcements public-facing pages, or internal-only admin notes? (`REQUIREMENTS.md` open item #1)
4. What does "Credits/Recognition" actually look like — visible score, badge, certificate, nothing user-facing at all? (`REQUIREMENTS.md` open item #4)

## Phase 1 — MVP (public site + admin core)

Ships the parts of the spec with zero open questions:

- Home, About (static/CMS content)
- Student Innovation Hub → Learning only, YouTube-sourced (content-source abstraction built in from day one per `ARCHITECTURE.md` §4, even though only `youtube` is used at launch)
- Business Solutions page + enquiry form
- Creator Support page + enquiry form
- Projects showcase (admin-entered)
- People & Network directory
- Idea Submission form + admin review queue (using whatever `status` values Phase 0 resolves)
- Admin panel: CRUD for Courses, Projects, People, Ideas
- Auth: admin role only

**Explicitly deferred out of MVP:** Opportunities + application system, growth ladder automation, Events, Announcements, native course hosting, member accounts.

## Phase 2 — Engagement layer

- Opportunities listing + application system (Section 10)
- Growth ladder (`growth_level`) surfaced on profiles, admin-editable
- "Build" section of Student Hub connecting Opportunities to Projects (`related_project_id`)
- Member accounts, if Phase 0 decision #1 calls for them
- Events + Announcements, per whatever shape Phase 0 decision #3 confirms

## Phase 3 — Scale / native content

- Native course hosting (`native_lessons` table + player), enabled by the content-source abstraction without touching Phase 1's course browsing UI
- Credits/Recognition mechanism, per Phase 0 decision #4
- Portfolio pages for students (public or gated, per Phase 0 decision #1)

## Why this order

Phase 1 alone already satisfies the spec's Final Requirement ("professional... real projects, real people, clear... fast, mobile-first, easy content management") — everything in Phase 2/3 is depth, not launch-readiness. Sequencing this way means Phase 0's unresolved questions block only the *second* phase, not the first.
