# Nestory Project

Nestory is invite-only property operations software for a property-management
company. It gives one team a dependable record of properties, units, people,
leases, rent, paid costs, maintenance, documents, and operational history.

This is the repository's durable product contract. Runtime code, database
contracts, generated types, tests, and merged Git history take precedence when
describing what is implemented. The product direction below guides future work;
it does not grant permissions or make planned workflows available. Update this
file in the same change whenever a durable product boundary changes.

## Product Direction — Staff Workflow First

Nestory should help property-management staff finish daily work quickly: find a
property or tenant, prepare a lease, collect rent, correct a mistake, coordinate
a repair, and explain an owner's activity. Use DoorLoop as a workflow reference,
adapted to Nestory's operating model and customers. Improve complete tasks rather
than pursuing feature parity or a visual copy.

Prefer contextual actions, useful defaults, visible balances and effects, short
forms, and an understandable correction history. Routine work should use the
staff member's configured capability within their assigned scope. Reserve
administrator involvement for governance and specifically privileged recovery,
not as a default solution to every difficult workflow.

Use little text and familiar language. Prefer clear labels and short actionable
errors over accounting or implementation jargon, repeated explanations and
instructional paragraphs. Reveal secondary help when it aids a decision.
Keep accessible labels and meaningful distinctions such as charge versus
payment, refund versus reversal, and live report versus saved statement.

Product and presentation conventions are revisable. Replace an unnecessary
restriction with a checked, auditable workflow; do not remove a server guard
before its replacement is implemented and verified. Archive/restore, correction,
reversal/replacement, and draft deletion have different effects and must use
clear operator language. A blocked action must explain the dependency and offer
the next authorized step when one exists.

Load the visible work first. Fetch forms, history, media and secondary insights
on intent or independently when appropriate. Any next-page prefetch must be
bounded, cancelable, scope-keyed, and justified by measurements. Financial totals
cover the complete selected scope through a separate aggregate; pagination must
not turn them into page totals.

Refactor as part of delivering these workflows: smaller cohesive feature
modules, shared UI and validation for demonstrated reuse, clear server-loader
and database-authority boundaries, consistent typed errors, and removal of
confirmed duplication. Use focused before/after regressions. Avoid a big-bang
rewrite, cosmetic churn, speculative abstractions, and more branching inside an
already oversized Finance component. Keep behavior changes and refactors
separate where practical. Do not add explanatory code comments.

Organization/property isolation, authentication, checked permissions, exact
money, source-linked audit and correction lineage, idempotency, stale/dependency
checks, migration gates and protected release procedures remain mandatory.
Existing closed-period rights, deposit policy, maker-checker requirements and
other financial business decisions remain in force until specifically changed.

The restriction matrix, architecture priorities, implementation phases and
implemented-versus-planned register are in
[Staff Workflow Product Direction](docs/product/staff-workflow-direction.md).
That document and this section supersede conflicting product preferences in
older design goals; historical specifications and evidence are retained.

## Product Boundary

Nestory is not a full accounting system, an ERP, or a public workspace builder.
It owns the operational facts needed to run managed properties and report
traceable property cash activity.

The implemented product includes:

- A public product page and persisted information-request intake. The operating
  workspace remains invite-only.
- Protected Super Admin access plus branch-scoped, organization-defined custom
  roles built from Nestory's fixed permission catalogue.
- Properties, units, people, ownership, vendors, staff, private documents,
  photos, and activity history.
- Authoritative lease terms, parties, occupancy evidence, deposits, and
  lease-owned billing rules. Lease-owned billing terms are the sole rent
  authority. The global Rent policy is retired: it has no operator-facing
  surface, and historical approved versions remain only as audit evidence.
- Automatic current-month rent invoices, typed generation exceptions, and an
  explicit selected-month recovery action for completed historical months.
- Rent collected through the company or confirmed as collected directly by an
  owner.
- Paid-expense evidence submission, Finance review, owner or tenant effects,
  exact reversal, owner invoice payments, owner distributions, and petty cash.
- Maintenance requests, branch coordination, assigned work, completion review,
  and an Operations-to-Finance cost handoff.
- Staged imports for properties, units, people, and leases.
- Monthly Owner Activity and Unit Profit and Loss reports with PDF and Excel
  exports, plus numbered official Owner Statements retained from immutable
  owner-month close revisions.
- A read-only operational Ledger and a narrow financial month lock.

The executable route contract is
`config/ui-route-coverage.json`. Route files under `src/app` and that manifest
are the authority for public and protected destinations.

## Authoritative Data Flow

### Lease to rent to report

1. Property is the operating root. A `single_space` property is leased directly
   with `leases.unit_id = NULL`; a `multi_unit` property is leased through its
   Units. Nestory never creates a fake Unit for a whole-property lease.
2. A user with the configured lease preparation permission creates a contextual
   lease in authorized property scope with one authoritative `lease_terms`
   record and explicit party and occupancy evidence. Activation and term changes
   retain their separate checked permissions.
3. An effective `lease_billing_terms` record owns the collection route,
   recipient, management fee, and the lease-owned billing rules used to
   generate rent. New leases do not depend on a global Rent policy.
4. Activation catch-up or the hourly scheduled runner creates exactly one rent
   obligation and tenant invoice for an eligible lease-month. A failed lease is
   isolated in `rent_generation_exceptions`.
5. A checked tenant payment allocation or direct-owner confirmation records
   settlement. Generating an invoice alone does not claim cash was received.
6. The settlement creates one immutable, source-linked operational Ledger event.
7. `get_property_cash_events_page` derives resolved property cash events from
   those operational sources. Unit Profit and Loss consumes only resolved,
   correctly scoped events.

Manual tenant charges use the same canonical invoice, line, income, payment,
allocation, receipt, owner-effect, Ledger-projection, and reversal contracts as
generated rent. A manual base-rent charge cannot duplicate an existing
Lease-month. Historical recovery creates only the selected completed month and
never fills adjacent months automatically.

An issued current-month rent invoice has an **Edit this month's rent** action
for Super Admin and the authorized Finance Manager in assigned property scope.
It requires a reason and checked balance preview, preserves prior payments and
future recurring terms, and records correction lineage. Overpayment,
owner-cash dependencies, locked or closed periods, stale previews and duplicate
commands retain their checked safeguards. This capability does not grant
general historical editing or closed-month reopening.

### Paid expense to approval to reversal

1. Finance Member, Finance Manager, or Super Admin submits amount, currency, property scope,
   vendor, responsibility, paid-from source, and evidence to
   `expense_submissions`.
2. Submission is evidence only. It creates no payment, customer charge, Ledger
   event, owner balance, or report effect.
3. Finance Manager or Super Admin approves or rejects the immutable snapshot.
4. Approval atomically creates the paid expense, payment/allocation, owner or
   tenant effect, activity, and one exact source-linked Ledger event.
5. Rejection records the reviewer and reason without a financial effect.
6. Super Admin and authorized Finance Manager may reverse an approved expense. Reversal appends exact
   opposite payment, customer, and Ledger evidence; it does not rewrite the
   original transaction.

Every money mutation is exact-decimal, organization-scoped, payload-idempotent,
and serialized against the affected financial month. Unsafe correction after
downstream settlement fails closed.

### Maintenance to Finance

1. Operations Manager coordinates branch work and records vendor, actual cost,
   currency, date, and evidence on the maintenance task.
2. `submit_maintenance_cost` snapshots the task cost into the same Finance
   review queue. It has no financial effect at submission.
3. Finance Manager or Super Admin validates the evidence, chooses the paid-from
   source, and approves or rejects it.
4. Approval uses the same atomic paid-expense flow. Later increases are explicit
   adjustment submissions linked to the approved history.

Operational task completion and Finance approval are independent states.
Maintenance never posts directly to the Ledger and never silently converts a
task cost into petty cash.

## Roles And Authorization

`Super Admin` is the only protected built-in role. It is organization-wide,
cannot be edited or archived, and exclusively manages branches, teams, users,
roles, permissions, and cross-branch assignments.

Every ordinary user has exactly one active branch and one active, non-empty
organization-defined custom role. Nestory defines the stable permission keys
and their semantics. Every non-View permission depends on its group's View
permission: adding a dependent adds View, and removing View removes every
dependent in that group. An empty or archived role cannot be assigned, and an
assigned role cannot be archived.

Permission is necessary, never sufficient, for maker-checker separation,
assignee and execution-mode rules, period reopen or unlock, exceptional
correction or reversal, historical recovery, immutable evidence, lease-owned
rent, lifecycle, and audit invariants.

Use capability-specific server contexts for protected routes and actions.
Navigation and hidden controls are usability boundaries, not authorization:
server actions, checked RPCs, grants, and RLS repeat every capability check.

Workspace access is invitation-based:

- Supabase Auth owns identity, verified email, password, recovery, session, and
  JWT state.
- Nestory owns invitation intent, membership, role, branch scope, Staff linkage,
  acceptance, revocation, and activity history.
- A People role never grants application access by itself.
- Unlinked authenticated users go to `/no-access`.
- Final-Super-Admin protection and role-shape checks are database invariants.
- Public signup and public organization provisioning are absent.

Invitation acceptance must have positive proof of the identity's current
password or require a replacement password. Never inspect, log, fixture, or
expose password hashes or fingerprints.

## Financial Model

Nestory distinguishes obligations from dated settlement:

- `finance_income_items`, tenant invoices, owner invoices, and approved expense
  records describe what is owed or charged.
- Receipts, payments, allocations, owner confirmations, deposit events, owner
  distributions, and reversal rows describe dated activity.
- Cash reporting uses settlement dates. Invoice and expense dates remain the
  obligation context.
- Security deposits and owner funding do not become property operating income.
- Management fees are explicit operational occurrences, not inferred report
  plug values.
- Ledger rows are immutable projections of checked operational sources. They
  cannot be created, edited, posted, or archived manually.

For a company-collected tenant payment, the selected receiving account records
where the cash actually landed. It is not an owner destination. Owner cash
effect and reporting attribution continue automatically from the Lease billing
and ownership authority after the checked settlement succeeds. The interface
loads eligible receiving accounts from Finance and never hardcodes an arbitrary
account for a Lease.

The Ledger is not a second source of truth. Reports must trace each row to the
underlying allocation, payment, confirmation, owner distribution, deposit, expense
approval, reversal, or petty-cash source.

`financial_month_locks` is the only financial time gate. Super Admin may lock
or unlock one organization-month to pause operational financial mutations.
This is not accounting period close. Nestory has an organization-owned Chart
of Accounts catalog for operational account selection and read-only activity,
but no accounting books, arbitrary journals, editable Ledger, trial balance,
bank reconciliation, accounts-payable scheduling, treasury, tax engine, or
multi-currency launch. Owner-month close revisions freeze the
operational source evidence for one exact property, owner, currency, and month;
official Owner Statement publication retains numbered PDF and Excel artifacts
from that immutable evidence without creating accounting-book authority.

## Lease Authority

`leases` owns lease identity, property/unit links, primary tenant, deposit
summary, and lifecycle. `lease_terms` alone owns rent amount, currency,
frequency, due day, and effective dates.

- Checked lease creation records the authoritative term, primary party,
  occupancy, and resident participation atomically.
- Lease responsibility, named party, physical occupancy, and resident
  participation are distinct facts with their own source, confidence, dates,
  actor, reason, and correction lineage.
- Accepted effective ranges cannot overlap where the database contract forbids
  it.
- Material term changes supersede history; they do not rewrite it.
- Ending, terminating, or cancelling a Lease supersedes every remaining
  non-terminal authoritative term while retaining all term and lifecycle rows.
- A zero deposit means no deposit is required. The checked write boundary
  stores it as no deposit and never creates a pending zero-value artifact;
  any zero-value record with financial evidence remains visible for review.
- Historical approved rent-policy versions are complete and immutable. No
  surface authors new ones.
- New Lease readiness resolves the effective Lease billing term and its visible
  lease-owned rent behavior; it has no global Rent policy prerequisite.
- Historical approved rent-policy versions and invoice references remain
  immutable audit evidence. Unresolved historical behavior fails closed until
  an operator confirms the visible Lease rule snapshot.

## Imports, Documents, And Reports

Imports are staged and server-owned. PostgreSQL creates the run identity,
normalizes rows, computes deterministic claims, and commits only safe ready
rows through checked RPCs. Invalid or ambiguous rows remain visible and are
never silently imported.

Documents and photos use private Storage buckets plus organization-scoped
metadata. Upload, link, archive, and evidence access must remain rollback-safe.
Documents referenced by expense history are immutable evidence.

The currently implemented operational report-builder catalog contains:

- Monthly Owner Activity
- Unit Profit and Loss

Reports use the canonical property-cash projection, preserve reversal signs,
and link back to operational sources. PDF and Excel are the only report export
formats. Official Owner Statements are a separate publication workflow under
authoritative owner balances. Finance Manager may close a reconciled, locked
owner month and publish its official statement; Super Admin may perform those
actions and is the only role that may reopen a closed month or resume an
exceptional incomplete publication. Finance Member may inspect retained
publications but cannot close, reopen, or publish. A separate Management Fee
Statement and any balance that requires invented opening authority remain
unavailable.

## Current Limitations And Pending Decisions

These describe the current implementation, not permanent product prohibitions.
Evaluate improvements against staff needs and the phased roadmap. Financial
policy, currency, access, external services and durable automation require their
own explicit decisions and implementation evidence; this direction does not
silently enable them.

- The database currency enum currently supports USD only.
- Human-entered expenses are costs the company already paid. Unpaid vendor
  bills, accounts-payable scheduling, bank reconciliation, payroll, tax,
  treasury, and multi-stage approvals are outside scope.
- Recurrence is task metadata and filtering only. It does not create future
  task instances.
- Reminders are browser-only, best effort, and active only while the relevant
  page is open. They are not a durable notification service.
- Petty cash rolls forward calculated balances but does not reconcile a
  physical cash count variance.
- Current party/occupancy correction paths are deliberately narrow and fail
  closed when safe downstream correction is not implemented.
- Official Owner Statement publication requires an exact property, owner,
  currency, and month; an immutable closed revision; and verified retained PDF
  and Excel artifacts. Missing authority remains visibly blocked.
- There is no automatic historical rent backfill.
- Lease creation is monthly-only in V1. Concessions, rent-free periods, and
  waivers use explicit manual adjustments until dedicated workflows exist.

Unavailable authority must remain visible as a blocked state or typed
exception. Never invent a balance, settlement, allocation, owner, resident, or
reconciliation source merely to populate a screen or export.

## Data And Mutation Rules

- Every business record is organization-scoped and RLS-protected.
- Data routes use server pages and feature-owned loaders.
- Mutations use server actions with Zod validation and checked RPCs for material
  history, money, lease, import, document, access, assignment, archive, and
  activity changes.
- Direct browser writes never replace an RPC-owned workflow.
- Direct table DML is revoked for protected financial and history records.
- Public and anonymous function execution is revoked unless explicitly needed.
- Archive/restore remains the normal lifecycle for established records. Design
  audited deletion for unused drafts as a separate workflow with a checked
  dependency/retention boundary. Financial or referenced evidence is corrected,
  voided, reversed or superseded through its source workflow, not erased. No new
  hard-delete capability is enabled by this document.
- Preserve source identity, evidence, activity, correction or reversal lineage,
  and idempotency across every material write.
- Store money in exact database numeric values with explicit currency. Do not
  use JavaScript floating point as business-money authority.
- Keep business dates separate from audit timestamps.
- Financial mutations take shared locks in one deterministic order: financial
  month before customer or owner settlement scope, then affected source rows.
- Person selectors validate active role and organization eligibility while
  preserving historical linked labels.
- Revalidate every affected route after a successful mutation.

Secrets from `.env.local`, `.env.docker`, `.vercel`, and `supabase/.temp` must
never enter source, documentation, logs, screenshots, or chat.

## Interface Contract

Authenticated Nestory is quiet, neutral, dense operating software:

- Dashboard active-Lease and occupancy metrics include only operational,
  non-archived Property and Unit scope. Open Leases outside that scope appear
  as a short attention item, not as healthy activity.
- Dashboard cash flow shows actual Ledger activity only. Contractual expected
  rent is a separate labeled view, and a period with no Ledger activity shows
  an empty state rather than a zero-valued chart.
- Prefer one visible workspace title/action composition and one dominant work
  surface. A second controls row or comparison surface is acceptable when a
  demonstrated staff task needs it and keyboard, zoom and hierarchy remain clear.
- Keep primary search visible. Disclose advanced URL-backed filters instead of
  giving every filter permanent visual weight.
- Top-level Properties, People, Maintenance, Finance work, Timeline, Documents,
  and Ledger surfaces share one Layer 1 register contract: a clear title,
  record count and primary action; one controls row by default; one dominant
  table or queue; explicit record navigation; and pagination attached to that
  surface. An extra controls row follows the same demonstrated-task, keyboard,
  zoom and hierarchy criteria above. Domain columns, attention states, and
  actions remain feature-owned.
- A desktop register may use one restrained bordered surface for its filters and
  rows while retaining captions, semantic headers, keyboard behavior, and
  accessible selection state. Avoid nested decorative card shells.
- Keep primary records and common actions early in the viewport. Desktop
  workspaces use the remaining viewport height and internal scrolling.
- Prefer an on-demand inspector beside operational tables. A persistent
  comparison panel may be used when workflow evidence supports it. Where a quick
  view exists, row click or Enter opens it with managed focus. Otherwise use an
  explicit record link and do not make a passive row appear interactive.
- Use shared drawers for focused create, edit, archive, restore, and upload work.
- Keep one global `Search or jump` surface. Results stay server-scoped and raw
  UUIDs remain out of ordinary operator labels.
- Settings uses capability-aware, path-based Workspace and Access navigation.
  Super Admins can manage Organization, Appearance, Branches, Teams, and
  Access. The legacy Rent policy screen is retired and no longer routable; its
  records remain readable only as retained audit evidence. The provisioned
  workspace address is immutable in Settings, while the display name remains
  editable through the checked organization boundary.
- Organization accent and the default display mode are Super-Admin-managed and
  default to a neutral black-and-white theme. Every workspace member may choose
  a personal Light, System, or Dark display mode stored locally per organization;
  that preference changes no organization setting, capability, or data rule.
- Organization accents affect actions, selection, links, and focus only. They
  never recolor structural surfaces or semantic success, warning, danger,
  finance, maintenance, or record states.
- Navigation and action visibility remain capability-aware for all five roles.
- Property and Unit records are the primary operating workspaces. Their Finance
  tabs compose canonical scoped rent and charges, expenses, and owner-account
  data. Global Finance is a secondary portfolio review surface; Ledger and
  Petty cash remain directly addressable under Advanced finance.
- The canonical Lease URL remains the record workspace. An eligible
  company-collected invoice may open a URL-backed guided payment state within
  that Lease, with one dominant action, concise Lease context, recent activity,
  and legitimate upcoming dates. Stale, paid, voided, archived, direct-to-owner,
  and unauthorized cases return to or preserve the stable Lease record with a
  valid next destination; they do not expose a dead-end payment form.
- A Lease shows the security deposit amount required and amount held in its
  summary. Deposit history, recording, and reversal controls live together in
  the focused `Manage deposit` drawer rather than in a second inline activity
  workspace.
- Loading, empty, filtered-empty, permission, blocked, error, draft, saving, and
  success states are explicit.
- Consequential actions identify the affected record, scope, and result.
- Shared primitives from `src/components/ui` own visible form controls.
- Treat 1440 x 900 and 1280 x 800 as laptop-first visual checks.

Dialogs and drawers trap focus, close with Escape, expose announced controls,
and return focus to the opener. Keyboard use, heading order, disabled states,
announcements, and 200% zoom must work without document-level horizontal
overflow. Serious accessibility failures block UI readiness.

## Technology And Repository Shape

- Next.js 16.3.8 App Router and React 19
- TypeScript, Tailwind CSS 4, Zod 4, and shadcn/Radix UI primitives
- Supabase Auth, PostgreSQL, RLS, RPCs, private Storage, and Cron
- Vitest, Testing Library, Playwright, ESLint, TypeScript, and pgTAP
- Node.js 24 for local, CI, and container consistency

Repository ownership:

- `src/app`: pages, layouts, route handlers, and route composition
- `src/features/<feature>`: feature actions, data, components, types, and tests
- `src/components/ui`: shared visible primitives
- `src/components/layout`: authenticated shell and navigation
- `src/hooks`: shared client interaction hooks
- `src/lib`: small cross-feature infrastructure and authorization helpers
- `supabase/migrations`: empty-database-reproducible schema and runtime setup
- `supabase/tests`: behavior, authorization, security, and retirement contracts
- `supabase/test-fixtures/baseline.sql`: local-only five-role operating fixture
- `src/types/database.generated.ts`: generated public database types
- `scripts`: local verification, fixture, smoke, and concurrency tools
- `config/ui-route-coverage.json`: executable route/UI-state contract

Keep behavior in its owning feature until reuse is demonstrated. Do not build a
generic workflow engine or general-purpose financial event layer.

## Local Development

Use Node.js 24:

```powershell
npm ci
npm run supabase:start
npm run dev
```

Starting an existing local instance does not prove it is disposable. Do not
reset or load fixtures into a shared or unverified database. For a new isolated
disposable instance, verify the target, contents and port/project separation
before following `npm run db:reset` and `npm run db:test:fixture`. The latter
loads the guarded five-role fixture documented at the top of
`supabase/test-fixtures/baseline.sql`. Use disposable CI or read-only/synthetic
checks when the existing local database must be preserved.

The guarded local fixture contains one organization, five fixed-role logins,
four properties (three operating stories and one isolated owner-close story),
ten units, five current leases, and connected lease-derived
rent, Finance approval, maintenance handoff, petty-cash, timeline, and reporting
stories. It is local-only: it is not a scale benchmark, hosted seed, or proof of
production readiness.

The five role logins are:

- `nestory@gmail.com`
- `finance.manager@nestory.com`
- `finance.member@nestory.com`
- `operations.manager@nestory.com`
- `operations.member@nestory.com`

After loading the fixture and starting the local application, run
`npm run test:fixture-roles` to verify each role's intended seeded journey.

Useful checks:

```powershell
npm run db:lint
npm run db:types
npx supabase test db --local supabase/tests
npx tsc --noEmit
npm run lint
npm run test:all
npm run test:ui-coverage
npm run test:ui-copy
npm run build
```

Never run a destructive database reset against a hosted project. Do not use
`docker compose down -v` unless deleting local Docker data is explicitly
intended.

## Verification And Release Boundary

Use the smallest check that proves a change, then expand according to blast
radius. Database work requires empty-database reproduction and fixture checks
in an isolated disposable local or CI instance, generated types, schema lint,
pgTAP, and the applicable concurrency harnesses. It never requires resetting
an existing shared database. Auth,
layout, upload, import, maintenance, and report changes also require a real
local browser smoke with disposable credentials.

Local success does not prove hosted readiness. A release claim must separately
verify exact Git SHA and divergence, CI for that SHA, linked Supabase migration
parity and lint, deployment SHA/alias/runtime health, protected-route behavior,
and backup expectations. Production migrations run only through the serialized,
protected GitHub environment from the exact merged `main` SHA; merging that pull
request authorizes this lane, never a developer checkout or connector write.
Cron activation, user invitation, deployment outside the protected release lane,
and production smoke always require explicit authorization.

Every handoff reports changed behavior, passed and failed checks, checks not
run, remaining limitations, exact branch/commit state, and hosted state when it
was in scope.

### Daily financial corrections

Super Admin and Finance Manager can create expenses, edit pending expenses from
other submitters, and correct or delete approved expenses within their authorized
property scope. Finance Manager uses the existing approval and correction
permissions together; other custom roles retain their configured permissions.
An approved expense correction reverses the original and approves its replacement
atomically. Every correction retains the actor, time, reason, and before/after
values. Existing receipts are copied into verified replacement evidence unless
the operator chooses a new receipt. Original financial evidence remains readable.
Live report rows open their source expense or rent invoice and retain a return
link with the report filters. Saved source changes refresh live report totals.
