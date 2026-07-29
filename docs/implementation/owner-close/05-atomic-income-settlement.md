# Plan 05 — Atomic Income Settlement, Projection, and Reversal

**Status:** Recommended next implementation-ready slice. A separate approved
implementation prompt is still required.
**Mode:** Standard
**Effort:** High
**Reason:** Current receipt/allocation writes and later Ledger/journal posting
are separate, so the same cash can be complete in one authority and missing,
collapsed, or mutable in another.
**Planning/reconciliation baseline:** merged `origin/main` at
`5210ae1c94fa5a854f9c484b79e9dbd214c99053`, containing the merged Track B
planning package.
**Original repository audit baseline:**
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`; retain it as the evidence point
for the current settlement defect described below.

## Context and baseline

Plans 00 through 04 are merged. Plan 03 supplies property-period locking,
reconciliation-source identity, payload-bound idempotency primitives, reserved
projection guards, and journal authority. Current Rent & Income obligations
and receipt rows predate adoption of that kernel.

This plan is the narrow current-sequence replacement for the legacy broad
source `03-income-settlement-and-reversal.md`. The legacy filename is not
current Plan 03 and does not authorize implementation.

Plan 05 operates on obligation identity. It does not require Plan 09 charge
occurrences, the unnumbered tenant-invoice coordination slice, or the
unnumbered formal-receipt coordination slice. Those later sources must consume
the settlement identities created here rather than replacing them. Ratified
Plan 10 remains security-deposit custody; ratified Plans 11-12 remain
management-fee authority.

Plan 05 also does not depend on TB-01 or implement any Track B slice. Plan 05
remains the next Track A implementation-ready slice from the shared merged
planning baseline; TB-01 is the independent next Track B slice. Either branch
must remain isolated, and neither may copy unmerged implementation from the
other.

## Objective

Create one checked source transaction for each incoming receipt and one checked
source transaction for each reversal so:

```text
money received
-> receipt header
-> exact allocation
-> compatibility balance/status
-> Ledger projection
-> balanced journal projection
-> activity and idempotency result
```

commits completely or not at all.

Operators record or reverse cash once. They never separately post, edit,
archive, re-date, reclassify, or reverse the derived Ledger/journal rows.

## Verified current behavior

- `finance_income_items` is the current incoming obligation source, with amount
  due/received, dates, payer/category, status, and an optional obligation-level
  Ledger link.
- `finance_receipts` is an actual-cash header.
  `finance_receipt_allocations` applies the receipt to obligations.
- The schema can represent several allocations on one receipt and several
  receipts against one obligation, but the public `record_finance_receipt`
  workflow creates one new header plus one allocation to one obligation.
- `app_private.record_finance_receipt` locks the obligation, rejects
  over-allocation and posted state, inserts receipt/allocation rows, refreshes
  compatibility totals, and logs activity in one SQL transaction.
- `app_private.reverse_finance_receipt` preserves the original and creates a
  linked reversing header and allocations, but allocation-to-allocation
  reversal identity is inferred rather than directly constrained.
- A posted obligation blocks receipt reversal and instructs the operator to
  reverse Ledger posting first.
- `post_finance_income_item` is a separate action. It collapses total received
  cash into one obligation-level `finance_income` Ledger row using the latest
  receipt date, then creates a compatibility journal.
- Partial receipts across dates therefore lose source-event/date granularity
  in Ledger.
- Current `finance_income` projections are outside the Plan 03 reserved
  source-type protection. Generic Ledger update/archive/restore remains
  available.
- Admins retain direct insert/update privileges on
  `finance_income_items`, leaving compatibility amount, status, and
  classification fields outside the checked settlement boundary.
- Current pgTAP covers receipt DML restrictions, partial settlement,
  over-allocation, posted-state rejection, and single reversal, but not atomic
  settlement-to-Ledger/journal parity.
- Owner Statement cash input correctly uses signed receipt allocations by
  receipt date; it can therefore diverge from current Ledger projections.

Primary evidence:

- `supabase/migrations/20260706113000_finance_income_expense_workflows.sql`
- `supabase/migrations/20260710065423_overview_property_cash_events.sql`
- `supabase/migrations/20260721091337_link_income_payer_person.sql`
- `supabase/migrations/20260723093124_finance_settlement_activity_logging.sql`
- `supabase/migrations/20260727174623_shared_financial_authority_kernel.sql`
- `src/features/rent-income/actions.ts`
- `src/features/rent-income/rent-income-workflow.ts`
- `src/features/rent-income/data/rent-income.ts`
- `src/features/rent-income/rent-income.types.ts`
- `src/features/reports/data/owner-statement-input.ts`
- `supabase/tests/overview_property_cash_events_test.sql`
- `supabase/tests/accounting_parity_test.sql`

## Required changes

### 1. Adopt the Plan 03 authority and lock order

Add versioned checked receipt and reversal commands, or compatibly replace the
public wrappers, that authenticate/authorize the actor, resolve every affected
scope without mutation, and then acquire the exact documented Plan 03 order
before source mutation:

1. take the property/currency/month transaction advisory lock;
2. get or create the stable property-reporting-period header and lock it
   `FOR UPDATE`;
3. take the shared organization/currency/month broader-authority transaction
   lock;
4. lock and capture property lifecycle, organization Ledger, and all applicable
   client accounting-book period states in stable book-ID order;
5. take the operation/idempotency advisory lock and lock its request row;
6. only for a genuinely new request, lock and validate the active
   reconciliation source, obligation, captured period states, and immutable
   classification/scope sources, then calculate exact signed open balance; and
7. write receipt/allocation, compatibility fields, reserved Ledger/journal
   projections, audit evidence, and the idempotent result in the same
   transaction.

After step 5, same-key/same-payload replay returns the stored result before the
captured lifecycle/book status is applied to a new mutation. A later period
closure cannot turn an already committed replay into a new business rejection.

The command rejects void/archived obligations, cross-organization/property/unit
or lease mismatches, unsupported currency, locked/closed periods, inactive or
wrong-scope reconciliation sources, non-positive amounts, and
over-allocation.

### 2. Keep the MVP cardinality narrow

The Plan 05 public command creates:

- one receipt header;
- one allocation to one obligation; and
- one exact allocation-based projection identity.

Multiple sequential partial receipts against that obligation are supported.
The underlying schema's multi-allocation capability is not exposed as
authorized product behavior in this slice.

The receipt header total must equal its signed allocation total. Plan 05 does
not invent unapplied cash. Overpayment, advance payment, or cash without a
valid obligation is rejected from this workflow and remains an explicit
reconciliation/close blocker until a dedicated liability workflow exists.

Plan 05 also defines a checked eligibility hook for the joint Plan 09 and
tenant-invoice coordination activation gate:

- classified pre-invoice/manual/legacy obligations may settle by obligation
  identity, remain explicitly classified, and never become formal-receipt
  publication sources merely because cash exists;
- Plan 09-generated new-business obligations remain non-collectable while
  Plan 09 is shadow/readiness-only; and
- after the joint Plan 09/tenant-invoice cutover, a Plan 09-generated
  obligation requires one exact tenant-invoice header/version/line before
  settlement. Plan 05 persists those exact identities on the allocation and
  never resolves them later from obligation identity alone.

For that post-activation path, settlement, reversal of an invoice-bound
allocation, and invoice cancellation acquire the shared
obligation/invoice/property-period locks in the same order and recheck the exact
allocation/reversal set. Settlement also rechecks that the referenced line
belongs to the current active `issued` invoice for the obligation. A
`cancelled`, `superseded`, or `issuance_abandoned` invoice cannot receive new
cash. A committed allocation blocks cancellation only while its net unreversed
signed effect is nonzero. Exact directly linked Plan 05 reversal retains both
rows and can restore cancellation eligibility when every positive allocation is
fully reversed and the net effect is zero. Cancellation cannot rely on an
in-flight reversal; cancellation winning first makes new settlement fail until
an approved replacement is issued. A later invoice lifecycle change never
deletes or retargets a committed allocation or reversal.

The initial Plan 05 implementation does not create invoice tables or activate
Plan 09. It must leave an explicit source classification/guard contract so a
later cutover cannot accidentally accept normally uninvoiceable cash.

### 2A. Expose a read-only financial owner adapter

Plan 05 owns a versioned, read-only adapter for its obligations, receipt
headers, allocations, reversals, and downstream draft/source identities. For
an exact typed source it returns:

- canonical source ID and version/material hash;
- owner-classified state and only the checked actions Plan 05 currently
  supports;
- organization, property, currency, and period scope, including every source
  and destination scope affected by a reversal or composed correction; and
- an explicit unavailable reason when a requested action is not merged.

The adapter and any preview that transports its result write no activity or
idempotency state. A composed Track B/Track A execution acquires every returned
property-period lock in the documented deterministic order inside the same
transaction, rechecks the adapter/material while locks are held, and only then
invokes the selected Plan 05 command. Track B may transport the opaque result;
it cannot update an obligation, receipt, allocation, Ledger/journal
projection, close source, or statement.

### 3. Freeze settlement materiality

At first settlement, either freeze the obligation fields on which cash
classification/scope depends or persist an immutable allocation classification
snapshot. The source must retain:

- organization, property, optional unit/lease, and obligation identity;
- economic class and obligation type;
- payer identity/label snapshot;
- exact amount and currency;
- received date;
- reconciliation-source identity;
- external reference;
- deterministic settlement sequence and the exact outstanding balance
  immediately after this allocation;
- actor and committed timestamp; and
- any Plan 03 canonical source discriminator.

When the obligation comes from Plan 09, the immutable scope also retains:

- exact charge-occurrence and authoritative `lease_term_id`/version;
- the exact Track A-approved calculation snapshot/hash, including service
  dates, due date, proration/notice basis, blockers resolved, policy version,
  and calculation reason codes;
- the selected debtor and recipient party/Person identities;
- every accepted Track B party/Person/occupancy/participant/notice source ID
  and version consumed by that selection, plus the relationship-evidence
  material hash; and
- the exact issued invoice header/version/line identities once the joint
  Plan 09/tenant-invoice activation gate is enabled.

A `billing_contact` may be part of recipient/contact evidence but never becomes
the debtor automatically. Classified pre-invoice/manual/legacy obligations
that lack these historical identities retain their explicit legacy class and
`NULL`/unresolved evidence fields; Plan 05 must not fabricate them from
today's primary Person, Lease header, term dates, or display labels.

Later obligation edits cannot reclassify already received cash. A correction
uses an exact reversal and a new source event.

### 4. Use allocation identity for every cash projection

Use the canonical lower-case reserved source type and exact allocation ID for
the Ledger and journal source identity. Do not project by obligation ID or
receipt description/reference.

Before any source mutation, the checked command resolves the allocation's
immutable economic class against the merged Ledger and accounting-book mapping,
including at least one applicable accounting book. An unsupported or unmapped
class, or a zero, missing, or duplicate book mapping, fails closed.

Each supported allocation creates, in the same source transaction:

- exactly one allocation-linked Ledger projection;
- exactly one balanced journal entry with its complete lines for every
  applicable accounting book; and
- the unique canonical allocation-to-Ledger-to-journal/line source links needed
  for event parity.

Any missing mapping, projection, book entry, line, or balance fails the
transaction and leaves no receipt/allocation source.

Cash date is the receipt's `received_date`. Projection date, amount, currency,
property, unit, and class must match the source snapshot exactly.

### 5. Make retries payload-bound

The command accepts an organization-scoped idempotency key and canonical
material payload hash. Same key and same payload returns the original receipt,
allocation, Ledger, journal, and activity identities. Same key with any
material difference fails closed.

No amount/date/reference proximity or user-visible reference is an
idempotency mechanism.

### 6. Make reversal symmetric and atomic

The checked reversal command:

1. validates actor capability and organization scope, canonicalizes the
   material payload, and resolves every affected original/reversal
   property/currency/month scope without mutation;
2. acquires all affected property-period advisory locks and reporting-period
   headers in deterministic order, followed by the broader
   organization/Ledger/accounting-book locks, and captures the lifecycle/book
   state required by Plan 03 without applying new-request rejection;
3. only after those earlier-order locks, locks the organization-scoped reversal
   operation/idempotency key and request row;
4. returns the committed reversal identities for the same key and payload, or
   fails a changed-payload reuse, before any new-request source, duplicate, or
   period-status rejection;
5. only for a genuinely new request, locks and validates the original source,
   requested reversal date, captured open-period policy, reconciliation source,
   and mandatory reason, then rejects reversal chains or an existing reversal;
6. creates one reversing receipt and exact reversing allocation;
7. stores direct original-allocation-to-reversing-allocation identity;
8. creates the exact reversing Ledger projection and exactly one balanced
   journal entry with its complete lines for every applicable accounting book;
9. refreshes compatibility balance/status;
10. preserves both original and reversal;
11. logs all identities and commits the payload-bound result against the locked
   operation key; and
12. never asks the operator to reverse a derived row first.

No reversal path may hold the operation key while waiting for an earlier-order
Plan 03 lock. A completed same-payload replay returns its stored result even if
the period later closes; the captured lifecycle/book status gates only a
genuinely new mutation.

Normal correction is dated in an open period. Historical restatement follows
the Plan 00 reopen/reclose sequence and never rewrites a published statement.

### 7. Close direct and generic bypasses

After compatible call sites are cut over:

- revoke or guard direct authenticated mutation of material obligation
  classification, amount, currency, scope, and settlement compatibility fields;
- reserve the receipt-allocation projection namespaces;
- reject generic Ledger/journal create, update, archive, restore, re-date,
  reclassify, post, and reverse operations for source-linked receipt
  projections; and
- retain a deliberate, tested boundary for unrelated manual legacy Ledger rows.

Internal capability context remains private and cannot be granted with
caller-set configuration or `service_role`.

### 8. Replace the split operator workflow

Update Rent & Income so the only cash action records the receipt. Remove the
separate `postRentIncomeItemAction` path and its "ready to post" copy after all
compatible callers are migrated.

The detail view shows:

- amount due, valid cash received, and outstanding;
- each receipt and reversal with source date/reference;
- exact reconciliation source;
- read-only Ledger/journal evidence;
- projection or parity failure as a blocker, never as a second action; and
- a checked reversal action with required reason and consequence copy.

The action revalidates every affected Rent & Income, Ledger, report,
property/unit, timeline, and Owner Close surface.

### 9. Preserve compatibility and shadow parity

Existing historical rows remain readable. Do not destructively rewrite,
fuzzy-match, or silently reclassify them.

The current wrapper may delegate to the new command while callers migrate, but
it must not retain an alternate split authority. New allocation events appear
once in `property_cash_events_v1` and match Owner Statement cash input,
Ledger, and journal controls.

## Invariants

- An obligation is not cash, an invoice, or a formal receipt.
- A receipt exists only after actual money is received.
- Cash authority is the immutable receipt/allocation source.
- Outstanding equals obligation amount minus valid signed allocations.
- Exact money and currency never use floating approximation.
- Service, due, received, projection, and delivery dates remain distinct.
- Organization/property/unit/lease scope is checked at the database boundary.
- Reconciliation-source identity is mandatory for new cash.
- Header total equals signed allocation total in the safe model.
- Allocation identity is the source of cash projections.
- Every supported allocation has exactly one allocation-linked Ledger
  projection and exactly one balanced journal entry with complete lines for
  each of at least one applicable accounting book; zero, missing, duplicate, or
  unmapped book mappings never create a source.
- Receipt, Ledger, journal, compatibility, and audit effects are atomic.
- Journals are balanced and deterministic.
- Source-linked projections are not generic operator records.
- Reversal is append-only, exact, directly linked, and period-safe.
- Deposit custody and owner contributions do not become operating income.
- No invoice, formal receipt artifact, close, or Owner Statement publication is
  created by this slice.
- Settlement never re-resolves debtor, Lease/Unit, or occupancy context from
  current compatibility headers. Future Plan 09 scope is frozen from the Track
  A-approved decision and exact consumed relationship evidence.
- Post-activation new-business allocations retain immutable invoice
  header/version/line identities; classified pre-invoice/manual/legacy cash
  remains obligation-only and is not a formal-receipt source.

## Acceptance criteria

1. One checked receipt with a supported allocation commits one immutable
   receipt header, exactly one allocation, exactly one allocation-linked Ledger
   projection, exactly one balanced journal entry with complete lines for every
   applicable accounting book, compatibility, audit, and idempotency result
   together.
2. Forced failure at each write boundary leaves none of those effects.
3. Partial receipts on different dates create separate allocation-based cash
   events and projections with stable historical balance-after snapshots.
4. After the complete earlier-order Plan 03 lock set and before new-request
   source/duplicate validation, a same-key/same-payload receipt or reversal
   retry returns the same identities; altered payload fails.
5. Over-allocation, unsupported or unmapped economic class, unapplied cash,
   closed period, wrong reconciliation source, cross-scope, unauthenticated,
   and unauthorized calls fail before mutation.
6. Reversal creates exact linked reversing source/projection effects without
   modifying the original or requiring a prior Ledger action.
7. Direct material obligation mutation and generic source-linked projection
   mutation fail.
8. Rent & Income offers no separate post-to-Ledger action.
9. New canonical cash agrees across allocations, `property_cash_events_v1`,
   Ledger, journals, and Owner Statement input.
10. Existing legacy records remain readable and explicitly classified.
11. The settlement eligibility contract distinguishes classified
    pre-invoice/manual/legacy obligations from Plan 09-generated new business;
    the latter persists an exact current-active issued invoice
    header/version/line under the shared lock and cannot accept cash against a
    cancelled, superseded, or abandoned invoice. Settlement, exact reversal,
    and cancellation serialize under one lock order; cancellation requires a
    zero net unreversed signed effect with every positive allocation exactly
    reversed, and no outcome deletes or retargets committed history.
12. The read-only Plan 05 owner adapter returns exact typed source
    identities/states/actions/scopes, and a composed executor holds every
    deterministic property-period lock in the same transaction before
    settlement or reversal mutation.

## Verification

### RED evidence

Before implementation, retain focused proof that:

- recording a receipt does not create Ledger/journal projections;
- two partial receipts collapse into one obligation-level Ledger row;
- current reversal blocks on posted income and exposes derived posting order;
- generic Ledger mutation can change a linked compatibility row; and
- direct material obligation mutation bypasses the checked receipt path.

### GREEN evidence

Add and run:

- pgTAP for organization/role/RLS/grants, exact scope/currency/source
  validation, locks, header/allocation balance, partial receipts, retry hash,
  unique source identity, journal balance, atomic rollback, reversal pairing,
  duplicate reversal, bypass rejection, and legacy compatibility;
- two-session races for receipt-versus-receipt, receipt-versus-close,
  reversal-versus-close, same-key retry, and, after invoice activation,
  invoice-bound reversal-versus-cancellation;
- same-key reversal-versus-composed-correction in both start orders, plus
  reversal against organization-Ledger/accounting-book transitions and
  different original/reversal periods, proving Plan 03 locks precede the
  operation key, no `40P01` occurs, and completed replay survives later period
  closure;
- focused Vitest for server validation, error mapping, all route revalidation,
  removed post action/copy, source evidence, and reversal flow;
- canonical cash and journal parity against a production-shaped fixture;
- `npm run test:all`;
- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run build`;
- `npm run db:reset`;
- `npm run db:lint`;
- generated-type drift comparison;
- full pgTAP and Plan 03 Ledger/accounting concurrency harnesses;
- authenticated browser flow for partial receipt, second receipt, reversal,
  read-only source evidence, and all blocker states; and
- `git diff --check`.

Hosted Supabase mutation, production backfill, Vercel deployment, and merge
require separate explicit authorization.

## Scope exclusions

- No Plan 09 rent occurrence generation.
- No tenant invoice, invoice number, invoice route, or invoice artifact.
- No formal receipt number, PDF, print, publication, or delivery.
- No multi-obligation receipt UI or allocation.
- No unapplied-cash, overpayment, advance-payment, refund, or credit-note
  workflow.
- No deposit, expense, maintenance, petty cash, fee, owner balance, close, or
  statement cutover.
- No fuzzy legacy classification or production backfill.
- No general-ledger or chart-of-accounts product.

## Deliverables

- Append-only migration adopting the Plan 03 kernel for income settlement and
  reversal.
- Checked payload-idempotent receipt and reversal commands.
- Allocation-level source and direct reversal identities.
- Atomic Ledger/journal projections and protected namespaces.
- Closed direct/generic bypasses with compatible legacy handling.
- Updated Rent & Income action/read workflow with no separate posting.
- Generated types, focused/full tests, parity evidence, and operator notes.
- Draft PR; no merge, hosted mutation, or deployment.

## Stop conditions

Stop if:

- any receipt or reversal can commit without all required projections;
- projection identity remains obligation-level;
- a header may exceed allocations without an approved unapplied-cash source;
- material classification remains mutable after settlement;
- reversal deletes/mutates the original or requires operator Ledger reversal;
- generic Ledger/journal actions can alter source-linked truth;
- idempotency relies on approximate matching;
- unsupported cash is forced onto an unrelated obligation;
- the slice needs invoice/formal-receipt authority; or
- implementation would broaden into tax, ERP, payment processing, or hosted
  operations.

## Required Cross-Plan Amendments

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Versioned relationship-evidence envelope for future generated obligations | Current manual obligations may link a Lease but do not prove historical party/occupancy identity; TB-05 will expose accepted candidates, versions, reasons, and a material hash | Plan 09 selects debtor and recipient identity plus the calculation from that envelope and Plan 04 policy; Plan 05 freezes the resulting occurrence/term/calculation/party/occupancy scope. `billing_contact` is never automatic debtor authority | Settlement must not infer today's tenant or rewrite historical payer scope | No for current Plan 05; yes before Plan 09-generated obligations settle | Yes, until Plan 09/TB-05 integration |
| Track A Plan 05 | Owner-state adapter and composed property-period locks | Track B supersession can identify affected sources but cannot classify or mutate settlement state | Return exact obligation/receipt/allocation identities, owner states/actions, material hash, and all source/destination scopes; acquire every scope in deterministic order inside the same execution transaction before invoking Plan 05 | Settled cash remains append-only and corrections are stale-safe without authority transfer | No for isolated Plan 05; yes before an affected cross-track execution | No for the enabled path |
| Track A — unnumbered tenant-invoice coordination slice | Obligation and allocation source contract | `finance_income_items` and receipt allocations currently have no invoice-line identity | Consume Plan 05 obligation/allocation identities; invoice status is derived from valid allocations and never drives cash | Prevent invoice workflow from becoming a second settlement authority | No for Plan 05; yes for invoice adoption | No, contract is fixed here |
| Track A — unnumbered formal-receipt coordination slice | Receipt publication source contract | Current database receipts have no formal artifact identity | Publish only from a committed Plan 05 receipt/allocation result; rendering/delivery failure cannot roll back cash | Preserve source transaction atomicity while allowing safe publication retry | No for Plan 05; yes for receipt-publication adoption | No, contract is fixed here |
