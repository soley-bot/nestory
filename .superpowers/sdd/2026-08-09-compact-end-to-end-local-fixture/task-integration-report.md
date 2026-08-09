# Compact Fixture Integration Report

## Status

Complete on `codex/ips-operational-readiness` from required base
`837238ca85261b4d13817ee0bb3e392c0921bdaf`. Work remained local-only. No
hosted Supabase, Vercel, email, GitHub, or production service was contacted or
mutated.

## Commits

Allowed fixture commits were cherry-picked in the required order:

1. `838d65eebc913ef3b4b84669298022dcea1a761b` — fixture contract
2. `215f9e0bff4992c954e0a60b900d6a46c3bdb7cc` — foundational portfolio
3. `635402481496fb178a5c1387a4df87d15938bcf0` — lease-derived rent states
4. `915829911b7ce943e4c32c1aca06ad57c5fc3da6` — operations and Finance flows
5. `cd3a7c860a7c4b62e5e2ac50d12a766961312b20` — contract corrections,
   activity-target coverage, five-role harness, and documentation

Excluded source commits `4c482e6`, `bf603d4`, and `b4ecdf8` are not ancestors
of this branch. No migration, SideDrawer, theme, organization appearance,
navigation, or unrelated UI file changed.

## Changed Files

- `supabase/test-fixtures/baseline.sql` — compact three-property fixture,
  canonical workflow states, and captured Garden Court exception guard.
- `supabase/tests/demo_seed_contract_test.sql` — exact portfolio/workflow
  contract and exactly one unresolved Garden Court exception.
- `src/features/activity/entity-types.ts` — centralized executable activity
  entity-type allowlist.
- `src/features/activity/entity-target.ts` and test — module targets for every
  activity type emitted by the fixture.
- `scripts/load-test-fixture.mjs` and Node test — fixture load now rejects any
  database activity type absent from the application resolver allowlist.
- `scripts/smoke-fixture-role-journeys.mjs`, core module, and Node test — five
  isolated Playwright login/route/story journeys with credential-safe errors.
- `package.json` — exact `test:fixture-roles` command and focused test wiring.
- `PROJECT.md` — local compact-fixture inventory, role emails, and proof
  boundary.
- `docs/superpowers/plans/2026-08-09-compact-end-to-end-local-fixture.md` —
  checkboxes marked only after their corresponding work/checks completed.

## Test-First Evidence

- Resolver test first failed for the eight real fixture activity types that
  were unsupported, then passed 32/32 after implementation.
- Fixture-loader integration first rejected those same eight database types,
  then accepted all 15 emitted types after the resolver allowlist was extended.
- The exact-one Garden Court pgTAP assertion was mutation-checked: forcing a
  second unresolved row produced the expected 1/40 failure, then a clean fixture
  load restored the passing state.
- Five-role harness tests first failed because the core contract module was
  absent, then passed 2/2. Live smoke also exposed and fixed URL-object
  navigation before the final 5/5 run.

## Final Fixture Counts

| Record | Count |
| --- | ---: |
| Active properties | 3 |
| Active units | 10 |
| Current leases | 5 |
| Tenant invoices | 4 |
| Maintenance tasks | 6 |
| Expense submissions | 5 |

Expense matrix:

| Source | Status | Count |
| --- | --- | ---: |
| General | Rejected | 1 |
| General | Reversed | 1 |
| General | Submitted | 1 |
| Maintenance task | Approved | 1 |
| Maintenance task | Submitted | 1 |

Maintenance matrix:

| Status | Count |
| --- | ---: |
| Blocked | 1 |
| Completed | 1 |
| In progress | 1 |
| Pending | 2 |
| Scheduled | 1 |

Garden Court has exactly one unresolved rent-generation exception; Central
Residence and Riverside Shops have zero.

## Verification Results

- `npm run db:reset` — PASS from an empty local reset.
- `npm run db:test:fixture` — PASS; fixture loaded and all emitted activity
  target types matched the application resolver.
- `npm run db:lint` — PASS, no schema errors.
- `npx supabase test db --local supabase/tests/demo_seed_contract_test.sql` —
  PASS, 40 assertions.
- `npx supabase test db --local supabase/tests/lease_derived_rent_generation_test.sql`
  — PASS, 78 assertions.
- `npx supabase test db --local supabase/tests/finance_expense_approval_test.sql`
  — PASS, 88 assertions.
- `npx supabase test db --local supabase/tests/maintenance_cost_handoff_test.sql`
  — PASS, 66 assertions.
- `npx supabase test db --local supabase/tests` — PASS, 31 files and 952
  assertions.
- `npx supabase db advisors --help` — PASS; supported flags confirmed.
- `npx supabase db advisors --local --level error --fail-on error
  --output-format json` — PASS, no issues.
- `npx tsc --noEmit` — PASS.
- `npm run lint` — PASS.
- `npm run test:all` — PASS: 178 Vitest files, 1,277 passed and 1 existing
  skip; 22/22 demo-tool tests passed.
- `npm run test:ui-coverage` — PASS, 47/47 routes covered.
- `npm run test:ui-copy` — PASS, zero prohibited narration occurrences.
- Placeholder-environment `npm run build` — PASS, all routes built.
- `npm run test:fixture-roles` against the local stack and temporary local dev
  server — PASS 5/5:
  - Super Admin `/overview`: `GDN-CRT / Garden Court`.
  - Finance Manager `/bills-expenses`: the submitted Garden Court maintenance
    cost row with `Ref: GDN-PUMP-2088`.
  - Finance Member `/rent-income`: open-rent tenant `Pisey Touch`.
  - Operations Manager `/maintenance`: `Riverside drainage access blocked`.
  - Operations Member `/maintenance`: assigned
    `Garden Court corridor light repair`.
- `git diff --check` — PASS.
- Excluded-commit ancestry and migration-scope checks — PASS.

## Risks And Remaining Gaps

- One pre-existing Vitest case remains skipped; this work did not convert it to
  a pass.
- Next build/dev emits the existing multiple-lockfile workspace-root warning;
  build still exits successfully.
- Newly supported low-level lease and receipt activity types intentionally open
  their owning module rather than claiming exact-record navigation.
- Plan Task 1 Step 6 remains unchecked because the historical intermediate
  failing-contract state was integrated as a commit rather than replayed in
  this worktree. All final contract assertions passed.
- This is local fixture proof only. It is not a scale benchmark, hosted seed,
  deployment result, or production-readiness proof.
