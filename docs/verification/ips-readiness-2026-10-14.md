# IPS production-readiness work — 2026-10-14

Decision: **BLOCKED for IPS go-live. Engineering candidate implemented, independently reviewed, and locally verified; integrated release and IPS acceptance gates remain open.**

## Candidate and scope

- Initial clean base: `555e64905631b7fadaa6bb954c0590165b2dffb2` (`origin/main`, fetched October 14).
- Deposit integration base: `eaf3fa8327d2e93df11244e06cdb4f4b93f3d25b` (merged PR230). The initial PR231 candidate was `a8b5c1e5908d1b5f663d991bcbf7cf2efb75caff`; its GitHub CI run `38568674038` passed. Those results are historical until rerun on the integrated candidate.
- Branch: `codex/ips-production-readiness-20261014`.
- Worktree: `D:/nestory/.worktrees/ips-production-readiness-20261014`.
- Deposit release task `01a12a68-07b8-71a4-b559-ae453cc64008` completed and verified PR230. The parent then released deployment ownership to this task, conditional on final browser evidence, independent review and exact-head CI. No concurrent release is permitted.
- Scope: complete/scoped dashboard and financial reads, invoice pagination, property concurrent-edit/no-op safety, deposit liability reporting, manual-charge authorization, sanitized maintenance-error reporting, recovery/browser evidence and independent verification. Cosmetics and optional features are excluded.
- Use fictional records in an independently verified local or non-customer test context. Do not change IPS records, run hosted load tests, change shared fixtures, contact IPS, or release concurrently with the deposit lead. The parent authorized the tested integrated release through the protected main pipeline; IPS business acceptance remains a separate decision.

## Execution provenance

The executor is Windows PowerShell on the supplied local workspace. Node reports `v24.8.0`; npm reports `11.6.0`; installed Next.js is `16.3.8`, Vitest `4.1.11`, and Supabase CLI `2.108.0`. Six parallel agents explicitly requested `gpt-6-astra` and `xhigh`: dashboard, finance operations, supporting financial reads, property writes, read-only readiness evidence, and independent review. The tool accepted those requests but did not return effective model telemetry. The current task was absent from the local thread metadata database. The agent interface has no service-tier selector. **Effective model, reasoning effort, and Fast tier remain independently unverified**; no Light substitution was requested.

The initial dependency install failed with Windows permissions; the elevated attempt failed on a shared npm-cache `EEXIST`. Installation then succeeded from `https://registry.npmjs.org` with a cache confined to this worktree, without dependency or lockfile changes. Failed installation timings are not performance measurements. Some Windows tests needed elevated execution for temporary files or loopback listeners; no credentials or security settings were changed.

Database checks use the dedicated synthetic stack `nestory-ips-readiness-20261014`, with API port `59321`, PostgreSQL port `59322` and application port `59330`. The original candidate's stack was stopped and configuration restored after its verification; the integrated rehearsal restarted only this owned stack with a temporary local configuration. Final cleanup is recorded separately below. No deposit-task database, fixtures, process, or browser session was used.

After both browser runs completed, the exact owned application process on port 59330 was verified and stopped, the named Supabase stack was stopped with its Docker volume retained, and `supabase/config.toml` was restored byte-for-byte from its saved original. Git reports no configuration diff. Failed and successful evidence remains in ignored local artifacts. No other task's process, stack or volume was stopped.

## Prepared implementation

- Dashboard: deterministic complete supporting reads, exact historical-ledger count without downloading history, shared property reads, scoped current-period ledger entries and active primary-owner enrichment. Occupancy totals include properties beyond the eight displayed rows; money aggregation uses integer cents.
- Rent invoices: authorized server pagination returns 50 rows and separate complete filtered totals in one statement snapshot. Search, status, stable tie ordering, page clamping, and a separately authorized selected invoice are covered. Heavy context is restricted to the chosen property; minimal property/unit selectors remain organization-scoped. Non-rent modes retain their complete reads.
- Supporting financial reads: deterministic pagination continues past both 1,000 rows and lower configured caps, batches ID filters, and fails on errors, malformed responses, or duplicate IDs. Ledger locks, documents, history and lease correction inputs are complete. Deep USD rent sorting uses direct ranges instead of a capped prefix.
- Manual charges: an exact authorized lease/month lookup finds existing invoices outside the current page or filter, preserving their due date. Pending/error states block submission, retry is available, and interrupted responses cannot replace a newer selection. The pre-existing race where another user creates an invoice after this lookup is not made atomic by this change.
- Property edits: a database version token and checked RPC serialize competing changes. No-op saves create no timestamp/activity writes; identical retries succeed; stale conflicting edits preserve the draft. A replay after a committed save refreshes affected paths. Existing photos are managed in the Files tab so the property edit transaction is not coupled to a separate non-idempotent upload; creation-photo behavior is unchanged.
- Four new forward migrations introduce invoice pagination, checked property updates, correct deposit-application liability projection and authorization before manual-charge existence probes. The liability correction reads existing posting evidence; it does not create a second cash receipt or alter posting authority. No old migration, credential, index or Auth setting is changed.
- Finance account activity completes all supporting selectors and cash-event pages beyond 1,000 records. Valid deposit application/reversal evidence projects a liability decrease/increase with zero cash; malformed evidence stays unresolved and archived historical accounts remain readable.
- Maintenance failures report one sanitized monitoring event for returned RPC errors, thrown RPC failures and setup failures. The generic HTTP response, authorization and single invocation are preserved. This code change does not establish a deployed schedule or delivered alert.
- The manual-charge account wrapper checks its existing organization/property permission before reading lease/account existence or idempotency bindings. Unauthorized callers receive the same denial for existing and missing foreign leases. The underlying command's checks and RPC grants remain intact.
- The user-approved password follow-up changes new-password validation to a minimum of eight characters with lowercase, uppercase and a number; symbols are optional. Both password-entry forms inherit the shared policy. Existing login acceptance and credentials remain unchanged. The parent reports the matching provider minimum/composition and leaked-password protection saved and verified after reload; this task did not change provider settings.

## Go-live gates

These are release decisions, not a count of passing unit tests. Historical evidence does not establish the current candidate's hosted behavior.

| Priority | Gate | Status | Evidence required to close |
| --- | --- | --- | --- |
| 1 | Deposit receipt, application to rent, refund, reversal and retry | **PASSED bounded local SQL/browser; IPS acceptance UNVERIFIED** | 183 disposable SQL assertions plus real receipt/custody/application/reversal, lost-response retry, PDF/XLSX and role journeys passed. Refund/retention and archived-account evidence is SQL-based; PR230 live verification is recorded separately. No customer financial action was performed. |
| 1 | Rent charge, receipt, correction and reversal | **UNVERIFIED current candidate** | Exact-SHA complete workflow, immutable receipt download, actor/reason audit, expected cash and receivable balances. October 7 evidence contains a historical partial pass. |
| 1 | Owner statements and P&L reconciliation | **PASSED bounded local synthetic; IPS reconciliation UNVERIFIED** | Real statement publication, retained PDF/XLSX bytes, corrected superseding revision and role denials passed. Deposit application/reversal preserved scoped P&L/cash and reconciled owner liability. Independently reconciled IPS balances remain required. |
| 2 | Complete totals and deterministic pagination above 1,000 rows | **PASSED local synthetic API/browser; hosted capacity UNVERIFIED** | 1,551-invoice SQL fixture; real API traversal of 1,005 invoices across 21 pages; UI first/last pages and full USD 10,060.05 total; cross-scope denial; strict mocks above 1,000 rows and lower caps. No hosted capacity or IPS SLA is claimed. |
| 2 | Concurrent editors, no-op saves and interrupted/repeated actions | **PASSED local synthetic; hosted acceptance UNVERIFIED** | Real two-session proof covers conflicting and identical edits, post-commit replay, rollback and owner races; SQL/component tests cover no-op, invalidation, stale drafts and interrupted invoice lookup. Hosted interruption/retry acceptance remains unverified. |
| 3 | Tenant, company, branch and role isolation | **PASSED tested local role/company/branch scopes; full IPS matrix UNVERIFIED** | Real Auth/API/browser/report/Storage journeys cover finance reader/member, lease-only, wrong-branch, foreign-company and operations actors. A complete tenant portal and IPS staff-role mapping remains outside this bounded proof. |
| 4 | Backup restoration | **PASSED bounded local restore; hosted recovery UNVERIFIED** | Full local schema/data/ACL/scoped-query checks and one synthetic Storage byte roundtrip passed. Hosted checkpoint, complete Auth/Storage failover, named recovery owner and approved RPO/RTO remain required. |
| 4 | Monitoring and scheduled jobs | **UNVERIFIED** | Deployed schedule, successful and failed execution history, duplicate invocation behavior, freshness/backlog thresholds and demonstrated alerts. |
| 4 | Rollback | **UNVERIFIED** | Named decision owner, criteria, exact-SHA application rollback and reviewed forward database repair/recovery procedure, rehearsed within the accepted objective. |
| 4 | Support | **UNVERIFIED** | Named support owner, escalation route, operating hours and incident procedure accepted by IPS. |
| 4 | IPS user acceptance | **UNVERIFIED** | Named independent finance/operations/data approvers, representative workflows, signed outcomes and explicit exception disposition. Engineering readiness cannot close this gate. |

For the integrated release, use an approved synthetic example in one currency: receive a deposit of 100, apply 40 to a rent invoice of 120, and verify invoice due 80, remaining deposit liability 60, and no second cash receipt. Repeat the request and verify no duplicate posting or receipt; reverse the application and reconcile the restored invoice and deposit positions. Include refund/retention, an archived account, a closed period, unauthorized users, and an interrupted response. Record integrated results separately from PR230's acceptance.

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

## Initial candidate verification record

This section records verification before merging PR230. The integration record below supersedes it for release decisions.

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

## Deposit integration record

PR230 merged into main at `eaf3fa8327d2e93df11244e06cdb4f4b93f3d25b`. The only merge conflict was the CI location where each branch added its database test; both steps are retained. Main's 208 migrations are unchanged. Only the two unreleased PR231 migrations were moved after main's latest timestamp, without changing their SQL bytes:

| Migration | New identity | SHA-256 |
| --- | --- | --- |
| Invoice pagination | `20261014131840_finance_invoice_pagination.sql` | `becc578eb98b3c2cec1f274702abdefe1be843cb7bb3c303e959dd4434d2b144` |
| Checked property updates | `20261014131841_property_checked_updates.sql` | `60a1b7383e5abe1f8de2c16188173f95d5278798d8655c955df29c304af8f77f` |

The two-migration integration passed discipline against that main SHA: 208 immutable migrations, two forward migrations and 20 historical reconciliation declarations. Its 210-migration replay passed. A third forward migration was then added for the financial read defect below; the final 211-migration chain also replayed successfully in the isolated local stack.

The first main release attempt in CI run `38569250515` failed at **Link exact production project** and skipped all subsequent hosted steps. The parent/deposit lead resolved the protected-environment blocker and verified the rerun: production job `115899674512` passed exact-main verification, hosted preflight, apply, postflight, preservation checks, linked lint and final dry-run. This task independently read those successful job steps. No credential was changed or copied by this task.

The parent reports both live domains on `eaf3fa8327d2e93df11244e06cdb4f4b93f3d25b`, a 208-row production migration ledger, passing preservation/grant/RLS/custody/reversal/step-up checks and 14 live checks without observed runtime errors. These are PR230 release results, not evidence that PR231 has deployed. The previous `555e6490` deployment is a rollback candidate; availability is not a completed rollback rehearsal.

Initial integrated checks passed: 139 SQL files / 4,660 assertions, one loaded-fixture contract, 3,110 unit assertions (one packet integration test skipped without its explicit fixture input), 235 Node contracts and the chart fixture contract. The 1,551-invoice fixture returned 50 rows and a 54,762-byte complete response; the bounded RPC measurement was 290.285 ms. The legacy read again exceeded five seconds. These measurements supersede the earlier table for the merged deposit-aware SQL, and remain synthetic local observations.

Independent review identified an inherited integration issue that the original SQL suite did not cover: deposit applications/reversals have no cash ledger entry and the existing cash projection marked them unresolved, causing liability account activity to omit their effects. Reproduction in a disposable database confirmed an applied 100 event with `amount=-100`, unresolved state, null effects and no ledger/source. Forward migration `20261014133400_project_deposit_rent_liability_activity.sql` (SHA-256 `e3a478452a05f73ecda01844283f09d45f5d92f6fb7ec8b51215e80a9ace6471`) validates the application, custody/owner evidence and reversal lineage before exposing liability effects of -100/+100 and zero cash. Invalid evidence remains unresolved. The final disposable database harness passed 183 assertions, including archived-account reversals, and confirmed cleanup. Its target guards passed eight tests; 56 focused application tests and TypeScript passed.

The security review then reproduced the manual-charge wrapper's existence oracle: foreign-company admin, wrong-branch writer, finance viewer and missing-user probes reached account validation before permission denial. The same rollback-only regression failed four denial assertions before the fix and passed all 13 afterward. Forward migration `20261014140000_manual_charge_authorization_first.sql` (SHA-256 `732be795b37dba1a68c04a1776b5e1ae168165f6b0ab89882c6d0d6494ed1bdc`) moves the existing effective guard before those reads. Postflight confirmed unchanged ACL, definer/search-path configuration and remaining function body, with zero invoice/activity/binding effects from rejected requests. Only the dedicated local database was updated, using the normal local migration command.

The full integrated UI tier passed 1,539 tests across 136 files. Full lint and the production build passed after the financial and monitoring changes. The monitoring change passed 26 focused tests. These are engineering checks, not IPS acceptance.

After the third migration, final local replay and verification passed: 211 migrations; 139 SQL files / 4,660 assertions in 117 seconds; one loaded-fixture contract; 251 Node contracts; full database lint with zero findings; generated public type parity; and discipline against 208 immutable main migrations, three new migrations and 20 historical declarations. Dependency audit reported zero production vulnerabilities and one low-severity development finding. A first database-lint invocation ran while transactional pgTAP tests were active and reported temporary extension helper errors; rerunning after the tests completed returned no findings. No application schema change or lint exception was used to make that rerun pass.

The operator scripts `scripts/ips-integrated-readiness-browser.mjs` and `scripts/ips-integrated-readiness-fixture.mjs` are hard-bound to this disposable project and loopback endpoints. Their contract tests reject other targets and fail closed if a resumed browser run has an uncheckpointed committed intent. The recovery operator `scripts/ips-readiness-recovery.mjs` and its core helper require the recorded fresh synthetic fixture/container provenance; they do not accept arbitrary project or backup targets. Pure guards for both operators are registered in `test:contracts`. Runtime results follow below; the presence of a runner is not a passing rehearsal.

`scripts/smoke-ips-owner-statement-readiness.mjs` uses fresh synthetic identities, organization, owner/property and future period in the owned stack. It does not invoke the existing global fixture reload/cleanup harness. Its guards and artifact/balance checks are in `scripts/owner-statement-readiness-core.mjs` and `scripts/owner-statement-readiness.node-test.mjs`; the pure tests are registered in `test:contracts`. It preserves the historical baseline R3 publication and both stored artifact hashes, and retains its new scoped case for review. Each repeat creates a fresh organization and case, preserving prior cases and their company-month locks. An initial baseline-identity attempt correctly failed privileged UUID validation because the legacy fixture uses version-zero UUIDs; that failure did not justify weakening the application guard.

Both integrated local browser runs passed. Final exact-SHA CI, final commit review and hosted release results are separate gates recorded on PR231 and in the release handoff. No pending check is a pass.

### Deposit and volume browser evidence

The generated fixture and retained attempt chain begin at `output/playwright/ips-readiness-2026-10-14T14-17-05-337Z/`; `acceptance-summary.json` indexes the evidence. The final completed result is its nested `resume-2026-10-14T14-18-47-771Z/resume-2026-10-14T14-21-47-691Z/resume-2026-10-14T14-23-44-269Z/results.json`; preceding checkpoints retain the original receipt, interrupted request and export evidence. Resume guards reconciled committed intent and balances before proceeding. No committed application was replaced or repeated under a new key to obtain a pass.

- A real synthetic actor traversed 1,005 invoices over 21 API pages, totaling USD 10,060.05. The UI showed 50 rows on the first page, five on the last and the same complete total; filtered queries also reconciled.
- The browser recorded a USD 600 deposit receipt, allocated its owner evidence and confirmed custody. A USD 100 rent application left held deposit and invoice due at USD 500. A deliberately lost committed response plus original double-click/retry produced exactly one settlement, zero invoice cash payments and no new cash/P&L movement. Scoped owner/deposit lineage reconciled.
- Full reversal restored both balances to USD 600, preserved zero cash/P&L movement and reversed the owner liability effect. Replaying the original reversal returned the same command. The stale applied-report fingerprint returned HTTP 409.
- Actual applied and reversed PDF/XLSX downloads passed exact summary and byte checks. Authenticated reader, lease-only, other-branch and foreign-company actors passed the expected UI/API/report denial matrix. All five final actor page-error arrays were empty.
- Every session's Auth issuer and actor were verified against the owned API on port 59321. The served `/login` page on port 59330 contained the exact on-disk build ID `ieWiv5aLzTtOz4oCHjbNK`, recorded in `build-binding.json`.

Initial harness failures (checked property creation, actual tab navigation, stricter cache directives, secure-cookie download transport and the correctly absent lease-only finance panel) remain recorded. They were corrected without changing product guards. Local synthetic timings and these scoped roles do not establish hosted capacity or a complete IPS access matrix.

### Official owner-statement browser evidence

Run `6240a2a7-0ab8-47b9-9581-b86278349355` completed at `2026-10-14T14:24:14.641Z` against the final local application and 212-migration database. Its report, canonical statement models, screenshots and downloaded bytes are retained under `.codex-artifacts/official-owner-statement/6240a2a7-0ab8-47b9-9581-b86278349355/`. The synthetic organization is separate from both the baseline and the deposit-browser fixture.

- Finance Manager closed and published revision one through the UI: held owner cash USD 1,000, owner due USD 200, two other components zero, eight lines and eight sources. PDF/XLSX downloads were 3,930/3,909 bytes and matched their registered SHA-256 hashes.
- A checked reopen and USD -25 correction produced revision two: held cash USD 975, owner due USD 200, nine lines and nine sources. Its 4,824/4,009-byte PDF/XLSX files matched registered hashes; revision two superseded the immutable first revision.
- Finance Member downloaded all four retained files; real close/publish/reopen RPC attempts returned `42501`. Operations Manager could not navigate to balances, read the statement (`42501`) or download either artifact (`403`). Browser requests used the actual session and did not count a login redirect as permission evidence.
- Historical baseline R3 publication metadata and both stored artifact hashes remained unchanged. No pending publication or verified-artifact claims remained. Synthetic cases and artifacts are retained in the owned local volume for inspection.

Earlier attempts are retained as failures: checked branch assignment rejected direct fixture property insertion; legacy version-zero fixture UUIDs failed privileged validation; a non-browser test request retrieved login HTML instead of the registered artifact bytes. The harness corrections used checked creation APIs, valid synthetic identities and actual UI downloads. No application authorization, artifact-integrity or UUID guard was weakened. The local step-up enforcement setting was observed false and left unchanged; production enforcement is not proven by this local run.

### Final local database and recovery evidence

The final clean replay contains **212 migrations**. It passed **140 SQL files / 4,673 assertions** in 93 seconds, zero database-lint findings, generated public type parity, and forward-only discipline (208 immutable main migrations, four additions, 20 historical declarations). The latest Node contract run passed **259 tests**. A prior repeated SQL run used a fixture already modified by the loaded-fixture contract's lifecycle smoke, whose deliberate 10% owner vector moved to the current date; two unrelated owner tests then saw 110%. A fresh owned-stack reset/load and the normal SQL-first order removed that contamination. The original failure remains in `.codex-artifacts/final-212-sql.log`; the passing clean run is `.codex-artifacts/final-212-clean-sql.log`.

Recovery run `ed136a63-b103-4cac-9265-8ac3c7c29d26` completed successfully on PostgreSQL 17.6 and the final 212-migration schema. Its report is retained at `.codex-artifacts/ips-readiness-recovery/ed136a63-b103-4cac-9265-8ac3c7c29d26/report.json`.

| Restore check | Observed result |
| --- | --- |
| Data and sequences | 180 tables, four sequences and 1,475 rows matched; source remained stable. |
| Logical schema and permissions | 6,825 objects matched, including 137 policies, 870 functions, ownership and effective grants. Seven PostgreSQL ACL comparison regressions also passed. |
| Auth data and scoped queries | Five users and five identities restored; authenticated finance, lease, invoice, deposit and property read results matched; unrelated actor returned zero properties. |
| Dump and timing | Custom-format dump 6,053,151 bytes; dump 0.937 seconds, restore 4.142 seconds, validation 3.020 seconds, whole rehearsal 12.661 seconds. These are tiny local-fixture timings, not production RTO. |
| Separate Storage bytes | One generated 7,248-byte object was downloaded, backed up, re-uploaded and checked by hash; corresponding metadata restored in the clone. |
| Cleanup | Run-owned clone dropped, dump removed, generated bucket/objects removed; `completed=true`. |

Failed rehearsal attempts were preserved. The first exposed PostgreSQL's string representation of OIDs, then strict schema comparison exposed physical gaps from dropped columns, ACL ordering and explicit-default versus null ACL representation. Reviewed comparison changes preserve logical column order, types/defaults/flags, owners, complete privilege/grant-option/grantor semantics, full identifiers and duplicate-key rejection. They do not omit permission checks or schema differences. The earlier retained clone was removed only after its exact name, OID, owner and run nonce matched, with separate cleanup evidence.

This proof excludes scheduler/outgoing queues, global-role/password restoration, an Auth service attached to the restored database and Storage service failover. Existing object-byte coverage is not established by the single generated object. New deposit-application lineage tables are empty in this source: their schema/empty state is verified, not recovery of populated application lineage. Hosted PITR/checkpoint and representative-volume recovery remain open gates.

### Inputs needed outside this worktree

- **Hosted fictional acceptance:** identify an already approved non-customer Vercel deployment/project and isolated Supabase project/ref or branch, prove their binding to the exact integrated SHA, and provide fictional fixture/ordinary-actor provenance. Read-only connector inventory on October 14 returned only the existing `nestory` project (`pfvmztxktkwyewvxfgot`) and its default `main` branch, not an isolated preview database. PR231's initial Vercel preview predates integration and its Supabase Preview check was skipped; no safe hosted database binding has been established. Do not point acceptance writes at the customer project or purchase/provision a substitute implicitly.
- **Recovery:** name the operator and approve RPO/RTO, checkpoint/retention expectations and a representative restore target, including separate Storage object bytes. Local restore evidence cannot identify a recoverable hosted checkpoint.
- **Monitoring:** name the operator, freshness/backlog thresholds, existing monitoring environment and approved alert destination. Local tests can verify reporting logic; delivery requires an approved recipient and actual external evidence.
- **Rollback/support:** name the release decision owner, rollback triggers, primary/backup support contacts, coverage hours and escalation route.
- **IPS acceptance:** provide the expected reconciliations and daily volumes, approved staff/branch mapping, named finance/operations/data approvers and recorded acceptance or exception decisions. No IPS contact has been made.

### Advisor warnings

The [security inventory](ips-security-advisor-review-2026-10-14.md) retains the original 198 authenticated-callable definer signatures and records the post-PR230 baseline: 205 definer signatures plus password protection and MFA warnings, 22 INFO and no ERROR. Its source review found the manual-charge error oracle; the regression reproduced it before the repair. Removing that bug does not remove the advisor's definer-exposure category. The parent reports the separately approved leaked-password setting enabled, persisted after reload and its warning cleared; the deposit lead owns that configuration evidence. No MFA setting, enforcement, paid phone MFA or material permission change is authorized by this task. Post-integration counts require a fresh live read.

The [performance review](ips-performance-advisor-review-2026-10-14.md) verifies the duplicate lease indexes and maps all 13 overlapping policy groups. Bounded local catalog and EXPLAIN checks support a narrow duplicate-index follow-up, but no index or policy was changed. The post-deposit baseline has 359 foreign-key and 87 unused-index INFO findings (previously 335 and 85), plus one Auth-connections INFO. These need workload evidence, not blanket index creation/removal. They are not additional security failures or measured latency gains.

## Serialized integration and release

1. Deposit PR230 is verified and the parent has released deployment ownership. Keep one serialized release writer.
2. Reconcile this candidate with the resulting `main`, resolve any finance/schema overlap, regenerate types, and rerun the relevant database, financial, UI and full repository gates on the integrated SHA. Current local success applies only to this candidate/base.
3. Apply production migrations only through `.github/workflows/ci.yml` from exact merged `main`, using the protected `production-database` environment, one writer, hosted preflight/postflight, linked lint and final dry-run. No developer `db push` or connector migration is authorized by this evidence.
4. Record exact deployment/database SHAs, read-only live smoke results and the financial reconciliations before requesting IPS acceptance. Hosted synthetic writes require a separately approved non-customer binding; do not improvise a customer-data fixture. Do not label technical readiness as IPS approval.
5. Release the tested engineering changes only after the applicable technical checks and review pass. IPS go-live remains blocked until its operational and business-acceptance evidence is complete. Application rollback and database recovery follow the reviewed runbooks; do not edit or reverse an already released migration.
