# Codex Ultra Review Request — Owner Close Financial Unification

**Model:** Codex Ultra  
**Mode:** Standard  
**Effort:** Extra High  
**Reason:** This is a repository-wide, financially high-risk architecture and migration review with competing source-of-truth, reversal, locking, and historical-data concerns.

## Context and baseline

Repository: `soley-bot/nestory`  
Planning branch: `agent/owner-close-implementation-plans`  
Planning baseline: `main` at `823deb4735b8124edefd1e68e451c21f1962b075`

The branch is documentation only. It proposes a sequential Owner Close and financial-unification program under:

- `docs/implementation/owner-close/README.md`
- `docs/implementation/owner-close/00-architecture-and-decision-gates.md`
- Plans `01` through `12`
- response template `98-ultra-review-response.md`

The review that led to these plans found that Nestory currently has competing financial representations: obligations/settlements, editable operational Ledger rows, and a compatibility accounting kernel. Owner Statement reads selected settlement sources; property/unit/performance/Ledger flows rely on other sources; maintenance and petty cash can bypass the current statement input; readiness can report zero-value statements as Ready; and statements are live rather than immutable.

Treat those as hypotheses to verify from the latest merged repository, not as facts to repeat without inspection.

Nestory's product boundary remains property-level operations and property accounting. Do not recommend corporate payroll, company overhead, tax accounting, full company P&L, generic ERP, or a product-facing general ledger unless repository evidence proves it is necessary for the narrow Owner Close outcome.

## Objective

Independently review the entire proposed plan sequence against the latest merged `main` and determine whether it is correct, complete, safely ordered, minimally scoped, and ready for later sequential implementation with Codex Standard + High.

This is review only. Do not implement code, create migrations, modify tests, execute a backfill, deploy, change production data, or merge anything.

## Required repository inspection

1. Fetch the latest remote state and record the exact latest merged `main` SHA.
2. Compare that SHA with the planning baseline and identify any merged changes that invalidate a plan.
3. Inspect the relevant current implementation rather than relying only on planning prose, including:
   - finance obligation, receipt, allocation, payment, deposit, petty-cash, Ledger, and accounting migrations;
   - current checked/private RPCs, RLS, grants, triggers, reversals, idempotency, and period locks;
   - Owner Statement loaders, allocation logic, diagnostics, recipient transformation, PDF/CSV endpoints, and tests;
   - property cash helpers, Finance close summary, Property/Unit Performance, and Income & Expense loaders;
   - maintenance actual-cost and direct Ledger posting paths;
   - lease terms and rent-generation behavior;
   - ownership schema and effective-date allocation;
   - documents/private Storage behavior relevant to immutable artifacts;
   - generated database types, seed/fixtures, pgTAP, Vitest, and browser verification scripts;
   - `PROJECT.md`.
4. Inspect all files in `docs/implementation/owner-close/`, not only the README.
5. Use exact file/migration/function/test evidence for material conclusions.

## Architecture questions to challenge

Do not approve the proposed architecture merely because it sounds coherent. Determine whether the repository supports or contradicts each choice.

1. Should existing domain records remain the write model with a normalized `property_cash_events_v1` view/RPC, or is a persisted canonical event table actually necessary?
2. Are receipt/payment allocation IDs the correct canonical cash-event identity for partial, multi-period, future multi-allocation, reversal, Ledger, and journal behavior?
3. Can `ledger_entries` safely become a deterministic projection while preserving legacy manual rows and current operational links?
4. Should the accounting kernel remain a derived compatibility control, be simplified, or be retired later? Do not propose product-facing generic accounting without necessity.
5. Is property-period close the right lock/readiness boundary, and how should it coexist with current organization-month Ledger locks and book periods?
6. Is the proposed reversal policy correct for closed periods versus later open-period reversals and historical restatement?
7. Does the proposed owner balance equation match the operational distinction between period performance and money IPS still holds for an owner?
8. Are security-deposit custody, management-fee assessment, reserve, owner contribution, and owner distribution classified correctly?
9. Does immutable statement versioning preserve enough internal evidence and owner-facing detail without duplicating live operational state unnecessarily?
10. Is the migration/cutover plan safely idempotent, resumable, reversible or repair-forward, and realistic for ambiguous legacy data?

## Plan-sequence review

For Plans 00-12:

- verify prerequisites and dependencies;
- find circular dependencies or assumptions that belong in an earlier plan;
- identify plans that are too large for one coherent pull request;
- identify plans that are artificially split and should be combined;
- identify safe parallelism, but default to sequential work where financial authority or migrations overlap;
- ensure every plan can merge without relying on an unspecified future repair;
- separate IPS October pilot requirements from later improvements;
- prefer the smallest coherent architecture that fixes the primary Owner Close outcome.

Pay special attention to whether:

- diagnostics should precede schema authority decisions;
- the canonical read contract can exist before write paths are unified;
- rent schedules depend on settlement work or can be isolated;
- deposits, fees, and owner balances require close-schema decisions earlier;
- statement persistence should be split into data model, rendering, and delivery PRs;
- backfill/cutover should be split into tooling, pilot data migration, and release PRs.

## Required correctness review

Verify that the plans explicitly prevent:

- one financial effect appearing more than once;
- a payment or receipt committing without required projections;
- a projection committing without its source event;
- obligation date being confused with cash date;
- deposits or owner contributions being counted as operating income;
- owner distributions being counted as operating expenses;
- source-linked Ledger rows being edited or archived independently;
- reversal mutating or deleting the original event;
- closed-period writes bypassing the lock through a settlement/deposit/fee/owner RPC;
- current owner/contact/archive state rewriting a historical statement;
- invalid or non-100% ownership being silently allocated;
- fuzzy legacy matching being treated as authoritative;
- migration rollback hiding canonical-only events;
- generic accounting scope expanding beyond Nestory's product boundary.

## Required security review

For every proposed schema/RPC boundary, examine:

- organization isolation;
- property/unit/lease/person/task scope consistency;
- RLS and table grants;
- SECURITY DEFINER versus SECURITY INVOKER search paths and privilege surface;
- direct-RPC bypass;
- role restrictions for admin, manager, and member;
- idempotency-key ownership and payload mismatch behavior;
- source/artifact Storage authorization;
- immutable table update/delete protection;
- lock and reopen authorization;
- migration tooling environment/project identity safeguards.

## Required verification review

Determine whether each plan has sufficient:

- RED regression evidence;
- focused pgTAP and direct-RPC bypass tests;
- Vitest and application tests;
- full reset, schema lint, generated-type drift, and full pgTAP requirements;
- authenticated browser verification;
- production-shaped performance evidence;
- PDF/CSV visual and authorization checks;
- migration dry-run, interruption/resume, stale-manifest, backup/restore, cutover, and rollback/repair-forward evidence.

Identify any existing tests or fixtures whose assumptions will become invalid and should be updated in the same implementation PR.

## IPS business-rule review

Separate:

1. rules that must be confirmed before any implementation;
2. rules needed only before a specific later plan;
3. safe defaults that can be documented without blocking early diagnostic work.

At minimum evaluate:

- monthly/non-monthly rent support;
- due-day and short-month behavior;
- proration;
- fee basis and recognition timing;
- deposit application/retention;
- owner-balance scope;
- reserves and negative balances;
- distribution approval/availability;
- unpaid bills at close;
- unapplied cash;
- reconciliation source and accepted variance;
- reversal versus restatement policy.

Do not invent IPS rules. Mark unresolved rules as explicit stop conditions.

## Required output

Update `docs/implementation/owner-close/98-ultra-review-response.md` on the planning branch with one consolidated review using every section in that template.

If repository write access is unavailable, post the complete response as one top-level pull-request comment using the same headings. Do not scatter the review across many inline comments unless a precise line-specific issue also benefits from one.

The response must include:

1. exact latest `main` SHA and coverage;
2. verdict: `APPROVE`, `APPROVE WITH CHANGES`, or `REJECT AND REPLAN`;
3. architecture decision and rejected alternatives;
4. explicit decisions for Gates A-I;
5. Critical findings with exact evidence;
6. missing IPS rules and when each blocks work;
7. corrected plan order and safe parallelism;
8. decision for every Plan 00-12;
9. schema/migration, accounting/reporting, security, and verification review;
10. October controlled-pilot judgment;
11. exact edits required before implementation;
12. one final implementation authorization recommendation.

## Acceptance criteria for the review

The review is complete only when:

- material conclusions cite exact current repository evidence;
- every plan receives an explicit decision;
- every architecture gate receives an explicit decision;
- no Critical concern is hidden as a future improvement;
- required plan edits are concrete and bounded;
- October MVP/pilot scope is separated from post-production improvements;
- the response states clearly whether Plan 01 may begin;
- no code, migration, production, merge, or implementation work was performed.

## Scope exclusions

- Do not implement any plan.
- Do not create or edit application code, SQL migrations, generated types, tests, package scripts, seed data, or deployment configuration.
- Do not run destructive database resets against user or hosted state.
- Do not change production or preview data.
- Do not merge, enable auto-merge, or mark implementation work ready.
- Do not expand into corporate/general accounting.

## Deliverables

- Completed `98-ultra-review-response.md` or one equivalent full PR comment.
- Exact repository evidence supporting the verdict.
- Corrected plan sequence and required edits.
- Clear stop/go recommendation for Plan 01.

## Stop conditions

Stop and report the blocker instead of guessing if:

- latest `main` cannot be verified;
- relevant repository files or migrations cannot be inspected;
- the planning branch differs from the described documentation-only scope;
- a required IPS business rule cannot be inferred safely;
- production data would need to be accessed or changed to complete the plan review; or
- the proposed architecture cannot guarantee one owner-relevant effect exactly once.
