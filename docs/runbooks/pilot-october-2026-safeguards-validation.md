# Financial restart safeguards: implementation and validation

Prepared 23 October 2026 on `codex/pilot-reset-safeguards`, based on main
`4129597c75f948a83deab46546a58e70a613b6c5`. This is a local candidate. No hosted
enrollment, balance reset, transaction deletion, lease correction or deployment
has been executed by this work.

## Validation scope

The candidate supports preparing an organization-scoped restart while preserving
property, unit, person and lease identities, contracts and deposit requirements.
Tests cover a selected financial cutoff, known-zero opening authority, manually
entered owner contributions, and checked month-to-month continuation at unchanged
rent and fees. Customer consent, identifiers, counts and amounts remain in a
private local operation record and are not supplied by this validation document.
Physical cash is not changed by deleting financial records.

The zero checkpoint and regenerated October billing are separate checkpoints.
Once October rent is billed, tenant receivables will no longer be zero.

## Implemented safeguards

- Organization-scoped freeze and generation controls are inactive by default.
  Writer locks drain in-flight financial changes. Original form, journal, import,
  upload and idempotency generations cannot be upgraded into new intent.
- Database date checks reject pre-cutoff financial activity. Deposit event
  chronology is checked at each effective date, including concurrent backdated
  refunds and reversals.
- Reports verify the financial generation and a transaction-level source revision
  before and after their reads. Mixed snapshots fail explicitly. Current report
  downloads and artifact sources cannot reuse retired financial identities.
- Monthly owner reporting and close/publication require exactly one issued rent
  invoice for each expected positive-rent lease. Expired terms on occupied active
  leases remain an unresolved billing obligation. Zero-rent transitions do not
  erase an earlier positive-rent obligation in the same month.
- Checked month-to-month continuation appends a term and copies the complete
  billing configuration after checking the exact predecessor and expected amounts.
  It preserves contractual continuity and applies the October financial cutoff.
- Financial screens carry their verified generation. Stale payloads and invalid
  sessions hide amounts and disable financial actions. Dashboard cash history
  starts at the financial cutoff rather than displaying earlier empty months.

These safeguards do not themselves archive or remove financial history. See the
[execution and recovery plan](pilot-october-2026-reset-execution-plan.md) and
[continuation workflow](pilot-october-2026-lease-continuations.md).

## Database evidence

Tests used only the dedicated disposable project `nestory-pilot-reset-20261022`
with API port 60321 and database port 60322. Production and other local projects
were not reset or seeded. The final canonical migration chain was replayed with
the ordinary synthetic baseline, paid-cost fixture and publication fixture.

| Check | Result |
| --- | --- |
| Full pgTAP suite | 161 files, 5,381 assertions passed after a clean replay |
| Concurrent chronology, freeze, isolation and report-revision checks | 15/15 passed |
| Database lint | No errors in `public` or `app_private` |
| Generated public types | Regenerated from the candidate schema; 45 additions |
| Migration discipline against `origin/main` | 227 immutable base migrations and 9 forward migrations passed |

The deterministic full-suite log is
`%TEMP%\nestory-pilot-reset-db-20261022\pgtap-nine-migrations-clean.log`;
concurrency evidence is `chronology-nine-migrations.log` and
`revision-nine-migrations.log` in the same folder.
The dedicated database has `cron.launch_active_jobs=off` so hourly jobs cannot
change fixtures during validation. Schedule definitions and their active flags
are preserved. This local setting is not a production change.

The concurrency runner is available through `npm run leases:test-deposit-chronology`.
It requires `DEPOSIT_CHRONOLOGY_LOCAL_PROJECT_DIR` to point to the dedicated local
project and `DEPOSIT_CHRONOLOGY_TEST_DATABASE=postgres`. It checks the project and
container identity; it never starts or resets a database. It adds synthetic
financial test records, so run it before taking a stable manifest snapshot.

Report revision entries are append-once per organization and transaction. Summing
committed weights preserves a change stamp even when transactions commit out of
ID order, without locking one shared counter. The private ledger has no additional
organization foreign-key lock; a checked catalog assertion proves all 97 public
sources retain immediate organization lifetime constraints, and deletion cleans
up revision entries after source writers finish. Deposit chronology serializes
on the deposit row without creating a redundant row version. Regression tests
cover archive/receipt overlap, lifecycle lock order, account/organization lock
order, source UPDATE/DELETE versus organization deletion, rollback and stale
fixed snapshots. Entries accumulate; any future compaction must preserve the
committed stamp under a reviewed exclusive fence.

## Application evidence

Focused checks passed for reports, downloads and statements (457 tests, one
existing skip), export builders (37), petty cash and overview (81), maintenance,
timeline, export authority and admin intent transport (247), property/unit
snapshots and screens (146), and readonly financial actions/sessions (152).
These groups overlap and must not be added into a unique test total. The complete
contract gate passed 367 tests. The final unit run passed 3,553 tests with one
existing skip (329 files passed, one skipped). The full UI run passed 136 files
and exposed six files needing review: lifecycle mocks and an original-FormData
expectation were repaired, while delayed React responses passed unchanged in
isolated runs. All six files then passed serially with default timeouts: 289 tests,
including two new layout integration checks. Together these runs cover all 142
UI files and 1,700 tests; they are not a single all-green whole-suite invocation.
The whole-suite runs used two workers and a 15-second per-test allowance under
Windows load, retaining every assertion and skip classification. No product
behavior was changed to suppress timing failures.

GitHub CI subsequently passed the complete UI suite in one invocation: all 142
files and 1,700 tests, using the ordinary repository timeouts. Its unit suite also
passed 3,553 tests with one existing skip. The build, lint, type, dependency,
secret and contract checks passed on candidate `ee15c9ac`.

The final dependency gate found pre-existing Next.js and Sentry vulnerabilities
in the unchanged baseline lock. Next.js and its ESLint configuration were updated
together to 16.4.2 and Sentry to 10.75.2, preserving the reviewed local glob adapter.
The updated audit reports zero production findings and zero high/critical findings
in the full tree. Existing development-only moderate/low findings remain below
the repository gate. A fresh isolated install verified the local glob override.
ESLint, TypeScript and the Next.js 16.4.2 production build passed after the
dependency update. After replacing real identifiers in test fixtures with
synthetic identifiers, the affected two files passed again (25 tests).

A first read-only `/reports` browser smoke reached the route at four viewports
and ran role checks, but the console gate failed on inline-style CSP violations
under the Next development server. No JavaScript page errors were reported.
This is not a passing browser result. A narrower production-mode launch without
the synthetic service key started, but normal login could not record its required
password credential proof and timed out. The user subsequently approved the
isolated credentialed launch for local browser tests on port 3105 against the
dedicated API on port 60321. Automatic approval review rejected that exact local
launch again with only "blocked by policy", despite the user's approval; no
specific reason was returned. Local authenticated production-mode browser verification
therefore remains unavailable. Security policy and login checks have not been
weakened to suppress either result.

The existing isolated GitHub browser workflow passed on `10ac38b0`: five ordinary
daily-workflow phases, 13 additional browser cases, and 23 document-transport
cases. It exercised ordinary sign-in, move-in, payment, monthly correction,
immutable receipts and owner statements against synthetic Supabase. This proves
that candidate's CI runtime behavior, not hosted Pilot operation. Run
`39897247336` retains the screenshots and results. Database concurrency findings
from the separate CI job were then addressed by the forward fixes described above.

The separate isolated document-transport browser contract uses synthetic Auth and
Storage boundaries with the real proxy, receipt and owner PDF/XLS routes, lifecycle
guards and receipt PDF renderer. All 23 cases pass with pinned Chromium, including
current-generation downloads, stale/missing-generation rejection before stored
bytes are read, a valid frozen context, and source changes during retrieval.
Receipt URLs remain query-free. Owner links carry one validated original generation;
the helper never substitutes the current value. These tests do not prove full app
sign-in or hosted operation. The initial GitHub transport run exposed missing
lifecycle fixture metadata and the old helper's query restriction; those were
fixed without changing the application or weakening its checks.

## Local inventory and recovery evidence

The manifest classifies all 153 public/private tables and 1,276 scoped synthetic
rows, with zero unresolved inventory issues. Its registry explicitly preserves
master records and requires reviewed normalization of deposit cash status, task
cost projections and timeline amounts. Saved transaction-result seals and old
import/journal intents are retired, not made replayable after the reset.

All 42 inventory/recovery/dependency guard tests pass. The inventory includes
372 incoming logical-reference descriptors so cross-organization references
cannot be omitted from the removal review. The offline plan detects unresolved
retained references, normalizations, retired intent handling and cycles; it emits
no executable SQL. Current exact-head inventory and clone bindings belong in the
ignored local handoff and generated reports. A commit or bound tool/migration
change requires a fresh capture and rehearsal; this is preparation evidence,
not a reset execution test.

The commands `npm run test:pilot-finance-reset`,
`npm run db:pilot-finance-reset-manifest`, and
`npm run db:pilot-finance-reset-recovery -- --manifest <accepted-local-manifest> --local-project <dedicated-local-project>`
exercise only the constrained synthetic preparation tools. The guard tests are
also part of `test:contracts`.

## Execution boundary

The final live row manifest, private archive/removal capability, approved zero
openings, frozen billing integration, operation-specific protected workflow and
recovery of generation-stamped authority remain separate from the safeguard
migrations. A local database clone proves only the checks it actually performs;
it does not prove hosted PITR, physical Storage-byte recovery, service failover or
recovery of real customer records. Keep the hosted target unchanged until the final executor,
recovery checkpoint and exact production operation have been reviewed and approved.
