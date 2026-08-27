# Build Progress — Rising Nation

- [x] scaffold
- [x] schema/migrations
- [x] auth
- [x] idea pipeline
- [x] learning/courses
- [x] showcase (projects/people, growth ladder)
- [ ] opportunities — **Post-MVP scope** (ENGINEERING.md §6.11), not part of this MVP backend build; not a gap in what was delivered
- [x] enquiries
- [x] media upload (signed-upload flow: project screenshots, people photos)
- [x] observability (structured logging + request_id propagation, health/readiness checks, security hardening pass)
- [x] deployment config (Dockerfile, fail-fast env validation, CI pipeline — ENGINEERING.md §6.8/§6.9)
- [ ] frontend pages — **out of scope for this deliverable**, not merely unstarted. This build is backend-only; see `DECISIONS_LOG.md` → "Delivery Scope: Backend-Only" for why, and what a separate frontend effort needs from this repo

All backend MVP work (per `ENGINEERING.md` §6.11's MVP scope: auth, Idea Pipeline, Learning, Showcase, Service Intake, plus schema/migrations, observability, and deployment config) is complete and checked above.

See `HANDOFF.md` for the full handoff summary (what's built, how to run/build/test, deferred items to resolve before production traffic).

See `DECISIONS_LOG.md` → "Deferred Hardening Items (Slice 7 audit)" for known, deliberately-unfixed gaps (CSRF defense-in-depth, Idempotency-Key, pending dependency vulnerabilities).

See `DEPLOY.md` for the deployment/CI slice: stateless Dockerfile (manually verified end-to-end — build, run, health/readiness, both failure modes — against a real Docker daemon), `src/config/index.ts` now fails fast at startup on any missing §6.9 "Required: Yes" variable (previously silently defaulted), GitHub Actions pipeline implementing §6.8's `lint → dependency-audit → test → migration-deploy-check → build → staging-deploy → smoke-test → production-deploy` sequence. The CI `dependency-audit` job allowlists the same known, already-documented advisories `DECISIONS_LOG.md` records (so the gate stays green for accepted risk but still fails on anything new — see `DEPLOY.md` → "Audit gate policy"); `staging-deploy`/`production-deploy`'s "push image to host" step remains a placeholder pending OD-6 (hosting provider, still undecided).
