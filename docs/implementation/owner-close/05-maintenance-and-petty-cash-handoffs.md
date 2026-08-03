# Plan 05 — Maintenance and Petty-Cash Financial Handoffs

> **Legacy broad design source — not current Plan 05.** The ratified sequence
> split this analysis into **sequence 07, maintenance handoff**, and **sequence
> 08, petty-cash authority**. Use `97-ratified-final-sequence.md`; do not paste
> this file directly into Codex.
>
> Current Petty Cash form/table simplification is governed by
> `../../superpowers/specs/2026-07-30-ips-finance-workflow-simplification-design.md`.
> It may clarify physical movement and economic responsibility but does not
> implement sequence 07 or 08 authority.

**Mode:** Standard  
**Effort:** High  
**Reason:** Maintenance and petty cash currently create owner-relevant costs outside the same settlement path used by Bills & Expenses and Owner Statement.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin only after Plans 00-04 are approved and merged.

Current maintenance behavior separates actual-cost capture from official financial posting. Admins can directly create or link a maintenance ledger effect. Current documentation also confirms there is no prefilled bill/petty-cash handoff, reciprocal link, duplicate prevention, or void recovery. Petty cash can post cleared expenses directly into the ledger and accounting journal.

## Objective

Connect maintenance and petty-cash expenses to `property_cash_events_v1` exactly once, with reciprocal source links, controlled handoff state, duplicate prevention, reversal/void recovery, documents, and period-lock enforcement.

## Verified current behavior

- Managers may record maintenance actual cost but cannot officially post finance.
- Admins may link or post a maintenance ledger effect.
- Maintenance completion evidence and actual cost are separate concepts.
- Bills & Expenses supports task linkage at the database level.
- Petty cash has accounts, monthly periods, advances, cash-in, expense rows, running balance, owner-reimbursable handling, rollover, and direct ledger posting for cleared expenses.
- Petty cash does not yet capture a separate physical cash count or variance-resolution workflow.

## Required changes

### 1. Add a maintenance finance handoff entity

Create an organization-scoped table, provisionally `maintenance_finance_handoffs`, with:

- task ID and property/unit scope;
- handoff type: bill or petty cash;
- either `finance_expense_item_id` or `petty_cash_entry_id`, never both;
- handoff status: draft, active, voided, replaced, or equivalent controlled lifecycle;
- amount/currency snapshot and actual-cost comparison;
- created/approved/voided actor and timestamp;
- replacement or void reason;
- unique rule allowing at most one active financial handoff per task unless an explicit split-cost design is approved.

If IPS requires multiple vendor bills for one task, revise the uniqueness rule to a controlled one-to-many model with a task-level expected total. Do not accidentally allow duplicates through unrelated rows.

### 2. Replace direct maintenance ledger posting

For new maintenance costs:

- Admin selects Create bill, Link existing bill, or Record through petty cash.
- Creating a bill pre-fills property, unit, task, vendor, actual cost, completion/invoice date, category, description, and available document links.
- Linking an existing bill validates same organization, property, optional unit, amount/currency compatibility, and absence of another active task handoff.
- Petty-cash handoff validates the selected account/period and links the task reciprocally.
- No new maintenance RPC writes an unrelated `ledger_entries` row directly.
- The final cash effect occurs when the bill is paid through Plan 04 or when a petty-cash expense is cleared/posted through the controlled petty-cash path.

Existing task-to-ledger links remain read-only legacy evidence until Plan 12.

### 3. Reconcile actual cost and finance cost

Actual cost remains an operational fact. Financial handoff amount is the accountable money fact.

Rules:

- If actual cost is missing when a handoff is attempted, require entry or explicit no-cost handling.
- If actual cost and handoff total differ, require a reason and show the variance.
- A task cannot be marked financially complete while its active handoff total is unresolved.
- Changing actual cost after an approved/paid handoff cannot silently rewrite finance; require an additional bill, credit/reversal, or documented variance.

Do not make every maintenance completion require a positive expense. Warranty, owner self-supply, no-cost inspection, and cancelled work must have explicit no-cost outcomes.

### 4. Make petty-cash expense posting canonical

Treat each cleared petty-cash expense as its own canonical operational cash event, sourced by the petty-cash entry ID.

The controlled posting RPC must atomically:

- validate admin authority, active account/period, available cash policy, status, property/unit/task scope, and open period;
- create the source-linked ledger projection;
- create the balanced journal projection;
- mark the entry posted/linked idempotently;
- update reciprocal maintenance handoff when present;
- write activity history;
- return projection identities.

Do not also create a finance payment allocation unless the approved architecture explicitly models the petty-cash entry as a settlement against an expense obligation. Whichever approach is selected must produce one canonical event, not two.

### 5. Add reversal and void recovery

- A draft handoff can be cancelled without a cash effect.
- An unpaid bill link can be replaced or voided with reason.
- A paid bill uses the Plan 04 payment reversal/credit path.
- A posted petty-cash expense uses an immutable reversing petty-cash event or approved correction path.
- Voiding or archiving a task never deletes or hides a settled financial effect.
- A voided finance source updates the handoff state and returns the task to an actionable finance exception.

### 6. Preserve documents and evidence

The handoff must expose linked invoice/receipt documents from both Maintenance and Finance without copying or deleting binaries. Required evidence policy may remain configurable later, but the operator must see whether an invoice or receipt is missing before period close.

### 7. Update workflows and navigation

Maintenance quick view/detail should show:

- operational actual cost;
- finance handoff state and type;
- linked bill or petty-cash record;
- paid/posted/reversed state;
- variance and missing evidence warnings;
- exact link into Bills & Expenses or Petty Cash.

Bills & Expenses and Petty Cash should show the reciprocal maintenance task link.

Managers may continue recording actual cost. Only authorized admins perform or approve the financial handoff unless a later scoped finance-manager role is implemented with complete RLS and route enforcement.

## Invariants to preserve

- Actual cost and financial settlement are distinct but reconciled.
- One owner-relevant effect appears exactly once in the canonical contract.
- No new direct maintenance ledger write.
- Petty-cash posting is atomic, idempotent, source-linked, and period-aware.
- A task cannot link across organization/property scope.
- Settled financial history survives task/archive lifecycle changes.
- Source documents stay private and traceable.
- Managers cannot bypass admin finance authorization.
- No-cost work remains valid when explicitly classified.

## Acceptance criteria

1. Admin can create a prefilled bill from a task and the reciprocal link appears on both records.
2. Admin can link one valid existing bill and duplicate/foreign-scope links are rejected.
3. Admin can record a task cost through petty cash and the canonical event appears once.
4. Paying the maintenance bill through Plan 04 produces the Owner Statement expense source without a separate maintenance ledger effect.
5. A posted petty-cash expense produces one canonical event plus derived projections.
6. Actual-cost variance is visible and cannot be silently overwritten after settlement.
7. Voiding/reversing the linked financial source returns a clear exception state without deleting history.
8. Generic task archive/restore does not remove settled expense history.
9. Manager/member direct-RPC and cross-organization bypass attempts fail.
10. Plan 01 parity output reports no new duplicate or missing handoff for supported flows.

## Verification

- RED regression for a maintenance ledger cost absent from Owner Statement and for potential maintenance/bill double counting.
- pgTAP for handoff uniqueness, reciprocal scope, RLS, role limits, idempotent petty-cash posting, locks, reversal/void behavior, journal balance, and direct-write bypass.
- Vitest for maintenance actions/components, prefill mapping, variance copy, finance links, and petty-cash workflow.
- Full application tests, lint, TypeScript, and build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flows:
  - maintenance task → actual cost → create bill → approve/pay → inspect statement source;
  - maintenance task → petty cash → clear/post → inspect statement source;
  - void/reverse recovery.
- Canonical parity artifact and `git diff --check`.

## Scope exclusions

- No broad vendor procurement, quote comparison, purchase order, or inventory workflow.
- No automatic owner approval thresholds beyond a future policy hook.
- No full physical petty-cash reconciliation; counted cash/variance may be added in Plan 10 or production hardening if IPS requires it.
- No owner statement publication yet.
- No production backfill of existing task ledger links.

## Deliverables

- Append-only migration for maintenance finance handoffs and any required petty-cash controls.
- Checked RPCs for create/link/replace/void handoffs and canonical petty-cash posting/reversal.
- Updated maintenance, Bills & Expenses, and Petty Cash actions/loaders/components.
- Reciprocal exact links and activity history.
- Full tests and generated types.
- Updated parity artifact.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- one task cost can still reach Owner Statement through both bill/payment and direct ledger/petty-cash paths;
- the design assumes one bill per task while IPS requires split invoices and no controlled alternative exists;
- a manager can create an official financial effect without enforced authorization;
- task archive or finance void deletes history;
- actual-cost edits silently rewrite paid finance; or
- petty-cash posting cannot be made atomic and reversible.
