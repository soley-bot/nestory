# Organization financial reset assessment template

Status: generic assessment and review guidance. An actual reset is **not implemented or approved for execution** by this document. Customer-specific consent, target identifiers, financial amounts and observed counts belong in the private operation record. October and November below are illustrative reporting periods, not statements about a hosted customer's books.

## Scope requiring a private decision record

Record whether the approved operation removes all existing transactions, including entries in the restart month, and whether tenant arrears, prepayments and deposit custody carry forward. If all recorded balances are to reset, establish approved known-zero owner components at the selected month boundary and have users re-enter actual owner contributions. This template supplies no customer authorization or selected target.

Preserve properties, units, owners, tenants, leases, their identities and relationships, and contractual terms. Deposit requirements are contractual terms; a zero cash balance must not change an agreed deposit requirement to zero.

Recommended approach: a one-time, recoverable, organization-scoped financial reset with an explicit October opening baseline. There is no existing production-ready finance-only reset executor. Do not use the old demo cutover planner, a database reset, a list of UI deletions, or `TRUNCATE CASCADE`.

The resulting books describe the new reporting period. Reports will reflect actual October activity only after complete, verified re-entry. A software reset does not remove money physically held or amounts actually owed. Deposits still held must be recorded again before deposit/custody reports are considered accurate. Pre-October reports must be identified as outside the retained reporting period, not represented as evidence that no historical activity occurred.

## Evidence and limits

- Reviewed fetched `origin/main` at `4129597c75f948a83deab46546a58e70a613b6c5` (21 October, PR #250), with three independent specialist reviews.
- The primary checkout remains at `bff350818735032988c621a6a4aab02bf1a2a22d` with existing unpublished changes. Those files were preserved; this assessment does not assume that checkout is deployed production.
- Capture the exact project, organization, operational timezone and financial start date in the private operation record. Independently verify migration-content parity and deployed application SHA.
- Inventory other organizations and preserve their data and access. Never infer a single-organization project from the intended target.
- Keep hosted metadata, aggregate financial counts, selected identities and readiness findings private. An assessment is not a backup, restoration rehearsal or execution manifest.
- Re-capture identities, counts and hashes under the actual write freeze.

### Private live inventory requirements

Inventory master records and archived states; roles and ownership; leases and contractual terms; invoices, lines, corrections and payments; income/expense sources; ledger projections; owner movements and openings; deposit headers and events; periods and publications; artifacts and external evidence. Retain exact row identities, counts, financial totals and hashes only in the restricted operation evidence.

Deposit header status and configured amounts do not independently prove physical custody. Reconcile event history rather than treating header sums as cash. Existing blocked periods, including `source_allocation_incomplete` or `opening_component_unknown`, need an explicit disposition and a valid new opening. Verify effective and historical ownership, branch access, currency coverage and opening eligibility across the complete retained roster.

## What the reset must handle

This is a dependency inventory, **not an executable deletion order or exhaustive verified manifest**. Final scope must be derived from live foreign keys, triggers, polymorphic source references and report readers across `public` and `app_private`.

| Area | Required treatment |
| --- | --- |
| Master data | Preserve properties, units, people, contacts, roles, ownership assignments, branches, memberships and access configuration. Preserve original IDs and archived states. |
| Lease configuration | Preserve leases, terms, billing terms, rent policies, parties, occupancies/participants, lifecycle/activation records and import provenance. Do not move lease start dates to October to suppress billing. |
| Finance configuration | Preserve accounts, categories, account roles/source/category mappings, reconciliation-source configuration and petty-cash account configuration. Separate configuration idempotency from transaction idempotency. |
| Tenant billing and collection | Reset invoices, lines, rent segments, invoice corrections, credits, payments/allocations, owner collection confirmations/allocations, receipt projections, income items, historical settlement reapplications and rent-generation exceptions. |
| Expenses and payments | Reset submissions, transactions/lines/scopes, legacy replacements, customer adjustments, owner responsibilities, expense items, payments/allocations and linked evidence state. |
| Owner transactions | Reset invoices/lines, payments/allocations, charge cash allocations, fees/date corrections, cash events, withdrawals, source consumptions and component transfers. |
| Owner balance authority | Retire old opening requests/entries and old period/component/close chains within the approved scope; reset allocation sets, owner allocations and component movements. Create the new approved zero-opening authority. |
| Deposit activity | Reset receipt/refund/reversal/application/custody/owner-bridge chains and their invoice/journal effects. Preserve contractual amounts. Normalize actual receipt/return dates and financial status; expected active positive-requirement records become pending with received/held zero. Preserve waived/archived distinctions. |
| Ledger and petty cash | Reset source-backed ledger projections and petty-cash entries/periods, including stored opening/advance amounts. Views such as `property_account_entries` derive from sources and are not separate balance tables to edit. |
| Private dependencies | Classify deferred owner cash, transaction request/results, bindings/seals, deposit journal intents/slots/attestations, evidence registrations and cleanup claims. Do not erase all organization idempotency: it also protects master-record creation. |
| Documents and reports | Preserve recoverable historical evidence. Remove old invoices/receipts/statement artifacts from current report lookup through a designed archive/invalidation mechanism. Inventory both database references and Storage bytes. Do not leave orphaned current downloads or delete lease documents. |
| Audit and mixed operational data | Preserve audit/activity evidence and record the reset reason/manifest. Preserve maintenance tasks, but handle historical actual-cost fields and submission eligibility so old expenses cannot reappear. Inspect financial timeline links. |

## Why simple deletion is unsafe

1. **Known zero differs from missing data.** Owner rollforward requires approved openings at the month boundary for `ips_held_owner_cash`, `owner_due_to_ips`, `ips_due_to_owner` and `security_deposit_custody`. Establish zero for each applicable property-owner-currency account on 1 October. The normal approval/evidence rules must be satisfied, or a separately reviewed one-time opening mechanism implemented. Do not invent cash contributions to force a zero display.
2. **Prior periods can override the new opening.** Existing predecessor periods/close chains must not carry old amounts or blocked state into October.
3. **Reports use different sources.** P&L recognizes invoice income and owner expenses; tenant debt follows invoices and settlements; owner cash follows component movements; P&L opening account activity comes from historical `property_account_entries`. All must reach the intended baseline together.
4. **Deposits mix contract and receipt state.** Removing events alone may leave old `held` labels and receipt/refund dates. Zeroing contractual amounts would incorrectly mean no deposit is required.
5. **Preserved leases remain billable.** Rent generation treats a missing lease/month invoice as eligible. Pause generation through baseline verification, add an enforced 1 October reporting/billing boundary for all entry paths, and resume with an explicit October-generation step. Verify the monthly job and manual recovery cannot recreate August/September. Invoice regeneration and manual October re-entry must not produce duplicates.
6. **History is intentionally protected.** Append-only triggers and restrictive/cyclic references prevent ordinary deletion. Any one-time maintenance allowance must be narrow, target/fingerprint-bound and restored atomically. Broad trigger disabling or replication-role bypass is not a safe plan.
7. **Old request replay can revive or break data.** Keep evidence/tombstones or use a reset generation boundary; reconcile pending commands. A retry must not return a deleted result or recreate historical transactions. Preserve master-workflow replay protection and avoid reusing historical document numbers.
8. **The release lane currently forbids the expected changes.** Normal production CI requires identical target organization counts before/after, including transaction history. A reviewed one-time operation needs exact permitted differences plus master/non-target equality checks. Preserve the ordinary release gate; do not merely remove it.

## Approved one-time transport exception, 28 October 2026

The owner explicitly approved direct execution through the authenticated Supabase
connection for Pilot operation `7c70e27f-ba37-48cc-8f93-d32badcb2fb7`, and requested
an authorization window longer than five minutes. This exception supersedes only
the connector restriction in step 6 for this operation. Production schema changes
still require exact merged-main protected CI. Other organizations remain outside
the reset scope.

Use the existing reviewed transaction with genuine administrator authorization,
the original binding and action plan, a verified current catalog and foreign
baseline, and one serialized writer. Retain previous failed attempt evidence;
do not replay its ticket or overwrite its journal. Execute once, inspect the live
database even after a transport timeout, and never automatically retry. Preserve
properties, units, people and contracts; leave Pilot billing paused and restore
the temporarily paused shared schedules. The owner accepts permanent loss of
Pilot test financial data; no additional recovery rehearsal is required solely
to protect that data.

## Proposed execution sequence

1. **Prepare the concrete operation.** Pin project, organization, schema/function hashes, cutoff and all authorized row identities/counts/hashes. Produce a preservation manifest for retained master/configuration records, contracts, permissions and non-target data. Include every incoming reference and archive/storage disposition. Fail on unknown schema or cross-organization dependencies.
2. **Implement recovery before deletion.** Identify a real available backup/checkpoint and retention expiry; produce a complete target data/evidence export where needed. Prove restoration into an isolated environment, validating database contents, Auth state and Storage bytes. Supabase database backups exclude Storage object bytes, so retain those separately. Whole-project rollback would affect all affected organizations; prove target organization-scoped recovery or obtain separate explicit approval covering restoration of every affected organization and accepted post-checkpoint data loss. Record expected data loss window, restoration time, responsible operator and stop conditions.
3. **Rehearse in isolation.** Use synthetic records first. A real-data rehearsal requires an authorized isolated destination: verify its identity and restricted access, and disable inherited schedulers and outgoing notifications before startup. Exercise complete financial dependencies, deposit requirements, historical artifacts, partial failures, wrong target, drift, replay and reruns. Verify a failed transaction leaves the original state intact and a successful operation is one-time. Also rehearse post-commit recovery; transaction rollback alone is insufficient.
4. **Review and approve the final destructive artifact.** Supply exact scope, rehearsal results, recovery proof and maintenance window. The repository requires explicit approval plus a reviewed recovery plan for a hosted reset. This assessment and the clarified business scope are not approval to execute a live wipe.
5. **Freeze and capture.** Contain target organization UI/API writes and relevant job/queue writers, including rent generation, scheduled activation, deferred settlement, expense submission and artifact publication. Settle or classify in-flight commands; pause is not proof they stopped. Capture the final manifest and backup checkpoint after containment. Abort if the approved fingerprint changed.
6. **Execute once through the protected lane.** Use the reviewed exact merged-main operation under `.github/workflows/ci.yml`, protected `production-database`, and the single production-writer lock. Implement the operation-specific preservation contract before execution. Use no direct connector mutation or developer-checkout production push/reset. Verify trigger/security restoration and the full expected result before commit wherever possible.
7. **Verify the empty October baseline.** Complete the checks below before reopening writes or scheduling. Keep jobs paused until a measured zero baseline has been captured.
8. **Re-enter and reconcile October.** Enter actual owner contributions through Owner Contribution, with correct property/unit attribution. Generate or initiate October invoices once from retained lease terms, then enter actual collections, expenses, distributions and deposits. Retain a checklist per lease/property for completeness. Validate reports and October close; verify November starts from October's closing components.

## Acceptance criteria

- Retained master IDs, contents, relationships, contract amounts, access settings and non-target records match the preservation manifest. Only the explicitly approved deposit financial-state fields differ on retained headers.
- No old operational transaction, allocation, ledger effect, deferred posting, current financial artifact or previous-period balance remains in the active reporting scope. Authorized archives remain recoverable and do not feed current reports.
- Before October re-entry: tenant arrears/prepayments/received deposits/held deposits are zero; the required deposit amount remains unchanged. Positive active deposit requirements show the appropriate pending state, with no obsolete received/returned dates.
- Every applicable owner component is **known zero**, not missing/unknown. October generation/close readiness is clear; existing August/September blocks do not poison the new period.
- Before re-entry: October P&L income, expense, NOI, funding, opening account activity and collections are zero. Owner contribution posting changes owner cash/funding without becoming rental income or operating profit.
- Ordinary staff sessions, property/unit reports, Owner Accounts, Owner Statements and PDF/XLSX agree with their authoritative sources. Test reports separately; they do not all use the same balance formula.
- October invoicing respects retained rents, due dates, fees, proration, currency, ownership and collection route. New receipts settle the new invoices once; retries and scheduler restarts do not duplicate them or resurrect pre-October charges.
- Test an owner-collected rent and an owner expense as well as IPS-collected rent. Verify correct unit attribution and no invented currency aggregation.
- October can close with a fresh source fingerprint; November opening equals October closing. Old artifacts cannot masquerade as the new statement.
- Guard definitions, RLS/permissions, migration ledger and release checks match the approved post-state. Reopen only after complete reconciliation.

### Synthetic example for rehearsal (not executed)

One owner, one unit, USD only, no management fee, all four 1 October openings zero. Enter a $500 owner contribution, a $1,000 rent invoice, an $800 IPS rent receipt, a $300 deposit receipt, and a $200 owner distribution.

| Expected result | Amount |
| --- | ---: |
| Accrual P&L income and NOI | $1,000 |
| Separately reported owner contribution | $500 |
| Opening account activity | $0 |
| Unpaid tenant rent | $200 |
| IPS-held owner cash | $1,100 |
| Deposit custody | $300 |
| Owner due to IPS / IPS due to owner | $0 / $0 |

The $500 contribution and $300 deposit must not increase NOI. This is an expected test oracle derived from current source rules, not a passed runtime test.

## Remaining work before execution

Build the narrowly scoped reset/zero-opening mechanism, cutoff enforcement and operation-specific preservation contract; finish the row-level dependency/archive manifest; verify a restorable backup and Storage coverage; execute the isolated reset and restore rehearsals; verify UI/exports; then obtain approval of the concrete operation. No live data deletion should occur on the strength of this assessment alone.

### Additional backdating and stale-data review

The [backdating and stale-data assessment](pilot-october-2026-backdate-stale-assessment.md) adds review guidance and targeted acceptance cases. Check missing invoices, ineffective billing rules, executable deferred work and scheduled writers. A financial reset alone does not repair billing configuration. Valid backdating within the retained reporting period must remain available, with earlier financial effects rejected at the database boundary.

The implementation must also reject pre-reset forms and request replays, invalidate browser statement state and persisted financial snapshots, and explicitly retire old report artifacts. A deposit-refund chronology candidate was identified in source and hosted function definitions but has not been reproduced end-to-end. These findings add implementation and rehearsal work; no production mutation or runtime reset test was performed.

## Source pointers

Repository references below were inspected at commit `4129597c75f948a83deab46546a58e70a613b6c5`; line numbers refer to that revision, not necessarily the older primary working tree.

- `docs/runbooks/production-database-release.md:24-38`, `.github/workflows/ci.yml:476-487,699-708`, `scripts/pilot-preservation-snapshot.sql:19-39`: exact-main release and target organization preservation.
- `docs/runbooks/ips-recovery-and-rollback.md:37-51,65-91,119-191`, `docs/runbooks/background-jobs-and-recovery.md:15-20`: recovery, writer containment and required proof.
- `scripts/hosted-demo-cutover-plan-core.mjs:3-8,179-182,220-235`: obsolete planning-only demo mechanism.
- `supabase/migrations/20260809155506_owner_opening_balance_entry_authority.sql:627`, `20260810053705_owner_balance_rollforward_authority.sql:139-245`: approved zero versus missing opening and predecessor precedence.
- `supabase/migrations/20260810051018_owner_balance_lifecycle_schema.sql:487-549`, `20261009233921_deposit_rent_application.sql:7-60,94-101,385-398`: immutable histories and deposit/tenant balance dependencies.
- `supabase/migrations/20260811124438_ips_operational_readiness_batch.sql:1191-1295`, `src/features/leases/data/lease-summary.ts:222-239,700-749`: deposit requirement, event totals and displayed status.
- `supabase/migrations/20260823014504_lease_owned_billing_rules.sql:1311-1328,1754-1761`, `20260823122317_correct_lease_billing_review_authority.sql:337-367`: invoice regeneration and historical recovery.
- `supabase/migrations/20260823084303_resolve_owner_profit_loss_finance_categories.sql:53-274`, `src/features/reports/data/profit-loss-funding-loader.ts:14-86`, `profit-loss-funding.ts:11-91`: accrual P&L and separate owner funding.
- `supabase/migrations/20260810051854_owner_event_allocation_and_component_movement.sql:29-38`: owner component source mapping.
- `supabase/migrations/20260810110520_owner_close_authority.sql:635-705,984-1044`, `20260810164308_harden_owner_statement_publication_recovery.sql:132-145,289-305,502-519`: close and publication dependencies.
- [Supabase database backup documentation](https://supabase.com/docs/guides/platform/backups): database backups exclude Storage objects; restores have downtime. Checked 22 October 2026. Actual project backup availability was not verified.
