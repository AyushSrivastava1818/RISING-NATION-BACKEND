# Requirements — Rising Nation Website

Source: `RN-START-UPDATED.pdf` ("Rising Nation Website — Development Requirements"). All items below are **Confirmed (spec)** unless marked otherwise. This document restructures the PDF for traceability; it does not add scope.

## 1. Home

- Rising Nation introduction, vision + mission, short ecosystem explanation.
- Four main sections surfaced: Student Innovation Hub, Business Solutions, Creator Support, Idea → Product.
- Featured projects, featured people/community.
- Primary CTA: Join / Work With Us / Submit an Idea.

**Inferred:** Home is a composed/aggregating view — it needs "featured" flags on Projects and on People profiles so admin can curate what surfaces here, rather than Home querying full lists.

## 2. About Rising Nation

Static/CMS-editable content: Who we are, Why we started, Vision, Mission, What we believe, What we are building, Future direction.

**Inferred:** This is pure content (no relational entities needed) — a single CMS-managed page/document, not a table with rows.

## 3. Student Innovation Hub

Purpose (spec): *"Free learning + real project experience + builder development."*

### 3.1 Learning
- Free courses/resources, arranged by category.
- Each course opens the relevant YouTube playlist/video (embed or external redirect).
- Categories (spec, non-exhaustive — "and other relevant technologies"): Web Development, AI/ML, DevOps, Cybersecurity / Ethical Hacking, Data, Design, Marketing, Business.
- Course card fields (spec): thumbnail, course name, short description, level, YouTube link.
- **Hard constraint (spec):** the system must allow replacing YouTube-sourced courses with Rising Nation's own courses later **without redesigning the system.** This drives the `content_source` abstraction in `ARCHITECTURE.md`.

### 3.2 Build
- Real projects, team participation, contributor opportunities, practical assignments, portfolio building, mentorship, industry exposure.

**Inferred:** "Build" overlaps structurally with the Projects and Opportunities entities (Section 8, Section 10) rather than being a separate content type — a contributor opportunity on a real project *is* an Opportunity record scoped to a Project.

### 3.3 Growth
- Ladder: **Learner → Contributor → Intern → Builder → Lead.**
- Spec: progression depends on *work, consistency, contribution and capability* — not on time-in-program or self-declaration.

**Inferred:** This requires a `growth_level` field on the user/profile plus an auditable way to justify a promotion (admin action, not automatic) — see `DATABASE.md`.

## 4. Idea Submission

Form fields (spec, exact list):
- Idea title
- Problem being solved
- Proposed solution
- Target users
- Why the idea matters
- Current stage
- Skills/team required
- Optional document/demo/link
- Contact details

Pipeline (spec): **Idea → Review → Evaluation → Credits/Recognition → Possible Development.**

Explicit constraints (spec):
- Good ideas get recognition/credits based on quality and contribution.
- Strong ideas *can be considered* for further validation/development.
- **The platform must not promise funding or product development for every submission** — this is a copy/UX constraint (status labels, confirmation messaging) as much as a data one.
- Admin/team must be able to review, shortlist, and update idea status.

## 5. Business Solutions

Services listed (spec): Website development, Software development, AI solutions, Automation, Digital solutions, Branding, Content, Social media, Marketing, Product development, Maintenance/support.
Plus: a project enquiry form.

**Inferred:** Services are a curated list (likely CMS-editable, not user-generated); the enquiry form needs to capture which service(s) the enquiry concerns.

## 6. Creator Support

Services listed (spec): Reels/video editing, Content creation, Content strategy, Branding, Instagram management, Growth support, Account management.
Plus: a creator enquiry form.

## 7. Idea → Product

Process shown (spec): **IDEA → VALIDATE → DESIGN → BUILD → TEST → LAUNCH → GROW.**
Teams referenced (spec): Technology, Product, Design, AI, Marketing, Business support, Industry guidance.
CTA (spec): "Submit Your Idea."

**Inferred:** This section is presentational (explains the process to visitors) — it reuses the Idea Submission entity/flow from Section 4 rather than introducing a new one.

## 8. Projects

Per-project fields (spec, exact list): name, client/category, problem, solution, technologies, team, result, screenshots/media, status.

**Inferred:** "team" implies a relation to People/Network profiles (Section 9), not a free-text field, so a contributor's project history can be shown on their own profile.

## 9. People & Network

Groups (spec): Founding Team, Core Team, Contributors, Builders, Mentors, Industry Professionals, Partners.
Per-profile fields (spec, exact list): Name, Role, Short introduction, Skills/Expertise, LinkedIn.

**Inferred:** "Group" here is best modeled as a category/tag on a single People entity, not seven separate tables — a person can plausibly hold more than one (e.g., a Builder who is also a Mentor).

## 10. Opportunities

Types (spec): Learner, Contributor, Internship, Project opportunities, Mentorship, Industry opportunities, Open positions.
Requirement (spec): an application system.

## 11. Admin / Content Management

Admin must be able to add/edit/remove (spec, exact list): Courses, YouTube links, Thumbnails, Projects, Team members, Opportunities, Ideas, Mentors, Events, Announcements, Website content.

**Hard constraint (spec, restated):** the course/learning system must support YouTube-based free learning now and native Rising Nation courses later, without a rebuild.

**Inferred:** "Events" and "Announcements" are mentioned only here — not defined elsewhere in the spec (no fields given). Treated as **Needs confirmation** in `DATABASE.md`.

## 12. Core User Flow

Four confirmed journeys, reproduced verbatim in structure:

- **Visitor** → Explore Rising Nation → Choose their path
- **Student** → SIH → Free Learning → Projects → Contribution → Portfolio → Opportunities
- **Business** → Solutions → Project enquiry → Discussion → Project
- **Creator** → Creator Support → Enquiry → Service
- **Innovator** → Submit Idea → Review → Credits/Recognition → Validation → Possible Product Development

Full diagrams in `USER_FLOWS.md`.

## Final Requirement (spec, verbatim intent)

The site must read as a professional technology/innovation organization, not a college club or generic agency. Constraints called out explicitly: simple navigation, strong visuals, real projects, real people, clear opportunities, fast performance, **mobile-first**, easy content management, ready to expand as Rising Nation grows.

## Open items — Needs confirmation

These are referenced by the spec but not specified in enough detail to design against without guessing:

1. **Events** and **Announcements** — no fields, no relation to other entities, no public-facing section described (only appear in the Admin list, Section 11).
2. **Authentication scope** — the spec requires admin-gated actions (review ideas, edit content) and implies user-facing accounts (growth ladder, portfolios, "Contributor" status), but never states whether general visitors/students register for accounts or whether only admin/internal staff authenticate.
3. **Payment/commerce** — Business Solutions and Creator Support are enquiry-based (spec), not checkout-based. No pricing, invoicing, or payment requirement is stated — assume none exists until told otherwise.
4. **"Credits/Recognition"** (Section 4) — the mechanism (points? badges? public leaderboard? certificate?) is never defined, only the *outcome* ("good ideas receive recognition/credits").
5. **Multi-language** — not mentioned; assume English-only.
