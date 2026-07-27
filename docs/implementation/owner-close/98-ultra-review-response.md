# Codex Ultra Review Response

**Status:** Complete - `APPROVE WITH CHANGES`.
**Review target:** `docs/implementation/owner-close/README.md` and Plans 00-12.
**Required repository baseline:** Latest merged `main` at `823deb4735b8124edefd1e68e451c21f1962b075`.
**Implementation authorization:** None. This file is architecture and plan review only.

## 1. Verdict

**Verdict:** `APPROVE WITH CHANGES`

**Confidence:** High.

**One-paragraph rationale:** The proposed direction is the smallest credible route to one Owner Close authority: keep domain records as writes, expose one normalized property-cash read contract, make Ledger/journals derived controls, close by property-period, and publish immutable statements. The current plan set is not implementation-ready, however. Its write plans depend on property-period locking and reconciliation identity that do not arrive until Plan 10; allocation reversals and Ledger projections are not yet constrained to exactly once; current direct table/generic RPC paths can bypass source authority; the owner-balance equation conflicts with its reserve model; a mutable period row cannot preserve reclose history; and Plans 05, 06, 08, 09, 10, 11, and 12 are too broad for safe financial PRs. Those are bounded corrections rather than reasons to replace the architecture.

## 2. Repository baseline and review coverage

- **Latest merged `main` SHA reviewed:** `823deb4735b8124edefd1e68e451c21f1962b075`.
- **Compared with planning baseline `823deb4735b8124edefd1e68e451c21f1962b075`:** Exact match. `origin/main`, local `main`, and PR #34's base OID were independently fetched and compared.
- **Relevant merged changes since planning baseline:** None. PR #34 head `b2acae9a822bae26373cf001721903c8bb35811e` is documentation-only under `docs/implementation/owner-close/`.
- **Repository rules and product docs inspected:** `PROJECT_RULES.md`, `docs/current-state.md`, `docs/engineering-rules.md`, `docs/verification.md`, every file in `docs/implementation/owner-close/`, and the planning `README.md`.
- **Primary migrations/RPCs inspected:** receipt/payment/allocation/backfill and compatibility refresh in `20260710065423_overview_property_cash_events.sql`; settlement/reversal RPCs in `20260723093124_finance_settlement_activity_logging.sql`; accounting kernel and compatibility posting in `20260710005932_property_finance_accounting_kernel.sql` and `20260710011833_property_finance_accounting_compatibility.sql`; organization Ledger locks and document Storage in `20260616131639_enterprise_lite_timeline_ledger_controls.sql`; generic Ledger mutation RPCs in `20260616113818_update_archive_timeline_ledger_rpcs.sql`; finance grants/workflows in `20260706113000_finance_income_expense_workflows.sql`; finance bridges/rent generation in `20260709012135_finance_domain_bridges.sql`; lease-term repair sync in `20260707123000_repair_lease_backbone_tables.sql`; ownership in `20260618040247_people_core_relationship_schema.sql`; deposit workflows in `20260713014039_lease_deposit_event_workflow.sql` and `20260713021858_lock_deposit_reversal_and_clamp_paid_page.sql`; maintenance finance posting in `20260713061948_maintenance_role_workflow.sql`; and petty-cash authority in `20260723052251_petty_cash_auditability.sql`.
- **Application/reporting paths inspected:** `src/features/finance/property-cash.ts`, `src/features/finance/data/finance-close.ts`, `src/features/reports/data/owner-statement.ts`, `owner-statement-report.ts`, `owner-statement-diagnostics.ts`, `trusted-report.ts`, `pdf.ts`, `csv.ts`, report API routes, Rent & Income actions/UI/types, Bills & Expenses actions, maintenance actions/data, petty-cash actions/data, Ledger actions/data, and document upload/replacement/signed-URL paths.
- **Types, seed, and verification assets inspected:** `src/types/database.generated.ts`, `src/types/database.ts`, `supabase/seed.sql`, relevant pgTAP suites (`accounting_*`, `finance_settlement_activity_logging_test.sql`, `lease_deposit_event_workflow_test.sql`, and `maintenance_role_workflow_test.sql`), relevant Vitest suites for property cash, owner statement, CSV/PDF, reports, Rent & Income, petty cash, maintenance, Ledger, and the authenticated browser/smoke scripts listed by `package.json`.
- **Evidence limits:** This was a source/schema/test review. It did not access or change production/preview data, run a backfill, reset a database, deploy, or execute implementation tests. Production legacy-row counts, real bank-account topology, and IPS business policies therefore remain explicit pilot inputs rather than inferred facts.

## 3. Architecture decision

**Decision:** Approve the architecture with the required changes below.

**Required architectural changes:**

1. Keep the existing domain tables as canonical writes. `property_cash_events_v1` should be a read-only, versioned, security-invoker view or a checked set-returning RPC over current sources, not another independently writable financial authority.
2. Use receipt/payment **allocation IDs** as canonical settlement event IDs and their header IDs as parent transaction IDs, but add immutable allocation scope/classification snapshots or freeze every material obligation field after first settlement. Add direct allocation-to-allocation reversal identity and exact scope/amount constraints before multi-allocation.
3. Represent an event identity as a typed namespace such as `(organization_id, source_type, source_id)`. A bare UUID is not globally meaningful across source families.
4. Add a shared authority kernel before settlement changes: serialized property-period checks, stable reconciliation/cash-source identity, payload-bound idempotency, unique canonical Ledger projection identity, reserved journal source namespaces, and database-level immutability/bypass guards.
5. Model a stable property-period header separately from append-only close revisions/runs. Each close revision freezes the owner roster, reconciliation evidence, source manifest/hash, and calculation version. Every statement version references one exact close revision. Reopen/reclose creates a new revision and explicitly invalidates or restates later dependent periods; it never overwrites prior evidence.
6. Treat property close as the business lock while preserving current organization-month Ledger locks and book-period locks as broader additional controls. Closing one property must not lock unrelated properties; reopening one property must not reopen an organization/book period.
7. Keep `ledger_entries` and accounting journals as atomic, idempotent projections and compatibility controls. Retain the accounting kernel until all report/read/write parity and cutover evidence passes; do not expose a product-facing general ledger.
8. Introduce the minimum stable cash/reconciliation-source identity before new settlement, deposit, petty-cash, owner-cash, or distribution writes. Free-text reconciliation labels added only at Plan 10 cannot prove source completeness.
9. Correct the owner liability model. Reserve hold/release is normally a bucket transfer inside total owner liability, not an increase/decrease to total liability. The ratified management-fee recognition event, not a generic “approved fee,” controls the liability effect.
10. Keep live operational state separate from published evidence. Statement versions, itemized lines, source manifests, recipient/ownership snapshots, and per-format artifacts are immutable; operational records remain linked evidence rather than copied wholesale.

**Rejected alternatives and reason:**

- **A new writable generic cash-event table:** rejected because it creates dual write authority and a synchronization problem without removing the existing operational sources.
- **Ledger or journals as the canonical product write model:** rejected because current operational workflows, reversals, evidence, and reporting classifications are domain-specific; `ledger_entries` also remains mutable through generic paths today.
- **A persisted live reporting event table:** rejected for the same dual-truth risk. Persist only immutable close/statement snapshots and migration resolutions.
- **Automatic property close by toggling current organization/book locks:** rejected because those locks affect more than one property.
- **Fuzzy legacy matching by amount/date/description:** rejected because ambiguity cannot become financial authority.
- **Retiring the accounting kernel during the October path:** rejected until derived parity, balanced posting, security, and rollback evidence are proven.
- **Expanding to corporate accounting, payroll, tax, or generic ERP:** rejected as outside the Owner Close product boundary.

## 4. Decision gates A-I

| Gate | Decision | Repository evidence | Required plan edit or implementation constraint |
|---|---|---|---|
| A - View/RPC versus persisted event table | **Approve read-only view/RPC; reject a writable or persisted live event table.** | `src/features/finance/property-cash.ts:123-327` already normalizes domain facts in application code, while `src/features/reports/data/trusted-report.ts:471-648,1793-1819` proves Ledger remains a competing report input. | Plan 02 must define a security-invoker view or checked paginated RPC, stable versioned columns, RLS/grant tests, shadow comparison, and no DML surface. Persist only close/statement evidence. |
| B - Canonical cash event identity | **Approve allocation ID conditionally.** | Current allocation rows contain header/obligation/amount/audit fields but no immutable economic scope or allocation-level reversal FK (`supabase/migrations/20260710065423_overview_property_cash_events.sql:15-24,40-49`); the latest reversal functions still reverse header transactions rather than directly pairing allocation rows (`supabase/migrations/20260723093124_finance_settlement_activity_logging.sql:292-639`). | Snapshot/freeze material classification, use `(source_type, allocation_id)`, add `reversal_of_allocation_id` or an equally strict tested bijection, enforce same organization/property/currency/obligation and exact opposite amount, and require header amount = allocation total. |
| C - Reversal policy | **Approve dated immutable reversal with changes.** | Current receipt/payment/deposit reversals create new headers/events, but settlement reversal can be blocked by old Ledger state and none shares one property-period policy (`20260723093124_finance_settlement_activity_logging.sql:292-639`; `20260713021858_lock_deposit_reversal_and_clamp_paid_page.sql:1-24`). | Never mutate/delete originals. Normal correction posts in an open period, cannot predate the original, and leaves prior statements intact. Historical restatement requires authorized reopen, dated reversal/adjustment, reclose, later-period invalidation/restatement, and replacement publication. Reopen immediately withdraws the prior version's current-authority status; it becomes superseded only when the replacement is published. Block generic Ledger/journal reversal of domain projections. |
| D - Property-period and compatibility lock scope | **Approve property-period close; change the hierarchy and order.** | Current `ledger_period_locks` are organization-month (`20260616131639_enterprise_lite_timeline_ledger_controls.sql:1-16,68-85`); accounting periods are book-month and journal posting checks both (`20260710005932_property_finance_accounting_kernel.sql:85-110,612-624`). Plan 10 introduces the property object only after Plans 03-09 need it (`10-property-period-close-and-readiness.md:28-43,168-187`). | Move a serialized property-period/close-revision kernel before Plan 03. Property lock blocks that property; organization/book locks remain broader blockers. Close and writes take the same row/advisory lock in one transaction. Do not automatically toggle broader locks. |
| E - Management-fee recognition | **Stop before Plan 08.** | Plan 08 itself leaves basis, categories, timing, rounding, waiver, and assessment-versus-transfer decisions open (`08-management-fee-agreements-and-assessments.md:25-39,80-112`). | IPS must choose agreement/assessment grain, basis, included/excluded categories, cash-versus-charge timing, rounding/tax/min/max, waiver/reversal treatment, and whether the owner effect arises at assessment or settlement. Avoid double allocation between owner-specific agreements and ownership percentages. |
| F - Rent proration/frequency | **Stop before Plan 06 implementation.** | Current generator uses compatibility `monthly_rent_amount` and month-start due dates (`20260709012135_finance_domain_bridges.sql:104-194`); lease terms support other frequencies/due days, and compatibility sync can overwrite term 1 (`20260707123000_repair_lease_backbone_tables.sql:158-290,605-626`). | Monthly-only is the safe October default if IPS accepts it; unsupported frequencies block. IPS must define due-day/short-month, start/end/notice proration, rent changes, concessions/rent-free periods, and business timezone before generation. Split lease-term authority from occurrence generation. |
| G - Owner balance/reserve/negative balance | **Approve a conservative owner-property-currency liability model.** | Plan 00 adds reserve movements to closing liability (`00-architecture-and-decision-gates.md:89-107`), while Plan 09 says reserves may remain within total liability but reduce availability (`09-owner-balances-and-distributions.md:107-117`). | Correct the equation; separately report total liability, reserved amount, and available-to-distribute. Default pilot: owner-property-USD, no reserve writes, no negative distribution/override, and no ownership change until IPS confirms deficits, transfers, reserves, approval, and availability rules. |
| H - Minimum reconciliation evidence | **Approve a narrow reconciliation model, but move source identity earlier.** | Receipt/payment headers have no cash-account/source FK (`20260710065423_overview_property_cash_events.sql:1-49`); Plan 10 proposes only an account/source label (`10-property-period-close-and-readiness.md:119-134`), and Plan 07 makes account identity optional (`07-security-deposit-custody.md:40-51`). | IPS must state dedicated versus pooled account topology. Add stable organization-scoped cash/reconciliation-source IDs to canonical cash events before Plans 03/04/05/07/09. A dedicated source uses property/source/period reconciliation. A pooled source uses one append-only source/period reconciliation against external evidence plus a complete property-subledger event/allocation manifest referenced by each property close; the same evidence cannot be independently “reconciled” once per property. Enumerate the complete source roster, checksums, system/external totals, reviewer, and variance. Default accepted variance is zero unless IPS approves a reasoned threshold and role. |
| I - Legacy manual Ledger classification | **Approve exact classification only.** | Maintenance currently creates Ledger rows without source metadata but retains `tasks.ledger_entry_id` (`20260713061948_maintenance_role_workflow.sql:701-737,763-775`); seed contains manual Ledger rows (`supabase/seed.sql:914-930`); generic Ledger mutation remains available (`20260616113818_update_archive_timeline_ledger_rpcs.sql:220-344,503-557`). | Deterministic FK/ID link -> explicit immutable adjustment source -> excluded with evidence -> blocking `legacy_unclassified`. Never fuzzy-match or rewrite the original. Add a canonical controlled adjustment workflow before retiring generic manual Ledger writes. |

## 5. Critical findings

| Severity | Finding | Exact repository/plan evidence | Required correction | Blocking plan(s) |
|---|---|---|---|---|
| Critical | **Lock and reconciliation authority arrive after the writes that require them.** Plans 03-09 cannot atomically honor a property close or reconcile newly created cash without an earlier period row/source identity; a check-then-write also races close. | Plans 03/04 require period awareness, but the unique period row and lock list are created only in Plan 10 (`docs/implementation/owner-close/10-property-period-close-and-readiness.md:28-43,145-187`). Current locks are organization-month only (`supabase/migrations/20260616131639_enterprise_lite_timeline_ledger_controls.sql:1-16,68-85,112-130`). Receipt/payment headers have no account/source identity (`supabase/migrations/20260710065423_overview_property_cash_events.sql:1-49`). | Extract an early property-period header + append-only close-version skeleton, shared transactional lock helper, stable reconciliation-source identity, and lock-order contract before Plan 03. | 03-10 |
| Critical | **RPC-only authority is not database-enforced.** Direct Data API grants and generic RPCs can mutate obligations/Ledger or impersonate/reverse domain journal sources. | Authenticated admin DML remains on finance items (`supabase/migrations/20260706113000_finance_income_expense_workflows.sql:96-117,143-146`); general authenticated grants include Ledger (`supabase/migrations/20260616011105_grant_authenticated_data_api_access.sql:4-16`); generic Ledger RPCs do not guard source type (`supabase/migrations/20260616113818_update_archive_timeline_ledger_rpcs.sql:220-344,503-557`); generic journal post/reversal is callable by admins (`supabase/migrations/20260710005932_property_finance_accounting_kernel.sql:928-1001,1332-1379`). | Revoke direct financial DML where practical and add trigger-level guards where reads/grants must remain. Reserve canonical source namespaces for private helpers; block generic edit/archive/post/reversal of domain-linked projections. Test actual privileges and direct RPC calls. | 02-05, 07-10, 12 |
| Critical | **Allocation/event exact-once is under-specified.** Header reversal does not prove allocation reversal, Ledger source identity is non-unique, and per-plan idempotency lacks a common ownership/payload contract. | Allocation schema lacks snapshots/reversal link (`supabase/migrations/20260710065423_overview_property_cash_events.sql:15-24,40-49`); Ledger source index is non-unique (`supabase/migrations/20260709012135_finance_domain_bridges.sql:18-21`). The accounting helper demonstrates the needed advisory lock, unique posting key, and payload-hash mismatch behavior (`supabase/migrations/20260710005932_property_finance_accounting_kernel.sql:580-683`). | Add allocation-level reversal pairing, immutable scope, unique canonical projection identity, and shared idempotency `(organization, operation, actor/key)` with canonical payload hash: same payload returns original IDs; changed payload/cross-actor reuse fails without leaking the prior result. | 00, 02-05, 07-09 |
| Critical | **Existing historical “cash events” already contain inferred dates.** A later plan saying “do not guess” does not neutralize rows already generated by a migration. | `backfill_property_cash_events()` converts `amount_received` and paid expenses, falls back to due/invoice dates (`supabase/migrations/20260710065423_overview_property_cash_events.sql:1332-1495`), marks references `BACKFILL-INCOME-*`/`BACKFILL-EXPENSE-*`, and executes immediately (`supabase/migrations/20260710065423_overview_property_cash_events.sql:1497`). | Plan 01 must enumerate these rows separately. Plan 12 must treat fallback-dated rows as inferred/non-authoritative until evidence resolves them; no clean/auto classification solely because a deterministic ID exists. Ambiguity blocks pilot cutover. | 01, 02, 10, 12 |
| Critical | **A unique mutable period row cannot preserve close/reopen history or bind an immutable statement.** | Plan 10 specifies one unique property-period-currency row (`docs/implementation/owner-close/10-property-period-close-and-readiness.md:28-43`) yet says reopen preserves the prior close (`docs/implementation/owner-close/10-property-period-close-and-readiness.md:159-166`). | Use stable period headers plus append-only close revisions/runs. Statements reference a revision and source hash. Reopen creates a new revision and marks later dependent periods/statements stale until sequentially restated. | 10-12 |
| High | **Owner liability math and source authority are internally inconsistent.** Reserve movement is included in total closing liability even when Plan 09 calls it an internal reserved bucket; `owner_contribution` also remains a Rent & Income category while Plan 09 proposes owner cash events. | `docs/implementation/owner-close/00-architecture-and-decision-gates.md:89-107`; `docs/implementation/owner-close/09-owner-balances-and-distributions.md:77-117`; `src/features/rent-income/rent-income.types.ts:10`; `src/features/finance/property-cash.ts:180-223,480-488`. | Correct the equation, separate total/reserved/available, define fee recognition, and select one owner-contribution authority. Plan 12 must reject/retire the other path and backfill exact links. | 00, 02, 08-12 |
| High | **Current statement readiness and live recipient loading are insufficient for publication.** A valid owner with no events can be `Ready`, and archived effective-dated owner/contact rows are filtered out. | `src/features/reports/data/owner-statement.ts:129-242`; `owner-statement-report.ts:179-285,788-866`. | Official readiness must require an exact close revision, opening-balance proof, source completeness/reconciliation, and publication prerequisites. Freeze ownership/recipient/payment instructions and source manifest at close/version time; do not regenerate history from current contact/archive state. | 01, 10, 11 |
| High | **Current document Storage cannot be reused as immutable statement artifact storage.** It permits update/delete and omits CSV. DB commit and object upload are not one transaction. | `20260616131639_enterprise_lite_timeline_ledger_controls.sql:198-273`; replacement/deletion behavior in `src/features/documents/actions.ts:195-329`. | Use a dedicated private append-only artifact boundary, one artifact row per `(statement_version, format)`, immutable content-addressed/versioned paths, byte checksum/size, checked serving, and an idempotent stage/finalize/fail/orphan-recovery saga. Never overwrite published bytes. | 11, 12 |
| High | **Current reporting remains dual truth.** Owner Statement/overview derive cash from settlement events, while Property/Unit Performance and Income & Expense still load Ledger rows. | `src/features/finance/property-cash.ts:123-327`; `src/features/overview/property-performance.ts:130`; `src/features/reports/data/trusted-report.ts:471-648,1793-1819`. | Name every read path in the shadow/parity manifest and cut each over only after source-level and aggregate parity. Keep accounting/Ledger derived until this is proven; no permanent mixed read authority. | 01, 02, 10-12 |
| High | **Rent-term authority can be overwritten and generation ignores normalized terms.** | `generate_monthly_rent_income_items` uses compatibility monthly amount and month start (`20260709012135_finance_domain_bridges.sql:104-194`); `sync_lease_backbone_records` rewrites term sequence 1 as monthly with compatibility due day (`20260707123000_repair_lease_backbone_tables.sql:158-290,605-626`). | First choose and protect authoritative lease terms, then build deterministic occurrences. Unsupported terms block rather than silently becoming monthly. | 06, 08, 10, 12 |
| High | **Maintenance/petty cash can remain financially misleading without two separate authority contracts.** Maintenance creates effectively manual Ledger rows; petty cash can use invoice date as cash date and has incomplete reversal/economic-scope semantics. | `20260713061948_maintenance_role_workflow.sql:701-737,763-775`; `20260723052251_petty_cash_auditability.sql:291-332`; Plan 05 required changes. | Split maintenance-to-bill handoff from petty-cash posting/reversal. Require explicit disbursement date, define property expense/company advance/company cost effects, exact reversal row/FK, atomic projection, and one/many bill cardinality policy. | 01, 05, 10, 12 |

## 6. Missing domain rules

Unresolved IPS rules do not block read-only Plan 01 diagnostics. They are stop conditions at the plan shown below.

| Rule | Needed before plan | Recommended default or question | Why it changes correctness |
|---|---|---|---|
| Reconciliation account/source topology | Early authority kernel before 03 | IPS must say dedicated property account, pooled trust account, petty cash source, or another finite roster. Dedicated sources reconcile per property/source/period. Pooled sources require one source/period external reconciliation plus a complete property-subledger allocation manifest referenced by every affected close. For pilot use one named source only if that matches reality; accepted variance defaults to zero. | Determines which events reconcile together, prevents reuse of the same pooled evidence as independent proof for several properties, and proves account-level plus property-subledger completeness. |
| Closed-period reversal versus restatement/materiality | 03/04 and early lock kernel | Default: normal reversal is dated in an open period and cannot predate the original. IPS must define when original-period reopen/restatement is mandatory and who approves it. | Changes period results, downstream balances, and statement supersession. |
| Rent frequencies and due-day/short-month behavior | 06A | Safe October option: monthly only; unsupported frequency blocks. Ask whether day 29/30/31 clamps to month end and which timezone defines occurrence date. | Controls whether expected obligations exist and which period owns them. |
| Rent proration, notice, concessions, and rent changes | 06A | No invented proration. IPS must provide worked examples for move-in/out, notice, mid-period changes, rent-free/concessions, and effective-term overlap. | Directly changes charged rent, arrears, fees, and close completeness. |
| Maintenance task-to-bill cardinality/variance | 05A | Ask whether one task may create multiple bills, how no-cost/warranty work closes, and whether task actual cost is estimate, approved bill total, or cash paid. | Prevents one maintenance cost from being omitted or counted twice. |
| Petty-cash economic scope and negative/variance policy | 05B | Property expense may enter owner performance only with an explicit cash date and property. Company advance/company cost do not. Ask whether negative cash or count variance is ever permitted. | Determines owner effect and whether the register reconciles. |
| Deposit application, refund, retention, and approval | 07 | Until IPS confirms application/retention targets, support receipt/refund custody only and block application/retention. Ask when retained funds become owner income/liability and which obligation receives an application. | Deposit custody is not operating income; disposition can create a different economic event. |
| Management-fee agreement grain | 08A | Ask whether fees are property-level then allocated by ownership, genuinely owner-specific, or a precedence combination. Do not calculate both. | Avoids double fee assessment on shared properties. |
| Fee basis/categories/timing/rounding/tax/min/max/waiver | 08A/08B | No calculation until IPS supplies examples. Ask charged versus collected rent, included income classes, assessment versus collection owner effect, rounding unit/order, tax, caps/floors, waivers, reversals, and refunds. | Changes both property result and amount owed to/from the owner. |
| Ownership allocation date and historical correction | 02 taxonomy, 09A | Ask whether entitlement follows cash event date, obligation/service period, or another rule. Pilot default is one 100% owner with no period ownership change; other cases block. | Changes which owner receives each event and whether later owner edits can rewrite history. |
| Owner-balance scope/opening balance/transfer | 09A | Default key: owner-property-currency. Require evidenced opening balance. Ask how ownership transfer disposes of prior balance. | Defines the liability being reconciled and prevents cross-property/currency netting. |
| Reserve policy | 09B | Omit reserve writes in October unless IPS confirms target, funding/release, effective dates, approval, and override rules. | Reserve normally changes availability, not total owner liability. |
| Negative balances and distribution availability/approval | 09B | Default: no distribution that makes available balance negative; no override. Ask required approver(s), pending/committed deductions, cancellation, and payment failure treatment. | Prevents paying more than is available and double-counting pending payouts. |
| Unpaid approved bills at close | 10B/10C | Until confirmed, show a coded blocker. Ask whether known unpaid bills are allowed with disclosure/accrual and which statuses qualify. | A cash statement may close with unpaid obligations, but readiness and disclosure differ. |
| Unapplied cash | 03 and 10B | If an explicit unapplied-cash source/workflow is not implemented for pilot, any unallocated receipt is a blocker. | Otherwise cash can disappear from owner reporting or be allocated twice later. |
| Reconciliation evidence and variance acceptance | 10B | Require external source identity, evidence checksum/document, opening/inflow/outflow/closing totals, reviewer, and zero variance. IPS must define any nonzero threshold, reason, and approver. | Close cannot prove cash completeness without independent evidence. |
| Statement disclosure, retention, approval, and delivery | 11A-11C | IPS must approve owner-facing line detail, payment instructions snapshot, retention, approver(s), and cancellation/reissue labels. Manual retained download is safe for pilot; email/portal can be deferred. | Controls legal/operational evidence and prevents live contact data from altering a published statement. |
| Production pilot boundary | 12C | IPS must name properties, period, currency, reviewers, external source records, backup/restore window, and explicit go/no-go authority. | Prevents a documentation plan from silently becoming portfolio-wide migration authority. |

## 7. Sequence and dependency review

**Recommended final order:**

1. **Plan 00 revised:** ratify architecture, Gate A-D/I constraints, later-plan IPS stop conditions, corrected owner equation, shared idempotency contract, lock hierarchy, reconciliation-source grain, close revisions, and canonical adjustment target.
2. **Plan 01A/01B revised:** current-state inventory/parity first; proposed canonical classifications second and clearly labeled. Keep execution read-only, fail-closed, paginated, and fixture/local unless separately authorized.
3. **Plan 02 revised:** introduce the current-source `property_cash_events_v1` shadow contract, typed identity, economic taxonomy, allocation reversal/snapshot requirements, pagination, and parity manifest. Do not cut over writes or reports.
4. **Early authority kernel extracted from Plan 10 and Plans 03/04:** stable property-period header, append-only close-revision skeleton, serialized lock helper/order, stable reconciliation-source identity, common idempotency requests/payload hash, unique projection identity, source immutability, and reserved journal namespaces.
5. **Plan 06A:** make lease terms authoritative and ratify the monthly October policy before any generator relies on them.
6. **Plan 03 revised, then Plan 04 revised:** atomic income then expense settlement/reversal on the shared authority kernel. Merge sequentially.
7. **Plan 05A and 05B:** maintenance-to-bill handoff, then petty-cash canonical posting/reversal. **Plan 06B** occurrence generation may be developed in parallel after 06A but merges/rebases sequentially.
8. **Plan 07 revised:** deposit custody/disposition after account identity, lock, idempotency, and IPS disposition rules exist.
9. **Plan 08A then 08B:** agreement/economic calculation first; assessment/approval/projection/UI second.
10. **Plan 09A then 09B:** controlled owner/property adjustments, contribution authority, roster/opening/balance foundation first; reserves/distributions second.
11. **Plan 10B then 10C:** reconciliation/close-check engine first; immutable close lifecycle, readiness/UI, reopen and downstream-restatement behavior second.
12. **Plan 11A then 11B:** close-backed statement data/approval first; immutable per-format rendering, Storage, checked download, and manual retained publication second.
13. **Plan 12A, 12B, 12C:** migration schema/dry-run/resolution; resumable apply + restore rehearsal; bounded IPS pilot/report cutover/release.
14. **Later:** Plan 11C delivery/history automation and Plan 12D compatibility retirement only after an observation window and explicit acceptance.

**Plans that may safely run in parallel:**

- After Plan 02 and the early authority kernel, Plan 06A/06B may be developed alongside Plan 03 if migrations and files remain disjoint. They must rebase and merge sequentially with full reset/generated-type evidence.
- Plan 05A and 05B can be developed independently after shared helpers stabilize, but should merge sequentially.
- Plan 07 may be developed alongside Plan 05 after IPS rules and the shared kernel, but financial migrations still merge sequentially.
- Plan 12A dry-run tooling may begin after the event taxonomy/classification manifest is stable; no apply, cutover, or production work may run early.

**Plans that must be split:** 05, 06, 08, 09, 10, 11, and 12.

**Plans that should be combined:** None. The shared authority kernel should be **extracted and merged first**, not duplicated inside or loosely combined with income/expense PRs.

**Circular or hidden dependencies:**

- Plans 03-09 depend on property-period locking created by Plan 10.
- Plans 03/04/05/07/09 create cash that Plan 10 expects to reconcile, but stable account/source identity is not created earlier.
- Plan 11 requires an immutable close identity, while Plan 10 currently proposes a mutable unique period row.
- Plan 12 wants to retire manual Ledger writes before a canonical explicit adjustment workflow exists.
- Plan 09 introduces owner contributions while Rent & Income remains another owner-contribution authority.
- Plan 08 can depend on Plan 06 if fees use charged/earned rent; collected-rent-only fees still depend on canonical settlements. The fee basis must decide the dependency, not implementation guesswork.
- Reopening an earlier period affects later opening balances and statements; later-period invalidation/restatement is absent.
- Current compatibility sync can overwrite lease-term authority before Plan 06's generator uses it.

## 8. Plan-by-plan review

| Plan | Decision | Most important correction | Missing acceptance/verification evidence |
|---|---|---|---|
| 00 - Architecture and decision gates | **Revise** | Correct allocation premise and owner liability equation; define typed event identity, shared payload-bound idempotency, lock hierarchy/serialization, reconciliation-source grain, append-only close revisions, reserved projection namespaces, canonical manual adjustment target, and explicit IPS stop conditions. | Ratified Gate A-I table with owner/date for IPS decisions; worked owner balance/reserve examples; two-property lock matrix; same/different idempotency payload examples. |
| 01 - Parity diagnostics and safety rails | **Revise** | Separate current-semantics inventory (`01A`) from proposed classification (`01B`); identify `BACKFILL-*` inferred-date rows, privilege/RPC bypasses, task-to-Ledger links, owner-contribution dual authority, lock disagreements, mutable projections, missing account identity, and report-source parity. Fixture must be isolated test-only. | Empty-scope fail-closed/read-only tests; deterministic ordering/timezone; source-change/stale-run detection; project/environment identity guard; pagination beyond 1,000 and 5,000 rows; no production run without separate authorization. |
| 02 - Canonical property-cash contract | **Revise** | Keep a security-invoker view/checked RPC in shadow mode; define property-level event grain, typed IDs, allocation snapshots/frozen obligations, allocation reversal pairing, stable reconciliation source, contribution/deposit duplicate handling, and extension contract. Do not owner-duplicate shared events; allocate from a frozen roster at close. | RLS/grant/direct-RPC tests; header/allocation sum and reversal bijection tests; pagination/index/`EXPLAIN` evidence; source-level and aggregate parity by every current report path; explicit unsupported-source blockers. |
| 03 - Income settlement and reversal | **Revise** | Depend on the early authority kernel; make receipt + allocations + compatibility status + unique Ledger/journal projections + activity one transaction; retire the separate income posting action/wrapper for operators; define unapplied cash or block it. | Forced failure after every write step; concurrent identical/conflicting/cross-actor idempotency; close-versus-post race; partial/multi-allocation and exact reversal; direct table/generic RPC bypass; source-linked projection immutability. |
| 04 - Expense settlement and reversal | **Revise** | Mirror Plan 03's idempotency/snapshot/lock contract; require an approved expense, reject `owner_payout`, require an explicit cash date, and describe the current defect accurately: the Bills action records payment but does not call `post_finance_expense_item`, so projection is silently missing rather than a visible second operator step (`src/features/bills-expenses/actions.ts:292-334`). | Atomic rollback, retry/conflict, direct bypass, approved/status matrix, owner-payout rejection, exact payment-allocation reversal, lock race, and compatibility-wrapper duplicate-projection tests. |
| 05 - Maintenance and petty-cash handoffs | **Split** | `05A` maintenance task-to-bill/handoff and variance/cardinality; `05B` petty-cash explicit disbursement, economic scopes, canonical posting and immutable reversal. Do not treat a generic `cash_in` as an expense reversal. | Exact task-to-Ledger legacy discovery; one/many/no-cost cases; manager/admin permissions; explicit date/scope matrix; register count/variance; reversal/projection atomicity and direct bypass. |
| 06 - Rent schedules and charge completeness | **Split** | `06A` authoritative lease-term/policy and compatibility-sync retirement/guard; `06B` deterministic range occurrences/generation. Monthly-only unsupported cases must block, not silently coerce. | pgTAP for short months, frequencies, proration, notice/end boundaries, changes/concessions, overlapping terms, concurrency/retry, timezone, and protection against compatibility sync overwriting authoritative terms. |
| 07 - Security-deposit custody | **Revise** | Make account/source identity mandatory, add application/retention target and approval semantics, shared locks/idempotency, direct reversal identity, and exact classification when disposition becomes an owner/operating effect. | Receipt/refund/application/retention matrix; over-refund/duplicate/concurrent reversal; locked-period/direct bypass; owner/report exclusion until disposition; account reconciliation and exact target tests. |
| 08 - Management-fee agreements and assessments | **Split** | `08A` agreement grain, IPS rules, deterministic calculation/rounding and preview; `08B` immutable assessment, approval/waiver/reversal, projection, compatibility transition and UI. Prevent owner-specific agreement plus ownership allocation from double charging. | IPS worked examples; charged-versus-collected basis; included-category/reversal/refund cases; rounding/tax/cap/floor; overlapping agreement precedence; retry/lock/direct bypass; owner balance and report parity. |
| 09 - Owner balances and distributions | **Split** | `09A` one owner-contribution/adjustment authority, roster correction, opening/balance chain and corrected total/reserved/available formula; `09B` reserve and controlled distribution lifecycle. Add a canonical property adjustment workflow before manual Ledger retirement. | Multiowner/effective-date/transfer cases; exact 100% and overlap blockers; later-period dependency; evidenced opening balance; concurrent distributions; pending/cancel/failure; no-negative enforcement; contribution dual-write rejection. |
| 10 - Property-period close and readiness | **Split** | Move `10A` period/lock/close-version kernel early; then `10B` reconciliation + deterministic checks; `10C` close/reopen/restatement/UI. A mutable unique row cannot be the close evidence. | Two-property same-organization isolation; write-versus-close race; stale calculation/source manifest; immutable reclose revisions; later-period invalidation; full blocker code matrix; account roster/zero variance; direct bypass. |
| 11 - Immutable Owner Statement publication | **Split** | `11A` close-backed schema, itemized lines, source/owner/recipient snapshots and approval; `11B` per-format artifacts, deterministic render, private append-only Storage, checked download and manual publish; `11C` history/reissue/cancel/delivery. Keep internal diagnostic CSV distinct from official owner CSV. | Exact close-revision binding; retained-byte/checksum equality; PDF/CSV owner-detail snapshots; multipage/locale/currency; upload/DB failure recovery; organization/path authorization; cancellation/supersession; no current-contact drift. |
| 12 - Backfill, pilot, and production cutover | **Split** | `12A` run/resolution schema + dry-run; `12B` bounded resumable apply + restore/rollback rehearsal; `12C` named pilot + canonical read/write cutover; `12D` later compatibility retirement. Treat `BACKFILL-*` inferred dates and all fuzzy/unresolved rows as blockers. | Two-process lock, interruption at every checkpoint, stale/corrupt manifest, duplicate apply, source change, project mismatch, backup restore, canonical-only rollback behavior, exact pilot reconciliation, production route smoke, observation window and explicit sign-off. |

## 9. Schema and migration review

- **Tables/views/RPCs that should not be added:**
  - no independently writable `property_cash_events` table;
  - no second generic Ledger/accounting authority or product-facing GL;
  - no fuzzy-match resolver that writes authoritative links;
  - no permanent dual-write/cutover toggle;
  - no generic workflow/approval engine for this scope;
  - no statement artifact reuse of the mutable `nestory-documents` bucket/policies.
- **Existing tables/columns that should be reused instead:**
  - receipt/payment headers and allocation IDs as settlement domains, once strengthened;
  - `lease_deposit_events`, petty-cash entries, finance obligations, maintenance tasks/handoffs, lease terms, `property_owners`, existing documents as linked operational evidence, `ledger_entries` as compatibility projection, and the accounting kernel as balanced/idempotent control;
  - existing organization/property composite-FK patterns and hardened checked/private RPC pattern;
  - existing accounting journal `posting_key` + payload-hash behavior as the idempotency precedent, not a second competing implementation.
- **Proposed constraints/indexes/RLS that are missing:**
  - typed canonical source namespace and unique canonical Ledger projection identity;
  - allocation-level reversal FK/uniqueness plus exact organization/property/currency/obligation/amount checks;
  - immutable allocation economic scope or source-field freeze after first settlement;
  - header amount equals allocation total, with an explicit unapplied-cash model if partial allocation is allowed;
  - stable organization-scoped reconciliation-source FK on every cash-bearing event;
  - unique payload-bound idempotency request scope, actor ownership, canonical hash, result IDs, and no cross-actor result leakage;
  - stable property-period header plus append-only close revision sequence/hash and one current pointer;
  - statement unique version sequence, exact close-revision FK, immutable line/source/owner/recipient snapshots, and artifact uniqueness by `(statement_version_id, format)`;
  - organization-scoped composite FKs on every cross-domain/source/artifact link;
  - no UPDATE/DELETE policies on close revisions, published statement evidence, migration resolutions after approval, or finalized artifacts;
  - historical owner-date overlap validation and close-time exact 100% ownership enforcement.
- **Migration-order hazards:**
  - adding write paths before property-period serialization, source identity, idempotency, projection uniqueness, and source immutability;
  - changing allocation/source identity after reports or journals already depend on obligation-level keys;
  - Plan 06 generation before compatibility sync stops overwriting lease terms;
  - statement schema before immutable close revisions exist;
  - retiring manual Ledger writes before canonical adjustments exist;
  - merging independently developed financial migrations without rebase, full reset, and regenerated-type comparison.
- **Backward-compatibility hazards:**
  - `post_finance_income_item`/`post_finance_expense_item` project obligation-level aggregate state, while the target authority is allocation-level;
  - current receipt/payment RPCs update compatibility amounts/statuses without required Ledger/journal projections;
  - owner contributions, owner payouts, deposits, management fees, maintenance, and petty cash have overlapping classifications or write paths;
  - current Property/Unit/I&E reports read Ledger, so write cutover without read cutover creates unexplained divergence;
  - generic Ledger/journal mutation can corrupt derived projections unless blocked at the database boundary.
- **Generated-type or application-boundary hazards:**
  - every migration/view/RPC change must regenerate `src/types/database.generated.ts`, preserve deliberate overrides in `src/types/database.ts`, and fail CI on an unexpected generated diff;
  - a view/RPC union needs stable non-nullability, discriminants, money/date representation, cursor order, and extension/version semantics;
  - report loaders currently cap source rows at 5,000 (`owner-statement-report.ts:49-50,869-894`), while PostgREST config caps rows at 1,000 (`supabase/config.toml:16-18`); correctness cannot depend on default truncation.
- **Historical-data ambiguity not handled:**
  - `BACKFILL-INCOME-*` and `BACKFILL-EXPENSE-*` rows with due/invoice fallback dates;
  - manual seed/production Ledger rows;
  - maintenance Ledger rows identifiable through task FK but not source metadata;
  - obligation-level posts that may represent multiple settlements;
  - current owner/contact rows excluded after archive;
  - potentially duplicated deposit-income versus deposit-event histories;
  - missing cash-source/account identity;
  - owner contribution dual authority and unknown opening balances.
- **Rollback/repair-forward concerns:**
  - after canonical-only writes begin, rollback cannot merely turn an old read/write flag back on because old paths cannot represent all new event/reversal/close data;
  - use phase checkpoints, a run lock, source manifest/hash, append-only resolution records, retry-safe operations, and a stop-writes/repair-forward procedure;
  - rehearse backup restore before pilot and define which application SHA/schema/cutover state pairs are valid;
  - never delete a canonical event to “undo” migration; reverse/resolve it and preserve provenance;
  - reopening retains the published version and bytes but immediately withdraws/invalidates its current-authority status and labels history/downloads accordingly; it becomes superseded only after a replacement is actually published.

## 10. Accounting and reporting invariants

**Confirmed invariants:**

- Every owner-relevant economic effect appears once in the canonical read contract and zero or one deterministic derived projection per required projection type.
- Obligation/assessment/service date remains distinct from settlement/cash event date; cash reporting uses the actual event date, never an invoice/due-date fallback presented as known cash.
- Receipt/payment header totals equal allocation totals, or the residual has one explicit unapplied-cash identity and workflow.
- Deposits remain custody liabilities until an approved disposition creates a separately classified owner/operating effect.
- Owner contributions are owner-liability funding, not operating income.
- Owner distributions are liability reductions, not property operating expense.
- Maintenance and petty-cash property costs enter owner performance only through one canonical property-expense effect.
- Ledger and journal projections commit in the source transaction, use unique typed identities, are balanced/idempotent, and cannot be edited/reversed independently.
- Reversals preserve originals, link directly to the reversed canonical event, produce the exact opposite amount/classification/scope, and follow property-period policy.
- Property close serializes against every canonical source and every parent/dimension edit that could change a closed event's classification, scope, date, or owner allocation.
- A close revision freezes ownership, reconciliation, source manifest, calculation version, and opening-balance dependency.
- Statement opening + itemized movement = closing total owner liability; itemized lines reconcile to source manifest and report totals.
- Published version rows and artifact bytes are immutable; correction creates a superseding version.
- Historical ownership and recipient/payment details are effective-dated and frozen for the close/version.
- Current archive/contact/owner edits cannot rewrite previously closed or published evidence.

**Missing or incorrect invariants:**

- Correct owner equation:

  ```text
  Opening total owner liability
  + allocated operating cash received
  - allocated property expenses paid
  - ratified management-fee liability effects
  + owner contributions
  - owner distributions
  +/- true owner/property adjustments
  = closing total owner liability

  available to distribute
  = closing total owner liability
  - reserved amount
  - approved pending/committed deductions
  ```

  Reserve hold/release normally moves value between available and reserved buckets; it does not change total owner liability.
- Ownership allocation needs an IPS-ratified source date (cash event date versus obligation/service entitlement) and then must use the frozen close roster. A property-level canonical event should not be duplicated once per owner in `property_cash_events_v1`.
- Reopening an earlier period must mark all dependent later close revisions/opening balances/statements stale or require ordered restatement.
- “Exactly once” must cover direct Data API and generic RPC bypass, not only the intended UI/server action.
- The owner contribution, manual adjustment, deposit disposition, fee assessment/settlement, and owner distribution authorities must each be singular and mutually exclusive.
- Close source locks must cover material parent edits. Freezing only an event date while allowing its obligation category/property/lease or ownership history to change is insufficient.
- Reconciliation is part of financial completeness: every in-scope cash event maps to a stable source, every source is included, and accepted external/system variance is zero unless an explicit IPS policy says otherwise.

## 11. Security and authorization review

- **RLS risks:**
  - Existing authenticated grants/direct admin policies permit table mutation on financial domains and Ledger. New immutable/canonical tables need SELECT through RLS and mutation only through checked RPCs/private helpers.
  - A view must use `security_invoker = true`, or a set-returning RPC must perform the same organization/role checks without bypassing source RLS.
  - Append-only evidence is not immutable if admin RLS still grants UPDATE/DELETE. Enforce immutability with grants plus trigger/policy constraints.
- **SECURITY DEFINER/INVOKER risks:**
  - Checked public functions should use hardened `search_path = ''` (or fully qualified safe paths), validate `auth.uid()`, role, organization, and every linked property/unit/lease/person/task/source, then call private helpers.
  - Private helpers must remain revoked from `authenticated`/`PUBLIC`; do not grant them merely to simplify application calls.
  - Security-definer functions must not accept a caller-controlled canonical `source_type` that can impersonate reserved projections.
- **Direct-RPC bypass risks:**
  - Generic Ledger update/archive and journal post/reverse paths can bypass source workflows. Domain-linked or reserved-source projections must be rejected there.
  - Trigger-level period/source immutability must protect direct SQL/Data API paths, not only checked settlement RPCs.
  - Compatibility wrappers must not create a second obligation-level projection after allocation-level posting.
- **Cross-organization link risks:**
  - Every source/reversal/allocation/cash-source/owner/close/statement/artifact link needs composite organization-aware FKs or equivalent checked constraints.
  - RPCs must reject mixed organization/property/unit/lease/task/person/account inputs even when individual IDs are visible to the same actor elsewhere.
  - Idempotency lookups must be scoped before returning prior result IDs so a reused key cannot disclose another actor/organization's event.
- **Role/access risks:**
  - Financial settlement, reversal, fee assessment approval, owner balance adjustment, distribution approval, close/reopen, statement approval/publication, and migration resolution should be admin-only for the initial scope.
  - A manager may create the approved maintenance handoff if IPS wants that workflow, but must not post Ledger/journal, close, publish, or override financial blockers.
  - Member/reader access is read-only and organization-scoped. Service-role migration tooling is server/CLI-only and environment-guarded.
- **Storage/artifact risks:**
  - Do not use the current mutable document bucket policy for statements. Use a private append-only boundary with organization/version path validation, checksum/size/MIME checks, and checked signed-download authorization.
  - Store one artifact row per format. Upload/finalize must tolerate object success + DB failure and DB staging + object failure without publishing partial state.
  - Recipient email/payment instructions embedded in an artifact are immutable version data; never fetch current contacts at download time.
- **Period-lock bypass risks:**
  - The lock helper and write path must acquire the same property-period serialization key in a documented order to prevent post-versus-close races/deadlocks.
  - Protect inserts, updates, archives, reversals, parent reclassification, ownership effective dates, and projection creation. Current organization/book locks remain additional blockers.
  - Reopen is admin-only, reasoned, logged, creates a new close revision workflow, and never silently unlocks a broader organization/book period.
- **Migration tooling risks:**
  - Default to dry-run/read-only, require explicit project reference/environment/date/property scope, reject local/hosted mismatch, hold one database run lock, write bounded checkpoints, and never print service-role credentials or owner contact/payment data.

## 12. Verification review

- **Required RED regressions missing from plans:**
  - zero-activity Owner Statement is not publishable merely because ownership is valid;
  - archived historical owner/contact data does not rewrite or disappear from a close/version;
  - direct edit/archive of any source-linked Ledger row fails;
  - generic journal post/reversal cannot use reserved domain source identities;
  - receipt/payment/deposit/petty-cash/owner writes race with close and exactly one side wins under one serialization order;
  - identical idempotent retries return original IDs, while changed payload and cross-actor key reuse fail;
  - allocation reversal pairs exactly once and cannot reverse the wrong obligation/property/currency/amount;
  - projection failure rolls back the source event, and source failure leaves no projection;
  - owner contribution cannot be written through two authorities;
  - compatibility lease sync cannot overwrite an authoritative lease term;
  - `BACKFILL-*` inferred dates remain unresolved without evidence;
  - later periods/statements become stale after an earlier reclose;
  - object upload/finalize failures never expose a published artifact without verified retained bytes.
- **Required pgTAP authorization/bypass cases:**
  - anonymous/member/manager/admin/cross-organization/service-role matrices for tables and every public/private RPC;
  - `has_table_privilege`, `has_function_privilege`, RLS visibility, private-helper denial, and direct DML attempts;
  - same-org wrong-property/unit/lease/person/task/account/reversal scope;
  - lock check for every source and parent edit, plus two properties in one organization;
  - forced exception after each atomic write step;
  - concurrent retry/projection uniqueness and close-versus-write sessions;
  - immutable close/statement/artifact update/delete denial;
  - first complete rent-term/generator tests: short month, frequencies, proration, changes, overlap, retry, timezone.
- **Required Vitest/application cases:**
  - canonical adapter classification/sign/date/typed ID and shadow parity;
  - no source/report truncation at configured caps;
  - owner allocation and corrected total/reserved/available equations;
  - readiness blocker/warning codes and repair links;
  - statement line/source totals, frozen owner/recipient snapshots, version/supersession;
  - official CSV contract separate from diagnostic CSV, and deterministic/normalized PDF assertions;
  - compatibility UI actions removed or disabled only after server authority exists.
- **Required browser flows:**
  - authenticated admin partial receipt, second receipt, expense payment, maintenance handoff, petty-cash post/reverse, deposit receipt/refund, one fee assessment, contribution/distribution, close, publish/download, reopen/correct/reclose/reissue;
  - manager/member forbidden-state checks and direct endpoint attempts;
  - blocker repair deep links, stale close retry, locked-period UI/server result, and retained historical statement download;
  - stateful finance lifecycle coverage rather than read-only smoke only.
- **Required performance/scale evidence:**
  - cursor/pagination correctness beyond PostgREST 1,000 and current report 5,000 limits;
  - indexed `EXPLAIN (ANALYZE, BUFFERS)` or equivalent production-shaped evidence for event view/RPC, close checks, ownership allocation, source manifests, statement generation, and migration scans;
  - deterministic bounded memory/runtime for at least the largest expected property-period and a multi-property organization;
  - no N+1 signed URL/source lookup behavior.
- **Required migration/production evidence:**
  - full local reset, schema lint, complete pgTAP, regenerated-types clean diff, lint/test/build, and focused browser flows on the exact candidate SHA;
  - dry-run manifest reviewed by source counts/amounts and explicit unresolved categories;
  - two-process run lock, stale/corrupt manifest, interruption/resume at every checkpoint, duplicate apply, changed source after analysis, and environment/project mismatch;
  - backup restore rehearsal and a documented repair-forward path for canonical-only events;
  - pilot-scoped cutover enforcement, external zero-variance reconciliation, exact deployed SHA/schema parity, protected-route authorization, and named IPS sign-off before broader rollout.
- **Existing test assumptions likely to break:**
  - `accounting_security_test.sql`, `accounting_dual_post_test.sql`, `accounting_parity_test.sql`, and compatibility tests currently permit/expect generic or obligation-level behavior that the authority kernel must retire;
  - owner-statement tests that accept Ready with valid ownership but no close evidence;
  - CSV tests that treat the current internal evidence export as the owner-facing artifact;
  - Bills/Rent & Income action tests around separate or missing posting;
  - seed assumptions of one 100% owner, monthly terms, and manual Ledger rows;
  - report tests that intentionally load Ledger for Property/Unit/I&E until the named canonical cutover.

## 13. October IPS scope judgment

**Judgment:** `Controlled pilot feasible after the corrected sequence`

**Minimum pilot scope:** One or two explicitly named USD properties and one closed month; monthly leases only; one clean 100% owner for each effective period; one named reconciliation source per property; verified opening owner balance; zero accepted variance; no ownership change; no reserve or negative-distribution override. The fixture/pilot should still exercise partial receipt/payment, known arrears, one maintenance bill, petty-cash property expense, deposit receipt/refund, one IPS-confirmed fee assessment, owner contribution/distribution, carried balance, and an open-period reversal. Manual retained PDF/official CSV download is sufficient delivery.

**Features/rules that must be deferred:** Multi-currency; non-monthly rent and unsupported proration/concession cases; within-period ownership transfers or complex multiowner pilot allocation; multiple/pooled cash sources unless IPS confirms and the reconciliation model proves them; reserve overrides/negative distributions; complex deposit retention/application; email/portal delivery; automated portfolio-wide migration; product-facing GL; and compatibility retirement before an observation window.

**Non-negotiable production blockers:** Exact source/account identity; atomic payload-idempotent settlement/reversal/projection; database-enforced source immutability and property-period locks; zero Critical diagnostic/migration issues; exact reconciliation or ratified variance; evidenced opening balances and valid ownership; immutable close revisions and retained artifact checksums; no fuzzy or unresolved legacy authority; dry-run review, interruption/resume, backup/restore rehearsal, pilot-scoped server enforcement, exact candidate SHA/schema/deployment parity, and named IPS go/no-go approval.

## 14. Exact edits required before implementation

1. **`README.md` - sequence and authorization:** Replace the current simple order with the corrected split order in Section 7; state that all financial migrations merge sequentially and that only revised Plan 01 is authorized after these documentation edits.
2. **`00-architecture-and-decision-gates.md` - Canonical write/read model and Gates A-I:** Correct the claim that allocations already carry sufficient classification; add typed event identity, allocation snapshot/freeze and direct reversal requirements, the common payload-bound idempotency contract, reserved projection namespaces, cash/reconciliation-source grain, and the property/org/book lock hierarchy.
3. **Plan 00 - Owner liability model:** Replace the equation with total liability and a separate available-to-distribute equation. State that reserve hold/release normally does not change total liability and that fees use the ratified assessment/settlement recognition event.
4. **Plan 00 - Close/statement role and stop conditions:** Replace a mutable close record assumption with stable period headers + append-only close revisions, later-period invalidation/restatement, one statement-to-close-revision link, and named IPS stop conditions for Plans 05-12. Add a canonical explicit property-adjustment target before manual Ledger retirement.
5. **`01-parity-diagnostics-and-safety-rails.md` - Required changes/fixture/verification:** Split output into current-state inventory and proposed classification; add `BACKFILL-*` inferred dates, direct grants/RPC bypass, task-to-Ledger exact links, owner-contribution dual writes, cash-source gaps, lock disagreements, report-source parity, pagination, source-change/stale-run detection, and project identity. Make the baseline fixture isolated test-only and production execution separately authorized.
6. **`02-canonical-property-cash-contract.md` - event contract:** Specify a security-invoker view/checked paginated RPC; property-level row grain; `(source_type, source_id)` identity; immutable classification/scope; allocation reversal pairing; header/allocation balance; stable reconciliation source; extension/version semantics; unsupported/duplicate deposit and legacy classifications as blockers; and no owner-duplicated rows.
7. **Create an early authority subplan extracted from Plan 10/Plans 03-04:** Before Plan 03, require property-period header and close-revision skeleton, common transaction serialization/lock order, stable reconciliation-source entity, idempotency request/payload hash, unique canonical projection identity, trigger/grant immutability, reserved journal sources, and compatibility-wrapper duplicate protection. This is a foundation PR, not close UI.
8. **`03-income-settlement-and-reversal.md` - atomic authority:** Depend on that foundation; retire the separate operator income-post action; define one transaction, explicit unapplied cash behavior, allocation snapshots/reversals, payload-bound retry results, projection uniqueness, generic Ledger/journal bypass denial, and forced-failure/race tests.
9. **`04-expense-settlement-and-reversal.md` - atomic authority/current behavior:** Mirror Plan 03, require approved non-owner-payout expenses and explicit paid date, and correct the prose to say the current Bills action silently omits the accounting post rather than presenting a visible second operator posting step.
10. **Split `05-maintenance-and-petty-cash-handoffs.md`:** `05A` covers task-to-bill cardinality, handoff, actual-versus-bill variance and legacy links. `05B` covers petty-cash explicit disbursement date, economic-scope matrix, account identity, immutable reversal event, register reconciliation and atomic projections.
11. **Split `06-rent-schedules-and-charge-completeness.md`:** `06A` ratifies policy, makes normalized lease terms authoritative, and stops compatibility sync overwrites. `06B` adds idempotent range occurrences/generation. Add worked IPS cases and full pgTAP concurrency/date-boundary coverage.
12. **`07-security-deposit-custody.md` - custody/disposition:** Make cash-source identity, locks/idempotency, disposition target/reason/approver, direct reversal identity, custody reconciliation and owner-effect classification mandatory. Restrict October to receipt/refund unless application/retention rules are ratified.
13. **Split `08-management-fee-agreements-and-assessments.md`:** `08A` resolves agreement grain and deterministic calculation/rounding with IPS examples. `08B` adds immutable assessment, approval/waiver/reversal, recognized owner effect, projection, compatibility transition and UI. Explicitly prevent agreement/ownership double allocation.
14. **Split `09-owner-balances-and-distributions.md`:** `09A` selects one owner-contribution authority, adds canonical adjustments/roster correction/evidenced opening balances and the corrected balance chain. `09B` adds reserves/distribution lifecycle only after IPS approval. Add later-period dependency and effective-owner transfer tests.
15. **Split `10-property-period-close-and-readiness.md`:** Move `10A` foundation earlier; make `10B` complete-source reconciliation and coded deterministic checks; make `10C` append-only close/reopen/restatement lifecycle and UI. Replace free-text source label with stable source FK and bind every statement to an exact close revision.
16. **Split `11-immutable-owner-statement-publication.md`:** `11A` schema/line/source/ownership/recipient snapshots and approval; `11B` official PDF/CSV, one artifact row per format, dedicated append-only private Storage, checked download and failure recovery; `11C` history/reissue/cancel/delivery. Keep current diagnostic CSV separate. Define `published -> withdrawn/invalidated` on reopen and `withdrawn -> superseded` only when a replacement version is published.
17. **Split `12-backfill-pilot-and-production-cutover.md`:** `12A` run/resolution/dry-run; `12B` resumable apply and backup/restore rehearsal; `12C` named IPS pilot and explicit report/write cutover; `12D` later compatibility retirement. Add inferred `BACKFILL-*`, owner contribution, manual adjustment, account-source, maintenance link, rollback-with-canonical-only-events, and no-fuzzy-match rules.
18. **All implementation plans - verification/handoff:** Add actual privilege and direct-RPC tests, two-session races, identical/conflicting/cross-actor idempotency, forced atomic failures, full reset/schema lint/pgTAP/generated types, production-shaped pagination/performance, stateful authenticated browser flows, and exact SHA/schema/environment evidence appropriate to the plan.

## 15. Final implementation authorization recommendation

**Recommendation:** `Begin Plan 01 only after listed plan edits`

**Conditions:**

- First commit the bounded documentation edits above and ratify Gates A-D/I plus the conservative defaults that Plan 01 uses. Later IPS fee/rent/deposit/reserve/distribution/close policies do not block read-only inventory, but they remain hard stops before their named plans.
- Plan 01 must be read-only, fail-closed, deterministic, paginated, project/environment guarded, and limited to local/test fixtures unless production diagnostic access is separately and explicitly authorized.
- Plan 01 may report ambiguity but may not classify it as authoritative, mutate data, run a backfill, change a migration, cut over a report, deploy, or authorize Plans 02-12.
- Do not begin a write-path implementation until the early authority kernel and Gate H source identity are specified and approved. Do not merge or mark implementation ready on the basis of this review alone.
