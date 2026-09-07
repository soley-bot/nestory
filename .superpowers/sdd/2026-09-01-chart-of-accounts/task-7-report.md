# Task 7 implementation report

Date: 2026-09-07
Branch: `codex/finance-chart-pilot-integration`
Reviewed starting HEAD: `0c54eb0fa9c8b4c6ae941f29fc98a9eaf9e0cfaa`
Task 7 implementation commit: `df410bcd63308da2179b1ed50640afc718de1b29`

## Outcome

Task 7's route, fixture, Pilot-preservation, semantic-postflight, and protected-workflow contracts are implemented. The exact implementation commit passes every feasible application, static contract, route, type, lint, migration-discipline, and production-build gate. Local database behavior and authenticated browser journeys remain blocked because Docker Desktop's Linux engine is unavailable. No hosted database, Pilot organization, Vercel deployment, production alias, remote branch, or `main` was read or mutated.

## RED evidence

The existing reviewed HEAD was tested before implementation:

- `npm run test:route-discoverability` failed with `/finance/accounts/[accountId]: live route missing from contract`.
- `npm run test:ui-coverage` failed because `/finance/accounts/[accountId]` was absent from the UI route manifest.
- `npm run test:ui-copy` passed.
- `npm run test:contracts` failed only through authenticated route discoverability: 168 passed, 1 failed.

Test-first Task 7 fixture and CI expectations were then added. The focused command
`node --test scripts/ci-deployment-gate.node-test.mjs scripts/chart-of-accounts-fixture-contract.node-test.mjs`
produced four expected failures and five passes:

1. guarded fixture did not contain the nested Plumbing sample;
2. production workflow did not contain the ordered Chart semantic postflight;
3. Pilot preservation snapshot did not contain privileged policy aggregate counts;
4. the semantic postflight SQL file did not exist.

## GREEN implementation

- Registered `/finance/accounts`, `/finance/accounts/[accountId]`, and the permanent `/finance/funding-sources` redirect across discoverability, UI coverage, enterprise content review, and verification evidence. Finance roles have read access; lifecycle mutation remains Super Admin-only.
- Updated `PROJECT.md` to recognize the organization-owned Chart catalog while explicitly retaining no accounting books, arbitrary journals, editable Ledger, trial balance, bank reconciliation, accounts-payable scheduling, treasury, tax engine, or multi-currency launch.
- Extended `scripts/pilot-preservation-snapshot.sql` only with privileged-step-up policy row and enabled-row counts. It contains no Chart row counts or row contents.
- Added `scripts/verify-pilot-chart-of-accounts-postflight.sql`. It returns one aggregate JSON value only when there is exactly one Pilot organization, each of the 20 required starter definitions occurs exactly once, all 11 compatible defaults exist, every active preserved source/category has exactly one active account mapping, all four privileged triggers exist, and Pilot has zero enabled privileged-step-up policy rows.
- Wired the semantic assertion into only the protected `production_database` job, after hosted migration postflight and before linked lint/final dry-run, using the existing protected Supabase secrets and fail-closed `jq` selection.
- Added a stable local-only nested `Plumbing` expense beneath `Repairs and maintenance`, with a synthetic description, no account number, and a fixture category whose existing trigger creates the one-to-one workflow mapping.
- Added static fixture/CI contracts and an eight-assertion pgTAP fixture test for starter accounts, nesting, source/category mappings, tenant billing, Expense Category choices, and active mapping completeness.

## Files changed

- `.github/workflows/ci.yml`
- `PROJECT.md`
- `config/authenticated-route-discoverability.json`
- `config/enterprise-frontend-content-review.json`
- `config/ui-route-coverage.json`
- `docs/verification/authenticated-route-discoverability.md`
- `docs/verification/ui-redesign-evidence.md`
- `package.json`
- `scripts/chart-of-accounts-fixture-contract.node-test.mjs`
- `scripts/ci-deployment-gate.node-test.mjs`
- `scripts/pilot-preservation-snapshot.sql`
- `scripts/verify-pilot-chart-of-accounts-postflight.sql`
- `supabase/test-fixtures/baseline.sql`
- `supabase/tests/chart_of_accounts_fixture_test.sql`

## Exact-commit verification

Run against `df410bcd63308da2179b1ed50640afc718de1b29`:

- `npm run test:all` — PASS: unit 228 files / 1,698 tests; UI 96 files / 877 tests; contracts 169/169; Chart fixture static contract 1/1. The UI tier printed its existing jsdom `Not implemented: navigation to another Document` notices but exited 0.
- Focused Chart Vitest — PASS: 9 files / 44 tests after the final fixture and semantic-query review.
- Focused deployment/fixture Node tests — PASS: 9/9.
- `npm run test:route-discoverability` — PASS: 50/50 authenticated routes.
- `npm run test:ui-coverage` — PASS: 59/59 page routes.
- `npm run test:ui-copy` — PASS: zero prohibited narration occurrences.
- `npm run lint` — PASS.
- `npx tsc --noEmit` — PASS.
- `npm run db:verify-migrations` — PASS: 135 immutable base migrations, 7 forward migrations, and 20 historical reconciliation declarations.
- `npm run build` — PASS on Next.js 16.3.1; the output includes `/finance/accounts`, `/finance/accounts/[accountId]`, and `/finance/funding-sources`.
- `git diff --check` and cached diff check — PASS; only Git's informational LF-to-CRLF working-copy warnings were printed.

Task 7 adds no migration. It consumes the prior Chart migrations `20260901081254_chart_of_accounts_foundation.sql`, `20260904084609_connect_chart_accounts_to_finance_workflows.sql`, `20260904092136_correct_chart_workflow_boundaries.sql`, `20260904100110_finance_account_activity_authority.sql`, `20260904103215_harden_finance_account_activity_authority.sql`, and `20260904110156_preserve_owner_reversal_account_authority.sql`. The static migration-discipline gate passed; a live local migration list could not run without Docker.

## Exact residual blockers

The one permitted local prerequisite attempt was:

```text
npm run supabase:start
failed to inspect service: error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/supabase_db_nestory/json": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Per the task boundary, it was not retried and no hosted/shared fallback was used. Therefore these gates are not claimed:

- local reset and migration list;
- `npm run db:lint` against local Postgres;
- fixture load, focused pgTAP, and full `test:database` execution;
- authenticated local route discoverability, existing five-role journeys, or the eight Chart browser journeys;
- browser screenshots for Chart, New account, Expense selections, or account activity.

The pgTAP, browser-route, role, fixture, and CI contracts are authored and statically gated, but runtime database/browser evidence requires a working isolated local Supabase stack. No push, merge, deploy, Vercel call, hosted Supabase query, or Pilot mutation was performed.
