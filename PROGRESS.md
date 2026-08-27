# Build Progress — Rising Nation

- [x] scaffold
- [x] schema/migrations
- [x] auth
- [x] idea pipeline
- [x] learning/courses
- [x] showcase (projects/people, growth ladder)
- [ ] opportunities
- [x] enquiries
- [x] media upload (signed-upload flow: project screenshots, people photos)
- [x] observability (structured logging + request_id propagation, health/readiness checks, security hardening pass)
- [x] deployment config (Dockerfile, fail-fast env validation, CI pipeline — ENGINEERING.md §6.8/§6.9)
- [ ] frontend pages

See `DECISIONS_LOG.md` → "Deferred Hardening Items (Slice 7 audit)" for known, deliberately-unfixed gaps (CSRF defense-in-depth, Idempotency-Key, pending dependency vulnerabilities).

See `DEPLOY.md` for the deployment/CI slice: stateless Dockerfile, `src/config/index.ts` now fails fast at startup on any missing §6.9 "Required: Yes" variable (previously silently defaulted), GitHub Actions pipeline implementing §6.8's `lint → dependency-audit → test → migration-deploy-check → build → staging-deploy → smoke-test → production-deploy` sequence. Two things flagged there rather than silently glossed over: the CI `dependency-audit` job will currently fail on `main` (the same pending vulnerabilities `DECISIONS_LOG.md` already documents, now actually gated in CI for the first time); and `staging-deploy`/`production-deploy`'s "push image to host" step is a placeholder pending OD-6 (hosting provider, still undecided).
