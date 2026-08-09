# Owner Balance And Close Authority Specification

**Date:** 2026-08-09

**Status:** Approved design authority for Tracks 2-4

**Decision authority:** IPS approved D1-D14 on 2026-08-09. This specification freezes D1-D12 and applies the D13-D14 separation-of-duties boundary without broadening Finance Manager authority.

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
| Read opening requests, approved components, allocation exceptions, roll-forward, close readiness, and published statements | Allow | Allow | Allow where existing Finance read authority allows | Deny |
| Submit initial opening request | Allow, but cannot review own request | Deny | Allow | Deny |
| Submit correction request | Allow, but cannot review own request | Allow, but cannot review | Allow | Deny |
| Approve or reject opening/correction request | Allow only, and reviewer must differ from submitter | Deny | Deny | Deny |
| Upload/select opening evidence | Existing checked document authority only; reference-only submission remains supported | Select readable evidence/reference only | Select readable evidence/reference only | Deny |
| Inspect close readiness and reconciliation | Allow | Allow | Read-only queue context | Deny |
| Generate/recompute open-period allocations and roll-forward | Checked private/system path | Checked private/system path only through an allowed ordinary operation or explicit readiness runner | Deny | Deny |
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
`authenticated` only through organization-scoped Finance read policies, revoke
authenticated `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE`, and reserve all writes
for checked RPCs. Every public RPC is `SECURITY DEFINER SET search_path TO ''`,
checks `auth.uid()`, organization membership and its exact capability, revokes
`PUBLIC`, and grants execute only to `authenticated`. Private helpers are never
executable by `authenticated`.

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
| `currency` | `currency_code` | Required; `USD` in current product |
| `effective_date` | `date` | Required; first day of a calendar month |
| `component` | `owner_balance_component` | Required |
| `request_kind` | `text` | `initial` or `correction` |
| `proposed_amount` | `numeric(14,2)` | Required, `>= 0`; `0.00` is valid known zero |
| `correction_of_entry_id` | `uuid` | Null for initial; required for correction; targets an unreversed positive opening/replacement entry with the same authority key |
| `status` | `text` | `submitted`, `approved`, or `rejected` |
| `reason` | `text` | Trimmed 3-500 characters |
| `source_reference` | `text` | Optional trimmed 3-240 characters |
| `supporting_document_id` | `uuid` | Optional FK to `documents`, delete restrict |
| `evidence_sha256` | `text` | Required lowercase 64-hex hash of the submitted source snapshot/file bytes |
| `payload_hash` | `text` | Required lowercase 64-hex canonical request fingerprint |
| `submitted_at` / `submitted_by` | `timestamptz` / `uuid` | Required and immutable |
| `reviewed_at` / `reviewed_by` | `timestamptz` / `uuid` | Null while submitted; both required after approve/reject |
| `review_reason` | `text` | Required trimmed 3-500 characters on reject; optional nonblank note on approve |
| `created_at` | `timestamptz` | Required; no generic `updated_at` |

Table invariants:

- at least one of `source_reference` and `supporting_document_id` is non-null;
- initial requests have no correction target; correction requests have one;
- submitted rows have no review fields; reviewed rows have actor/time;
- `reviewed_by <> submitted_by` for approved and rejected requests;
- a rejected request creates no entry and never returns to submitted;
- request business payload, evidence, and submission identity never change;
  the review RPC may update only status and review fields through a private
  transaction-local capability guard;
- `(organization_id, id)` is unique for composite foreign keys.

### Track 2: `owner_opening_balance_entries`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `request_id` | `uuid` | Required FK to approved request, delete restrict |
| `organization_id`, `property_id`, `owner_person_id`, `currency`, `effective_date`, `component` | same as request | Required immutable copy; exact equality to request enforced by checked RPC and trigger |
| `entry_kind` | `text` | `opening`, `correction_reversal`, or `correction_replacement` |
| `signed_amount` | `numeric(14,2)` | Opening/replacement `>= 0`; reversal `<= 0` and exact negative of target, including explicit zero reversal |
| `reversal_of_entry_id` | `uuid` | Required only for correction reversal; never self; unique |
| `created_at` / `created_by` | `timestamptz` / `uuid` | Required, immutable |

An approved initial request creates exactly one `opening` entry. An approved
correction creates exactly two entries in one transaction: one
`correction_reversal` against the current unreversed positive entry and one
`correction_replacement` with the proposed nonnegative amount. The request ID
plus entry kind is unique. There is exactly one `opening` entry per authority
key. A positive entry can be reversed once. The current opening amount is the
exact sum of all signed entries for the authority key.

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

Before Track 2 approval can consume an owner roster:

- `property_owners.started_on` is non-null for every active financial owner;
- `ended_on` is null or strictly greater than `started_on`;
- effective membership is `started_on <= event_date` and
  `(ended_on IS NULL OR event_date < ended_on)`;
- duplicate/overlapping intervals for the same property/person are rejected;
- all active roster percentages are non-null, greater than zero, at most 100,
  and sum to exactly `100.000` at the effective date;
- archived rows are excluded;
- `is_primary` may control contact/display only and MUST NOT select financial
  authority with `ORDER BY ... LIMIT 1`.

Track 2 must add a half-open range contract and change its own queries. Track 3
must remove every inclusive-ended current-owner resolver from owner allocation
and balance paths before event allocation acceptance. Existing product views
that still use `ended_on >= date` are contradictory evidence and cannot be cited
as Track 3 completion.

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

For a supporting document, the checked submit RPC verifies:

- document organization and property match the request;
- its storage path begins with the organization prefix;
- the private `nestory-documents` object exists;
- its category is `owner_opening_balance_evidence`;
- it is not archived;
- the submitted byte hash is lowercase 64-hex.

Once referenced by a submitted or approved opening request, document metadata
and Storage bytes are locked from replacement, archive, and deletion. The
existing expense-evidence lock must be generalized or complemented so storage
policies call one financial-evidence predicate covering both expense and owner
opening evidence. A rejected request releases the lock only if no submitted or
approved request references the same document. Approved evidence is permanent.

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

Canonical payloads use normalized UUID text, enum values, ISO dates, canonical
two-decimal amount strings, trimmed reason/reference text, evidence hashes, and
sorted arrays. An exact completed replay returns original result IDs. Reusing a
key with a different actor or payload fails `22023` and creates no effect.

The mandatory write lock order is:

1. organization-month advisory lock;
2. property/currency/month advisory lock;
3. owner/authority-key advisory lock where applicable;
4. financial idempotency claim;
5. request/source/domain rows in stable UUID order;
6. projection/roll-forward/close rows.

Opening submit/review/correction uses the month containing `effective_date` and
`app_private.lock_open_property_financial_month` before claiming idempotency.
If the month becomes locked, an unreviewed request remains submitted and review
fails without entries. Track 4 close uses the exclusive organization-month
boundary and rechecks the input hash after acquiring all locks.

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
  p_idempotency_key text
) returns jsonb;
```

`p_decision` accepts only `approve` or `reject`. The review RPC returns the
request ID and created entry IDs. Rejection returns an empty entry list.
Correction submission derives all authority-key fields from the target entry;
the client cannot repoint a correction to another owner/property/component.

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
- `components/owner-balance-ledger.tsx` is added only in Track 3 and consumes
  persisted allocations/periods, not live report reconstruction.

`/balances` must display four distinct component columns plus derived available
withdrawal. It must render `Unknown` for missing authority and `$0.00` only for
an approved zero. It must never assign today's primary owner to historical rows.

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

### Task 2.1: Schema and executable contracts

Create migrations only through:

```powershell
npx supabase migration new owner_opening_balance_schema_contracts
```

Implement the component enum, request/entry tables, half-open opening-ownership
checks, immutable-row guards, capability contract, minimum RLS/grants, and
failing-then-green pgTAP structure/denial tests. Do not add public mutation RPCs
until the schema contract is independently reviewed.

### Task 2.2: Submit, review, correction, and evidence locking

Create the workflow migration only through:

```powershell
npx supabase migration new owner_opening_balance_workflows
```

Add the three public RPCs, private checked helpers, idempotency, month
serialization, reviewer separation, approved entry creation, correction
reversal/replacement, evidence integrity/locking, activity logs, and complete
allow/deny/RLS/Storage pgTAP matrix.

### Task 2.3: Application and evidence workflow

Implement exact-decimal types/actions/loaders, `/balances` opening queue,
role-specific controls, upload rollback behavior, evidence links, unknown/zero
copy, ownership blockers, component completeness, and action/component/route
tests. Do not implement roll-forward or Owner Statement presentation here.

### Task 2.4: Fixture and reconciliation acceptance

Extend the guarded local fixture through checked RPCs with one owner/property,
all four explicit components including a known zero, one rejected request, and
one approved correction chain. Add a deterministic reconciliation smoke that
compares the approved component totals and evidence hashes with a checked local
manifest. Do not create fake Storage bytes; use reference evidence unless the
test actually uploads an object.

Each task is a separate commit, implementation report, fresh read-only review,
and root-agent acceptance gate. Track 3 may not start until Task 2.4 is approved
from current HEAD.

## Required Verification

Focused Track 2 acceptance includes:

```powershell
npx supabase test db --local supabase/tests/owner_opening_balance_authority_test.sql supabase/tests/owner_opening_balance_workflow_test.sql supabase/tests/owner_opening_balance_reconciliation_test.sql
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
- exact amount scale, canonical idempotency replay/conflict, and concurrency;
- half-open transfer-date ownership, overlap, missing percentage, and total not
  equal to 100.000;
- missing evidence/object, wrong organization/property document, archive,
  replacement/delete lock, and upload cleanup after failed submit;
- initial approve/reject, self-review denial, duplicate authority, known zero,
  unknown, locked-month review, correction of current entry, repeated/stale
  correction denial, and original-row retention;
- one manifest-to-approved-components reconciliation with exact cents and
  evidence hashes.

## Forbidden Scope

- No one-scalar owner balance, floating-point money, inferred zero, primary-owner
  `LIMIT 1`, report-time allocation, or report-time opening/closing plug.
- No custom role, permission table, generic approval engine, journal, chart of
  accounts, accounts payable, bank reconciliation, or second currency.
- No owner allocation/roll-forward code in Track 2; no close/publication code
  before Track 3 source coverage and continuity are approved.
- No migration filename invented by hand; use the Supabase CLI and record the
  generated filename in each report.
- No direct authenticated table write, broad `TO authenticated` authorization,
  public executable private helper, user-metadata authorization, or RLS-bypassing
  view.
- No fake document or Storage object, evidence deletion, mutation of an approved
  request/entry, or rewrite of a closed revision/publication.
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
