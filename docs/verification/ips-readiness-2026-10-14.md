# IPS production-readiness work — 2026-10-14

Decision: **BLOCKED for IPS go-live. Engineering candidate implemented, independently reviewed, and locally verified; integrated release and IPS acceptance gates remain open.**

## Candidate and scope

- Clean base: `555e64905631b7fadaa6bb954c0590165b2dffb2` (`origin/main`, fetched October 14).
- Branch: `codex/ips-production-readiness-20261014`.
- Worktree: `D:/nestory/.worktrees/ips-production-readiness-20261014`.
- Deposit release task `01a12a68-07b8-71a4-b559-ae453cc64008` owns the deployment and first financial release gate. This work does not merge or deploy concurrently.
- Scope: dashboard reads, invoice pagination and complete financial reads, property concurrent-edit/no-op safety, and independent verification. Cosmetics and optional features are excluded.
- Only synthetic local data may be used. No IPS records, hosted load tests, production writes, shared fixture changes, or IPS contact are authorized by this validation record.

## Execution provenance

The executor is Windows PowerShell on the supplied local workspace. Node reports `v24.8.0`; npm reports `11.6.0`; installed Next.js is `16.3.8`, Vitest `4.1.11`, and Supabase CLI `2.108.0`. Six parallel agents explicitly requested `gpt-6-astra` and `xhigh`: dashboard, finance operations, supporting financial reads, property writes, read-only readiness evidence, and independent review. The tool accepted those requests but did not return effective model telemetry. The current task was absent from the local thread metadata database. The agent interface has no service-tier selector. **Effective model, reasoning effort, and Fast tier remain independently unverified**; no Light substitution was requested.

The initial dependency install failed with Windows permissions; the elevated attempt failed on a shared npm-cache `EEXIST`. Installation then succeeded from `https://registry.npmjs.org` with a cache confined to this worktree, without dependency or lockfile changes. Failed installation timings are not performance measurements. Some Windows tests needed elevated execution for temporary files or loopback listeners; no credentials or security settings were changed.

Database checks used the dedicated synthetic stack `nestory-ips-readiness-20261014`, with API port `59321` and PostgreSQL port `59322`. The stack was stopped after verification, its synthetic volumes retained locally, and its temporary config override restored exactly before handoff. No deposit-task database, fixtures, process, or browser session was used.

## Prepared implementation

- Dashboard: deterministic complete supporting reads, exact historical-ledger count without downloading history, shared property reads, scoped current-period ledger entries and active primary-owner enrichment. Occupancy totals include properties beyond the eight displayed rows; money aggregation uses integer cents.
- Rent invoices: authorized server pagination returns 50 rows and separate complete filtered totals in one statement snapshot. Search, status, stable tie ordering, page clamping, and a separately authorized selected invoice are covered. Heavy context is restricted to the chosen property; minimal property/unit selectors remain organization-scoped. Non-rent modes retain their complete reads.
- Supporting financial reads: deterministic pagination continues past both 1,000 rows and lower configured caps, batches ID filters, and fails on errors, malformed responses, or duplicate IDs. Ledger locks, documents, history and lease correction inputs are complete. Deep USD rent sorting uses direct ranges instead of a capped prefix.
- Manual charges: an exact authorized lease/month lookup finds existing invoices outside the current page or filter, preserving their due date. Pending/error states block submission, retry is available, and interrupted responses cannot replace a newer selection. The pre-existing race where another user creates an invoice after this lookup is not made atomic by this change.
- Property edits: a database version token and checked RPC serialize competing changes. No-op saves create no timestamp/activity writes; identical retries succeed; stale conflicting edits preserve the draft. A replay after a committed save refreshes affected paths. Existing photos are managed in the Files tab so the property edit transaction is not coupled to a separate non-idempotent upload; creation-photo behavior is unchanged.
- Two new forward migrations introduce invoice pagination and checked property updates. No old migration, financial posting authority, credential, or index is changed.

## Go-live gates

These are release decisions, not a count of passing unit tests. Historical evidence does not establish the current candidate's hosted behavior.

| Priority | Gate | Status | Evidence required to close |
| --- | --- | --- | --- |
| 1 | Deposit receipt, application to rent, refund, reversal and retry | **FAILED at base / deposit release pending** | Deposit lead's exact-SHA database and browser acceptance, account reconciliation, duplicate/retry and reversal evidence. Base action only allows received/retained/refunded and the existing lifecycle test explicitly rejects applied. |
| 1 | Rent charge, receipt, correction and reversal | **UNVERIFIED current candidate** | Exact-SHA complete workflow, immutable receipt download, actor/reason audit, expected cash and receivable balances. October 7 evidence contains a historical partial pass. |
| 1 | Owner statements and P&L reconciliation | **UNVERIFIED** | Complete statement publication/download and independently reconciled IPS balances, including recognized expense versus cash paid, deposits, fees and reversals. Synthetic oracles do not establish IPS balances. |
| 2 | Complete totals and deterministic pagination above 1,000 rows | **PASSED local synthetic; hosted acceptance UNVERIFIED** | 1,551-invoice SQL fixture, complete page traversal/totals, cross-scope denial, strict mock fixtures above 1,000 rows and lower caps. Representative hosted volume/browser acceptance is still required. |
| 2 | Concurrent editors, no-op saves and interrupted/repeated actions | **PASSED local synthetic; hosted acceptance UNVERIFIED** | Real two-session proof covers conflicting and identical edits, post-commit replay, rollback and owner races; SQL/component tests cover no-op, invalidation, stale drafts and interrupted invoice lookup. Hosted interruption/retry acceptance remains unverified. |
| 3 | Tenant, company, branch and role isolation | **UNVERIFIED current full acceptance** | New RPC denial/cross-company tests plus exact-SHA real HTTP/Auth/Storage role journeys. Historical staff matrix is partial evidence only. |
| 4 | Backup restoration | **UNVERIFIED** | Named recovery owner, restorable checkpoint, Auth/database/Storage coverage, approved RPO/RTO and timed restoration evidence. Existing tiny synthetic rehearsal is insufficient. |
| 4 | Monitoring and scheduled jobs | **UNVERIFIED** | Deployed schedule, successful and failed execution history, duplicate invocation behavior, freshness/backlog thresholds and demonstrated alerts. |
| 4 | Rollback | **UNVERIFIED** | Named decision owner, criteria, exact-SHA application rollback and reviewed forward database repair/recovery procedure, rehearsed within the accepted objective. |
| 4 | Support | **UNVERIFIED** | Named support owner, escalation route, operating hours and incident procedure accepted by IPS. |
| 4 | IPS user acceptance | **UNVERIFIED** | Named independent finance/operations/data approvers, representative workflows, signed outcomes and explicit exception disposition. Engineering readiness cannot close this gate. |

For the integrated release, use an approved synthetic example in one currency: receive a deposit of 100, apply 40 to a rent invoice of 120, and verify invoice due 80, remaining deposit liability 60, and no second cash receipt. Repeat the request and verify no duplicate posting or receipt; reverse the application and reconcile the restored invoice and deposit positions. Include refund/retention, an archived account, a closed period, unauthorized users, and an interrupted response. Deposit PR230 owns this financial acceptance; this candidate does not claim it has passed.

Reconcile owner statements as opening balance plus supported activity equals closing balance, with the statement PDF matching the ledger and P&L treatment. Record the distinction between recognized rent/expenses and cash movement, and exclude refundable deposits from earned income. Run the approved staff/tenant/company roles through real sign-in, HTTP and Storage downloads, including explicit cross-company and cross-branch denial. Record workflow response-time thresholds agreed with IPS and test those at representative volumes; the local measurements below are not that acceptance.

## Evidence limitations

The canonical `ips-production-readiness-report.md` and `ips-pilot-reconciliation.md` remain historical blocked records tied to an August candidate. October verification notes are also checkpoints tied to their own SHAs. Neither old successes nor old failures are silently reclassified as current results.

No new index is justified without an inspected query plan. Mock row/query counts describe application transfer and algorithm behavior, not hosted latency or concurrent-user capacity. Offset scans across multiple requests do not provide a transaction snapshot; stable ordering does not prevent a concurrent insertion/deletion from changing later offsets. The invoice page and totals share a SQL statement snapshot; separate user page visits do not.

These changes reduce transfer and fix truncation, but do not establish an IPS response-time SLA. The remaining broad lease selectors and complete non-rent workflows require separate measurement before further optimization. Application mocks and local SQL do not prove production Auth/Storage behavior or business acceptance.

## Before/after synthetic measurements

| Scenario | Before | After | Meaning |
| --- | --- | --- | --- |
| Dashboard fixture with 21,005 historical entries | 36 mock requests, 22,014 returned rows, 22,010 ledger rows | 17 requests, 1,007 returned rows, 1,005 ledger rows | Historical count remains 21,005 and current income remains 1,005; measures application transfer, not database latency. |
| Ledger completeness | 1,000 properties/units/documents, 120 activity rows, 24 locks; older entry incorrectly shown unlocked | 1,001 properties/units/documents/activity rows, 30 locks; older entry correctly locked | Deliberately returns more complete data; not claimed as a speed gain. |
| Lease page 22 of 1,200 rows, USD rent descending | 0 rows; two prefix list requests | 50 rows; one direct range request (1,050–1,099) | Fixes the deep-page truncation. |
| Authenticated invoice fixture: 1,551 selected-property invoices, including 1,251 open and 300 paid | Legacy view transfer exceeded a bounded 5-second diagnostic timeout | 50 page rows; 53,134-byte full JSON response; 208.437 ms in the first isolated run (197.093 ms in the full-suite run) | Different bounded request; no reliable old/new speed ratio. All page/totals checks passed. |

An initial legacy diagnostic was cancelled after approximately 167.8 seconds, targeting only its own backend. The committed test bounds this diagnostic at five seconds. The available RPC `EXPLAIN` exposes the wrapper rather than internal execution plans, so nested plan quality and production contention remain **UNVERIFIED**. No index was added on that basis.

Mock comparison source/results and command logs are retained locally under `.codex-artifacts`; the assertions and SQL fixture are in the committed test sources. Ignored local artifacts are supporting evidence, not a hosted release record.

## User-owned evidence

Obtain through the parent/release owner, without contacting IPS from this task:

- Representative volumes, expected balances and acceptable daily-workflow response times.
- Staff roles/branch mapping and named independent finance, operations and data approvers.
- Signed IPS UAT outcomes and unresolved-exception disposition.
- Backup/Storage coverage, approved RPO/RTO, recovery owner and restoration evidence.
- Monitoring thresholds, support/escalation ownership and rollback criteria/decision owner.

## Verification record

| Check | Result | Scope/evidence |
| --- | --- | --- |
| Clean migration replay | PASS | Dedicated local database, all existing migrations plus the two new migrations, no seed. |
| Full SQL suite and loaded-fixture contract | PASS | 139 files / 4,660 SQL assertions, plus one loaded-fixture contract. Includes 53 assertions in the two new SQL test files. |
| Local database lint | PASS | `db lint --local --level error --fail-on error`. |
| Generated public database types | PASS | Generated from the isolated database; 40 added lines for the new column and RPCs. |
| Node contract suite | PASS | 235 tests. |
| Updated CI registration contracts | PASS | 13 tests after adding the property concurrency job step. |
| Chart fixture contract | PASS | One fixture contract. |
| Migration discipline | PASS | 193 immutable base migrations, two forward migrations and 20 historical reconciliation declarations, checked against the stated clean base. |
| Tracked repository secret scan | PASS | All 1,890 tracked files, including newly staged files. |
| Dependency audit | PASS | Production: no vulnerabilities; development: one low, no high/critical. |
| Full unit tier | PASS | 2,941 tests across 293 files; final serial run, 209.78 seconds. |
| Full UI tier | PASS | 1,531 tests across 135 files; final serial run, 704.44 seconds. These are component tests, not IPS browser acceptance. |
| Full lint | PASS | Final frozen source, including the hook correction and new CI test. |
| TypeScript and production build | PASS | `npx tsc --noEmit` and `npm run build` on the final frozen source. Local placeholder configuration; telemetry and upload credentials disabled. |
| Built application smoke | PASS | CI-equivalent local server served `/login` with HTTP 200 and title Nestory on private port 59330; owned process stopped afterward. No authenticated browser acceptance is claimed. |
| Two-session property concurrency | PASS | One real concurrency proof (19.7 seconds), covering conflicting/identical edits, replay, rollback and owner changes; random fixture cleanup verified. Registered in CI. |
| Local repository database concurrency checks | PASS | Lease-term authority passed; paid-cost passed 11 tests; legacy-deposit default passed two tests; historical rent correction passed five tests. Serial execution only in the dedicated synthetic stack. |
| CI-only concurrency checks | UNVERIFIED in this local record | Photo/logo concurrency requires `CI=true`; deposit lifecycle concurrency requires `GITHUB_ACTIONS=true`. These guards were not bypassed locally. The PR's exact-SHA GitHub checks are the authoritative execution record; rerun the normal isolated database job at integration. |
| Fresh independent review | PASS | No unresolved actionable findings in the final source. Both the off-page manual-charge due-date regression and the A-to-B-to-A stale pending-state bypass were fixed and re-reviewed with regressions. Reviewer made no implementation changes. |

The first simultaneous full unit/UI/build attempt hit timing failures under resource contention and was stopped. Checks were rerun serially without weakening the test timeouts. The first property concurrency proof exposed test-harness session-name truncation and cleanup defects; those were corrected before the successful proof, with original failures preserved if cleanup also fails. These interrupted/failed attempts are not counted as passes.

All final local verification commands above exited zero. The build smoke emitted the existing Next.js standalone-launch warning while serving the expected HTTP 200 response; it does not establish a hosted startup, authenticated workflow, or IPS acceptance. The original checkout's unrelated edits and user-local configuration were preserved.

## Serialized integration and release

1. Parent/release lead completes and verifies deposit PR230 first. Keep this branch out of the active deployment until that lead releases ownership.
2. Reconcile this candidate with the resulting `main`, resolve any finance/schema overlap, regenerate types, and rerun the relevant database, financial, UI and full repository gates on the integrated SHA. Current local success applies only to this candidate/base.
3. Apply production migrations only through `.github/workflows/ci.yml` from exact merged `main`, using the protected `production-database` environment, one writer, hosted preflight/postflight, linked lint and final dry-run. No developer `db push` or connector migration is authorized by this evidence.
4. Record exact deployment/database SHAs, synthetic hosted smoke results and the financial reconciliations before requesting IPS acceptance. Do not label technical readiness as IPS approval.
5. Keep the release blocked while any financial, recovery, access or business-acceptance gate above lacks its required evidence. Application rollback and database recovery follow the reviewed runbooks; do not edit or reverse an already released migration.
