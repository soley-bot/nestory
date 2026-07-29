# Plan 05 — Atomic Income Settlement, Projection, and Reversal

**Status:** Implemented by
`20260729151842_plan05_atomic_income_settlement.sql`; hosted database
application and production deployment remain separately authorized release
activities.
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

The initial pre-activation Plan 05 slice operates on existing obligation
identity. It does not require Plan 09 charge occurrences, the unnumbered
tenant-invoice coordination slice, or the unnumbered formal-receipt
coordination slice. At the later named activation, new-business settlement
requires the issued invoice identity defined below. Those later sources must
consume the settlement identities created here rather than replacing them.
Ratified Plan 10 remains security-deposit custody; ratified Plans 11-12 remain
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

- before the named Plan 22 cutover, current manual obligations may continue
  through Plan 05 while the later activation hook remains disabled;
- after that cutover, obligation-only settlement is limited to exact obligation
  IDs proven by immutable creation provenance and the reviewed Plan 20 manifest
  frozen into the named Plan 22 cutover to predate activation and retain the
  `legacy_obligation_only` remaining-balance disposition. Plan 20 assigns every
  candidate obligation exactly one immutable remaining-balance disposition:
  `legacy_obligation_only` or
  `migration_invoice_required`. The latter never falls back to obligation-only
  settlement and returns `migration_invoice_issuance_required` until its
  migration invoice is issued. `manual`, an income-type/description label, a
  caller flag, a backdated due/service date, or a present-day Lease/Person join
  cannot establish grandfathering;
- Plan 09-generated new-business obligations remain non-collectable while
  Plan 09 is shadow/readiness-only; and
- after the joint Plan 09/tenant-invoice cutover, Plan 09 is the sole normal
  creator of rent obligations and every new rent obligation requires one exact
  tenant-invoice header/version/line before settlement. Plan 05 persists those
  exact identities on the allocation, returns
  `current_issued_invoice_required` while they are absent, and never resolves
  them later from obligation identity alone.

The joint cutover is atomic for creation and collection. Its checked
application and database boundary rejects new manual `rent` obligations through
`createRentIncomeItemAction`, `create_finance_income_item`, every legacy
wrapper, and direct authenticated DML with a typed
`rent_occurrence_generation_required` result that points to Plan 09
generate/catch-up/repair. The UI is not the guard. Only a manual economic class
that its ratified owner/policy explicitly marks non-invoiceable may retain a
manual creation path; generic `manual`, `other`, or legacy labels are not an
escape hatch. Plan 05 installs the source-classification and future activation
hook without implementing Plan 09 or invoice authority.

Plan 22 may activate only while holding the same creation/cutover policy lock
used by the guarded obligation path. It locks and compares the complete current
grandfather candidate set with the reviewed Plan 20 manifest frozen into the
proposed activation. That set includes exact obligation IDs/dispositions and
every existing receipt/allocation/reversal identity, version, material hash,
and allocation publication class. Any drift fails with
`legacy_manifest_refresh_required`; Plan 20 must refresh and re-review the
manifest before another activation attempt. If manual creation or pre-cutover
settlement/reversal commits first, it changes that candidate set and invalidates
readiness. If cutover commits first, guarded creation fails with
`rent_occurrence_generation_required`. No row is adopted merely because its
creation transaction started before activation.

The obligation's remaining-balance disposition controls only future settlement
eligibility. It never classifies cash that already committed. Every rent
allocation in the activation cohort has an independent immutable
settlement/publication snapshot:

- `settlement_basis = pre_cutover_uninvoiced` with
  `publication_source_class = legacy_cash_non_publishable` requires exact
  Plan 20 receipt/allocation-manifest membership frozen and hash-checked by
  Plan 22;
- `settlement_basis = grandfathered_obligation_only` with the same
  non-publishable class requires the exact `legacy_obligation_only` obligation
  manifest item and Plan 22 activation version frozen when the later allocation
  commits; or
- `settlement_basis = invoice_bound` with
  `publication_source_class = eligible_invoice_linked` requires the exact
  normal or migration invoice header/version/line frozen when the allocation
  commits.

An explicitly owner-policy-approved non-invoiceable economic class retains its
own typed settlement basis outside this tenant-rent publication taxonomy; it is
not mislabeled as legacy cash.

For pre-cutover cash, Plan 20 appends allocation-level evidence keyed by the exact
receipt, allocation, and obligation IDs, signed amount/currency,
received/committed dates, original/reversal identity, Plan 20 manifest
item/version/hash, and Plan 22 activation version. It retains `NULL` invoice
identities plus `invoice_identity_not_historically_available` and
`artifact_not_historically_created`. Manifest membership and locked commit
identity, not received/created/business dates, prove the class. A later
obligation disposition or invoice issuance cannot mutate or recompute that
allocation class. A partially paid
obligation may therefore retain a pre-cutover
`legacy_cash_non_publishable` allocation while
`migration_invoice_required` governs only its remaining balance; a later
post-issuance allocation is independently `eligible_invoice_linked`.

For that post-activation path, settlement, reversal of an invoice-bound
allocation, and invoice cancellation acquire the shared
obligation/invoice/property-period locks in the same order and recheck the exact
allocation/reversal set. Settlement also rechecks that the referenced line
belongs to the current active `issued` invoice for the obligation. A
`cancelled`, `superseded`, or `issuance_abandoned` invoice cannot receive new
cash. Only an `invoice_bound` allocation freezing that exact
header/version/line blocks its cancellation while the allocation's net
unreversed signed effect is nonzero. Exact directly linked Plan 05 reversal
retains both rows and can restore cancellation eligibility when every positive
allocation against that exact line is fully reversed and the invoice-linked net
effect is zero. Earlier `legacy_cash_non_publishable` obligation cash neither
settles nor blocks cancellation of a later migration invoice. Its later exact
reversal still changes obligation outstanding; when issuance already froze the
old net balance, the invoice owner returns
`migration_invoice_replacement_required` and close blocks on that stale-invoice
condition until checked cancellation/replacement. Cancellation cannot rely on
an in-flight reversal; cancellation winning first makes new settlement fail
until an approved replacement is issued. A later invoice lifecycle change
never deletes or retargets a committed allocation or reversal.

The initial Plan 05 implementation does not create invoice tables or activate
Plan 09. It must leave an explicit source classification/guard contract so a
later cutover cannot accidentally accept invoice-required rent cash without
exact invoice authority.

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

For `record_receipt` and `reverse_receipt`, the caller supplies the proposed
receipt or reversal date as action material. The adapter fails closed when that
date is missing or unbound, includes it in the material hash, and returns its
destination month together with every distinct source month in deterministic
order.

The adapter and any preview that transports its result write no activity or
idempotency state. A composed Track B/Track A execution acquires every returned
property-period lock in the documented deterministic order inside the same
transaction, rechecks the adapter/material while locks are held, and only then
invokes the selected Plan 05 command. Track B may transport the opaque result;
it cannot update an obligation, receipt, allocation, Ledger/journal
projection, close source, or statement.

### 3. Freeze settlement materiality

At first settlement, persist an immutable allocation-level
classification/scope snapshot. Relevant obligation fields may additionally
freeze, but obligation state never substitutes for the allocation's own
evidence or class. The source must retain:

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
- any Plan 03 canonical source discriminator;
- its immutable allocation-level `settlement_basis` and
  `publication_source_class`; and
- exact classification evidence/version/hash. For pre-existing allocations this
  is the append-only Plan 20 evidence record rather than a rewrite of the
  original cash row.

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
the debtor automatically. Exact obligations proven to predate the named
cutover and lacking these historical identities retain their immutable
grandfather classification and `NULL`/unresolved evidence fields; Plan 05 must
not fabricate them from caller labels, backdated business dates, today's
primary Person, Lease header, term dates, or display labels.

Later obligation edits cannot reclassify already received cash. A correction
uses an exact reversal and a new source event.

Every reversal retains a direct link to the original allocation and inherits
its immutable settlement/publication class. Reversal of
`legacy_cash_non_publishable` remains Plan 05/reconciliation evidence and
creates neither an original nor reversal formal receipt, regardless of the
current remaining-balance disposition. An allocation lacking both an exact
invoice-bound snapshot and exact Plan 20 historical-cash evidence returns
`allocation_publication_classification_required`; it is genuinely unclassified
and cannot be repaired from labels, dates, current relationships, or the
obligation disposition.

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
The original Ledger projection is positive income. Its exact reversal is
negative contra-income with the same reserved allocation source identity; it
must reduce generic income totals to zero without appearing in expense totals.
The accounting journal still uses positive debit/credit line amounts in the
exact reversed orientation.

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
  classification, amount, currency, scope, settlement compatibility fields,
  obligation-level Ledger links, and transitions into or out of `posted`;
- preserve the current manual creation flow before activation, but make the
  named cutover and immutable grandfather manifest part of the checked
  creation/settlement boundary so no post-cutover manual rent action, RPC,
  wrapper, or direct DML can self-classify as legacy;
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
  header/version/line identities. Publication eligibility is immutable per
  allocation, not inferred from the obligation's current remaining-balance
  disposition: exact pre-cutover `legacy_cash_non_publishable` cash remains
  non-publishable even if the remaining obligation later receives a migration
  invoice, while only a later allocation that freezes that issued invoice is
  `eligible_invoice_linked`.

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
11. Before activation, current manual obligations retain the existing Plan 05
    path. After activation, the settlement eligibility contract distinguishes
    exact manifest-backed `legacy_obligation_only` obligations from Plan
    09-generated new business; labels, caller flags, backdated business dates,
    or current joins cannot confer grandfather status. New rent creation through
    the action, checked/legacy RPCs, or direct DML fails with
    `rent_occurrence_generation_required`, while the Plan 09 path persists an
    exact current-active issued invoice header/version/line under the shared
    lock and cannot accept cash against a cancelled, superseded, or abandoned
    invoice. `migration_invoice_issuance_required` and
    `current_issued_invoice_required` remain distinct settlement blockers.
    Every allocation retains an independent immutable publication-source class;
    a partially paid obligation assigned immutable
    `migration_invoice_required` can retain prior
    `legacy_cash_non_publishable` cash, and a later invoice-linked allocation
    on the same obligation can be eligible without making earlier cash
    publishable. An attempted remaining-balance-disposition mutation is
    rejected and cannot relabel prior cash. A reversal inherits the original
    allocation class; truly unclassified cash returns
    `allocation_publication_classification_required`.
    Settlement, exact reversal, and cancellation serialize under one lock
    order; cancellation requires a zero invoice-linked net unreversed signed
    effect with every positive `invoice_bound` allocation against that exact
    header/version/line exactly reversed. Historical
    `legacy_cash_non_publishable` cash is outside invoice cancellation
    eligibility, and no outcome deletes or retargets committed history.
12. The read-only Plan 05 owner adapter binds the proposed receipt/reversal
    date into its material hash, returns exact typed source
    identities/states/actions and every distinct source/destination period
    scope in deterministic order, and a composed executor holds every returned
    property-period lock in the same transaction before settlement or reversal
    mutation.

## Verification

### RED evidence

The pre-implementation baseline recorded focused proof that:

- recording a receipt does not create Ledger/journal projections;
- two partial receipts collapse into one obligation-level Ledger row;
- current reversal blocks on posted income and exposes derived posting order;
- generic Ledger mutation can change a linked compatibility row; and
- direct material obligation mutation bypasses the checked receipt path; and
- the current action and RPC can create and settle a fresh manual `rent`
  obligation without a Plan 09 occurrence or issued invoice.

### GREEN evidence

The implemented repository slice passes:

- a clean migration rebuild and local seed replay;
- schema lint and all 29 pgTAP files, including organization/role/RLS/grants,
  scope/currency/source validation, header/allocation balance, partial
  receipts, payload-bound retry, journal balance, atomic rollback, reversal
  pairing, contra-income Ledger totals, pre-allocation posting-bypass rejection,
  immutable provenance, direct-DML creation guards, cross-organization denial,
  and legacy compatibility;
- the current seven-scenario two-session income harness for
  receipt-versus-receipt, receipt/reversal idempotent retry, and both
  receipt/reversal-versus-close start orders;
- the Plan 03 Ledger and accounting transition concurrency harnesses;
- focused and full Vitest, demo-tool tests, ESLint, TypeScript, generated-type
  drift comparison, and the production build;
- authenticated browser proof for partial receipt, second receipt, reversal,
  and read-only source evidence; and
- `git diff --check`.

The later Plan 09/invoice activation gate must additionally prove
invoice-bound reversal-versus-cancellation, same-key
reversal-versus-composed-correction, cutover-versus-manual-rent creation,
cutover-versus-legacy-settlement/reversal, and generator-versus-manual-rent
creation. At the versioned
activation boundary, using its separately approved effective-time semantics,
manual creation or settlement/reversal winning first must change the locked
obligation/allocation/reversal candidate-set hash and force
`legacy_manifest_refresh_required`. Cutover winning first must make creation
fail with `rent_occurrence_generation_required` and make settlement recheck
the exact `legacy_obligation_only` or `migration_invoice_required`
disposition. Neither ordering may create an ambiguous/adopted row.

Hosted Supabase mutation, production backfill, and Vercel deployment require
separate explicit authorization. Repository merge was explicitly authorized
for this implementation.

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
- Operator notes and a merge-ready PR; no hosted mutation or deployment.

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
