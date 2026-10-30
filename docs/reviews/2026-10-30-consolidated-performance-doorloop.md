# Consolidated performance and workflow review

This branch combines the completed large-data performance and DoorLoop-inspired workflow reviews. Dashboard counts and their unit-register destinations now share the current-lease definition of occupancy while retaining SQL filtering, exact counts and bounded page hydration. Report navigation retains compatible context and resets page positions when changing report kinds.

## Source and integration history

- Common baseline: `27c19fa97ed2fbbc8885367147a2cf1cb7eb8b2a`.
- Performance source: `44341145eb842cfa3d1c207e0f982d02041f801c`, branch `codex/large-data-performance-fixes`.
- Workflow source: `74ba5179df203e320eb98e350a76f3e5bbcb5a73`, branch `codex/doorloop-fixes-polish`.
- Integration branch: `codex/consolidate-reviews-20261029`. Its merge retains both source commits as parents.

The sources overlap in eight files, with three textual conflicts: the Overview loader, Units loader and report-query helpers. The resolution retains the performance branch's aggregate/page RPCs and bounded hydration, and carries the workflow branch's corrected dashboard semantics and links into those readers. Five automatic merges in report components, types and tests were also reviewed.

The new forward migration `20261029053000_align_operating_portfolio_readers.sql` replaces two existing reader definitions without changing signatures, ownership or grants. Both remain stable security invokers with empty search paths. Operating units must belong to visible, active, unarchived properties; this condition is applied before counting, sorting and paging. Occupied means a current operational lease, lease gaps include every operating unit without one, and vacancy additionally requires vacant status.

All ten source migrations and all 263 baseline migrations remain byte-identical in Git. The combined branch adds eleven forward migrations in total. No production migration was applied.

## Verification

| Check | Combined result |
| --- | --- |
| Unit tier | 3,937 passed; six existing skips |
| UI coverage | All 1,776 tests across 149 files passed, combining the full-tier run with isolated rechecks of three interrupted/timeout-affected files |
| Contract tests | 1,456 main contracts and 667 backup/custody contracts passed; four existing skips; the certificate correction was verified by rerunning its complete 112-test file |
| TypeScript and production build | Passed; all 16 static pages generated using synthetic public environment values |
| ESLint | Zero errors; 13 existing warnings in unchanged backup scripts |
| Migration discipline | 263 immutable baseline files, eleven forward migrations and 20 historical reconciliation declarations verified |
| Secret scan | Passed |
| SQL authority/scale suites | 821 assertions passed across 16 suites, including the saved-view and integration regressions |

The UI total is coverage across successful file executions, not a claim that one uninterrupted full-tier invocation passed. The three isolated files passed all 30 tests with one worker and a 15-second default timeout; test assertions and repository timeout settings were unchanged. A large SQL authority fixture initially exceeded its statement timeout while other checks were active; all 32 assertions passed in 48.6 seconds when rerun in isolation with the original 120-second statement limit. The integrated 20-assertion SQL regression passes; restoring the unintegrated reader definitions inside a rollback-only transaction produces ten expected failures.

The native SQL harness uses an isolated `performance_consolidation_20261029` database on loopback-only PostgreSQL 17.10, port 55492. It applies the 263 baseline migrations, all ten source migrations and the integration migration in order. Auth/storage and inert cron/net/vault shims substitute for unavailable Supabase platform services only within the transient runner. Tests execute real RLS under authenticated roles; fixture writes roll back. This is not full Supabase platform or hosted-browser acceptance.

Additional integration regressions cover dashboard occupancy/vacancy/gaps, inactive and archived portfolio exclusion, exact filtered final pages and clamping, branch/organization isolation, retained invoker grants, and report-switch page resets. The application fixture also verifies hydration under a one-row API cap.

An initial UI run crossed an overnight clock jump and is excluded from acceptance. Local browser-dependent contracts use the existing Chromium installation on D:. The checkout's public CA certificate was restored directly from the source commit after the new `.gitattributes` rule exposed pre-existing Windows newline conversion; its reviewed SHA-256 remains `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.

Windows also converted SQL test fixtures to CRLF, changing the function-definition hashes used by two equivalence oracles. `.gitattributes` now keeps `supabase/tests/*.sql` on LF. Each normalized working file was first verified against its staged Git blob; no SQL test contents changed. The affected equivalence suites then passed all 102 assertions without changing their expected hashes.

## Preservation and release boundary

The original performance and workflow checkouts remain clean at their original commits. The dirty primary and sync checkouts retain their original heads, statuses and all eight file hashes. Outside overlapping files, the three intentionally updated test fixtures and the additional SQL line-ending rule, 149 source files match their source commits exactly. Recovery copies and machine-readable preservation evidence remain in `D:\nestory\.codex-artifacts\consolidation-20261029`.

The workflow branch's production database dependency on `release_readiness` is retained. Release still requires the protected exact-main workflow and hosted checks described in the production database runbook. No main merge, production deployment or production database write was performed. The repository's existing Git integration automatically starts a Vercel preview for the draft pull request. Existing skips and warnings are reported rather than treated as additional coverage.
