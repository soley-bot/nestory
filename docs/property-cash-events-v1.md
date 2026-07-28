# Property Cash Events v1

`property_cash_events_v1` is the frozen, read-only database contract returned
by `public.get_property_cash_events_v1_page`. It is a shadow read model only:
no current report, export, page, or write path consumes it.

## Identity and pagination

The provisional canonical identity is the typed tuple
`(organization_id, source_type, source_id)`. `event_key` is the deterministic
text encoding `<source_type>:<source_id>` and is unique only within an
organization. Source IDs are always IDs of the domain row at the contract
grain. Receipt and payment allocation events use allocation IDs; a nonzero
header/allocation difference emits one separate residual event using the
receipt or payment header ID. Obligations are never event identity.

Rows are ordered by `event_date ASC NULLS LAST`, then `source_type ASC`, then
`source_id ASC`. The RPC uses the last returned values as a checked cursor and
never uses `OFFSET`. A null `event_date` cursor is valid only with non-null
source type and source ID, so unresolved evidence can be traversed
deterministically after dated events.

## Effects and unresolved evidence

`amount` is exact, positive `numeric`. The four signed effects are nullable:

- `owner_cash_effect`
- `operating_cash_effect`
- `deposit_liability_effect`
- `management_fee_effect`

`classification_status` states how consumers may use those effects:

- `source_stable` means the classification and signed effects come from the
  direct source row or exact linked Ledger row.
- `provisional_current_obligation` means receipt or payment classification is
  derived from the current, still-mutable obligation. Countable obligation
  classes return exact signed effects for shadow comparison; compatibility
  classes with unknown property economics remain null. Neither form is
  historical authority, and `requires_resolution` is always true.
- `unresolved_source_scope`, `unresolved_reversal_header`, and
  `unresolved_evidence` mean the evidence is not safe to count. All four
  effects are `NULL` and `requires_resolution` is true.

Exact zero is used only for an intentionally unaffected axis. Zero never
stands in for unknown economic meaning or an unproven cash date.
`period_start` is derived from a non-null `event_date`; it remains null when
the event date is unresolved.

Every row exposes `resolution_codes text[]`, `reconciliation_source_id`, and
`reconciliation_state`. Resolution codes are sorted and unique, and every
`requires_resolution = true` row has at least one code. An exact Plan 03 source
link has state `linked_exact_identity`. An unlinked row has a null ID:
`missing_stable_identity` means a required stable identity is absent, while
`not_required` means reconciliation does not apply to that row. The contract
never infers or fuzzy-matches a source. `missing_reconciliation_source`
appears only for the missing state, while unrelated resolution reasons remain
intact after a link is added.

## Source matrix

| Source at contract grain | Eligibility | Economic class | Status | Signed effects |
| --- | --- | --- | --- | --- |
| Receipt allocation for operating income | Exact source scope and, for reversals, exact header pairing | `operating_income` | `provisional_current_obligation` | owner and operating signed `amount`; deposit and fee `0` |
| Receipt allocation for management fee families | Exact source scope and, for reversals, exact header pairing; owner recognition policy not ratified | `management_fee` | `provisional_current_obligation` | signed fee effect; operating and deposit `0`; owner `NULL` |
| Receipt allocation for owner contribution | Exact source scope and, for reversals, exact header pairing | `owner_contribution` | `provisional_current_obligation` | owner signed `amount`; other effects `0` |
| Receipt allocation for security-deposit compatibility income | No exact deposit-event identity | `security_deposit` | `provisional_current_obligation` | all effects `NULL` |
| Payment allocation for property expense | Exact source scope and, for reversals, exact header pairing | `operating_expense` | `provisional_current_obligation` | owner and operating signed `amount`; deposit and fee `0` |
| Payment allocation for owner payout | Exact source scope and, for reversals, exact header pairing | `owner_distribution` | `provisional_current_obligation` | owner signed `amount`; other effects `0` |
| Payment allocation for company-scope handling or refund | Property effect is not authoritative | `legacy_unclassified` | `provisional_current_obligation` | all effects `NULL` |
| Receipt header residual | Header amount differs exactly from organization-scoped allocation total | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL`; `unapplied_receipt` or `overallocated_receipt` |
| Payment header residual | Header amount differs exactly from organization-scoped allocation total | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL`; `unallocated_payment` or `overallocated_payment` |
| Lease deposit event | Exact event, lease-deposit parent, and reversal scope | `security_deposit` | `source_stable` | owner and operating `0`; signed deposit liability; fee `0` |
| Cleared or posted property-expense petty cash with `clear_date` | Exact petty-cash row | `operating_expense` | `source_stable` | owner and operating `-amount`; deposit and fee `0` |
| Petty cash without `clear_date` | Invoice evidence only | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL`; date null |
| Maintenance task with Ledger evidence but without exact finance expense plus payment allocation | Evidence-only task/Ledger identity; no proven cash settlement | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL` |
| Malformed task/Ledger/vendor/unit/property scope | Retained once through the maintenance family | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL` |
| Active unmatched positive Ledger row | No exact domain identity | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL` |

Company-scope petty-cash expenses, advances, and refunds remain visible as
unresolved non-counting evidence under the same null-effect rule.

## Person identity

Person columns contain only IDs directly stored on the source chain. Receipt
and payment person context is emitted from organization-scoped `people` joins:

- tenant identity may come from the exact lease on an income or deposit row;
- vendor identity may come from the exact expense obligation or maintenance
  task;
- owner identity is populated only when a source stores that owner directly.

The current owner roster is never joined to allocate or infer historical cash.
Labels, people roles, and current ownership percentages are not identity
evidence. A malformed direct person reference never becomes linkable contract
context; the row remains visible as `unresolved_source_scope` with null effects
and null person fields. Receipt payer and lease-tenant references are also
protected by composite organization/person foreign keys.

The adapter is property-level and has no owner filter. Direct
`owner_person_id` values on contribution or distribution compatibility
evidence are metadata, not a partition of ordinary property activity. The
optional unit filter intentionally excludes property-level rows whose
`unit_id` is null.

## Resolution code matrix

| Code | Meaning |
| --- | --- |
| `mutable_obligation_classification` | Allocation classification still follows a mutable obligation |
| `missing_reconciliation_source` | This cash-bearing row has no exact reconciliation-source link |
| `management_fee_owner_recognition_unresolved` | IPS owner-liability recognition timing is not ratified |
| `deposit_cash_identity_missing` | Compatibility deposit evidence lacks an exact deposit-cash identity |
| `receipt_header_unapplied` | Receipt header exceeds its organization-scoped allocations |
| `receipt_header_overallocated` | Receipt allocations exceed the header |
| `payment_header_unallocated` | Payment header exceeds its organization-scoped allocations |
| `payment_header_overallocated` | Payment allocations exceed the header |
| `reversal_header_not_exact` | Reversal header is not an exact one-to-one allocation reversal |
| `source_scope_invalid` | A typed source relation crosses or violates exact scope |
| `maintenance_cash_settlement_unproven` | Task/Ledger evidence does not prove a finance settlement |
| `petty_cash_date_unproven` | Petty-cash evidence has no proven disbursement date |
| `legacy_ledger_unclassified` | Unmatched Ledger evidence has no exact domain classification |

## Exact-only deduplication and reversals

Finance, petty-cash, and maintenance Ledger rows are projections and are
excluded when their exact domain source exists. Journals never emit events;
their IDs and status are non-authoritative reconciliation metadata only.
No link or deduplication may use descriptions, references, dates, vendors,
labels, or approximate amounts.

A receipt or payment reversal allocation receives provisional signed effects
only when the entire reversal header is a one-to-one match with the original
header by obligation ID and exact allocation amount. The reversal row retains
its own allocation identity and points to its exact original allocation. If
any allocation is missing, extra, or redistributed, every allocation on that
reversal header remains visible with
`classification_status = 'unresolved_reversal_header'`, null effects, and
`requires_resolution = true`.

A deposit reversal uses only its direct `reversal_of_id`. Resolved reversals
preserve the original event, carry exact opposite signed effects, and net to
zero with it. Archived settled obligations remain eligible because settlement
history is authoritative; void obligations without settlement never emit a
row.

Exact source scope also requires receipt/obligation and payment/obligation
currency equality, lease/property/unit consistency, task/property/unit
consistency, direct person organization consistency, and deposit reversal
membership in the same lease-deposit parent and original property/currency
scope. `currency_code` currently permits only non-null `USD`, so a
header/obligation currency mismatch cannot be inserted through the current
schema; the equality check remains part of the contract for future currencies.

Ledger eligibility deliberately requires `amount > 0`. A zero-amount Ledger
row is excluded as non-owner-relevant evidence rather than surfaced as an
unresolved cash event.

## Projection metadata

`ledger_entry_id`, `journal_entry_id`, and `projection_status` are diagnostic
reconciliation fields. They do not establish event identity, classification,
deduplication, settlement, or a cash date. Missing projections do not erase a
valid domain event.

## RPC boundary

The public RPC is `SECURITY INVOKER`, requires a signed-in organization admin,
and requires exact organization, property, currency, start date, and end date.
It rejects a property outside the organization, a range over 366 days, invalid
or partial cursors, and a page size outside `1..1000`. Execution is revoked
from `PUBLIC` and `anon` and granted only to `authenticated`. Fully qualified
base relations and the caller's RLS policies preserve organization isolation.

## Shadow parity manifest

`src/features/finance/data/property-cash-shadow-parity.ts` is an engineering
adapter only. No page, report, export, or mutation imports it. It invokes the
existing pure builders and records their returned values beside canonical
event totals without declaring either side authoritative.

Every record includes:

- surface and metric identity;
- organization, property, USD currency, and selected-period scope;
- `period_flow`, `period_obligation`, `closing_balance`, or `control` basis;
- exact `bigint` current, canonical, and delta cents, with `null` used when the
  comparison cannot be made safely;
- explicit `referenceCents` and `referenceDeltaCents` for current-path
  integrity controls; `canonicalCents` and `deltaCents` are populated only
  from canonical-event comparisons;
- `match`, `mismatch`, `unresolved`, or `not_comparable` status;
- exact included, excluded, and unresolved typed identities; and
- a non-authoritative explanation of the comparison boundary.

Identity variants cover canonical events, Plan 01 source stable keys and
diagnostic stable keys, current obligations and settlement evidence, effective
owner links, returned Ledger report sources, and journal controls. Identity
collection for each raw source fails closed before accepting identity 10,001.
Cross-representation parity records may retain up to 30,000 identities so a
5,000-plus canonical set and its distinct current/Plan 01 evidence can be
reported without truncation. Inputs that can produce stored identities are
rejected before any builder runs when an individual Owner Statement,
TrustedReport, Property Summary, canonical, or Plan 01 collection exceeds the
raw limit. Required combined
PropertyCash, owner-allocation, and report contributor sets are preflighted
after all raw lengths pass. Before an Owner Statement adapter or builder runs,
separate conservative bounds cover combined receipt rows, income items,
expense items, and maximum PropertyCash source-line candidates. The
source-line, owner-link, and possible deposit-issue evidence bound applies even
with no owners. Ready allocation reserves every raw ownership line and up to
two evidence emissions per source line per owner through an overflow-safe
division check. These bounds cover all statement properties and months, and
repeated raw rows are not deduplicated. The PropertyCash identity preflight
also expands obligation plus allocation identities. One required-limit
collector consumes identity chunks without first concatenating them, stops
before adding limit plus one, and rejects an identity assigned to more than one
of included, excluded, and unresolved. The focused fixture proves 5,205
identities are retained without truncation.

Every canonical input event must match the stamped organization, property, and
USD currency. A dated event must fall inside the inclusive selected period.
Null-dated evidence is accepted only when its organization, property, and
currency match, `requiresResolution` is true, its classification status is
explicitly unresolved, and all four signed effects are null. A countable,
source-stable, or provisional null-dated event is rejected.

### Property cash mapping

| Current `PropertyCashTotals` field | Basis | Canonical comparison |
| --- | --- | --- |
| `rentDueCents` | `period_obligation` | `not_comparable`; canonical events are settlement flows |
| `rentReceivedCents` | `period_obligation` | `not_comparable`; current value is obligation-bounded receipt state |
| `arrearsCents` | `period_obligation` | `not_comparable`; no zero substitute |
| `managementFeesEarnedCents` | `period_obligation` | `not_comparable` |
| `managementFeesOutstandingCents` | `period_obligation` | `not_comparable` |
| `managementFeesReceivedCents` | `period_flow` | `managementFeeEffectCents` |
| `operatingCashReceivedCents` | `period_flow` | `operatingIncomeCents` |
| `ownerContributionCents` | `period_flow` | signed owner-contribution effect |
| `ownerPayoutCents` | `period_flow` | negated signed owner-distribution effect |
| `propertyExpensesPaidCents` | `period_flow` | negated signed operating-expense effect |
| `netOwnerCashMovementCents` | `period_flow` | signed owner-cash movement |
| `securityDepositHeldCents` | `closing_balance` | `not_comparable`; v1 exposes selected-period deposit movement |

Any relevant canonical event with a null effect makes that metric unresolved:
canonical and delta cents remain null while the event identity stays visible.
Original and reversal identities remain separate. Current archived-settlement
differences remain mismatches rather than being normalized away.

Current provenance is field-specific. Rent due and management-fee earned retain
only their obligation identities. Rent received and arrears also retain the
exact relevant receipt allocations; management-fee outstanding retains both
its obligation and relevant fee receipts. Selected-period flow metrics retain
only allocations whose dates contributed to those flows. Deposit balances use
typed `current_cash_source/deposit_event` identities rather than pretending
current evidence is a canonical event. The current-source deduplication key
includes both source type and ID.

### Current read surfaces

- Owner Statement input is normalized through `toOwnerStatementInput`.
  Property-level cash is built first with `buildPropertyCash`, then
  `buildOwnerStatement` is invoked. Effective-roster owner allocations are
  separate `not_comparable` records because a direct canonical owner ID is not
  an allocation roster. Readiness records retain exact blockers and evidence.
  Blocked summary omissions remain unresolved nulls, never zero mismatches.
  Separate controls compare ready current allocations with current
  property-level cash through `referenceCents` and `referenceDeltaCents`;
  canonical fields remain null. Each allocation metric retains its effective
  owner link and only the evidence lines used for that metric.
- Property Performance, Unit Performance, and Income & Expense are all built by
  `buildTrustedReport`. Returned USD strings are parsed exactly. Returned
  Ledger source links and matching active Plan 01 stable keys are retained
  separately for income, expense, and their NOI union. Unrelated,
  opposite-direction, and archived Plan 01 keys are excluded. A null-effect
  `legacy_unclassified` canonical event becomes relevant when it is itself a
  Ledger source with a matching source ID or when its non-null projection
  `ledgerEntryId` matches an exact current contributor, regardless of the
  canonical source family. This covers unresolved projected petty cash and
  makes only the matching metric unresolved. Unit Performance
  summary totals and visible unit-row totals are separate records so legitimate
  property-level Ledger rows remain in the summary while visible-row
  provenance remains limited to returned visible-unit rows.
- Plan 01 output is rebuilt through `buildReadPathParity`,
  `buildUnitContextCoverage`, and `buildParitySummary`. Proposed bucket
  included/excluded/unresolved stable keys remain diagnostic and carry an
  explicit non-authority disclaimer. `REPORT_TOTAL_CONTRADICTION` retains its
  diagnostic key plus `settlementAmount` and `ledgerAmount`;
  `SOURCE_LOAD_LIMIT_EXCEEDED` remains unresolved. Gross settlement
  diagnostics are not forced into canonical economic buckets. A report-total
  contradiction keeps Ledger amount as current and settlement amount as an
  explicit reference; both canonical fields remain null.
- Journal debit, credit, and balance are current internal `control` records,
  not canonical cash comparisons. Balance compares against an explicit zero
  reference. Exact journal entry and line IDs are required for typed journal
  identities; a row missing either ID retains its Plan 01 stable key as
  unresolved evidence instead of inventing journal identifiers.
- `buildPropertySummary` is invoked, but both `netIncome` and `netIncomeUsd`
  remain `not_comparable` because they are all-time current Ledger values and
  the canonical scope is a selected period. Its parity input requires a
  nonempty, unique Ledger ID on every all-time row while remaining structurally
  passable to the existing builder. Those exact rows emit `ledger_source`
  identities; selected-period Plan 01 keys are not substituted.

## Executable shadow artifact

Run `npm run finance:property-cash-shadow` with explicit organization,
property, `USD`, inclusive period, and the exact disposable Finance inventory
stack workdir. The command proves the local project/API/workdir identity,
rejects hosted and Vercel production/preview execution, authenticates as the
fixture admin, traverses every checked RPC page, loads current-path and Plan 01
evidence, and verifies an unchanged before/after Plan 01 watermark. It also
loads every current-path input twice and compares a deterministic SHA-256
material-state token, so changes to properties, units, leases, all-time
PropertySummary Ledger rows, period report Ledger rows, timeline, maintenance,
organization-wide active documents, owner data, obligations, or settlements
fail the collection. The document input exactly follows the trusted report:
the same selected columns, archive exclusion, ID ordering, exact count, and
5,000-row completeness boundary. A document linked to another property in the
same organization therefore participates in both before and after material
tokens, while an archived document does not.
PropertySummary receives all-time active Ledger evidence; period reports retain
the selected period only. A dirty repository fails closed unless
`--record-dirty` is explicitly supplied and recorded.

Each ignored `artifacts/property-cash-shadow/<timestamp>/` directory contains
deterministic normalized JSON, a readable Markdown summary, and runtime
metadata. The normalized JSON records repository/schema/migration identity,
scope, canonical counts/totals, parity records, included/excluded/projection
and unresolved identities, header residuals, resolution-code counts, source
watermark plus current-path material hash, and a reported SHA-256. `--strict`
exits nonzero for unresolved or mismatched evidence while leaving expected
`not_comparable` records informational. No application surface imports the
runner or its artifacts.

### Local fixture and query-plan evidence

No Plan 02 overlay or rewrite of
`supabase/fixtures/finance_inventory_fixture.sql` was needed. The existing
fixture already inserts 5,205 bounded-period Ledger rows. The focused
`property_cash_events_v1_test.sql` passed all 61 assertions on the disposable
`artifacts/finance-inventory-stack`; it covers mixed source families, exact
projection deduplication, archived settlements, deposit compatibility,
resolved and unresolved reversals, receipt/payment residuals, management-fee
owner recognition, unresolved petty cash/maintenance/legacy Ledger evidence,
RLS, sorted resolution codes, and deterministic traversal above 5,000 events.

On that disposable fixture, an authenticated
`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)` of the first 1,000-row RPC page
at code head `e70a147ade1139f626587f07087c9f8c617906a5` reported:

- a `Function Scan` over `get_property_cash_events_v1_page`;
- 1,000 returned rows in one loop;
- 6,173 shared-buffer hits;
- 0.062 ms planning time; and
- 68.385 ms total execution time.

This is local diagnostic evidence from one Windows Docker stack, warm-cache
state, fixture shape, and machine. The function boundary hides its internal
subplans in this outer `EXPLAIN`; the measurement is not a production latency
claim, throughput guarantee, or proof that every source-family branch has an
optimal plan.
