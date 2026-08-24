# Legacy Test Compatibility Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize current test and fixture behavior while retaining every live legacy-compatibility contract and adding omitted safety tests to the default Application gate.

**Architecture:** Keep the change in test infrastructure, the local-only baseline, and repository documentation. Model the demo clock as one explicit Phnom Penh transaction timezone, derive assertions from persisted fixture facts, and make the script inventory distinguish executable-but-ungated Node tests from human operator documentation. Do not change schema migrations or hosted state.

**Tech Stack:** Node.js test runner, Vitest, PostgreSQL/pgTAP, Supabase CLI, PowerShell, GitHub Actions package gates.

**Spec:** `docs/repository/legacy-test-compatibility-inventory.md`

## Global Constraints

- Base every change on `5dc8da4824bee0e4b1d6cbbb1ff49b99ce0d4800`.
- Never edit an existing file under `supabase/migrations`.
- Never connect or write to hosted/shared Supabase.
- Use an isolated local Supabase project ID and non-default ports, then remove only resources created for this proof.
- Preserve compatibility coverage unless production impossibility is proven.
- Do not weaken assertions, skip tests, merge, or deploy.
- No test deletion is authorized by the inventory.

---

### Task 1: Detect and gate executable Node safety tests

**Files:**
- Modify: `scripts/script-inventory-core.node-test.mjs`
- Modify: `scripts/script-inventory-core.mjs`
- Modify: `scripts/generate-script-inventory.mjs`
- Modify: `package.json`
- Modify: `docs/repository/script-inventory.md`

**Interfaces:**
- Consumes: `buildScriptInventory({ documents, packageScripts, scriptPaths, workflowTexts })`.
- Produces: inventory entry classification `ungated-test` for `.node-test.mjs` files with no package or workflow execution reference; generated inventory evidence excludes `docs/repository/script-inventory.md` itself.

- [x] **Step 1: Write the failing classifier test**

Add a real `buildScriptInventory` input containing an ungated
`scripts/safety.node-test.mjs`, a generated-inventory mention, and no package or
workflow execution reference. Assert the literal result has classification
`ungated-test` and no self-generated documentation reference.

- [x] **Step 2: Run the classifier test and verify RED**

Run: `node --test scripts/script-inventory-core.node-test.mjs`

Expected: FAIL because the current implementation reports
`documented-operator` and counts its generated inventory mention.

- [x] **Step 3: Implement the minimal classification behavior**

Classify an unexecuted `.node-test.mjs` as `ungated-test` before documentation
or reusable-support classifications. Exclude
`docs/repository/script-inventory.md` from document evidence. Leave Vitest
convention discovery and specialist package commands unchanged.

- [x] **Step 4: Run the classifier test and verify GREEN**

Run: `node --test scripts/script-inventory-core.node-test.mjs`

Expected: all classifier tests pass.

- [x] **Step 5: Add the three proven safety tests to `test:contracts`**

Add the paid-cost Storage cleanup, Sentry autofix, and portable-migration Node
tests to the package command. Do not add specialist database or browser races
to the default contract tier.

- [x] **Step 6: Regenerate and verify the script inventory**

Run: `npm run repo:script-inventory`

Run: `npm run test:contracts`

Expected: generated inventory contains no ungated test queue and the expanded
contract tier passes.

### Task 2: Make fixture date and timezone behavior explicit

**Files:**
- Modify: `supabase/test-fixtures/baseline.sql`
- Modify: `supabase/tests/demo_seed_contract_test.sql`
- Modify: `scripts/load-test-fixture.node-test.mjs`
- Modify: `PROJECT.md`

**Interfaces:**
- Consumes: the local-only baseline transaction and persisted invoice facts.
- Produces: a Phnom Penh demo organization and policy, transaction-stable
  fixture dates in the named business timezone, and pgTAP assertions whose
  operating month comes from loaded invoices.

- [x] **Step 1: Create a disposable local Supabase configuration**

Temporarily assign project ID `nestory_268f_legacy_cleanup` and unused ports in
the 58320 range in `supabase/config.toml`. Record the original file hash. Use
`supabase --help` and `supabase start --help` before starting the stack.

- [x] **Step 2: Write failing pgTAP fixture assertions**

In `demo_seed_contract_test.sql`, assert that the single organization and the
approved rent policy both persist `Asia/Phnom_Penh`. Create a temporary
contract scope from the distinct loaded invoice billing period and assert that
there is exactly one operating month.

- [x] **Step 3: Load the unchanged baseline and verify RED**

Run a clean isolated reset, load `baseline.sql`, then run
`supabase test db --local supabase/tests/demo_seed_contract_test.sql`.

Expected: FAIL because the organization is UTC and the rent policy is
`Asia/Bangkok`.

- [x] **Step 4: Implement the minimal fixture correction**

Set the baseline transaction timezone, organization operational timezone, and
approved rent policy timezone to `Asia/Phnom_Penh`. Replace the seven pgTAP
`current_date` expectations with the operating month derived from loaded
invoice facts. Do not change login identities, property/lease counts,
historical billing rows, or migrations.

- [x] **Step 5: Make workspace samples platform-neutral**

Use `node:path` inputs in `load-test-fixture.node-test.mjs` instead of literal
Windows checkout paths. Preserve the two fail-closed container-selection
assertions.

- [x] **Step 6: Correct the executable fixture documentation**

Change `PROJECT.md` from three properties to four properties and describe the
three operating stories plus isolated owner-close story.

- [x] **Step 7: Reload and verify GREEN**

Run a fresh isolated reset, load the updated baseline, and run the focused demo
pgTAP contract plus `npm run test:database`.

Expected: timezone and operating-month assertions pass with all retained
database compatibility coverage.

### Task 3: Verify scope, compatibility, and release gates

**Files:**
- Modify: `docs/repository/legacy-test-compatibility-inventory.md`
- Verify only: `supabase/migrations/**`

**Interfaces:**
- Consumes: Tasks 1 and 2 plus the exact merged migration baseline.
- Produces: reviewer-ready evidence with no migration changes, no test
  deletions, and explicit retained compatibility debt.

- [x] **Step 1: Run focused RED/GREEN evidence again**

Run the classifier test, the three newly gated safety tests, fixture-loader
tests, and the focused pgTAP demo contract. Record exact counts and failures.

- [x] **Step 2: Run the Application gate**

Run: `npm run lint`

Run: `npx tsc --noEmit`

Run: `npm run test:unit`

Run: `npm run test:ui`

Run: `npm run test:contracts`

Run: `npm run build`

- [x] **Step 3: Run the Database gate**

Run: `npm run db:verify-migrations`

Run a clean isolated reset, `npm run db:lint`, generated database type parity,
`npm run db:test:fixture`, `npm run test:database`, and
`npm run leases:test-term-authority`.

- [x] **Step 4: Run relevant concurrency suites**

Run the retained lease history and relationship suites plus the paid-cost,
owner lifecycle, owner-close, and document concurrency commands that exercise
the fixture and ungated safety boundaries touched by this cleanup.

Result: every listed suite passed except the retained
`leases:test-history-integrity` authorization-snapshot assertion documented in
the compatibility inventory. The assertion was not weakened to make the gate
green.

- [x] **Step 5: Prove migration discipline and test retention**

Verify `git diff --name-only origin/main...HEAD -- supabase/migrations` is empty,
the three duplicate schema/behavior pairs remain, and no test file was deleted.

- [x] **Step 6: Remove disposable resources and restore config**

Stop only project `nestory_268f_legacy_cleanup`; remove its containers,
volumes, network, and any temporary artifacts. Restore `supabase/config.toml`
byte-for-byte and verify its original hash. Do not stop or inspect data in
other project stacks.

- [x] **Step 7: Review, commit, and publish**

Review the complete diff, run final verification from the clean restored
configuration, commit the focused change, push
`codex/legacy-test-compatibility-cleanup`, and open a PR against `main`. Do not
merge or deploy.
