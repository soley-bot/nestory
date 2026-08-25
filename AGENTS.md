# Repository agent rules

## Production database

- Treat `supabase/migrations` as the forward-only source of truth. Never edit the body or identity of a migration that has reached `main` or a shared environment, except through a reviewed identity-reconciliation manifest that proves byte-equivalent SQL.
- Release production migrations only through `.github/workflows/ci.yml` from the exact merged `main` SHA and the protected `production-database` environment.
- Never use connector `apply_migration` against the linked production project. Do not run `supabase db push` to production from a developer checkout.
- Never reset, reseed, restore, repair migration history, or run destructive DDL against a hosted project without explicit approval and a reviewed recovery plan.
- Keep one serialized production database writer. A pull request may run local database checks, but it must not write to the production database.
- A production release must pass hosted preflight before writing and hosted postflight, linked lint, and a final dry-run afterward. Unknown remote versions, names, or statement payloads fail closed. A pre-guardrail content divergence is allowed only when an immutable reconciliation manifest pins both the Git SQL hash and hosted ledger hash without claiming SQL identity.
- Keep credentials in the protected GitHub environment. Never print, commit, copy into documentation, or expose database credentials or tokens.

See `docs/runbooks/production-database-release.md` for the operator and recovery workflow.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
