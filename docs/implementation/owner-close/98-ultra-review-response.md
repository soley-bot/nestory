# Codex Ultra Review Response

**Status:** Awaiting review.  
**Review target:** `docs/implementation/owner-close/README.md` and Plans 00-12.  
**Required repository baseline:** Record the exact latest merged `main` SHA reviewed here.  
**Implementation authorization:** None. This file is architecture and plan review only.

Codex Ultra: replace the placeholder sections below with one consolidated, repository-grounded response. Do not implement code, migrations, tests, or production changes in this review.

## 1. Verdict

Choose exactly one:

- `APPROVE`
- `APPROVE WITH CHANGES`
- `REJECT AND REPLAN`

**Verdict:** Awaiting review.

**Confidence:** Awaiting review.

**One-paragraph rationale:** Awaiting review.

## 2. Repository baseline and review coverage

- Latest merged `main` SHA reviewed:
- Compared with planning baseline `823deb4735b8124edefd1e68e451c21f1962b075`:
- Relevant merged changes since planning baseline:
- Files, migrations, RPCs, tests, and docs inspected:
- Evidence limits:

## 3. Architecture decision

Review the proposal that:

- domain-owned operational records remain the canonical write model;
- `property_cash_events_v1` is a normalized read contract rather than another independently writable source;
- receipt/payment allocation IDs are canonical cash-event identities;
- `ledger_entries` and accounting journals are deterministic projections and controls;
- property-period close is the readiness and lock object;
- published Owner Statements are immutable snapshots;
- owner balance is separate from property-period operating performance.

**Decision:** Awaiting review.

**Required architectural changes:** Awaiting review.

**Rejected alternatives and reason:** Awaiting review.

## 4. Decision gates A-I

| Gate | Decision | Repository evidence | Required plan edit or implementation constraint |
|---|---|---|---|
| A — View/RPC versus persisted event table | Awaiting review |  |  |
| B — Canonical cash event identity | Awaiting review |  |  |
| C — Reversal policy | Awaiting review |  |  |
| D — Property-period and compatibility lock scope | Awaiting review |  |  |
| E — Management-fee recognition | Awaiting review |  |  |
| F — Rent proration/frequency | Awaiting review |  |  |
| G — Owner balance/reserve/negative balance | Awaiting review |  |  |
| H — Minimum reconciliation evidence | Awaiting review |  |  |
| I — Legacy manual Ledger classification | Awaiting review |  |  |

## 5. Critical findings

List only issues that could make the implementation financially wrong, insecure, destructive, non-migratable, or internally inconsistent.

| Severity | Finding | Exact repository/plan evidence | Required correction | Blocking plan(s) |
|---|---|---|---|---|
| Awaiting review |  |  |  |  |

## 6. Missing domain rules

Identify which items require IPS confirmation before implementation and which can use a safe documented default.

| Rule | Needed before plan | Recommended default or question | Why it changes correctness |
|---|---|---|---|
| Awaiting review |  |  |  |

At minimum review:

- supported rent frequency and due-day behavior;
- proration convention;
- management-fee basis and recognition timing;
- management-fee included income categories;
- security-deposit application/retention policy;
- owner-balance scope;
- owner reserve policy;
- negative balance and distribution policy;
- unpaid-bill close policy;
- unapplied-cash policy;
- reconciliation evidence and accepted variance;
- closed-period reversal versus historical restatement.

## 7. Sequence and dependency review

**Recommended final order:** Awaiting review.

**Plans that may safely run in parallel:** Awaiting review.

**Plans that must be split:** Awaiting review.

**Plans that should be combined:** Awaiting review.

**Circular or hidden dependencies:** Awaiting review.

## 8. Plan-by-plan review

For every plan, choose `Accept`, `Revise`, `Split`, `Merge with another plan`, or `Remove`.

| Plan | Decision | Most important correction | Missing acceptance/verification evidence |
|---|---|---|---|
| 00 — Architecture and decision gates | Awaiting review |  |  |
| 01 — Parity diagnostics and safety rails | Awaiting review |  |  |
| 02 — Canonical property-cash contract | Awaiting review |  |  |
| 03 — Income settlement and reversal | Awaiting review |  |  |
| 04 — Expense settlement and reversal | Awaiting review |  |  |
| 05 — Maintenance and petty-cash handoffs | Awaiting review |  |  |
| 06 — Rent schedules and charge completeness | Awaiting review |  |  |
| 07 — Security-deposit custody | Awaiting review |  |  |
| 08 — Management-fee agreements and assessments | Awaiting review |  |  |
| 09 — Owner balances and distributions | Awaiting review |  |  |
| 10 — Property-period close and readiness | Awaiting review |  |  |
| 11 — Immutable Owner Statement publication | Awaiting review |  |  |
| 12 — Backfill, pilot, and production cutover | Awaiting review |  |  |

## 9. Schema and migration review

- Tables/views/RPCs that should not be added:
- Existing tables/columns that should be reused instead:
- Proposed constraints/indexes/RLS that are missing:
- Migration-order hazards:
- Backward-compatibility hazards:
- Generated-type or application-boundary hazards:
- Historical-data ambiguity not handled:
- Rollback/repair-forward concerns:

## 10. Accounting and reporting invariants

Confirm or correct the minimum invariants:

- every owner-relevant effect appears exactly once;
- cash reporting uses event date;
- obligations remain distinct from settlement;
- deposits and owner contributions are outside operating income;
- owner distributions are outside operating expense;
- ledger and journal projections are atomic, idempotent, balanced, and derived;
- reversals preserve originals and produce exact opposite effects;
- property-period close locks every canonical source;
- statement lines reconcile to owner opening/movement/closing balance;
- published versions and artifacts are immutable;
- historical ownership is effective-dated and frozen at close;
- no archive/contact edit rewrites prior statements.

**Confirmed invariants:** Awaiting review.

**Missing or incorrect invariants:** Awaiting review.

## 11. Security and authorization review

- RLS risks:
- SECURITY DEFINER/INVOKER risks:
- Direct-RPC bypass risks:
- Cross-organization link risks:
- Role/access risks:
- Storage/artifact risks:
- Period-lock bypass risks:

## 12. Verification review

- Required RED regressions missing from plans:
- Required pgTAP authorization/bypass cases:
- Required Vitest/application cases:
- Required browser flows:
- Required performance/scale evidence:
- Required migration/production evidence:
- Existing test assumptions likely to break:

## 13. October IPS scope judgment

Choose one:

- `Controlled pilot feasible after the corrected sequence`
- `Controlled pilot not feasible without reducing scope further`
- `Insufficient evidence`

**Judgment:** Awaiting review.

**Minimum pilot scope:** Awaiting review.

**Features/rules that must be deferred:** Awaiting review.

**Non-negotiable production blockers:** Awaiting review.

## 14. Exact edits required before implementation

Provide a concise, numbered list of changes to Plans 00-12. Refer to exact files and sections. Do not rewrite the entire package unless architecture materially changes.

Awaiting review.

## 15. Final implementation authorization recommendation

Choose exactly one:

- `Do not begin implementation`
- `Begin Plan 01 only after listed plan edits`
- `Begin Plans 01-02 only after listed plan edits`
- `Plan set is ready for sequential Codex Standard + High implementation`

**Recommendation:** Awaiting review.

**Conditions:** Awaiting review.
