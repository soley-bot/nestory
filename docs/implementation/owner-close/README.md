# Owner Close Financial Unification

**Status:** Proposed implementation sequence under architecture review.  
**Planning baseline:** `main` at `823deb4735b8124edefd1e68e451c21f1962b075`.  
**Implementation rule:** Before starting any plan, fetch the latest merged `main`, replace the planning baseline with that SHA, confirm the new branch is clean, and re-check the referenced implementation.  
**Scope:** Documentation only. Nothing in this directory describes merged behavior until the corresponding implementation pull request is merged.

## Purpose

This package converts the 27 July 2026 product and technical due-diligence findings into a sequence of narrow implementation plans. The plans are intentionally separated so that finance, migrations, RLS, reporting, and historical-data changes are not mixed into one unreviewable refactor.

The due-diligence review established five repository-verified problems that this sequence must resolve:

1. Owner Statement reads finance obligations and settlement allocations, while Property, Unit, Ledger, maintenance, petty cash, and several reports rely on `ledger_entries`.
2. Recording an expense payment and posting an expense to the ledger/journal are separate write paths.
3. Maintenance and petty cash can create financial effects outside the Owner Statement's current payment-allocation source.
4. Owner Statement readiness validates ownership but does not prove charge, settlement, expense, fee, deposit, reconciliation, or close completeness.
5. Owner Statements are live calculations and exports, not immutable approved period artifacts.

The target is not a general accounting product. Nestory remains a property-operations and property-accounting system whose core financial output is a trustworthy property-period Owner Close.

## Proposed architecture in one sentence

Domain-owned operational records remain the write model; one normalized property-cash event contract becomes the reporting read model; `ledger_entries` and accounting journals become deterministic projections; and published Owner Statements become immutable snapshots of closed periods.

The architecture decision is detailed in `00-architecture-and-decision-gates.md`. Ultra must review and either approve or change that decision before any implementation plan starts.

## Sequential plan

| Order | Plan | Intended outcome | Depends on |
|---:|---|---|---|
| 00 | `00-architecture-and-decision-gates.md` | Ratify financial authority, source identity, close semantics, and product boundary | None |
| 01 | `01-parity-diagnostics-and-safety-rails.md` | Produce a read-only inventory of mismatches, duplicates, orphans, and historical ambiguity | 00 |
| 02 | `02-canonical-property-cash-contract.md` | Add one normalized, organization-scoped event read model without changing writes | 01 |
| 03 | `03-income-settlement-and-reversal.md` | Make receipts, allocations, ledger projection, journal projection, reversal, and period checks atomic | 02 |
| 04 | `04-expense-settlement-and-reversal.md` | Make payments, allocations, ledger projection, journal projection, reversal, and period checks atomic | 03 |
| 05 | `05-maintenance-and-petty-cash-handoffs.md` | Route operational expenses into the canonical event contract exactly once | 04 |
| 06 | `06-rent-schedules-and-charge-completeness.md` | Make expected rent deterministic and missing charges detectable | 02; may run after 05 only if isolated |
| 07 | `07-security-deposit-custody.md` | Remove the dual income/deposit interpretation and make custody movements auditable | 02, 03, 04 |
| 08 | `08-management-fee-agreements-and-assessments.md` | Calculate approved fees from IPS rules instead of relying on manual income rows | 02, 03, 04, 06 |
| 09 | `09-owner-balances-and-distributions.md` | Add opening balances, contributions, reserves, payouts, reversals, and closing owner liability | 02, 07, 08 |
| 10 | `10-property-period-close-and-readiness.md` | Replace technical queue readiness with a property-month close that blocks incomplete statements | 03-09 |
| 11 | `11-immutable-owner-statement-publication.md` | Persist itemized versions, approvals, source manifests, PDFs, reissues, and delivery state | 10 |
| 12 | `12-backfill-pilot-and-production-cutover.md` | Reconcile legacy data, cut reports over safely, and prove an IPS pilot end to end | 01-11 |

Plans are merge-ordered unless a plan explicitly allows isolated parallel work. No later plan may silently compensate for an unresolved invariant in an earlier plan.

## Cross-cutting invariants

Every implementation pull request must preserve all of the following:

- Organization isolation at table, RLS, RPC, server-loader, and export boundaries.
- Exact numeric money fields and explicit currency codes; no JavaScript floating-point business calculations.
- Business dates separated from audit timestamps.
- Property obligations separated from settlement events.
- Cash reporting based on receipt/payment/event dates, not invoice or charge dates.
- Security deposits and owner contributions excluded from property operating income.
- Balanced and idempotent journal projections while the accounting compatibility kernel remains.
- One stable source identity for every reportable event and every reversal.
- No generic edit/archive of source-linked financial projections.
- Closed periods reject source writes; corrections use a controlled reopen or a dated reversing event according to the ratified close policy.
- Existing documents, activity logs, timeline links, and exact record links remain traceable.
- Append-only migrations, backward-compatible reads during transition, generated-type checks, and no destructive production reset.
- No corporate payroll, company overhead, tax accounting, generic chart-of-accounts UI, or broader ERP scope.

## Required verification depth

Finance, RLS, migration, accounting, and cross-domain plans require:

1. A failing regression test first when practical.
2. Focused Vitest and pgTAP coverage for the changed invariant.
3. Full application tests.
4. ESLint, TypeScript, and production build.
5. Local Supabase reset, schema lint, generated-type drift check, and the full pgTAP suite.
6. Direct-RPC bypass and cross-organization authorization tests.
7. Authenticated browser verification for every changed operator workflow.
8. `git diff --check`, clean worktree, remote parity, and hosted checks before review-ready status.

Production writes, migrations, backfills, or verification require explicit authorization. A green application suite is not sufficient evidence unless the full lease-to-statement chain is proven.

## Review workflow

1. Codex Ultra reviews this entire package against the latest repository and writes one consolidated response as requested in `99-ultra-review-request.md`.
2. The plans are revised until the architecture, sequence, invariants, and scope are clear.
3. Only then does Codex Standard + High implement one plan per branch and pull request.
4. Each implementation prompt uses the then-current merged `main` SHA and only the delta for that plan.
5. Codex must not merge unless explicitly requested.

## Review status

- [ ] Ultra verified the repository references.
- [ ] Ultra approved or amended the architecture decision.
- [ ] IPS fee, proration, reserve, payout, and reconciliation rules are documented where required.
- [ ] Plan sequence and pull-request boundaries are accepted.
- [ ] No P0 invariant is deferred into an unspecified future phase.
- [ ] Implementation may begin with Plan 01.
