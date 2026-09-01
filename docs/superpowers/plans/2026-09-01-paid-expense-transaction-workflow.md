# Paid Expense Transaction Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vendor/person payees, real descriptions, multi-line paid-expense transactions, and explicit authoritative owner-cash application without breaking the released single-line accounting workflow.

**Architecture:** Add an immutable transaction parent and line links that orchestrate the existing checked expense submissions as downstream-compatible financial lines. New transaction RPCs own atomic submit/review/reversal and actor-bound idempotency; the application groups those lines into one operator transaction while historical submissions remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Supabase PostgreSQL/RLS/RPC/Storage, Vitest/Testing Library, pgTAP, Node concurrency harnesses.

**Spec:** `docs/superpowers/specs/2026-09-01-paid-expense-transaction-workflow-design.md`

## Global Constraints

- Base is fetched `origin/main` SHA `cf4925c625993ee9580f1e954a0c8e9dd54d9a66`.
- Use additive forward-only migrations only; do not edit released migrations.
- Do not mutate hosted Supabase, Pilot, production, or Vercel.
- Keep payee/date/funding/reference/evidence/review at transaction level and property/unit/category/description/amount at line level.
- Keep exact decimal money, category authority, branch scope, RLS, maker-checker review, source lineage, idempotency, and exact reversal.
- Blank owner-cash amount preserves automatic allocation; explicit amounts fail closed on over-allocation.

---

### Task 1: Freeze Application Contracts Under RED

**Files:**
- Modify: `src/features/finance-operations/actions.test.ts`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- Modify: `src/features/finance-operations/data/finance-operations.test.ts`

**Interfaces:**
- Consumes: current `submitExpenseAction`, `FinanceOperationsScreen`, and `toExpenseSubmissionSummary`.
- Produces: failing behavioral contracts for transaction payloads, payee choices, line editing, descriptions, owner cash, and grouped summaries.

- [ ] Add an action test whose literal two-line JSON payload contains two properties, descriptions, exact amounts, and one explicit owner-cash amount; require `submit_expense_transaction` and transaction-level evidence anchored to the first property.
- [ ] Add action rejection tests for malformed line JSON, exponent/overprecision money, line amount zero, explicit owner cash above the line amount, missing person/external payee, and multiple tenant lines.
- [ ] Add UI tests for existing Vendor/Person options, deliberate external payee input, `/vendors?action=create`, description per line, `Add line`, removal, transaction total, and blank-versus-explicit owner cash.
- [ ] Add loader tests requiring two child submissions to become one transaction summary with two ordered lines while an old unlinked submission remains a single-line summary.
- [ ] Run the three focused Vitest files and retain the expected failures before production edits.

### Task 2: Freeze Database Authority Under RED

**Files:**
- Create: `supabase/tests/expense_transaction_workflow_test.sql`
- Modify: `scripts/paid-cost-concurrency.node-test.mjs`

**Interfaces:**
- Consumes: released paid-cost submit/review/reversal, category, evidence, owner-cash, branch, and idempotency contracts.
- Produces: pgTAP and real-session race oracles for the new parent workflow.

- [ ] Add pgTAP contracts for transaction/scope/line table RLS and grants, person versus external payees, cross-property pooled funding, dedicated-source rejection, unit/property mismatch, inactive category rejection, and branch denial.
- [ ] Add literal one-line and two-line submit assertions proving no pre-approval financial effects and exact child snapshots.
- [ ] Add approve/reject assertions proving one maker-checker decision, source-linked Ledger/P&L/owner effects per line, explicit owner-cash targeting, automatic default behavior, and rollback on over-allocation.
- [ ] Add transaction reversal assertions proving exact opposite child effects and immutable originals.
- [ ] Extend the concurrency harness for duplicate transaction submit and approve/reject/reversal races with no pending idempotency rows or duplicate financial effects.
- [ ] Run the focused pgTAP and concurrency tests and retain the expected missing-schema/RPC failures.

### Task 3: Implement Additive Transaction Database Authority

**Files:**
- Create via `npx supabase migration new paid_expense_transactions`: `supabase/migrations/<generated>_paid_expense_transactions.sql`
- Regenerate: `src/types/database.generated.ts`

**Interfaces:**
- Produces: `expense_transactions`, `expense_transaction_scopes`, `expense_transaction_lines`, `submit_expense_transaction`, `review_expense_transaction`, `reverse_expense_transaction`, and targeted owner-cash allocation.

- [ ] Create the migration with the Supabase CLI; define immutable organization-scoped tables, unique keys, exact-money checks, foreign keys, RLS, explicit grants, and supporting indexes.
- [ ] Add transaction-aware evidence eligibility that permits one document only across children of the same immutable transaction and validates every recorded property scope.
- [ ] Implement `app_private.apply_owner_cash_to_expense_line(...)` with advisory locking, authoritative held-cash and target-line outstanding checks, exact append-only allocation, and responsibility refresh.
- [ ] Replace `app_private.approve_expense_submission(...)` additively so line descriptions flow to expense/owner/tenant/Ledger descriptions and explicit owner-cash amounts use the targeted helper; unlinked submissions retain released behavior.
- [ ] Implement transaction submit/review/reversal RPCs using parent and deterministic child idempotency keys, checked property authority, existing child RPCs, one reviewer decision, and atomic rollback.
- [ ] Revoke `PUBLIC`/`anon`, grant only intended execution/read privileges, and add comments for the authority boundary.
- [ ] Reset the local database, regenerate types, and run the focused pgTAP RED to GREEN.

### Task 4: Implement Application Boundary And Read Model

**Files:**
- Modify: `src/features/finance-operations/actions.ts`
- Modify: `src/features/finance-operations/paid-cost-evidence.ts`
- Modify: `src/features/finance-operations/finance-operations.types.ts`
- Modify: `src/features/finance-operations/data/finance-operations.ts`
- Modify: `src/features/finance-operations/finance-operations-view-model.ts` only if transaction status presentation requires it.

**Interfaces:**
- Consumes: generated `submit_expense_transaction`, `review_expense_transaction`, and `reverse_expense_transaction` RPC types.
- Produces: validated server-action transaction payloads and grouped `ExpenseSubmissionSummary` records.

- [ ] Parse a strict JSON line array with exact string money and validate owner-versus-tenant cardinality before evidence upload.
- [ ] Resolve a person payee label from the server-owned organization-scoped People query; accept an external label only under the deliberate external mode.
- [ ] Register evidence once using a deterministic transaction scope key and call the transaction submit RPC with minimal safe return values.
- [ ] Route review/reversal actions to transaction RPCs when `transactionId` exists and preserve existing RPCs for historical submissions.
- [ ] Load transaction/scopes/line mappings and active person roles; group child summaries into one ordered transaction summary without widening client DTOs.
- [ ] Run focused action/data tests to GREEN.

### Task 5: Implement The Operator Form And Review

**Files:**
- Modify: `src/features/finance-operations/components/finance-operations-screen.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`

**Interfaces:**
- Consumes: grouped summaries, People roles/options, property/unit/category/source options, and authoritative position guidance.
- Produces: one transaction form and transaction-aware review/reversal drawers.

- [ ] Replace free text `Paid to` with a shared selector that orders Vendors first, supports other People, and reveals a required external label only for `One-time external payee`.
- [ ] Add the safe `Create vendor` link to `/vendors?action=create` in a new tab so the current draft is not replaced.
- [ ] Render owner lines with property, unit, owner-expense category, description, amount, optional explicit owner-cash amount, add/remove controls, and exact transaction total.
- [ ] Keep tenant recovery one-line and preserve its invoice/markup behavior.
- [ ] Filter funding sources to those valid for every line and clear an invalid dedicated source when line scope changes.
- [ ] Show transaction lines and owner-cash instructions in review/reversal history, with one transaction-level decision.
- [ ] Run focused component/action/data tests to GREEN and perform a mutation check on each required behavior.

### Task 6: Verify, Review, And Publish The Branch

**Files:**
- Modify only scoped files above if verification finds a real defect.

**Interfaces:**
- Produces: fresh evidence for a reviewable unmerged PR.

- [ ] Run clean reset, fixture, generated types, focused and full pgTAP, DB lint, migration discipline, and paid-cost concurrency.
- [ ] Run focused Vitest, `npm run test:all`, TypeScript, ESLint, UI route/copy coverage, production build, and `git diff --check`.
- [ ] Review the complete diff against every requirement, fix all Critical/Important findings, and rerun affected gates.
- [ ] Update `PROJECT.md` only where the durable paid-expense flow changed.
- [ ] Commit the verified scope on `codex/paid-expense-multiline-owner-cash`, push it, and open a PR to `main` without merging or deploying.

## Self-Review

- Spec coverage: every user requirement maps to Tasks 1-5, and Task 6 preserves the requested release boundary.
- Placeholder scan: all implementation boundaries, RPC/table names, tests, and verification commands are explicit.
- Type consistency: transaction IDs select new review/reversal RPCs; child submission IDs retain released source lineage; line owner-cash amount is nullable exact decimal where null means automatic.
