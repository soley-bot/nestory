# Nestory Project Rules

Nestory is an operating system for property history, maintenance, leasing,
documents, reporting, and finance. It is no longer a tiny starter build. Treat
the current app as a real multi-module product with an existing data model,
server mutation boundaries, role-aware workspace routing, and production-style
verification.

## Source Of Truth

- The codebase is the source of truth. Inspect routes, feature modules,
  Supabase migrations, actions, and tests before changing product direction.
- Read only the current docs that fit the task:
  - `docs/current-state.md` for what exists now.
  - `docs/engineering-rules.md` for implementation rules.
  - `docs/verification.md` for checks and handoff.
- Do not revive deleted planning docs, broad prompt files, or old starter-build
  language.
- Keep future docs compact and current. If a doc starts becoming a roadmap
  archive, split or delete it.

## Product Shape

- The primary product promise is a reliable operating record for every property
  and unit: rent, lease, ledger, documents, maintenance, activity, and history.
- Dashboard pages should answer what needs attention and link into records.
- Operational pages should optimize for repeated work: dense tables, filters,
  inspectors, drawers, linked records, and clear status.
- Detail pages should show the full operating record without hiding important
  financial, lease, maintenance, document, or timeline context.
- Placeholder routes are allowed only when navigation needs a destination. Do
  not treat placeholders as complete modules.

## Current Access Model

- Workspace roles are `admin`, `manager`, and `member`.
- Admins can access the full shell and admin-only modules.
- Managers and members have restricted operational access through the shell.
- Workspace context is resolved from the signed-in user and, when configured,
  an organization subdomain.
- Unlinked users go to setup or no-access flows. Do not bypass these redirects.

## Data And Write Rules

- Every business record must remain organization-scoped.
- Important mutations belong in server actions backed by Supabase RPCs when
  they affect history, money, documents, archive/restore, linked records,
  assignments, or activity logs.
- Do not replace existing RPC-backed flows with direct client writes.
- Archive/restore is the default lifecycle pattern. Hard delete only when a
  maintenance cleanup explicitly requires it.
- Preserve activity logs and linked record revalidation when changing writes.
- Keep exact money fields and currency codes. Do not store business money as
  loose JavaScript floats.
- Keep business dates distinct from audit timestamps.
- Supabase Storage business documents stay private by default.

## UI Rules

- Authenticated Nestory should feel quiet, neutral, dense, and operational.
- Prefer tables, filters, list/card selectors, side drawers, record inspectors,
  badges, and compact actions over marketing layout.
- Keep primary records and useful actions early in the viewport.
- Use shared primitives from `src/components/ui` for visible form controls.
- Use URL-backed filters and pagination for list surfaces.
- Hide raw UUIDs from normal operator views.
- Long labels, file names, linked records, and descriptions must truncate or
  wrap deliberately.
- Mobile must remain usable, but desktop operating density matters.

## Code Organization

- Keep feature code in `src/features/<feature>` until reuse is real.
- Shared primitives belong under `src/components` and `src/lib`.
- Avoid dumping unrelated helpers into generic files.
- Keep server data loaders, filters, actions, types, and components close to
  their feature.
- Before changing a shared helper or action, grep callers and fix the root
  cause once.

## Verification Rule

- Non-trivial changes need at least one runnable check.
- Prefer focused checks first: lint/type/test the touched area, then build when
  route, schema, auth, or shared behavior changed.
- Use `docs/verification.md` for the current check menu and handoff format.
