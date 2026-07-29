# Plan 02 — Canonical Property-Cash Contract

**Mode:** Standard  
**Effort:** High  
**Reason:** Every later workflow needs one normalized event contract before writes can be unified or reports can be trusted.
**Status:** Implemented and merged in PR #36. It remains the shadow cash
contract, not invoice or formal receipt-document authority. Use `README.md`,
`96-tenant-billing-reconciliation.md`, and
`97-ratified-final-sequence.md` for current status and boundaries.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin only after Plan 00 is approved and Plan 01 produces a reviewed parity baseline.

The later Track A/Track B reconciliation baseline is merged `origin/main` at
`5210ae1c94fa5a854f9c484b79e9dbd214c99053`. The original Plan 02 baseline
above remains historical implementation evidence. Reconciliation adds a
forward contract for exact event-time relationship attribution; it does not
retroactively claim that existing nullable tenant fields already satisfy that
contract.

Current reports select different financial sources. This plan adds a canonical read model while deliberately leaving all current writes and user-facing report calculations unchanged. That allows the event contract to be compared against existing behavior before cutover.

## Objective

Implement one organization-scoped, versioned property-cash event contract that normalizes every currently supported owner-relevant financial effect into one row shape with stable source identity, explicit economic classification, reversal semantics, and traceable property/unit context.

## Verified current behavior

- Obligations and settlement events are separate tables.
- Cash reporting should use receipt/payment dates.
- Deposits and owner contributions are not property operating income.
- Receipt and payment allocations carry the amount associated with a classified obligation.
- Maintenance and petty cash can represent owner-relevant expenses outside payment allocations.
- Ledger rows already carry source metadata for several origins, but source identity is not used consistently by Owner Statement.
- Accounting journals already have source type, source ID, posting key, and idempotency constraints.
- Current receipt-allocation and deposit branches can obtain
  `tenant_person_id` by joining the exact Lease and then reading today's
  `leases.primary_tenant_person_id`. That is a confirmed historical-attribution
  defect: an exact Lease ID does not prove which Person/party applied when the
  event occurred.

## Required changes

### 1. Add `property_cash_events_v1`

Create a security-invoker view or checked, set-returning RPC according to the approved Plan 00 decision. The contract must be versioned in its name so later evolution is explicit.

Required columns:

- `event_key`: stable deterministic key, unique within organization.
- `organization_id`.
- `property_id`.
- optional `unit_id`, `lease_id`, `task_id`.
- optional `owner_person_id`, `tenant_person_id`, `vendor_person_id`.
- `event_date` and derived `period_start`.
- `currency`.
- `amount` as exact positive numeric.
- `owner_cash_effect` as exact signed numeric.
- `operating_cash_effect` as exact signed numeric.
- `deposit_liability_effect` as exact signed numeric.
- `management_fee_effect` as exact signed numeric.
- `economic_class`.
- `statement_section`.
- stable `category_code` plus a display label resolved in application code.
- `source_type` and `source_id`.
- optional `source_parent_type` and `source_parent_id` for receipt/payment headers or obligations.
- optional reversal source identity.
- `is_reversal`.
- `is_legacy` and `requires_resolution`.
- ledger and journal projection identifiers/status where they already exist.
- created/audit metadata needed for diagnostics, but not as a substitute for business date.

Do not store UI URLs in SQL. The feature adapter maps source type and ID to exact Nestory links.

### Historical relationship attribution

For any new or replaced source family that displays tenant/Lease context:

- emit a tenant/Person identity only from source-stored event-time scope or
  immutable accepted Track B relationship evidence selected and frozen by the
  owning Track A workflow;
- preserve exact organization, property, Unit, Lease, authoritative term,
  selected party/Person, accepted occupancy/participant source IDs and
  versions, and the consumed relationship-evidence material hash when the
  source owns them;
- return `NULL` plus a typed unresolved reason for legacy rows whose event-time
  identity cannot be proved;
- never fall back to current `primary_tenant_person_id`, `tenant_name`, a
  billing-contact role, current Lease status, or Lease/term dates; and
- keep the Track A-approved obligor/recipient and calculation snapshot on the
  canonical financial source. Track B supplies evidence candidates and never
  makes that financial decision.

### 2. Normalize current source families

At this stage include, without changing writes:

- receipt allocations for operating income, company-fee compatibility rows, owner-contribution compatibility rows, and deposit-income compatibility rows;
- payment allocations for operating expense and owner-payout compatibility rows;
- lease deposit events;
- cleared/posted petty-cash entries;
- maintenance-linked ledger entries that lack a finance expense source;
- source-linked and manual ledger rows not represented elsewhere, marked legacy and resolution-required where applicable;
- reversal rows as separate signed effects.

Deduplication rules must be explicit. A finance-origin ledger projection cannot appear as a second event when its settlement allocation already exists. The canonical row is the domain source; the ledger/journal rows are projection metadata.

### 3. Define economic classes

Initial economic classes should remain narrow:

- `operating_income`
- `operating_expense`
- `management_fee`
- `owner_contribution`
- `owner_distribution`
- `owner_reserve`
- `security_deposit`
- `adjustment`
- `legacy_unclassified`

Category labels such as rent, parking, utility reimbursement, maintenance, utilities, supplies, or petty cash remain subordinate classifications. Do not confuse economic class with free-form category.

### 4. Define source and reversal rules

- Receipt/payment allocation rows use the allocation ID as `source_id`.
- Receipt/payment header IDs are parent identity.
- Deposit events, petty-cash entries, maintenance handoffs, fee assessments, owner cash events, and adjustments use their own IDs.
- A reversal event receives its own event key and negative effect; it points to the original source identity.
- The original event remains visible and immutable.
- Archived obligations do not erase settled historical events.
- Voided obligations with no settlement contribute no cash event.
- Any ambiguous legacy row remains visible with `requires_resolution = true`.

### 5. Add a feature-owned adapter

Create a focused module, for example `src/features/finance/data/property-cash-events.ts`, that:

- loads by organization, property, unit, owner, and bounded period;
- maps canonical source identities to exact source links and, when the merged
  Track A projection registry supports them, exact source -> Ledger projection
  -> accounting journal/line links plus the permission-checked reverse route;
- returns exact integer cents or safe numeric strings according to existing conventions;
- exposes reusable totals without duplicating classification logic;
- rejects unsupported currencies or mixed-currency aggregation;
- paginates rather than using the current 5,000-row report cap.

Do not place the new contract in the generic trusted-report monolith.

### 6. Run in shadow mode

Add shadow comparison tests and optional engineering output that compare the new contract with:

- current Owner Statement cash input;
- current property cash helper totals;
- current Ledger totals;
- Property Performance and Unit Performance totals;
- accounting journal controls.

No screen or export switches to the new contract in this plan.

## Invariants to preserve

- One canonical event row per owner-relevant effect.
- Projection rows never create duplicate event rows.
- Cash date is the settlement/event date.
- Deposits and owner contributions are excluded from operating income.
- Owner payouts are not ordinary property expenses.
- All rows retain property context and organization isolation.
- Reversals preserve originals and produce exact opposite effects.
- Legacy ambiguity is explicit rather than guessed.
- The view/RPC cannot bypass base-table RLS.
- Historical tenant/relationship context comes from source-stored/event-time
  identity or remains explicitly unresolved; today's Lease header is never a
  fallback.
- Ledger and journal navigation is projection evidence from exact typed source
  identity, never relationship authority or a fuzzy property/Unit/date/name
  match.

## Acceptance criteria

1. Every current source family in the Plan 01 fixture maps to a canonical row or an explicit unresolved diagnostic.
2. Event keys are stable and unique across repeated loads.
3. Finance-origin ledger/journal projections do not double count settlement allocations.
4. Reversal pairs net to zero across their combined dates while remaining individually traceable.
5. Archived source records with historical settlement remain reportable.
6. Security-deposit and owner-contribution compatibility rows are classified outside operating income.
7. The adapter handles more than 5,000 rows through pagination or database aggregation.
8. Shadow totals identify, rather than conceal, every current mismatch.
9. No existing page, report, export, or mutation changes behavior.

## Verification

- RED tests for duplicate projection inclusion, archived-source disappearance, reversal sign errors, and cross-organization leakage.
- GREEN pgTAP tests for view/RPC row shape, RLS, source identity, reversal behavior, and exact totals.
- Focused Vitest tests for TypeScript normalization and source links.
- Full application tests, lint, TypeScript, and production build.
- Database reset, lint, generated types, and full pgTAP.
- Query-plan review with production-shaped row counts and required indexes.
- `git diff --check`.

Browser verification is not required because no user-facing source changes, unless an internal comparison surface is added.

## Scope exclusions

- No write-path unification.
- No generic edits to ledger behavior.
- No rent schedule, deposit migration, management fee, owner balance, close, or statement persistence.
- No report cutover.
- No deletion or retirement of compatibility tables or columns.

## Deliverables

- Append-only migration for `property_cash_events_v1` and supporting indexes/functions.
- Generated database types.
- Feature-owned loader, types, source-link resolver, and totals helpers.
- Shadow parity tests against the Plan 01 fixture.
- Documentation of source taxonomy, deduplication, and reversal rules.
- Draft PR with no production cutover.

## Stop conditions

Stop if:

- one source can map to multiple canonical rows without an explicit allocation distinction;
- deduplication depends on descriptions, references, dates, or approximate amounts rather than stable IDs;
- RLS cannot be preserved through the selected view/RPC design;
- the contract requires loading unbounded rows into application memory;
- cash and accrual effects become mixed in one ambiguous amount; or
- a new generic event table would become another independently mutable source instead of a controlled write model.

## Required Cross-Plan Amendments

This merged shadow-contract plan adds no new implementation authority. Current
amendment detail is authoritative in
`96-tenant-billing-reconciliation.md`.

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Versioned relationship-evidence input for future canonical sources | Plan 02 normalizes exact cash source IDs but current receipt/deposit attribution can still read today's primary Person through the Lease | Return accepted party/Person/occupancy/participant/notice candidates with exact versions, resolution states, reasons, and material hash; Track A selects and freezes the financial result or leaves legacy attribution unresolved | Future cash/document evidence must not resolve through today's mutable Lease/party state or treat `billing_contact` as debtor | No; Plan 02 is merged | Yes, until the source owner lands |
| Track A projection owners | Exact source/projection navigation | Ledger source indexes alone do not prove one projection or relationship attribution | Expose allowlisted canonical source -> Ledger projection -> journal/line identities and exact permission-aware reverse routes; legacy ambiguity stays null/unresolved | Operators need precise navigation without turning a projection into financial or relationship authority | No for Plan 02 | Yes, until the projection registry lands |
