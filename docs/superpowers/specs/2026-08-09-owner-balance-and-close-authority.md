# Owner Balance And Close Authority Specification

**Date:** 2026-08-09

**Status:** Approved design authority for Tracks 2-4

**Decision authority:** IPS approved D1-D14 on 2026-08-09. This specification freezes D1-D12 and applies the D13-D14 separation-of-duties boundary without broadening Finance Manager authority.

**Review status:** Corrected after adversarial specification review; Track 2
implementation starts with Task 2.0 and may not skip any numbered/lettered gate.

**Implementation boundary:** Local branch only. This specification does not authorize a hosted migration, import, close, publication, deployment, push, or merge.

## Purpose

Nestory must publish an Owner Statement only from owner balances that can be
reconstructed from evidence and immutable operational sources. The current
property cash and Monthly Owner Activity projections start from zero and resolve
one current primary owner; they are useful operational views, not opening-balance,
roll-forward, close, or statement authority.

Tracks 2-4 replace that gap in dependency order:

1. Track 2 establishes evidence-backed opening component authority.
2. Track 3 allocates every owner-affecting source once, applies safe reversals,
   and rolls all four components through calendar months.
3. Track 4 closes one property-owner-currency-month into an immutable revision
   and publishes byte-stable PDF and Excel artifacts from that frozen revision.

No report loader may create, default, infer, rebalance, or repair an opening
amount, owner allocation, component movement, close line, or closing amount.

## Product Boundary

This is an operational owner-subledger and publication boundary. It is not a
general ledger, chart of accounts, journal system, bank reconciliation system,
accounts-payable system, treasury system, tax engine, or multi-currency launch.

The schema remains organization scoped and USD-only at implementation time.
Currency remains part of every key so a future currency expansion cannot merge
unlike authority. No implementation task may add a second `currency_code` value.

## Binding Decisions D1-D12

| ID | Binding rule |
| --- | --- |
| D1 | Store four separate components: `ips_held_owner_cash`, `owner_due_to_ips`, `ips_due_to_owner`, and `security_deposit_custody`. Never store one unexplained owner-balance scalar. |
| D2 | Opening authority is keyed by organization, property, owner, currency, effective date, and component, and carries submitter, independent reviewer, reason, source reference/document, evidence fingerprint, and append-only correction lineage. |
| D3 | Ownership intervals are half-open: `[started_on, ended_on)`. The end date belongs to the next roster. Overlap, missing effective dates, or incomplete percentage allocation fails closed. |
| D4 | Allocate an event by its settlement/event date and effective roster unless the checked source already names an explicit owner. Persist the roster/allocation snapshot used. Never recompute history from today's ownership. |
| D5 | An ownership transfer never silently moves held cash, debt, custody, receivables, fees, or expenses. A component moves only through a checked explicit transfer instruction implemented in Track 3. |
| D6 | A management fee is earned at the existing rent-obligation/invoice generation occurrence. Collection and close do not create or plug a second fee. |
| D7 | Direct-owner rent settles tenant debt and appears as owner activity, but it does not increase IPS-held owner cash or available withdrawal. |
| D8 | Owner invoice payment, owner contribution, owner reimbursement, and owner distribution/withdrawal are distinct event types and checked workflows. Labels or projections may not collapse them into `owner payment`. |
| D9 | Security-deposit custody is separate from operating cash and income. It never contributes to available withdrawal. Beneficial ownership must be explicit before close. |
| D10 | Close scope is exactly one organization + property + owner + currency + calendar month revision. The organization-month lock remains the operational write gate and close orchestration boundary. |
| D11 | A closed revision is immutable. Reopen creates revision `N+1`, preserves revision `N`, supersedes any publication through a new publication record, and marks every later dependent period stale until deterministic re-roll and re-close. |
| D12 | A statement has an immutable number, close revision, canonical content hash, generating actor/time, supersession link, PDF/Excel artifact hashes, and permanent prior-revision retention. |

## Normative Terms

- **MUST / MUST NOT** are required for acceptance.
- **Unknown** means no approved authority exists. Unknown is not zero.
- **Known zero** means an approved opening request explicitly established
  `0.00` for a component with the same evidence and review requirements as a
  nonzero amount.
- **Opening authority key** is
  `(organization_id, property_id, owner_person_id, currency, effective_date, component)`.
- **Opening ownership snapshot** is the exact `property_owners.id`, explicit
  `ownership_percent`, and canonical whole-roster SHA-256 resolved for the
  opening effective date. It is authority evidence, not a live join.
- **Period key** is
  `(organization_id, property_id, owner_person_id, currency, month_start)`.
- **Atomic source line** is the smallest immutable source row whose whole amount
  is allocated once; a source header with multiple lines is not an atomic source.
- **Current revision** is the closed revision referenced by its close series. An
  older revision remains closed and immutable; it is derived as superseded, not
  rewritten to a new status.

## Authorization And Separation Of Duties

D13 delegates ordinary daily Finance operations. It does not delegate creation
of cutover authority or exceptional closed-period correction. D14 requires
maker-checker separation. The fail-closed Tracks 2-4 matrix is therefore:

| Operation | Super Admin | Finance Manager | Finance Member | Operations roles |
| --- | --- | --- | --- | --- |
| Read opening requests, approved components, opening-ownership remediation, and later allocation/close/statement results once their tracks exist | Allow | Allow | Allow where existing Finance read authority allows | Deny |
| Submit initial opening request | Allow, but cannot review own request | Deny | Allow | Deny |
| Submit correction request | Allow, but cannot review own request | Allow, but cannot review | Allow | Deny |
| Approve or reject opening/correction request | Allow only, and reviewer must differ from submitter | Deny | Deny | Deny |
| Upload/select opening evidence | Existing checked document authority only; reference-only submission remains supported | Select readable evidence/reference only | Select readable evidence/reference only | Deny |
| Inspect close readiness and reconciliation | Allow | Allow | Read-only queue context | Deny |
| Generate/recompute event allocation, roll-forward, or withdrawal capacity | Track 3 only | Track 3 only through an allowed checked path | Deny | Deny |
| Safe open-period correction after Track 3 acceptance | Allow | Allow only through `canCorrectFinance` and the exact guarded paths approved by Track 3 | Deny | Deny |
| Unlock, ownership transfer instruction, closed-period reopen, exceptional correction, close, or publication | Allow only | Deny | Deny | Deny |
| Mutate tables directly | Deny | Deny | Deny | Deny |

The opening-balance review authority is intentionally narrower than paid-cost
review. Opening balances establish cutover truth and are not ordinary daily
receipts. If IPS later delegates close or opening approval, that is a new
decision and requires a role-matrix change at TypeScript, server-context, RPC,
grant, RLS, pgTAP, and browser boundaries.

The TypeScript capability contract introduced in Track 2 MUST add explicit
booleans rather than reuse `canManageFinanceOperations`:

```ts
type OwnerBalanceCapabilities = {
  canReadOwnerBalanceAuthority: boolean;
  canSubmitOwnerOpeningBalance: boolean;
  canRequestOwnerOpeningBalanceCorrection: boolean;
  canReviewOwnerOpeningBalance: boolean;
  canInspectOwnerCloseReadiness: boolean;
  canCloseOwnerMonth: boolean;
  canReopenOwnerMonth: boolean;
  canPublishOwnerStatement: boolean;
};
```

For Tracks 2-4, `canCloseOwnerMonth`, `canReopenOwnerMonth`, and
`canPublishOwnerStatement` are true only for Super Admin.

## Exact Database Contract

All tables below live in `public`, have RLS enabled, grant `SELECT` to
`authenticated` only through organization-scoped Finance read policies, and
reserve all writes for checked RPCs. Each opening-authority migration explicitly
revokes `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` from `PUBLIC`, `anon`,
`authenticated`, and `service_role`; it also revokes `SELECT` from `PUBLIC`,
`anon`, and `service_role`. Track 2 has no named `service_role` consumer, so it
receives no opening-table privilege. A later named worker must obtain the minimum
separate grant in its own reviewed migration, never an inherited broad grant.
Every public RPC is `SECURITY DEFINER SET search_path TO ''`, checks `auth.uid()`,
organization membership and its exact capability, revokes execute from
`PUBLIC`, `anon`, and `service_role`, and grants execute only to `authenticated`.
Private helpers revoke execute from all application roles and are never directly
executable by `authenticated` or `service_role`.

### Shared enums and checks

Use a PostgreSQL enum for the four durable component identities:

```sql
CREATE TYPE public.owner_balance_component AS ENUM (
  'ips_held_owner_cash',
  'owner_due_to_ips',
  'ips_due_to_owner',
  'security_deposit_custody'
);
```

Use check constraints, not additional PostgreSQL enums, for workflow states so
future additive migration remains possible without renaming enum values:

- opening request kind: `initial`, `correction`;
- opening request status: `submitted`, `approved`, `rejected`;
- opening entry kind: `opening`, `correction_reversal`,
  `correction_replacement`;
- allocation basis: `effective_roster`, `explicit_owner`;
- allocation effect: `component_movement`, `activity_only`;
- roll-forward status: `blocked`, `ready`, `stale`, `closed`;
- close-series state: `open`, `preparing`, `closed`, `stale`;
- close-revision status: `preparing`, `closed`, `abandoned`;
- statement artifact format: `pdf`, `xlsx`.

Every monetary column is `numeric(14,2)`. Public RPCs accept an unconstrained
`numeric`, reject a value with more than two decimal places before insertion,
reject negative proposed opening amounts, and return amounts as canonical
decimal text. JavaScript `number`, `parseFloat`, `Number`, and binary floating
point MUST NOT cross an authoritative owner-balance action or loader boundary.

### Track 2: `owner_opening_balance_requests`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key, generated UUID |
| `organization_id` | `uuid` | Required; FK organization, delete restrict |
| `property_id` | `uuid` | Required; composite organization/property scope checked |
| `owner_person_id` | `uuid` | Required; active owner role and roster membership checked at `effective_date` |
| `property_owner_id` | `uuid` | Required; exact active `property_owners` row resolved by the Track 2.0 validator |
| `ownership_percent_snapshot` | `numeric(6,3)` | Required, `> 0` and `<= 100`; exact explicit share on `property_owner_id` |
| `ownership_roster_hash` | `text` | Required lowercase 64-hex hash of the complete valid roster on `effective_date` |
| `currency` | `currency_code` | Required; `USD` in current product |
| `effective_date` | `date` | Required; first day of a calendar month |
| `component` | `owner_balance_component` | Required |
| `request_kind` | `text` | `initial` or `correction` |
| `proposed_amount` | `numeric(14,2)` | Required, `>= 0`; `0.00` is valid known zero |
| `correction_of_entry_id` | `uuid` | Null for initial; required for correction; targets the current unreversed authority-bearing opening/replacement entry with the same authority key, including an entry whose amount is `0.00` |
| `resubmission_of_request_id` | `uuid` | Optional; targets the immediately preceding rejected request in the same request chain |
| `status` | `text` | `submitted`, `approved`, or `rejected` |
| `reason` | `text` | Trimmed 3-500 characters |
| `source_reference` | `text` | Optional trimmed 3-240 characters |
| `supporting_document_id` | `uuid` | Optional FK to `documents`, delete restrict |
| `evidence_sha256` | `text` | Required lowercase 64-hex hash of the submitted source snapshot/file bytes |
| `payload_hash` | `text` | Required lowercase 64-hex fingerprint of canonical public RPC arguments; operation and authenticated actor complete the idempotency identity |
| `submitted_at` / `submitted_by` | `timestamptz` / `uuid` | Required and immutable |
| `reviewed_at` / `reviewed_by` | `timestamptz` / `uuid` | Null while submitted; both required after approve/reject |
| `review_reason` | `text` | Required trimmed 3-500 characters on reject; optional nonblank note on approve |
| `created_at` | `timestamptz` | Required; no generic `updated_at` |

Table invariants:

- at least one of `source_reference` and `supporting_document_id` is non-null;
- initial requests have no correction target; correction requests have one;
- a resubmission target is a rejected request with the same organization,
  authority key, request kind, and correction target; it is never self, is not
  already resubmitted, and is the immediately preceding rejected request;
- a rejected request has at most one successor through a unique non-null
  `resubmission_of_request_id`; resubmission always creates a new submitted row
  and never changes the rejected row;
- submitted rows have no review fields; reviewed rows have actor/time;
- `reviewed_by <> submitted_by` for approved and rejected requests;
- a rejected request creates no entry and never returns to submitted;
- request business payload, evidence, and submission identity never change;
  the review RPC may update only status and review fields through a private
  transaction-local capability guard;
- `(organization_id, id)` is unique for composite foreign keys.
- only one submitted initial request may exist per authority key, and only one
  submitted correction may exist per `correction_of_entry_id`; partial unique
  indexes enforce both under concurrency;
- `property_owner_id`, `ownership_percent_snapshot`, and
  `ownership_roster_hash` are copied from the successful Track 2.0 date
  validator as a separate immutable server-authority snapshot. They are never
  public RPC arguments and never enter `payload_hash`; the client cannot supply
  an arbitrary share or roster hash.

Required database enforcement includes:

- composite foreign keys proving request organization/property/owner and
  `property_owner_id` scope, not standalone UUID existence;
- check `effective_date = date_trunc('month', effective_date)::date`;
- check `proposed_amount >= 0`, exact `numeric(14,2)` storage, reason/reference
  trim/length, and both hash formats;
- check initial/correction target pairing, status/review-field pairing,
  independent reviewed/submitted actors, and no self-reference for correction
  or resubmission;
- unique non-null `resubmission_of_request_id`;
- partial unique submitted-initial index on the full authority key;
- partial unique submitted-correction index on `correction_of_entry_id`;
- trigger/RPC validation for same-key rejected predecessor and latest-chain
  lineage, which cannot be expressed by a row check alone.

Task 2.1A defines nullable `correction_of_entry_id` plus its row-level kind/null
pairing and submitted-correction uniqueness, but cannot add an entry foreign key
before `owner_opening_balance_entries` exists. Task 2.1B adds the composite
organization/scoped correction-target foreign key and target constraints only
after creating the entry table. No migration uses an unresolved forward
reference or temporarily disables referential enforcement.

pgTAP asserts the complete table ACL matrix: `authenticated` has only `SELECT`;
`anon` and `service_role` have no table privilege; and none of `anon`,
`authenticated`, or `service_role` has `INSERT`, `UPDATE`, `DELETE`, or
`TRUNCATE`. Direct calls to every private helper and public-RPC execution by
`anon`/`service_role` are denied.

Concurrency tests use two database sessions and barriers, not sequential calls,
to prove only one pending initial per authority key, one pending correction per
target, one approval result, one resubmission successor, and one reversal pair.
The losing transaction must return a stable domain/idempotency error without a
partial request or entry.

### Track 2: `owner_opening_balance_entries`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `request_id` | `uuid` | Required FK to approved request, delete restrict |
| `organization_id`, `property_id`, `owner_person_id`, `property_owner_id`, `ownership_percent_snapshot`, `ownership_roster_hash`, `currency`, `effective_date`, `component` | same domain as request | Opening/replacement copies the approved request snapshot; correction reversal copies the exact target-entry snapshot |
| `entry_kind` | `text` | `opening`, `correction_reversal`, or `correction_replacement` |
| `signed_amount` | `numeric(14,2)` | Opening/replacement `>= 0`; reversal `<= 0` and exact negative of target, including explicit zero reversal |
| `reversal_of_entry_id` | `uuid` | Required only for correction reversal; never self; unique |
| `created_at` / `created_by` | `timestamptz` / `uuid` | Required, immutable |

An approved initial request creates exactly one `opening` entry. An approved
correction creates exactly two entries in one transaction: one
`correction_reversal` against the current unreversed authority-bearing
`opening`/`correction_replacement` entry, including `0.00`, and one
`correction_replacement` with the proposed nonnegative amount. The request ID
plus entry kind is unique. There is exactly one `opening` entry per authority
key. An authority-bearing opening/replacement entry can be reversed once. The current opening amount is the
exact sum of all signed entries for the authority key.

Approval re-runs the Task 2.0 validator at the effective date. It requires the
request's `property_owner_id`, explicit share, and roster hash to match the
current validated effective-date roster. If they changed after submission,
approval fails `ownership_roster_changed`, leaves the request submitted, and
creates no entry. The operator must repair ownership or reject/resubmit with a
new snapshot. For a correction, the reversal row preserves the target entry's
old ownership snapshot while the replacement preserves the newly approved
request snapshot; the lineage therefore explains a deliberate roster repair
instead of rewriting the old evidence.

The presence of an approved entry chain establishes knowledge. No row means
unknown; a chain summing to `0.00` means known zero. Consumers MUST return an
explicit `{ state: "unknown" }` rather than `COALESCE(..., 0)` when the chain is
absent.

### Track 3: event allocation and component movement

`owner_event_allocation_sets` records each atomic source exactly once:

- `id`, `organization_id`, `property_id`, `currency`, `event_date`;
- `source_type`, `source_id`, and required `source_line_id` identifying the
  atomic immutable row;
- `gross_signed_amount numeric(14,2)` and `source_fingerprint` lowercase SHA-256;
- `allocation_basis` (`effective_roster` or `explicit_owner`) and optional
  `explicit_owner_person_id` required only for explicit-owner allocation;
- `reversal_of_allocation_set_id` for an exact opposite source, unique and not
  self-referencing;
- `created_at`, `created_by`.

The unique source identity is
`(organization_id, source_type, source_line_id)`. The exact supported
`source_type` registry is:

```text
tenant_rent_receipt
owner_direct_rent_receipt
management_fee_occurrence
owner_paid_cost
owner_invoice_payment
owner_contribution
owner_reimbursement
owner_distribution
security_deposit_receipt
security_deposit_refund
owner_component_transfer
reversal
```

`owner_event_owner_allocations` persists the roster decision:

- `allocation_set_id`, `organization_id`, `property_owner_id`,
  `owner_person_id`, `ownership_percent_snapshot numeric(6,3)`,
  `allocated_gross_signed_amount numeric(14,2)`, and `allocation_order`;
- unique `(allocation_set_id, owner_person_id)` and
  `(allocation_set_id, allocation_order)`;
- allocation totals equal the set gross amount exactly to the cent.

For roster allocations, percentages at the event date must total exactly
`100.000`. Cent remainders are assigned deterministically by largest fractional
remainder, then `property_owners.id` ascending. For explicit-owner sources, one
row receives `100.000`; the checked source identity must match that owner.

`owner_component_movements` stores zero or more component effects per owner
allocation:

- `id`, `organization_id`, `owner_event_owner_allocation_id`, period key,
  `component`, `signed_amount numeric(14,2)`, `movement_order`;
- `reversal_of_movement_id`, unique, exact opposite sign/amount/component/key;
- `created_at`, `created_by`;
- unique `(owner_event_owner_allocation_id, component, movement_order)`.

Direct-owner rent has an owner allocation for statement activity and zero
component movements. It therefore cannot increase IPS-held cash. Security
deposit sources may move only `security_deposit_custody`. An owner distribution
may decrease only `ips_held_owner_cash`. No source may use a report-time plug.

### Track 3: monthly roll-forward

`owner_balance_periods` has one row per period key:

- `id`, period key, `status`, `input_watermark`, `input_hash`;
- `blocked_reason_code`, `blocked_reason_detail` present only when blocked;
- `generated_at`, `generated_by`, `stale_at`, `stale_reason`, and optional
  `closed_revision_id` populated by Track 4;
- unique period key.

`owner_balance_period_components` has exactly four rows for each ready, stale,
or closed period:

- `owner_balance_period_id`, `component`;
- `opening_amount`, `movement_amount`, `closing_amount numeric(14,2)`;
- check `closing_amount = opening_amount + movement_amount`;
- unique `(owner_balance_period_id, component)`.

The first period consumes the approved opening chain at its effective date.
Every later period consumes the immediately preceding closing amount. A period
cannot be ready if any of the four first-period components is unknown, any
source is unallocated/unsupported, ownership is ambiguous, source hashes drift,
or prior continuity is broken. Period `N` closing must equal period `N+1`
opening for all four components and exact owner/property/currency key.

Available withdrawal is a derived checked value, never a stored balance. Only
current `ips_held_owner_cash` can contribute positively. Deposit custody,
`owner_due_to_ips`, and `ips_due_to_owner` never create withdrawable cash merely
by existing. The checked calculation subtracts distributions already committed
and any active reservation represented by canonical sources. Concurrent
withdrawal requests serialize on the same property-period key and cannot make
IPS-held owner cash negative.

### Track 4: close revisions

`owner_close_series` is the mutable orchestration header:

- `id`, period key, `state` (`open`, `preparing`, `closed`, `stale`);
- `active_revision_id`, `current_closed_revision_id`;
- `created_at`, `created_by`, `state_changed_at`, `state_changed_by`;
- unique period key.

`owner_close_revisions` is revisioned authority:

- `id`, `owner_close_series_id`, period key, `revision_number integer > 0`;
- `status` (`preparing`, `closed`, `abandoned`);
- `supersedes_revision_id` for revision `N+1`;
- `reopen_reason`, `prepared_at`, `prepared_by`;
- `input_watermark`, `input_hash`, `content_hash` lowercase SHA-256;
- `closed_at`, `closed_by`, `close_reason`;
- unique `(owner_close_series_id, revision_number)` and one current preparing
  revision per series.

A first close creates preparing revision 1. Reopen creates preparing revision
`N+1` and points to revision `N`; it never updates revision `N`. Closing freezes
lines, hashes canonical content, fills close fields, and changes only the
preparing revision to closed. A trigger rejects every update/delete of a closed
revision and every insert/update/delete of its lines or source links.

`owner_close_lines` stores deterministic frozen presentation/accounting lines:

- `id`, `owner_close_revision_id`, `line_number integer > 0`, `line_kind`,
  `component` nullable only for activity-only lines, `description`,
  `business_date`, `signed_amount numeric(14,2)`, `source_count`;
- unique `(owner_close_revision_id, line_number)`;
- line order is business date, approved source-type rank, source line UUID, then
  component enum order; opening lines come first and closing lines last.

`owner_close_line_sources` links every frozen line back to exact immutable
inputs through `(close_line_id, source_type, source_id, source_line_id,
source_fingerprint)`. One source line cannot be silently omitted or consumed
twice within a revision.

Close readiness requires:

1. the organization month is locked;
2. the target roll-forward period is ready and has four known components;
3. prior-period continuity is valid and no earlier dependent period is stale;
4. all supported owner-affecting atomic sources are allocated exactly once;
5. no unsupported, ambiguous, pending-idempotency, pending opening/correction,
   unreconciled transfer, or evidence-integrity exception exists;
6. source watermark and canonical input hash remain unchanged while the close
   transaction holds the organization-month and property-owner advisory locks.

### Track 4: statement publication

`owner_statement_publications` is immutable:

- `id`, `organization_id`, `owner_close_revision_id`, `statement_number`;
- `content_hash`, `generated_at`, `generated_by`;
- `supersedes_publication_id` nullable, unique when present;
- unique close revision and unique `(organization_id, statement_number)`.

Statement numbers contain no PII and match
`^OS-[0-9]{6}-[0-9A-F]{12}$`, using the close month and a stable uppercase UUID
fragment assigned in the publication transaction. Numbering never reuses or
renumbers a superseded statement.

`owner_statement_artifacts` is immutable:

- `id`, `organization_id`, `publication_id`, `format` (`pdf` or `xlsx`),
  `storage_path`, `sha256`, `size_bytes`, `created_at`, `created_by`;
- unique `(publication_id, format)` and unique storage path;
- artifact bytes are retained permanently; replacement creates a new
  publication/artifact, never an update.

Report loaders accept only `owner_close_revision_id` or publication ID. They
load frozen lines and metadata and MUST NOT query live operational tables to
reconstruct a published statement. PDF and Excel render the same canonical
content model, and repeated generation for the same publication is byte-stable
or returns the retained artifact.

## Ownership And Transfer Invariants

Task 2.0 is a prerequisite migration and executable readiness gate. No opening
table or request RPC may be created until it is independently approved.

For every unarchived `property_owners` row used as financial authority:

- `started_on` is required;
- `ended_on` is null or strictly greater than `started_on`;
- `ownership_percent` is required, greater than `0.000`, and at most `100.000`;
- a stored generated `effective_range daterange` uses
  `daterange(started_on, ended_on, '[)')`;
- a GiST exclusion constraint rejects overlapping unarchived ranges for the
  same `(organization_id, property_id, person_id)`;
- effective membership is `started_on <= p_effective_date` and
  `(ended_on IS NULL OR p_effective_date < ended_on)`;
- every active roster share on the requested property/date is explicit and the
  exact sum is `100.000`.

There is no sole-owner exception. One active owner with a null share is not
treated as `100.000`; one active owner with `99.999` is not rounded to 100; and
`is_primary` never supplies or overrides a share. Existing rows that fail the
new constraints must be corrected explicitly in the guarded local fixture or
surfaced as remediation data before constraint validation. The migration must
not backfill `100.000` merely because only one active row is found.

Task 2.0 creates one non-public date validator with this interface:

```sql
app_private.validate_owner_roster_on_date(
  p_organization_id uuid,
  p_property_id uuid,
  p_effective_date date
) returns table (
  property_owner_id uuid,
  owner_person_id uuid,
  ownership_percent numeric(6,3),
  started_on date,
  ended_on date,
  ownership_roster_hash text
);
```

The validator checks property/organization scope, excludes archived rows,
requires at least one row, validates every half-open interval/share, and asserts
the sum is exactly `100.000`. The roster hash input is UTF-8 bytes of rows sorted
by lowercase hyphenated `property_owner_id`, each serialized exactly as
`property_owner_id|owner_person_id|ownership_percent(three decimals)|started_on(YYYY-MM-DD)|ended_on(YYYY-MM-DD or empty)` and joined with a single LF, with
no trailing LF. UUIDs are lowercase hyphenated text; dates are ISO text; shares
are fixed three-decimal strings. One lowercase SHA-256 of those bytes is copied
to every returned row. It never defaults, normalizes, or rounds a missing share.

Task 2.0 also ships a read-only legacy preflight query and report command. For
each property it evaluates every interval beginning at an ownership `started_on`
or non-null `ended_on`, plus an explicitly supplied candidate cutover date. It
reports source row IDs and typed issues for null dates/shares, invalid or empty
intervals, same-person overlap, inactive owner persons, an empty roster, and
each interval whose exact active-share total differs from `100.000`. It prints
the canonical roster serialization/hash when valid, a deterministic issue JSON
hash, and never writes or proposes a sole-owner default.

The pre-migration command must work against the clean pre-Task-2.0 baseline. It
executes a self-contained read-only SQL/CTE over the existing `property_owners`,
`properties`, and `people` schema; it must not call, probe, or assume the later
helper exists. Its contract is
`node scripts/report-owner-roster-preflight.mjs --target local --cutover
YYYY-MM-DD --out <path>`; any later hosted target requires explicit hosted-read
approval and a named project.

Task 2.0 then installs
`app_private.owner_roster_legacy_preflight(p_cutover_date date)`, a reusable
`STABLE`, non-`SECURITY DEFINER`, non-Data-API helper callable only by the
migration owner. Both paths return one row per property/boundary/issue with
`organization_id`,
`property_id`, `boundary_date`, nullable `next_boundary_date`, `issue_code`,
sorted `property_owner_ids uuid[]`, `active_owner_count`,
`ownership_percent_total numeric(9,3)`, nullable canonical serialization, and
nullable `ownership_roster_hash`. JSON rows are sorted by organization, property,
boundary, issue, and owner IDs before their lowercase SHA-256 report hash. Both
consume `scripts/fixtures/owner-roster-preflight-vectors.json` as shared
deterministic expected rows and canonical/report hashes. Acceptance first runs
the script
before the migration/helper exists and proves zero writes; after installation it
runs the same vectors through both paths and requires byte-identical normalized
rows, canonical roster hashes, and report hashes.

The hosted ownership migration is gated on a separately approved read-only
preflight against the named project, followed by an operator-approved remediation
manifest for every issue. The migration may proceed only when a rerun is clean
and its report hash is recorded. Neither Task 2.0 nor any later migration may
silently backfill legacy `started_on`, `ended_on`, or `ownership_percent`; a
non-clean hosted preflight blocks hosted migration application.

A checked Finance-readable remediation RPC/view exposes typed issues without
writing ownership:

```text
owner_roster_missing
owner_start_missing
owner_interval_invalid
owner_interval_overlap
owner_share_missing
owner_share_invalid
owner_share_total_not_100
owner_person_inactive
```

Each issue includes organization, property, optional `property_owner_id`,
effective date, observed share total, and a direct owner/property setup target.
Only existing Super Admin ownership setup authority can repair it. Finance roles
may inspect the issue but cannot write `property_owners`.

The current `app_private.sync_property_primary_owner` path inserts a primary
owner without `ownership_percent` and uses implicit `current_date` boundaries.
Task 2.0 must replace that carried-forward writer and its property action/form
contract so selecting an owner requires an explicit ownership start date and
explicit decimal share. The UI must not prefill `100.000`. A same-day
replacement that would create an empty `[date,date)` interval is rejected or
handled through an explicit correction that removes the never-effective row;
it is never stored as a zero-length ownership interval. `is_primary` remains a
contact/display choice, not a financial allocation shortcut.

Track 2 opening submission calls this validator, selects the exact owner row,
and persists its `property_owner_id`, explicit share, and whole-roster hash on
both request and approved entries. Subsequent ownership edits never rewrite the
snapshot.

Track 3 must remove every inclusive-ended or current-primary-owner resolver
from event allocation, existing balance projections, roll-forward, and
withdrawal-capacity paths before those paths can consume this authority.
Existing projections remain explicitly non-authoritative during Track 2 and
cannot be cited as Track 2 completion.

An ownership transfer with unsettled amounts creates explicit
`owner_component_transfer` allocation sets per component, from owner and to
owner, with a reason, effective date, evidence, and equal opposite movements.
Absent transfer instructions, balances remain with the original owner and the
new period is blocked for remediation; the system never assumes a transfer.

## Evidence And Document Integrity

Opening evidence may be a private Nestory document, a source reference, or both.
Reference-only submissions remain valid so fixture and migration rehearsals do
not invent Storage objects. The submission must carry a SHA-256 of the exact
source snapshot used to derive the amount.

Task 2.2A adds nullable `documents.content_sha256 text` with a lowercase 64-hex
check. Existing document rows remain null and cannot be selected as opening
evidence until their bytes are deliberately re-read/re-uploaded through a
checked fingerprint workflow. The migration MUST NOT populate a content hash
from file name, path, size, ETag, Storage metadata, or an unverified client
claim.

The checked document create/fingerprint path accepts `p_content_sha256`, and the
server action computes SHA-256 from the exact file bytes before upload. Opening
submission requires:

```text
p_evidence_sha256 = documents.content_sha256
```

as well as the scope/object/category/archive checks below. The database can
prove equality to immutable document metadata and can prevent later replacement;
it cannot independently re-hash Supabase Storage object bytes inside ordinary
PostgreSQL. That limitation must be stated in the UI/report and verified at the
application upload boundary. A local integration test that actually uploads an
object must download/read it and compare the bytes to `content_sha256`; a
metadata-only fixture must use reference evidence instead.

`content_sha256` is immutable once non-null. A checked one-time legacy
fingerprint may change null to the hash of bytes actually downloaded and read;
after that, neither metadata RPC nor direct DML can change or clear it. Replacing
file bytes always creates a new document row and object; it never mutates a
fingerprinted row. A financially referenced document is additionally locked
against archive/delete and retains its row and bytes permanently.

Task 2.2A must replace or harden every legacy `create_document` and
`update_document` signature so no executable overload can omit the hash or
replace fingerprinted bytes. Creation with bytes requires the checked hash;
update is metadata-only and preserves storage identity, size, and hash. Old
overloads are dropped or have execute revoked before the new grant is made.
Existing direct `documents` grants are narrowed: revoke `INSERT`, `UPDATE`,
`DELETE`, and `TRUNCATE` from `PUBLIC`, `anon`, `authenticated`, and
`service_role`; no Track 2 `service_role` document writer exists. Preserve only
the existing organization-scoped authenticated read path. Storage update/delete
policies call the fingerprint/financial lock so a fingerprinted object's bytes
cannot be replaced or removed and a financially referenced document cannot be
archived or deleted. pgTAP and action tests enumerate legacy overloads, ACLs,
null-to-hash once-only behavior, hash immutability, new-row replacement, and
referenced-row retention.

For a supporting document, the checked submit RPC verifies:

- document organization and property match the request;
- its storage path begins with the organization prefix;
- the private `nestory-documents` object exists;
- its category is `owner_opening_balance_evidence`;
- it is not archived;
- `documents.content_sha256` is non-null and equals the submitted lowercase
  64-hex `p_evidence_sha256`.

Once referenced by a submitted or approved opening request, document metadata
and Storage bytes are locked from replacement, archive, and deletion. The
existing expense-evidence lock must be generalized or complemented so storage
policies call one financial-evidence predicate covering both expense and owner
opening evidence. A rejected request releases the lock only if no submitted or
approved request references the same document. Approved evidence is permanent.

For reference-only evidence, `evidence_sha256` is the fingerprint of the exact
external extract/manifest row retained by the migration operator. Nestory
stores and compares that fingerprint but cannot prove the external bytes still
exist. The UI calls this **Source snapshot fingerprint**, never **Verified file**.

Upload and submission are two transactions. If upload succeeds and submit
fails, the action reports the failure and may remove only the newly uploaded,
still-unreferenced object/metadata. It never removes pre-existing or referenced
evidence. Signed URLs are read conveniences and never evidence identity.

## Idempotency, Fingerprints, And Lock Order

Every submit, review, reject, correction, allocation, roll-forward, close,
reopen, and publication command is payload-idempotent. Reuse
`app_private.claim_financial_idempotency` and
`app_private.complete_financial_idempotency`; do not create a second request
table.

Canonical payload hashes contain only the public arguments of that RPC:
normalized UUID text, enum values, ISO dates, canonical two-decimal amount
strings, trimmed reason/reference text, evidence/document arguments,
resubmission/correction identities, and sorted public arrays. Operation name and
authenticated actor are separate parts of the existing financial-idempotency
identity. Server-resolved `property_owner_id`, share, roster hash, document
metadata, current roster, and month-lock state never enter the payload hash.
They are validated and stored only for a first execution. An exact completed
replay returns original result IDs even if the roster/document state later
changes or the effective month is later locked. Reusing a key with a different
actor or public payload fails `22023` and creates no effect.

Each RPC first authenticates and authorizes organization scope, canonicalizes
its public arguments, and calls `app_private.get_financial_idempotency_replay`.
A completed exact replay returns the original IDs immediately, before ownership
roster validation, document existence/content-hash revalidation, current-target
resolution, or any open-month assertion. A conflict fails immediately. A
missing or pending replay continues through mutable authority validation and
serialization.

Task 2.2B creates this private lock helper and no caller duplicates its keys:

```sql
app_private.lock_owner_opening_property_month(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
) returns void
```

It first calls the existing non-open-checking
`app_private.lock_property_financial_month` with the same arguments, then takes
`pg_advisory_xact_lock(hashtextextended(concat_ws(':',
'owner_opening_property_month_v1', p_organization_id::text,
p_property_id::text, p_currency::text,
date_trunc('month', p_effective_date)::date::text), 0))`. The helper is owned by
`postgres`, has `SET search_path TO ''`, and revokes execute from `PUBLIC`,
`anon`, `authenticated`, and `service_role`.

The mandatory new-request lock order is:

1. completed-replay/conflict lookup using the canonical payload;
2. `lock_owner_opening_property_month`, whose internal order is the existing
   `financial_month_v1` organization-month key first and
   `owner_opening_property_month_v1`
   second;
3. open-month assertion when the decision can create or replace authority;
4. `pg_advisory_xact_lock(hashtextextended(concat_ws(':',
   'owner_opening_authority_v1', organization_id::text, property_id::text,
   owner_person_id::text, currency::text, effective_date::text,
   component::text), 0))`;
5. financial idempotency claim;
6. request/source/domain rows in stable UUID order;
7. Track 3/4 projection, roll-forward, or close rows only in those later tracks.

Initial submit, correction submit, and approval require the effective month to
be open. Rejection is serialized on the same organization/property/month keys
but deliberately skips the open-month assertion because it creates no opening
entry and must remain possible after an operational lock. An exact completed
submit/approve/correction/reject replay returns its original IDs regardless of
the later lock state. A new approval attempted after lock leaves the request
submitted and creates no entry. A new correction submission attempted after
lock creates no request.

The review RPC resolves the immutable request and canonical replay identity,
then branches on `p_decision`: `approve` follows the open-month path; `reject`
follows serialized-no-open. It must not call a helper whose unconditional open
check makes locked-month rejection impossible. Track 4 close uses the exclusive
organization-month boundary and rechecks the input hash after acquiring all
locks.

## Cutover And Month Behavior

- Opening `effective_date` is the first day of a calendar month.
- Track 2 may establish local authority before Track 9 defines the hosted IPS
  cutover batch, but it may not call that date the official IPS cutover.
- Track 9 must match each imported opening key to an approved entry chain and
  exact evidence hash. A mismatch blocks cutover activation.
- Historical rent recovery remains selected-month explicit. Opening authority
  does not generate missing rent invoices or imply adjacent-month recovery.
- Initial/correction approval is allowed only while the effective month is
  operationally open and before a close revision consumes the key.
- After any close consumes the opening chain, correction requires Track 4
  reopen/revision `N+1`; the old revision and publication remain retained.
- Reopening an earlier month marks every later period for the same
  property-owner-currency key stale. No later statement can be republished
  until deterministic re-roll and re-close complete in order.

## Checked RPC Contract

Track 2 public signatures are fixed as follows; generated migration timestamps
are chosen only by `npx supabase migration new`:

```sql
public.submit_owner_opening_balance(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_effective_date date,
  p_component public.owner_balance_component,
  p_amount numeric,
  p_reason text,
  p_source_reference text,
  p_supporting_document_id uuid,
  p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,
  p_idempotency_key text
) returns jsonb;

public.review_owner_opening_balance(
  p_organization_id uuid,
  p_request_id uuid,
  p_decision text,
  p_review_reason text,
  p_idempotency_key text
) returns jsonb;

public.submit_owner_opening_balance_correction(
  p_organization_id uuid,
  p_entry_id uuid,
  p_replacement_amount numeric,
  p_reason text,
  p_source_reference text,
  p_supporting_document_id uuid,
  p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,
  p_idempotency_key text
) returns jsonb;
```

`p_decision` accepts only `approve` or `reject`. The review RPC returns the
request ID and created entry IDs. Rejection returns an empty entry list.
Correction submission derives all authority-key fields from the target entry;
the client cannot repoint a correction to another owner/property/component.
Initial and correction submission validate `p_resubmission_of_request_id`
against the rejected predecessor rules above. Null means a new chain. A request
for the same key/kind after a rejection must name the latest rejected request;
it cannot silently abandon rejected history. The RPC returns both the new
request ID and its predecessor ID.

Read access uses security-invoker views or checked read RPCs that preserve
unknown explicitly. No view may bypass RLS. New tables exposed through the Data
API receive only the minimum `SELECT` grant plus RLS; write grants remain absent.

## Application Contract

Create one feature boundary under `src/features/owner-balances`:

- `owner-balance.types.ts` owns canonical decimal strings, components, request
  states, readiness blockers, and exhaustive labels;
- `owner-balance.money.ts` validates/canonicalizes decimal text without binary
  floating point;
- `actions.ts` uses capability-specific contexts and exact RPCs;
- `data/opening-balances.ts` maps database decimal strings without `Number`;
- `components/opening-balance-screen.tsx` renders the submission/review queue,
  component completeness, evidence links, and blocked ownership states;
- after each public RPC signature exists and generated types are refreshed,
  `src/types/database.ts` must override numeric RPC arguments/results so
  authoritative owner-opening amounts are decimal `string`; generated
  `number` types must not be accepted at the action/data boundary;
- `components/owner-balance-ledger.tsx`, existing balance projection changes,
  event allocation, roll-forward, and withdrawal availability are Track 3 only.

During Track 2, `/balances` adds an explicitly labelled **Opening authority**
queue/completeness view. It renders `Unknown` for missing authority and `$0.00`
only for an approved zero. It does not relabel the current all-time property
projection as authoritative, derive available withdrawal, assign today's
primary owner to historical rows, or modify the current projection. Track 3
must replace/retire that projection only after event allocation and roll-forward
acceptance.

Zod/form parsing must validate the original amount string with an exact decimal
regular expression and canonical string helper. It must not use `z.coerce.number`,
`Number`, unary `+`, `parseFloat`, arithmetic on a JavaScript number, or a
generated Supabase numeric type that aliases the owner-opening amount to
`number`. Tests include a source scan and runtime value above JavaScript's exact
integer range in cents.

Required UI language is: **Opening balance**, **Submit opening balance**,
**Approve opening balance**, **Request correction**, **Known zero**,
**Ownership needs resolution**, **Close owner month**, and **Published
statement**. Do not use generic **Adjust balance**, **Set balance**, or **Owner
payment** for multiple D8 event types.

## Failure Contract

All failures are atomic and preserve the source request. Tests assert SQLSTATE
and stable message fragments for:

- `22023`: invalid amount scale, malformed hash/reference/reason, conflicting
  idempotency payload, invalid status transition, self-review;
- `42501`: wrong role, unaffiliated/cross-organization access, direct DML,
  closed/reopen/publish authority denial;
- `23503`: missing/cross-scope property, owner, document, request, source, or
  correction target;
- `23505`: duplicate initial authority, repeated reversal, duplicate source
  allocation, duplicate revision/publication/artifact identity;
- domain failures with explicit text: financial month locked, ownership
  ambiguous, ownership percentages incomplete, component unknown, source
  unsupported, prior period stale, dependent distribution exists, evidence
  missing or changed, and close input changed concurrently.

No failure may fall back to zero, a primary-owner guess, a report plug, direct
table DML, or a Super Admin impersonation actor.

## Sequential Implementation Tasks

### Task 2.0: Opening-ownership readiness

Create a CLI-generated `owner_opening_ownership_readiness` migration and focused
pgTAP. Add the half-open range, unarchived overlap exclusion, explicit positive
share constraints, exact-100.000 date validator, canonical roster hash, and
Finance-readable remediation surface. Add the deterministic read-only legacy
preflight query/command, issue/report hashes, and hosted clean-report/remediation
gate. The command runs its self-contained baseline SQL before the helper exists,
then proves identical shared-vector output after helper installation. Replace
the current primary-owner sync
writer/action/form so start/share are explicit and never prefilled. Correct
fixture ownership explicitly; never infer sole-owner `100.000`. No
opening-balance table exists in this task.

### Task 2.1A: Opening request schema

Create a CLI-generated `owner_opening_balance_request_schema` migration. Add the
component type and request table with exact authority/ownership/evidence
snapshots, `resubmission_of_request_id`, request/status pairing, partial unique
submitted-request indexes, composite scope keys, and required constraints.
Add failing-then-green structure and concurrency pgTAP. No public mutation RPC
or approved entry table exists yet. Explicitly assert that `authenticated` has
read only, while `anon` and `service_role` have no table access and all three
application roles lack every table mutation privilege.
Define `correction_of_entry_id` without its future entry FK in this task; retain
the kind/null and uniqueness rules that do not require the entry table.

### Task 2.1B: Approved entry schema, capabilities, and immutable access

Create a CLI-generated `owner_opening_balance_entry_authority` migration. Add
the signed entry table, initial/reversal/replacement uniqueness, including a
reversible `0.00` authority-bearing row, immutable guards, explicit capabilities
and contexts, RLS/read policy, complete anon/authenticated/service-role ACL and
direct-DML denial, and generated schema types. Do not add handwritten RPC
overrides before the RPC signatures exist. No public workflow RPC exists.
After creating the entry table, add the request-to-entry composite correction
target FK and same-scope/target constraints deferred by Task 2.1A.

### Task 2.2A: Verifiable document fingerprint and evidence lock

Create a CLI-generated `owner_opening_evidence_fingerprints` migration. Add
nullable checked `documents.content_sha256`, exact-byte hashing create/one-time
legacy fingerprint plumbing, hash and byte immutability, new-row-only file
replacement, opening-evidence category/scope/object/hash equality, generalized
evidence lock, narrowed direct document grants, and honest Storage limitations.
Drop/revoke every bypassing legacy `create_document`/`update_document` overload.
Prove existing null-hash documents are ineligible, old signatures/direct grants
cannot bypass hashing, and reference-only evidence does not invent Storage.

### Task 2.2B: Submit, reject, and resubmit workflow

Create a CLI-generated `owner_opening_submit_reject_resubmit` migration. Add
the private ordered property/currency/month lock helper, initial submission and
rejection/resubmission paths, roster snapshot resolution separate from public
payload identity, completed replay before roster/document/open checks,
open-month submit, serialized locked-month rejection, payload idempotency,
activity, five-role/cross-org/direct-DML tests, and concurrent one-pending-request
proof. Generate types after the RPC names exist, then add only the required
decimal-string overrides in `src/types/database.ts`. No correction submission,
approval, or entry creation exists yet. Two-session pgTAP must prove same
organization/month calls serialize on the existing first key, same property
scope shares the second key, distinct property/currency/month inputs produce
distinct second-key hashes, and different organization/month scopes can proceed
independently.

### Task 2.2C: Approval and append-only correction authority

Create a CLI-generated `owner_opening_approval_correction` migration. Complete
the initial review approval branch first so an authority-bearing entry exists;
then add correction submission and correction approval. Enforce independent
actors, open-month requirements, exact entry creation, current unreversed
opening/replacement correction including `0.00`, reversal plus replacement,
completed replay before mutable roster/document/target/open checks, concurrency,
and stale-target denial. Regenerate types after all signatures exist and extend
the decimal-string overrides. Rejection behavior from 2.2B must remain possible
while locked.

### Task 2.3A: Exact-decimal application boundary and loaders

Implement canonical string money, Zod validation without numeric coercion,
capability-specific server actions, consume and verify the generated RPC names
and `src/types/database.ts` string overrides created with Tasks 2.2B/2.2C,
request/entry/readiness loaders, unknown/known-zero mapping, and action/data
tests. No existing balance projection, allocation,
roll-forward, withdrawal capacity, close, or report code changes.

### Task 2.3B: Opening authority and evidence UI

Implement the role-specific `/balances` **Opening authority** queue,
component-completeness view, ownership remediation, evidence upload/select/
reference workflow, safe orphan cleanup, resubmission/correction history,
unknown/known-zero copy, accessibility, and route/component tests. Keep the
current balance projection separate and explicitly non-authoritative.

### Task 2.4: Fixture and reconciliation acceptance

Extend the guarded local fixture through checked RPCs with one owner/property,
an explicitly valid roster, all four components including a known zero, one
rejected-then-resubmitted request, and one approved correction from a current
authority-bearing `0.00` entry. Add a deterministic reconciliation smoke that
compares approved component totals, `property_owner_id`, share snapshot, roster
hash, request lineage, and evidence hashes with a checked local manifest. Do not
create fake Storage bytes; use reference evidence unless the test actually
uploads and re-reads an object.

Each numbered/lettered task is a separate commit, implementation report, fresh read-only review,
and root-agent acceptance gate. Track 3 may not start until Task 2.4 is approved
from current HEAD.

## Required Verification

Focused Track 2 acceptance includes:

```powershell
npx supabase test db --local supabase/tests/owner_opening_ownership_readiness_test.sql supabase/tests/owner_opening_balance_authority_test.sql supabase/tests/owner_opening_balance_workflow_test.sql supabase/tests/owner_opening_balance_reconciliation_test.sql
npx vitest run src/features/owner-balances src/lib/auth/capabilities.test.ts
npm run test:fixture-owner-opening-balances
```

Every task also runs the applicable complete local matrix:

```powershell
npm run db:reset
npm run db:test:fixture
npm run db:lint
npx supabase test db --local supabase/tests
npx supabase db advisors --local --level error --fail-on error --output-format json
npx tsc --noEmit
npm run lint
npm run test:all
npm run test:ui-coverage
npm run test:ui-copy
npm run build
git diff --check
git status --short --branch
```

Acceptance must prove at least:

- all five roles, unaffiliated users, cross-organization users, anon, direct
  table DML, public/private function grants, and RLS;
- exact amount scale and string typing, canonical idempotency replay/conflict,
  concurrent pending submission/approval/correction, and no JavaScript numeric
  coercion;
- exact public-argument-only replay identity, with an original-ID replay after
  both a roster change and month lock and no new request/entry or mutable-state
  validation; different public argument, operation, key, or actor must conflict
  or authorize independently as specified;
- half-open transfer-date ownership, same-person overlap exclusion, missing/
  zero/negative percentage, exact total below/above `100.000`, deterministic
  `property_owner_id`/share/roster hash snapshots, and no sole-owner default;
- missing evidence/object, wrong organization/property document, archive,
  null/mismatched `documents.content_sha256`, actual uploaded-byte hash equality,
  legacy RPC/direct-grant bypass denial, once-only null fingerprint, immutable
  non-null hash/bytes, new-row replacement, replacement/delete lock, honest
  reference-only hash limits, and upload cleanup after failed submit;
- read-only legacy ownership preflight coverage at every interval boundary and
  supplied cutover date, successful execution before the Task 2.0 helper exists,
  shared deterministic fixture vectors, zero-write proof, byte-identical rows
  and canonical/report hashes between baseline SQL and post-migration helper,
  no silent backfill, and a blocking hosted remediation gate;
- initial approve/reject, self-review denial, duplicate authority, known zero,
  unknown, new submit/approve/correction denial while locked, locked-month reject,
  completed replay after lock, rejected resubmission lineage and concurrency,
  roster/share/hash change between submit and approve with reject/resubmit,
  correction of the current authority-bearing entry including `0.00`, repeated/
  stale correction denial, and original-row retention;
- one manifest-to-approved-components reconciliation with exact cents and
  evidence hashes.

## Forbidden Scope

- No one-scalar owner balance, floating-point money, inferred zero, primary-owner
  `LIMIT 1`, report-time allocation, or report-time opening/closing plug.
- No custom role, permission table, generic approval engine, journal, chart of
  accounts, accounts payable, bank reconciliation, or second currency.
- No edit, replacement, or relabeling of existing balance projections in Track
  2. Event allocation, roll-forward, current-balance derivation, available
  withdrawal, held-cash guards, safe correction delegation, projection
  retirement, and owner-balance Ledger are entirely Track 3.
- No close/publication code before Track 3 source coverage and continuity are
  approved.
- No migration filename invented by hand; use the Supabase CLI and record the
  generated filename in each report.
- No direct authenticated table write, broad `TO authenticated` authorization,
  direct `service_role` opening-authority write, public executable private
  helper, user-metadata authorization, or RLS-bypassing view.
- No fake document or Storage object, evidence deletion, mutation of an approved
  request/entry, or rewrite of a closed revision/publication.
- No `documents.content_sha256` fabricated from path/name/size/ETag/metadata and
  no claim that PostgreSQL independently hashed Storage bytes.
- No hosted Supabase/Vercel/email/storage/IPS-data access, push, merge, or deploy
  without the later explicit hosted-mutation approval boundary.

## Track Completion Boundaries

Track 2 is complete only when an independently reviewed local example can be
reconstructed from its evidence, all four components distinguish unknown from
known zero, correction retains the original approved chain, and the full local
matrix passes from a clean reset.

Track 3 is complete only when every supported source type is allocated or
visibly blocked, multi-month roll-forward reconciles exactly, all owner-cash
reversals are symmetric, and Finance Manager safe correction cannot create
negative held cash or orphan a distribution.

Track 4 is complete only when a closed revision is immutable, reopen/re-close
creates and publishes `N+1` without changing `N`, later periods stale and
recover deterministically, PDF/Excel artifacts match the frozen content hash,
and one redacted statement reconciles line by line with zero unexplained
difference.
