# Operational Finance Reset Design

**Date:** 2026-08-08
**Status:** Approved for implementation
**Supersedes:** The accounting-kernel compatibility direction, dual-posting
bridges, legacy route aliases, and migration-history preservation requirements
that predate this development reset.

## Purpose

Nestory is an operational property-management system. It needs trustworthy rent,
expense, maintenance-cost, payment, owner, and reporting flows, but it does not
need a general accounting system hidden behind those flows.

There are no production users or production records to preserve. The repository
will therefore move forward with a clean development reset instead of carrying
compatibility code, inferred historical states, or a long migration chain into
the first real pilot.

This is replacement-first cleanup. Current business workflows remain available
only when their authoritative end-to-end data flow is preserved. A legacy object
is dropped after every active consumer has moved to the simpler authority.

## Success Criteria

The reset is complete when:

1. Lease configuration is authoritative in `lease_terms` and effective billing
   and rent-policy records, without duplicated rent/date authority on `leases`.
2. Automatic rent creates exactly one invoice and obligation per eligible
   lease-month, and checked collection creates its exact cash and Ledger effects.
3. Human-entered and maintenance costs have no financial effect before Finance
   approval; approval and reversal remain atomic, idempotent, and auditable.
4. Finance reads operational obligations, settlements, owner effects, and
   resolved property cash events without accounting books, accounts, periods,
   journals, or close revisions.
5. Ledger is a read-only operational event history. It is not a second source of
   truth and has no generic manual posting, edit, or archive path.
6. One organization-month lock prevents operational financial writes for that
   month. There is no period-close workflow or hidden property/accounting close.
7. The five fixed roles remain enforced in server contexts, RPCs, grants, RLS,
   navigation, and action visibility.
8. Obsolete public RPCs, redirects, query aliases, compatibility CSS aliases,
   CSV export, diagnostics, generated types, tests, and documentation are
   removed or replaced.
9. `supabase/migrations` contains a clean baseline that can build the final
   schema from an empty local database. The old migration history remains
   recoverable from Git, not from runtime SQL.
10. A clean local reset, database contracts, security tests, application tests,
    typecheck, lint, and production build all pass from the consolidated baseline.

## Product Boundary

### Retained operational workflows

- Properties, units, people, leases, documents, imports, and activity history.
- Five fixed workspace roles: Super Admin, Finance Manager, Finance Member,
  Operations Manager, and Operations Member.
- Authoritative lease terms, billing terms, approved rent policy, deposits,
  automatic current-month rent, typed exceptions, and selected-month recovery.
- Tenant invoices, checked tenant payments, direct-owner collection
  confirmation, owner invoices, owner payments, withdrawals, and petty cash.
- General paid-expense evidence submission, Finance review, exact approval,
  rejection, adjustment, and append-only reversal.
- Operations-to-Finance maintenance-cost submission and adjustment.
- Operational Ledger history, activity evidence, property cash events, Unit
  Profit and Loss, Monthly Owner Activity, PDF, and Excel exports.
- Private task and expense evidence with scoped document access.
- A narrow organization-month financial lock controlled by Super Admin.

### Removed product and compatibility surfaces

- Accounting books, chart-of-accounts records, accounting periods, journal
  headers, journal lines, journal balancing, and journal-to-Ledger bridges.
- Property reporting-period close state and close revisions.
- Generic manual Ledger posting, editing, and archiving.
- Inferred legacy lease terms, relationship evidence, promotion workflows, and
  duplicated lease rent/date projections.
- Compatibility finance refreshers, dual-post helpers, versioned/unchecked
  public RPC aliases, and retired settlement/status mutation paths.
- Legacy maintenance-to-Ledger links and any direct maintenance financial post.
- Finance inventory diagnostics that exist only to reconcile the retired dual
  model.
- Redirect-only workspace aliases, deprecated query parameters, deprecated auth
  context aliases, and compatibility styling aliases after callers migrate.
- The retained CSV compatibility export. PDF and Excel are the only report
  exports.

Full accounting, accounts payable, bank reconciliation, tax, payroll, treasury,
owner-statement publication, custom roles, and multi-stage approval remain out
of scope.

## Authoritative Data Flow

### Rent

1. Super Admin creates a lease with an authoritative term, billing term, and
   effective approved rent policy.
2. The scheduled or explicit selected-month generator resolves that authority,
   obtains the shared organization-month lock, and creates one rent obligation
   and one tenant invoice for the lease-month.
3. Generation is idempotent by lease and billing-period identity. Configuration
   failure records a typed exception without a partial obligation.
4. A checked tenant payment or direct-owner confirmation records settlement,
   allocation, owner/management-fee effects where applicable, one immutable
   Ledger event, and activity in the same transaction.
5. Reversal appends opposite settlement and Ledger evidence. Original rent and
   payment evidence is never rewritten.

### General paid expense

1. Finance Member or Super Admin submits amount, date, property scope,
   responsibility, funding source, and document or reference evidence.
2. Submission stores an immutable snapshot and creates no payment, customer
   charge, Ledger event, balance change, or report effect.
3. Finance Manager or Super Admin rejects with a reason or approves after
   revalidating evidence, source, scope, and the organization-month lock.
4. Approval atomically creates the expense obligation, payment and allocation,
   owner or tenant effect, one immutable Ledger event, property cash effect, and
   activity.
5. Super Admin reversal appends exact opposite evidence and keeps the original
   submission and financial rows immutable.

### Maintenance cost

1. Operations Manager records actual task cost, date, vendor, scope, and
   evidence.
2. Submission snapshots those facts into the same expense-review boundary and
   creates no financial effect.
3. Finance chooses the verified paid-from source and approves or rejects.
4. A later positive difference is a linked adjustment submission; approved
   history is never overwritten.
5. Maintenance completion and Finance approval remain independent states.

### Reporting

Authoritative obligations and settlements produce immutable operational Ledger
events. The property-cash projection reads settlement/allocation identity and
those Ledger links directly; it does not require a journal. Trusted Unit Profit
and Loss consumes only resolved, correctly scoped cash effects. Unsupported or
ambiguous effects remain visibly unresolved instead of being inferred.

## Database Design

### Operational Ledger

`ledger_entries` remains the exact internal projection used by the Ledger,
activity, and reporting surfaces. Each system-owned event stores:

- organization, property, optional unit, business date, amount, currency, and
  operational category;
- immutable source type and source ID;
- settlement/allocation identity where applicable;
- original-event identity for reversals;
- actor and audit timestamps.

Source identity is unique where one source may create only one event. Reserved
system rows cannot be changed directly. The application no longer exposes
generic create, edit, archive, or post actions.

### Month lock

`financial_month_locks` replaces Ledger, property-reporting, and accounting
period state. It is keyed by organization and month and stores locked/unlocked
state, reason, actor, and timestamps.

Every authoritative financial mutation acquires the same transaction-level
organization-month advisory lock and then checks `financial_month_locks`. Lock
and unlock use that same serialization key. This prevents a financial write
from racing a lock transition without introducing a close workflow.

### Funding sources

The paid-from/received-into configuration remains an operational funding-source
record with organization, optional property scope, currency, label, active
state, and audit identity. It is not a bank-reconciliation or chart-of-accounts
record. UI and APIs use funding-source language consistently.

### Authority and immutability

- `lease_terms` is the only lease rent/date authority.
- Income and expense items remain obligations; dated allocations remain
  settlements.
- Approval, collection, owner settlement, withdrawal, petty-cash, and reversal
  RPCs are the only financial mutation boundaries.
- Direct table DML stays revoked for authenticated roles.
- Every public RPC has explicit capability checks, fixed search path, exact
  grants, organization validation, payload-bound idempotency, and safe errors.
- Evidence and source records referenced by immutable workflows cannot be
  repointed or deleted.
- No table or function uses an accounting journal as a correctness dependency.

## Application Cleanup

- Replace every `requireAdminContext` call with the appropriate explicit
  capability context and delete the alias.
- Delete redirect-only aliases such as the retired dashboard, team, schedule,
  maintenance-dashboard, people-report, signup, and setup paths after updating
  navigation and route coverage.
- Keep `/reports` as the canonical report catalog rather than a redirect; it
  exposes only Monthly Owner Activity and Monthly Unit Profit and Loss.
- Remove legacy URL-filter normalization and update links/tests to canonical
  parameters.
- Remove accounting-health and compatibility diagnostic modules.
- Remove journal/accounting status from Ledger types, loaders, inspectors,
  badges, titles, and error messages.
- Remove manual Ledger mutation controls and actions; retain read-only history
  and Super Admin month-lock controls.
- Migrate callers from compatibility CSS aliases to current design tokens, then
  remove the alias block.
- Remove the CSV report handler and formula-safety tests that exist only for
  that retired endpoint.
- Regenerate database types only after the final schema is stable.

## Reset and Migration Strategy

The reset is local and development-only. It does not mutate a linked or hosted
Supabase project and does not deploy the application.

1. Add executable retirement contracts against the current schema. They must
   initially fail because the accounting and compatibility objects still exist.
2. Move active callers to the operational authority in small vertical slices:
   month lock, Ledger projection, rent settlement, expense approval/reversal,
   maintenance handoff, reporting, imports, and leases.
3. Drop each compatibility object only after its slice passes focused behavior,
   authorization, idempotency, reversal, and concurrency tests.
4. Rebuild fixtures around only the five fixed roles and current authoritative
   records. No legacy backfill or transitional state is seeded.
5. Once the replacement schema passes from a clean reset, consolidate the
   migration directory into a reproducible baseline using a verified Supabase
   CLI dump/squash path. Preserve bucket setup, grants, RLS, policies,
   functions, triggers, Cron configuration, and seed behavior.
6. Reset a second time from only that baseline, regenerate types, and rerun the
   complete verification suite. The second reset is the acceptance authority.

The previous migrations and removed source remain recoverable through Git. No
runtime compatibility layer is retained merely to make old commits forward-
compatible with the new empty development database.

## Failure and Recovery Rules

- A missing lease term, billing rule, rent policy, funding source, evidence
  record, or role capability fails before financial mutation.
- A locked month leaves the source workflow unchanged.
- Completed idempotent retries return their stored result even if mutable setup
  changes later; a changed payload under the same key fails as a conflict.
- Partial approval, collection, reversal, or owner settlement rolls back in one
  transaction.
- Exact reversal is blocked after incompatible downstream settlement and names
  the required correction path.
- One workflow failure cannot abort unrelated scheduled rent generation.
- There is no fallback to a journal, duplicated lease field, manual Ledger row,
  or inferred legacy state.

## Verification

### Database contracts

- Accounting/close tables, functions, columns, policies, grants, and enum states
  are absent.
- Retired public RPCs and direct DML paths are absent or non-executable.
- Five-role allow/deny and cross-organization/branch tests pass at helper, RLS,
  storage, and RPC boundaries.
- Rent generation, selected-month recovery, payment, direct-owner collection,
  expense review, maintenance adjustment, owner settlement, petty cash, and all
  reversals preserve exact effects and idempotency.
- Organization-month lock and financial writes serialize in both directions.
- Property cash events and trusted reports consume approved/reversed operational
  effects without journal identifiers or compatibility resolution codes.
- A clean empty-database reset from the consolidated baseline passes database
  lint and security/performance advisors relevant to the changed schema.

### Application contracts

- Route inventory contains only canonical paths and all five roles have tested
  read/write visibility.
- Finance roles can read the intended Lease, Ledger, Petty Cash, rent, expense,
  and owner surfaces while only authorized roles see mutations.
- Ledger has no manual posting controls or accounting terminology.
- Reports expose only the canonical catalog, PDF, and Excel.
- No runtime import references a removed object, alias, or compatibility type.
- Full Vitest, TypeScript, ESLint, production build, and authenticated local
  smoke tests pass after the second clean reset.

## Delivery Boundary

This work is performed on an isolated local branch. Completion may include local
commits. It does not include pushing, merging, hosted Supabase migration, Cron
activation, Vercel deployment, or user invitation without separate approval.
