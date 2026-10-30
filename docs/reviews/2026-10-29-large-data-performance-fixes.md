# Large-data performance fixes — verification

29 October 2026. The confirmed record-completeness, pagination, ledger-total and repeated-query problems from the performance review are fixed in the isolated branch `codex/large-data-performance-fixes`.

Base: `27c19fa97ed2fbbc8885367147a2cf1cb7eb8b2a`.
Checkout: `D:\nestory\.worktrees\large-data-performance-fixes`.
Scope: local implementation and synthetic verification. No production database changes, deployment, merge or customer-data writes were performed.

## Storage verification

The storage coordinator's completed manifest confirms 41 managed folders moved to `D:\Codex\worktrees`, a working junction at the former C: location, 21 repaired Git location pointers and successful native app attachment. All 99 files in this implementation's pause checkpoint were independently rehashed unchanged before work resumed. The original local PostgreSQL cluster was restarted, preserving its existing synthetic databases. Implementation continued in the separate D: checkout above.

Evidence: `D:\Codex-Archives\worktree-move-20261029-01a1851d\FINAL-RESULT.json`, `final-preservation-verified.json`, `git-after-path-repair-verified.json`, and `performance-checkpoint-after-restart.json`.

## Confirmed findings and fixes

| Finding | Result |
| --- | --- |
| Person and account reads silently stopped at a server row cap | Counted complete reads preserve necessary catalogues; person choices search and page on demand, and resolve an existing selected ID independently. Account lists use exact database counts and page-only relationship hydration. |
| Property/unit search and derived sorting loaded the entire portfolio | Matching, natural ordering, derived filters, current-lease state and net sorting now run before the database page boundary. Only selected identities and their display data are transferred. |
| A small register page downloaded all ledger history and failed above 100,000 rows | Database aggregates return currency/direction/period/category totals and source counts. Financial read fences, archives, corrections and reversals remain covered. One captured request date keeps detail totals consistent across midnight. |
| Large search predicates streamed whole registers into the application | Documents, Ledger, Timeline and Leases use an allowlisted POST search reader for oversized predicates. It returns an exact count and ordered page IDs; hydration uses at most 50 IDs per request. |
| Finance and Leases loaded broad form data on initial page requests | Unrelated people reads were removed; lease availability, filters, billing and finance choices load on demand. Selected-lease context is narrow, drawer responses retain request identity, and deposit transitions retain their choices. |
| Dashboard and Maintenance transferred full collections for summaries | SQL returns exact counters and chart buckets. Dashboard task previews are bounded to six per property; Maintenance hydrates only its selected page while preserving queue and filter definitions. |
| Reports paged only after sending all rows to the browser | Screen reports are paged before serialization, with full totals and group subtotals. Unit P&L details are also paged. Complete PDF/XLSX export paths remain intact and reject screen-only pages. Property events/owner references are grouped once instead of repeatedly filtered. |
| A duplicate lease/tenant index added write overhead | A forward migration verifies exact index equivalence and dependency safety before dropping the duplicate. It retains the valid survivor and rejects unexpected shapes. |
| Restricted large-dataset queries spent excessive time planning permission helpers | Predecessor-guarded migrations reuse plans for the original scalar permission expressions. Person NULL-branch checks short-circuit only the already-false case. Differential tests preserve authority, ACLs, ownership, volatility and pinned search paths. |
| Property setup also omitted late identities and loaded data before selection | It waits for an owner, scopes properties to that owner and units to the chosen property, and completes required cross-property lease references. Late selections survive capped fixtures. |

## SQL authority and migrations

There are nine new forward migrations. All 263 baseline migration files remain unchanged, and the repository migration-discipline check also validates the 20 existing reconciliation declarations.

Public aggregate/page entrypoints remain security invokers. The two private ledger aggregation helpers are security definers so they can evaluate the exact canonical finance predicate once per distinct property instead of once per history row. They require a signed-in actor, pin an empty search path, expose only aggregate results and retain narrow execution grants. A runtime check rejects added/restrictive or changed ledger SELECT policies, rather than continuing under an outdated authorization assumption. No table policy or permission predicate was broadened.

The final schema was built anew in `performance_final_verification_20261029` on loopback-only PostgreSQL 17.10. All 263 historical migrations and then all nine new migrations were applied in order. This native harness provides auth/storage and inert cron/net/vault platform shims; unavailable hosted extension declarations are omitted only in the transient runner. Application SQL, constraints and RLS are exercised against authenticated roles. Repository migration files are not rewritten. Genuine pgTAP 1.3.4 is installed. Synthetic fixture setup may bypass insertion triggers locally, then restores them before tested reads; fixture transactions roll back.

## Verification results

| Check | Result |
| --- | --- |
| Full unit tier | 3,915 passed; six existing skips; no failures |
| Full UI tier | 1,758 passed; no failures |
| Combined final SQL schema | 790 assertions passed across 14 suites |
| Migration/fixture/security contract tests | 45 passed |
| Final review cap regressions plus related Maintenance tests | 70 passed after four new tests first reproduced the defects |
| TypeScript | Passed |
| Full ESLint plus final changed-file recheck | Passed |
| Production build | Passed on the final post-review source |
| Migration discipline | 263 immutable baseline migrations and nine forward migrations passed |
| Repository secret scan | Passed across 2,446 tracked files |
| Duplicate-index safety | Exact duplicate removed; survivor retained; repeat safe; missing/changed survivor rejected; rollback restored both originals |

The SQL assertion total comprises portfolio 36, references 16, summaries 32, broad search 44, document-helper equivalence 16, existing authority suites 544, person equivalence 17, and shared-helper equivalence 85.

Large fixtures include 5,000 properties, 20,000 units and 100,001 ledger entries; 5,000 people/accounts/leases; 10,000 each of Documents, Ledger and Timeline with 1,200 leases; and a summary fixture with 1,005 related portfolio records, over 1,205 tasks and 25,100 ledger entries. Application tests exercise 1,205/5,000-record capped catalogues and 10,000-row report/search sources. Final-page identities, empty/clamped pages, selected hidden identities, role/organization/branch isolation, dates, archives, currencies, exact cents and reversals are covered. Complete 10,000-line PDF/XLSX exports retain their first and last lines and exact totals; paged report JSON stays below 40 KB in the committed fixture.

The final fresh SQL run took approximately 112.4 seconds including fixture setup and all assertions. These are local correctness and scale checks, not hosted latency percentiles or a multi-user load test.

## Measured performance changes

Local measurements share one host and are sensitive to cache state and competing checks. They demonstrate specific bottleneck reductions, not production service-level guarantees.

| Measurement | Evidence |
| --- | --- |
| 100,001-entry portfolio ledger total | Exact aggregate reconciled in about 0.9 seconds, returning buckets instead of raw history; the previous loader rejected this size. |
| Portfolio net sort | Previously exceeded a 120-second statement timeout; the optimized local measurement was about 3.3 seconds. |
| Sparse branch person selector, one visible person among 5,000 | Previously about 97.6 seconds; final reference fixture about 3.3 seconds. |
| Restricted Overview, same-session profile | 15.5 to 5.8 seconds; canonical finance checks fell from 25,100 to one, and ledger aggregation took about 96 ms. |
| Restricted document permission sample | About 1.3–1.4 seconds to 0.35–0.37 seconds, with identical count and ordered page IDs. |
| Account first/deep/search pages across 5,000 accounts | Approximately 0.36–0.41 seconds in the reference fixture. |

## Independent review and decisions

A fresh reviewer inspected the whole branch, including the final Overview migration. There were no critical findings and two important findings: large-search and Maintenance page hydration assumed the API would return the full requested page. Both were reproduced with failing tests, then fixed to continue reading only selected IDs using the actual number of rows received. Search continuation still checks counts/order/identity; Maintenance keeps actor filters, exact counts, stable ordering and final identity reconciliation. The resulting regressions and full unit suite pass. No minor findings remain in the review ledger.

Recorded implementation decisions and costs:

- Proceed with the already-authorized local fixes without another approval pause. If an implementation choice is rejected, the isolated branch remains reviewable and reversible.
- Use a separate D: checkout after C: disk pressure prevented a clean dependency installation. This retains both previous work and the review checkout, at the cost of an additional checkout.
- Keep private ledger aggregation narrowly tied to the released canonical policy after invoker-only aggregation remained slow. Future ledger policy changes must explicitly update and test these helpers; otherwise the guard rejects reads.
- Accept only measured, source-equivalent permission-plan changes with pinned predecessor definitions and differential authority checks. A divergent upstream helper intentionally prevents migration application until reviewed.
- Retain complete exports, full dashboard property picker/chart output and necessary intent-loaded form catalogues. Their cost still grows with the authorized dataset; the changes remove unnecessary initial transfer and repeated computation rather than asserting constant cost for every workflow.
- Preserve the local branch, checkout and audit evidence for review. Production release remains a separate protected workflow.

## Limits and release boundary

Exact SQL counts/sorts still evaluate matching data. Sparse branch searches and full Overview remain multi-second operations in these fixtures. Deep offset pages, full financial report construction/exports, dashboard property charts and some form catalogues remain proportional to dataset size. They must not be described as universally subsecond.

Authenticated browser acceptance against the changed schema, full Supabase platform parity, concurrent-user resource measurements and hosted p50/p95 were not performed. Existing Vite configuration and Sentry deprecation warnings are unchanged. The unit suite's six skipped tests remain skipped. The local build uses synthetic public environment values; it does not connect to production.

Any later production rollout must use `.github/workflows/ci.yml` from the exact merged main SHA and its protected database environment, with the required preflight/postflight checks. No hosted migration was applied during this work.

## Evidence and reproduction

Application checks from the isolated checkout:

```text
npm run test:unit -- --maxWorkers=1
npm run test:ui -- --maxWorkers=2
npx tsc --noEmit
npm run lint -- --quiet
npm run build
```

Run migration discipline with `MIGRATION_BASE_REF=27c19fa97ed2fbbc8885367147a2cf1cb7eb8b2a`. New SQL fixtures live under `supabase/tests/` and participate in the repository database test convention. Use only a disposable synthetic database for their large fixture writes.

Local evidence directory: `D:\nestory\.codex-artifacts\performance-db`.

- `final-integration-bootstrap.log`, `final-integration-migrations.log`, `final-integration-sql-tests.log`
- `unit-suite-final-review-green.log`, `ui-suite-green.log`, `contracts-final.log`
- `review-fixes-red.log`, `review-fixes-green.log`, `period-boundary-green.log`
- `typecheck-final-review-green.log`, `lint-final-review.log`, `build-final-review.log`, `migration-discipline-final.log`, `secrets-final.log`
- `duplicate-index-test.log`, `summary-lane-final-evidence.md`, aggregate/permission profile JSON and query plans

Reference/search handoffs and original review evidence remain in `D:\nestory\.codex-artifacts\performance-review-2026-10-29`. Connection configurations stay outside Git and are not part of this report.
