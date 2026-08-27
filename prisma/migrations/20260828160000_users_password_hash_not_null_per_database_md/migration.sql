-- Tighten users.password_hash to NOT NULL, matching DATABASE.md's Entity
-- Specification for `users` (`password_hash | string | No | — | bcrypt;
-- never logged`). Handoff audit (DECISIONS_LOG.md) confirmed no code path
-- in src/ or scripts/ ever creates a `users` row without setting
-- password_hash -- the column was simply looser than it needed to be, not
-- protecting any real passwordless-user flow. No backfill needed: any
-- existing NULL row here would itself be a data-integrity bug, not a
-- legitimate state to preserve, so this intentionally fails loudly instead
-- of silently working around one.
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;
