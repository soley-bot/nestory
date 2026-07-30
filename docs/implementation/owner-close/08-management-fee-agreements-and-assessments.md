# Plan 08 — Management-Fee Agreements and Assessments

> **Legacy broad design source — not current Plan 08.** The ratified sequence
> split this analysis into **sequence 11, fee agreements/calculation**, and
> **sequence 12, assessment lifecycle**. Use
> `97-ratified-final-sequence.md`; do not paste this file directly into Codex.
>
> A narrow manual compatibility fee may be entered once and shown as an owner
> deduction plus the matching internal IPS fee view under
> `../../superpowers/specs/2026-07-30-ips-finance-workflow-simplification-design.md`.
> Automatic basis/rate calculation and assessment remain sequence 11-12 work.

**Mode:** Standard  
**Effort:** High  
**Reason:** Management fees currently exist as manually entered income categories rather than reproducible owner/property contract calculations.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin only after the canonical event contract, atomic settlements, and deterministic rent schedule are merged.

Current finance categories include management fee, leasing commission, service fee, and maintenance markup. Property cash logic can report fees earned, received, and outstanding from those manually entered rows, but no agreement, basis, rate, effective date, assessment, approval, waiver, or reversal entity proves why a fee exists.

## Objective

Model only the management-fee rules IPS actually uses, calculate reproducible period assessments from canonical source facts, approve/reverse them through checked workflows, and expose the exact fee basis on Owner Close and Owner Statement.

## Verified current behavior

- Company-fee compatibility categories are separated from ordinary property operating income in current cash helpers.
- Manual income obligations can represent fee earned/received/outstanding.
- The accounting compatibility kernel has client and management-company books, but no operator-facing fee agreement workflow.
- Owner Statement deducts management-fee amounts but cannot prove the contract or calculation.
- Current settings do not contain owner/property fee policy.

## Required business decisions

Before code, IPS must document for the initial release:

- supported fee type: fixed monthly, percentage of collected rent, percentage of charged rent, or a required combination;
- whether the basis includes parking, utilities, late fees, or only rent;
- whether the rate applies before or after refunds/reversals;
- minimum/maximum fee, if any;
- tax/VAT treatment, only if required for the statement;
- effective dates and mid-period agreement changes;
- whether fee is deducted from owner balance when assessed or only when internally transferred/collected;
- waiver/discount and approval rules;
- leasing commission or maintenance markup requirements for October.

Do not implement speculative fee variants.

## Required changes

### 1. Add management-fee agreements

Create an organization-scoped table, provisionally `management_fee_agreements`, with:

- property and owner scope;
- effective start/end dates;
- fee basis code;
- rate or fixed amount using exact numeric fields;
- currency;
- optional minimum/maximum only when required;
- explicit included source categories;
- approved tax setting only when required;
- status and archive lifecycle;
- created/approved/updated actors and timestamps;
- version/supersession relationship so historical assessment basis is not rewritten.

Prevent overlapping active agreements for the same owner-property and fee type unless a deliberate precedence rule is implemented.

### 2. Add immutable fee assessments

Create `management_fee_assessments` with:

- organization, property, owner, agreement, and period;
- assessment date;
- basis amount;
- rate/fixed-rule snapshot;
- calculated fee, tax, and total;
- currency;
- status such as draft, approved, waived, reversed;
- source manifest/hash and calculation version;
- approval/waiver/reversal actor, date, and reason;
- reversal relationship;
- source-linked ledger/journal projections if required by the approved architecture;
- unique active assessment per agreement/owner/property/period.

The assessment must retain the rule snapshot so later agreement edits cannot rewrite history.

### 3. Calculate from canonical source facts

Create a pure calculation module and checked RPC that:

- loads only the source categories included by the agreement;
- uses `property_cash_events_v1` for collected-rent basis;
- uses generated charge occurrences/obligations for charged-rent basis;
- nets reversals according to the documented rule;
- allocates by effective ownership when needed;
- applies fixed/rate/minimum/maximum/tax deterministically;
- produces a source manifest and hash;
- refuses unsupported mixed currency or ambiguous ownership;
- is idempotent for the same agreement, owner, property, period, and source version.

Do not calculate from Ledger totals or free-form category labels.

### 4. Separate assessment from transfer/collection

The design must explicitly represent the IPS rule selected in Plan 00:

- If approval immediately reduces owner payable, the approved assessment becomes an owner-liability deduction event.
- If physical/internal transfer is separately tracked, assessment records what is owed and a later owner cash/fee settlement event records what was collected.

Do not use a manual `finance_income_item` receipt as the unexplained bridge between the two.

### 5. Add approval, waiver, and reversal

- Draft calculation is reviewable before owner close.
- Approval freezes the calculation snapshot.
- Waiver requires reason and preserves the calculated amount for audit.
- Reversal is a new immutable opposite assessment/event with reason.
- An approved assessment cannot be edited; a changed rule produces a replacement version or reversal/new assessment.
- Closed-period behavior follows Plan 10.

### 6. Transition compatibility fee rows

After the new workflow is available:

- stop offering new manual management-fee/leasing-commission/service-fee/maintenance-markup rows where a supported agreement/assessment exists;
- preserve unsupported categories only when IPS confirms a real need;
- keep historical compatibility rows visible to parity diagnostics;
- Plan 12 classifies or migrates existing fee rows without double counting.

### 7. Add focused operator UX

Place agreement configuration where owner/property context is visible, not in a generic accounting screen.

Provide:

- active agreement summary and effective dates;
- selected fee basis and rate/fixed amount;
- month assessment queue;
- calculation evidence: basis sources, amount, rule, fee, tax, total;
- approve, waive, reverse, and exact source navigation;
- close blocker for missing or unresolved assessment.

Keep the interface table-first and operational. Do not expose chart-of-accounts configuration.

## Invariants to preserve

- Every fee is reproducible from an approved agreement and stable source facts.
- Agreement changes do not rewrite prior assessments.
- One active assessment per agreement/owner/property/period.
- Money, rates, and tax are exact numeric values.
- Fee basis excludes unsupported categories and respects reversals.
- Ownership and organization scope are enforced.
- Approval freezes source manifest and calculation.
- Waiver/reversal preserves history.
- Management fee is not property operating income to the owner.
- Journal projection remains derived and balanced.

## Acceptance criteria

1. Supported IPS agreement types can be created with effective dates and no invalid overlap.
2. A period calculation reproduces the expected fee from canonical source facts and exact rule snapshot.
3. Re-running unchanged calculation is idempotent.
4. A source change before approval updates the draft and source hash; after approval it requires reversal/replacement.
5. Reversed rent receipts affect a collected-rent fee basis according to the documented rule.
6. Waived fee remains visible with calculated amount and reason but has no owner-liability effect.
7. Approved fee appears exactly once in canonical owner-cash effects.
8. Existing manual fee rows do not double count after transition.
9. Cross-organization, invalid overlap, unsupported basis, mixed currency, ambiguous ownership, direct-RPC bypass, duplicate approval, and closed-period attempts fail.
10. Owner Close can identify missing, draft, approved, waived, and reversed assessment states.

## Verification

- RED test proving a manual fee row can be omitted or miscalculated without an agreement.
- Pure calculation tests for every approved IPS example, boundaries, rounding, reversal treatment, ownership, minimum/maximum/tax if supported.
- pgTAP for agreement overlap, RLS, checked RPCs, idempotency, immutable approval, waiver/reversal, period locks, journal balance, and bypass.
- Vitest for loaders, actions, source evidence, state transitions, and error mapping.
- Full application tests, lint, TypeScript, and build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flow: agreement → calculate → inspect basis → approve/waive → reverse → inspect close effect.
- Parity artifact and `git diff --check`.

## Scope exclusions

- No generic fee-rule engine.
- No corporate P&L, payroll, tax accounting, or chart-of-accounts UI.
- No fee type not documented by IPS.
- No automated bank transfer or invoicing integration.
- No Owner Statement publication yet.
- No production migration of compatibility fee rows.

## Deliverables

- IPS fee-rule decision record with worked examples.
- Append-only agreement and assessment migrations.
- Deterministic calculation module and checked RPCs.
- Approval/waiver/reversal workflow and source evidence.
- Focused property/owner fee UI.
- Full tests, generated types, and parity output.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- IPS fee basis or recognition timing remains necessary but undocumented;
- calculation depends on Ledger totals or free-form labels;
- agreement edits can rewrite approved history;
- fee assessment and collection are conflated contrary to IPS operations;
- one fee can appear through both compatibility income and new assessment; or
- the design expands into general company accounting.
