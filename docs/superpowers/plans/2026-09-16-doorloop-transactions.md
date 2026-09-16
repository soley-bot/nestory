# Property and Unit Transactions Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review each task.

**Goal:** Deliver the approved property/unit transaction workflow with safe edits/deletions and consistent reports.
**Architecture:** Reuse authoritative posting commands and scoped finance data. Add a current-transaction projection, contextual actions and report links; retain append-only accounting history.
**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Vitest, pgTAP.
**Spec:** docs/superpowers/specs/2026-09-16-doorloop-transactions.md (approved by user).

## Global constraints
- No direct production schema writes; migrations through protected exact-main CI only.
- No live financial corrections without a concrete reviewed preview.
- Exact money, property/unit authority, closed periods and audit history remain enforced.
- PDF/XLSX use matching report scope; contributions/distributions/deposits are not operating profit.

## Task 1: Historical cash-allocation reproduction and recovery preview
Files: new supabase/tests/owner_distribution_historical_fee_recovery.sql; output evidence; new forward-only migration only if existing authority cannot perform safe correction.
- [ ] Reproduce 500 August receipt, 40 August fee, 40 September fee allocated in August, 5.60 utilities, and 454.40 September distribution.
- [ ] Assert moving distribution to August initially fails without partial writes.
- [ ] Exercise existing fee payment date correction with downstream cash dependency; verify supported atomic repair path or implement narrow forward-only fix.
- [ ] Assert corrected chronology leaves August closing cash zero after payout and September cash 460, with no fabricated funds.
- [ ] Produce an exact preview of affected records/dates/amounts for user approval; never save live changes.

## Task 2: Unified transaction projection and workspace
Files: finance-operations.types.ts, data/finance-operations.ts, new data/transaction-workspace.ts and tests; new components/transaction-workspace.tsx and tests; finance-operations-screen.tsx; property/unit finance routes.
Interface: transaction rows identify kind, sourceId, date, label, propertyId, unitId, tenant, amount, status, original source; existing source models remain authoritative.
- [ ] Add fixture tests covering charges versus payments, correction history exclusion, filters and unit scope.
- [ ] Implement pure projection with deterministic dates/order and no double counting; retain source identities for actions only.
- [ ] Add Transactions tab, searchable/filterable table, permission-scoped Add charge/Receive payment/Add expense/owner cash controls and details/edit/delete callbacks.
- [ ] Route source actions to existing dialogs, preserving record context. Do not invent a combined tenant/owner balance.
- [ ] Run projection and screen tests; validate empty and denied states.

## Task 3: Safe transaction mutation controls
Files: new transaction-command modules/tests, current owner correction modules, cash RPC migration if needed; existing expense/charge/payment actions.
- [ ] Inventory authoritative edit and void commands by source kind; expose only supported operations.
- [ ] Make Edit a single reviewed atomic correction; Delete a confirmed void with retained history. Never reverse then fail to replace in separate commits.
- [ ] Cover permission denial, stale data, closed periods, consumed cash, partial payment, repeat request and cancel without writes.
- [ ] Verify UI messages identify resolution for blocked operations and use plain business terms.

## Task 4: Contextual reports
Files: transaction-workspace report menu, reports filters/export tests.
- [ ] Generate owner statement/P&L links carrying selected property/unit and period.
- [ ] Verify shared screen/PDF/XLSX totals, source classification and inclusion of applicable property-level costs.
- [ ] Preserve published statement versions and readable owner-facing fields.

## Task 5: Review and release
- [ ] Review each lane for specification and code quality, resolve findings.
- [ ] Run focused tests, TypeScript, lint, clean CI database replay, full application checks and production build.
- [ ] Review final diff, commit, open PR, merge only green required checks, run protected release.
- [ ] Verify production SHA/schema parity and read/review/cancel live UI; record exact limits.

## Decisions / progress
- Approved design is copied into the isolated worktree. Use existing shared installed dependencies through a junction; do not alter dependency files without need.
- Main remains untouched until tested merge. No other worktrees or local database stacks will be reset.
