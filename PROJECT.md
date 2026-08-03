# Nestory Project

Nestory is an invite-only property operations system. It gives a property
management team one reliable operating record for properties, units, people,
leases, money, maintenance, documents, and history.

This is the repository's single canonical project document. It records durable
product boundaries and engineering rules, not roadmap history. Current code,
Supabase migrations, generated types, tests, CI, and merged Git history outrank
this file when they disagree with it.

## Working Agreement

- Inspect the current checkout before making product or release claims.
- Update this file in the same change when a durable product boundary changes.
- Keep dated evidence, rollout notes, and implementation history out of this
  file. Git and executable artifacts own that history.
- Treat documents under `docs/implementation` and `docs/superpowers/specs` as
  scoped historical or implementation references. Reconcile them with current
  code before reuse.
- Read the matching local guide under `node_modules/next/dist/docs/` before
  changing Next.js behavior. This repository uses Next.js 16.2.9 App Router and
  newer conventions.

## Product Boundary

Nestory is operational property-management software centered on property and
unit records. It is not a generic ERP, a management-company general ledger, or
a public self-service workspace builder.

The implemented product includes:

- Invite-only authentication, organization membership, roles, and workspace
  access.
- Overview and attention surfaces for portfolio, property finance, leasing,
  maintenance, and record readiness.
- Property and unit records with linked leases, money, maintenance, documents,
  photos, and timeline history.
- People records for tenants, owners, vendors, and staff.
- Lease terms, parties, occupancy evidence, deposits, and rent policy.
- Rent and income, bills and expenses, ledger history, period locks, and petty
  cash.
- Maintenance cases, assigned tasks, work orders, inspections, recurring work,
  scheduling, reminders, and completion review.
- Private documents and photos.
- Staged CSV imports for properties, units, people, and leases.
- Traceable Unit Profit and Loss reporting plus deliberately blocked statement
  families whose authority is incomplete.
- Organization settings, branches, teams, invitations, and access management.

The executable route inventory is `config/ui-route-coverage.json`. Route files
under `src/app` and that manifest are authoritative; do not preserve route
counts or exhaustive route lists in documentation.

## Current Limitations

These are intentional truth boundaries, not invitations to synthesize data:

- Automated recurring rent generation is blocked until it consumes exact
  authoritative lease-term and approved rent-policy identities.
- Existing-lease party, occupancy, and resident transitions remain fail-closed
  until their impact and correction workflows are implemented.
- Owner Statement export is blocked because authoritative opening and closing
  owner balances do not yet exist.
- Management Fee Statement is defined but unavailable until owner-recognition
  authority exists. Legacy allocations and estimates are not substitutes.
- Maintenance can capture actual cost and, for administrators, link an official
  ledger effect. It does not yet provide a complete bill or petty-cash handoff
  with reciprocal links, duplicate prevention, and void recovery.
- Petty cash rolls forward a calculated closing balance but does not capture a
  separate physical cash count or resolve a counted-versus-calculated variance.
- The accounting schema is retained as a compatibility kernel behind current
  workflows. It is not a user-facing payroll, overhead, tax, company P&L,
  general-ledger, or ERP module.
- The database currency enum currently supports USD.

## Technology And Repository Shape

- Next.js 16.2.9 App Router and React 19
- TypeScript and Tailwind CSS 4
- Supabase Auth, Postgres, Row Level Security, RPCs, and private Storage
- Zod validation
- Vitest, Playwright, Testing Library, ESLint, and TypeScript checks
- Node.js 24 for local, CI, and container consistency

Repository ownership:

- `src/app`: server pages, layouts, route handlers, and route composition
- `src/features/<feature>`: feature actions, loaders, filters, types,
  components, and tests
- `src/components/ui`: shared visible UI primitives
- `src/components/layout`: authenticated shell and navigation
- `src/lib`: small cross-feature infrastructure, auth, and Supabase helpers
- `supabase/migrations`: append-only database history
- `supabase/tests`: database contracts and security checks
- `src/types/database.generated.ts`: generated public database types
- `scripts`: provisioning, verification, fixture, diagnostic, and concurrency
  tools
- `config/ui-route-coverage.json`: executable route and UI-state contract

Avoid generic utility dumping grounds and premature cross-feature abstractions.
Keep behavior in its owning feature until reuse is demonstrated.

## Authentication And Access

Workspace access is invite-only. Public signup and public organization
provisioning are disabled.

- Supabase Auth owns identities, verified email, passwords, recovery, sessions,
  and JWTs.
- Nestory owns invitation intent, organization membership, access level,
  branch scope, staff linkage, acceptance, revocation, and audit history.
- The supported access levels are `admin`, `manager`, and `member`.
- An active Staff record is the operational person identity. Workspace Access
  is a separate sign-in grant linked to Staff; a People role never grants
  software access by itself.
- Organization scope is resolved from the signed-in user and, where
  configured, the organization host. Localhost and reserved hosts use fallback
  membership resolution.
- Unlinked authenticated users go to `/no-access`. Only the server-only
  provisioning command may create an organization and its pending first-admin
  invitation.
- Never create an active membership before the matching verified identity
  explicitly accepts its invitation.
- Final-administrator protection, invitation state, staff linkage, role, and
  scope must remain enforced in checked SQL boundaries.

Use `requireAdminContext` for administrator-only surfaces and
`requireWorkspaceContext` for role-aware workspace surfaces. Administrators
have the full operating shell. Managers and members have restricted
maintenance-oriented access; members execute only work assigned through their
linked Staff identity and exact scope.

Invitation acceptance must fail closed unless Nestory has positive proof for
the identity's current password or the user creates a replacement password.
Identity existence or a provider hash alone is not password proof. Never read,
print, store in fixtures, or expose Auth password hashes or fingerprints during
verification. Safe evidence is limited to invitation and membership state plus
proof method and timestamp presence.

Secrets from `.env.local`, `.env.docker`, `.vercel`, and `supabase/.temp` must
never enter source files, documentation, logs, screenshots, or chat.

## Data And Mutation Rules

- Every business record must remain organization-scoped and protected by RLS.
- Data-loaded routes use server pages and feature-owned loaders.
- Mutations live in server actions with Zod validation.
- Important writes use checked Supabase RPCs, especially history, money,
  leases, imports, documents, access, archive/restore, assignments, and
  activity.
- Do not replace an RPC-backed workflow with direct browser writes.
- Revalidate every affected route after a successful mutation.
- Archive and restore are the default lifecycle. Hard delete is exceptional
  and must be explicitly authorized.
- Preserve activity evidence, correction or reversal lineage, linked-record
  identity, and idempotency across material writes.
- Store money in exact database numeric fields with an explicit currency code.
  Do not use JavaScript floating-point values as business-money authority.
- Keep business dates separate from audit timestamps.
- Schema changes use append-only migrations unless a destructive local reset is
  explicitly requested.
- Keep private business documents and photos in the private
  `nestory-documents` and `nestory-photos` buckets with database metadata and
  rollback-safe upload behavior.
- Person selectors must enforce active role and organization eligibility at an
  authoritative query or RPC boundary while preserving historical linked
  values.

## Lease And Rent Authority

`lease_terms` is the rent-term authority. Dates and rent values duplicated on
`leases` are compatibility projections and must not write back into term
history.

- New checked leases atomically create or adopt the authoritative term, primary
  party, occupancy, and participant identities.
- Lease responsibility, unit occupancy, and named-person residence are
  different facts. Keep their evidence, lifecycle, effective range, source,
  confidence, correction lineage, actor, time, and reason distinct.
- Unresolved legacy relationship rows remain non-authoritative until a checked
  promotion workflow exists.
- Accepted effective ranges must not overlap where the database contract
  forbids overlap.
- Term changes require explicit due day, payment frequency, amount, currency,
  effective dates, organization scope, idempotency, activity history, and
  property-period authority.
- Preserve historical identity through supersession; never rewrite material
  history in place.
- Rent policy uses normalized, effective-dated versions. Incomplete rules may
  exist only as drafts; approved versions are complete and immutable.
- Compatibility rent fields alone never make a lease ready for automatic rent
  generation.

## Financial Authority

Finance distinguishes obligations from dated settlement events:

- Income and expense items record what is owed.
- Receipts, payments, allocations, deposit events, and exact reversals record
  dated settlement activity.
- Cash reporting uses receipt and payment dates. Obligation dates belong to
  invoice, charge, and future accrual contexts.
- Property operating income excludes security deposits and owner
  contributions.
- Unit Profit and Loss consumes resolved, unit-linked property cash effects,
  preserves reversal signs, and excludes property-level, deposit,
  owner-funding, company-fee, and unresolved effects.

Checked finance transactions must preserve organization and property scope,
source identity, reconciliation identity, payload-bound idempotency, balanced
journal compatibility, activity history, exact Ledger projection identity,
and every affected property-period lock. Take shared locks in deterministic
order and fail closed on closed or changed periods.

Reserved receipt-allocation Ledger rows are derived Rent and Income evidence,
not editable manual rows. Their lifecycle follows the source receipt or exact
reversal. Compatibility journals and accounts may remain internally, but must
not leak into a product-facing management-company accounting model.

When financial authority is incomplete, label the workflow unavailable or the
evidence unresolved. Never estimate a publishable owner balance, management
fee, settlement, allocation, or reconciliation identity merely to populate a
screen or export.

Finance uses the configured organization name in operator-facing collection
labels. Short money actions use focused modals; multi-step lease billing setup
and longer conditional expense forms use right-side drawers. Internal funding,
markup, and responsibility details remain recorded without exposing internal
accounting terminology to tenants.

## Imports And Reports

CSV import supports properties, units or rent roll, people, and leases.

- Preserve template download, automatic or saved header mapping, staged row
  validation, review downloads, and one safe ready-row commit flow.
- The server owns import identity. Staging computes deterministic raw and
  semantic claims in PostgreSQL and inserts the run, rows, and counts
  atomically.
- Reuse an identical clean staged snapshot; replace only a clean staged run
  whose reference-derived semantics changed.
- Committing, terminal, legacy non-atomic, and provenance-linked runs fail
  closed rather than replaying or silently mutating history.
- Commits remain RPC-backed, organization-scoped, idempotent, and audited.
- Invalid or ambiguous records are visible and excluded; they are never
  silently imported.

The public report catalog is limited to Monthly Unit Profit and Loss, Owner
Statement, and Management Fee Statement. Reports remain traceable to source
records and scoped period/property context. PDF and Excel are the public export
formats; the retained CSV compatibility endpoint must remain auth-gated and
formula-safe. Do not add report families or infer blocked balances without an
approved product and data-authority change.

## Interface Contract

Authenticated Nestory is quiet, neutral, dense operating software.

- Use compact headers, URL-backed filters, tables, list/card selectors, badges,
  quick views, side drawers, and explicit record links.
- Keep primary records and common actions early in the viewport.
- Desktop workspaces should use the remaining viewport height and internal
  scrolling instead of small document-level scrollbars.
- Do not reserve a persistent side inspector beside operational tables. Row
  click or Enter opens a focus-managed quick view; an explicit record link
  reaches a real detail route. Double-click may be a pointer shortcut only when
  that detail route exists.
- Use the shared side drawer for create, edit, archive, restore, upload, and
  other focused record work.
- Keep one global `Search or jump` surface. Entity results stay server-scoped
  and must not expose raw UUIDs as operator labels.
- Settings uses local navigation, the active workspace, and one shared
  save/discard/status area. Configuration is a read-only registry catalog until
  persistence, approval, and effective-dating authority are implemented.
- Label ordinary actions directly. Explain risk, consequence, permission,
  unfamiliar domain meaning, and handoffs where needed.
- Consequential actions show the affected record, scope, and effect before
  submission, then a specific result.
- Shared loading, empty, filtered-empty, error/retry, permission, blocked,
  draft, saving, and success states must be explicit.
- Long labels and descriptions wrap or truncate deliberately. Raw UUIDs remain
  out of ordinary operator views.
- Use primitives from `src/components/ui` for visible form controls.

Dialogs and drawers trap focus, close with Escape, expose an announced close
control, and return focus to the opener. Keyboard use, focus, disabled states,
heading order, announcements, and 200% zoom must work at desktop, tablet, and
mobile widths without document-level horizontal overflow. Icon-only controls
need accessible names. Serious or critical accessibility failures block UI
readiness.

## Local Development

Install dependencies with Node.js 24:

```powershell
npm ci
npm run supabase:start
npm run dev
```

The default app runs directly against the local Supabase CLI stack. Use only
disposable local fixture accounts and keys. Public signup remains disabled.

Useful commands:

```powershell
npm run lint
npx tsc --noEmit
npm run test:all
npm run build
npm run db:reset
npm run db:reset:demo -- --reference-date 2030-01-15
npm run db:lint
npm run db:types
npx supabase test db --local supabase/tests
npm run test:ui-coverage
npm run test:ui-copy
```

For the Docker production-runtime path, copy `.env.docker.example` to the
ignored `.env.docker`, replace its placeholders with disposable local values,
then run:

```powershell
npx supabase start
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f app
```

Stop without deleting volumes:

```powershell
docker compose --env-file .env.docker down
npx supabase stop
```

Do not add `-v` unless deleting local Docker data is explicitly intended.

## Verification

Use the smallest check that proves a change, then expand with blast radius.

Standard application gate:

```powershell
npm run lint
npx tsc --noEmit
npm run test:all
npm run build
npm run test:ui-coverage
npm run test:ui-copy
```

Database changes also require the applicable local Supabase reset, lint,
generated-type comparison, pgTAP suite, and concurrency harnesses from
`package.json`. Never run a destructive reset against a hosted project.

Authenticated UI, auth, layout, drawers, uploads, imports, maintenance, and
report-export changes require a real local browser smoke. Available runners
include:

```powershell
npm run test:ui-redesign
npm run test:ui-a11y
npm run test:properties-flow
npm run test:maintenance-mobile
```

Browser runners use explicit loopback `BASE_URL` and disposable local
credentials supplied through the current PowerShell session. Prefer read-only
smokes unless the test owns cleanup. Invitation changes require the complete
invite, password-proof or replacement, acceptance, workspace continuation,
sign-out, and password-login lifecycle—not merely one successful redirect.

Production readiness is never inferred from local success or a generic green
badge. Recompute and report:

- Worktree, branch, exact HEAD, upstream SHA, divergence, and clean/dirty state
- Exact-head CI status and failed or skipped jobs
- Linked Supabase migration dry run, schema lint, and migration parity
- Vercel deployment filtered to the expected Git SHA, Ready state, aliases,
  public/protected route behavior, and recent runtime errors
- Backup/restore readiness when the release gate requires it

If the Vercel CLI is unavailable, install it with `npm i -g vercel` before
using `vercel env pull`, `vercel deploy`, or `vercel logs`.

## Handoff

Every completed change reports:

- Files and user-visible behavior changed
- Checks passed, failed, and not run, including the reason
- Known limitations or placeholders that remain
- Branch, commit, upstream parity, and deployment state when Git or production
  work was requested

Never stretch CI, preview, fixture, or local-browser evidence into claims about
an unverified hosted database, production alias, external integration, or
physical device.
