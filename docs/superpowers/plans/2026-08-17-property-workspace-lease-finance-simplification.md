# Property Workspace, Lease, and Finance Simplification Implementation Plan

**Goal:** Deliver one chronological Property to optional Unit to Lease to
activation to scoped Finance workflow without a global Rent policy prerequisite.

**Architecture:** Property is the aggregate root; property-only Leases use the
existing nullable Unit relationship. Lease billing terms own generation rules.
Contextual Finance composes canonical invoices, expenses, payments, and owner
accounts rather than introducing a second settlement model.

**Spec:** `docs/superpowers/specs/2026-08-17-property-workspace-lease-finance-simplification-design.md`

## Execution Order

- [x] Update the durable product contract and mark the older Lease plan and
  spec partially superseded.
- [x] Add `properties.rental_structure` and `properties.registered_date`,
  checked structure transitions, optional user code with generated fallback,
  and the simplified Property create form with optional photo.
- [x] Make Lease creation contextual to a `single_space` Property or a Unit,
  remove the global create action, and keep the first monthly form minimal.
- [x] Snapshot visible rent-generation rules on Lease billing terms, backfill
  historical authority safely, and retire ordinary global Rent policy writes.
- [x] Implement Activate today and scheduled activation through one idempotent
  checked path.
- [x] Add canonical manual tenant charges with duplicate base-rent protection.
- [x] Compose scoped Property and Unit Finance tabs from canonical loaders and
  actions; retain Unit owner account as a parent-Property summary.
- [x] Reframe global Finance for portfolio review and move Ledger and Petty cash
  to Advanced finance without deleting routes or data.
- [x] Update disposable fixture stories, run database and application gates,
  complete real-browser journeys, and reconcile historical financial outputs.
- [x] Document additive Stage A release evidence; defer destructive legacy
  retirement until a separate post-cycle Stage B decision.

## Non-negotiable Guardrails

- Start each behavior change with a focused failing test.
- Never create a fake Unit or a parallel Finance authority.
- Keep money exact-decimal, idempotent, organization-scoped, RLS-protected, and
  checked-RPC-owned.
- Preserve historical policies, invoices, payments, owner effects, Ledger,
  Petty cash, reports, and activity history.
- Do not reset a hosted database or mutate production records for verification.
