# Plan 05 — Atomic Income Settlement, Projection, and Reversal

**Status:** Recommended next implementation-ready slice. A separate approved
implementation prompt is still required.
**Mode:** Standard
**Effort:** High
**Reason:** Current receipt/allocation writes and later Ledger/journal posting
are separate, so the same cash can be complete in one authority and missing,
collapsed, or mutable in another.
**Planning baseline:** merged `origin/main` at
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`.

## Context and baseline

Plans 00 through 04 are merged. Plan 03 supplies property-period locking,
reconciliation-source identity, payload-bound idempotency primitives, reserved
projection guards, and journal authority. Current Rent & Income obligations
and receipt rows predate adoption of that kernel.

This plan is the narrow current-sequence replacement for the legacy broad
source `03-income-settlement-and-reversal.md`. The legacy filename is not
current Plan 03 and does not authorize implementation.

Plan 05 operates on obligation identity. It does not require Plan 09 charge
occurrences, Plan 10 tenant invoices, or Plan 11 formal receipt documents.
Those later sources must consume the settlement identities created here rather
than replacing them.

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

Add a versioned checked receipt command, or compatibly replace the public
wrapper, that authenticates/authorizes the actor and then acquires the exact
documented Plan 03 order before source mutation:

1. take the property/currency/month transaction advisory lock;
2. get or create the stable property-reporting-period header and lock it
   `FOR UPDATE`;
3. take the shared organization/currency/month broader-authority transaction
   lock;
4. evaluate property lifecycle, organization Ledger lock, and all applicable
   client accounting-book period locks in stable book-ID order;
5. take the operation/idempotency advisory lock and lock its request row;
6. lock and validate the active reconciliation source, obligation, and
   immutable classification/scope sources, then calculate exact signed open
   balance; and
7. write receipt/allocation, compatibility fields, reserved Ledger/journal
   projections, audit evidence, and the idempotent result in the same
   transaction.

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

Plan 05 also defines a checked eligibility hook for the Plan 09/10 activation
gate:

- classified pre-invoice/manual/legacy obligations may settle by obligation
  identity;
- Plan 09-generated new-business obligations remain non-collectable while
  Plan 09 is shadow/readiness-only; and
- after the joint Plan 09/10 cutover, a Plan 09-generated obligation requires
  one exact issued Plan 10 invoice line before settlement.

The initial Plan 05 implementation does not create invoice tables or activate
Plan 09. It must leave an explicit source classification/guard contract so a
later cutover cannot accidentally accept normally uninvoiceable cash.

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

Later obligation edits cannot reclassify already received cash. A correction
uses an exact reversal and a new source event.

### 4. Use allocation identity for every cash projection

Use the canonical lower-case reserved source type and exact allocation ID for
the Ledger and journal source identity. Do not project by obligation ID or
receipt description/reference.

Each allocation creates, in the same source transaction:

- zero or one required Ledger projection according to its immutable economic
  class;
- exactly one required balanced journal entry and lines for classes adopted by
  the accounting kernel; and
- the unique source links needed for canonical event parity.

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

1. validates capability, original source, requested reversal date, open-period
   policy, reconciliation source, and mandatory reason;
2. rejects reversal chains and duplicate reversal;
3. creates one reversing receipt and exact reversing allocation;
4. stores direct original-allocation-to-reversing-allocation identity;
5. creates reversing Ledger and balanced journal projections;
6. refreshes compatibility balance/status;
7. preserves both original and reversal;
8. logs all identities and returns an idempotent result; and
9. never asks the operator to reverse a derived row first.

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
- Receipt, Ledger, journal, compatibility, and audit effects are atomic.
- Journals are balanced and deterministic.
- Source-linked projections are not generic operator records.
- Reversal is append-only, exact, directly linked, and period-safe.
- Deposit custody and owner contributions do not become operating income.
- No invoice, formal receipt artifact, close, or Owner Statement publication is
  created by this slice.

## Acceptance criteria

1. One checked receipt commits source, allocation, compatibility, Ledger,
   journal, audit, and idempotency result together.
2. Forced failure at each write boundary leaves none of those effects.
3. Partial receipts on different dates create separate allocation-based cash
   events and projections with stable historical balance-after snapshots.
4. A same-key/same-payload retry returns the same identities; altered payload
   fails.
5. Over-allocation, unsupported unapplied cash, closed period, wrong
   reconciliation source, cross-scope, unauthenticated, and unauthorized calls
   fail before mutation.
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
    the latter cannot accept cash after activation without an issued Plan 10
    invoice line.

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
  reversal-versus-close, and same-key retry;
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
| Track B — Lease and Occupancy History | Stable lease/party identities on future obligations | Current manually created obligations may link `lease_id`, while Plan 09 will consume Track B/Plan 04 authority | Require future generated obligations to retain exact period-effective lease and obligor identities; Plan 05 treats them as immutable scope inputs | Settlement must not infer today's tenant or rewrite historical payer scope | No for current Plan 05; yes before Plan 09-generated obligations settle | Yes |
| Track B — Lease and Occupancy History | Typed impact from term/party/occupancy corrections | Plan 04 blocks unsafe generation but Track B owns later history/corrections | Emit impact identities; never directly rewrite settled obligations, receipts, or projections | Settled cash must remain append-only when lease truth changes | No for current Plan 05 | Yes |
| Track A — Tenant invoice Plan 10 | Obligation and allocation source contract | `finance_income_items` and receipt allocations currently have no invoice-line identity | Consume Plan 05 obligation/allocation identities; invoice status is derived from valid allocations and never drives cash | Prevent invoice workflow from becoming a second settlement authority | No for Plan 05; yes for Plan 10 | No, contract is fixed here |
| Track A — Formal receipt Plan 11 | Receipt publication source contract | Current database receipts have no formal artifact identity | Publish only from a committed Plan 05 receipt/allocation result; rendering/delivery failure cannot roll back cash | Preserve source transaction atomicity while allowing safe publication retry | No for Plan 05; yes for Plan 11 | No, contract is fixed here |
