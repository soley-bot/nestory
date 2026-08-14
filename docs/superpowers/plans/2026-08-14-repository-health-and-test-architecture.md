# Repository Health and Test Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce duplicated repository maintenance and make the full Nestory verification suite faster, explicit, and safer to evolve.

**Architecture:** Keep the existing UI route manifest as the single route inventory and treat discoverability/content-review data as validated overlays. Split verification by execution environment, refactor only the highest-cost modules, protect applied migrations at the Git boundary, and classify scripts from actual references.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest 4, Node test runner, Supabase CLI and pgTAP, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-14-repository-health-and-test-architecture-design.md`

## Global Constraints

- Preserve every existing worktree and stash.
- Keep `config/ui-route-coverage.json` as the canonical executable route inventory.
- Do not change user-visible behavior during structural extractions.
- Do not modify or delete applied migrations.
- Keep `test:all` as a supported command.
- Do not commit until the user approves the final diff.

---

### Task 1: Canonical route-registry loader

**Files:**
- Create: `scripts/route-registry-core.mjs`
- Create: `scripts/route-registry-core.node-test.mjs`
- Modify: `scripts/verify-authenticated-route-discoverability.mjs`
- Modify: `scripts/smoke-authenticated-route-discoverability.mjs`
- Modify: `src/lib/ui/enterprise-content-review.test.ts`
- Modify: `scripts/smoke-ui-redesign.mjs`
- Modify: `scripts/generate-enterprise-frontend-evidence.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadRouteRegistry({ projectRoot })` returning `{ routes, authenticated, contentReview }` with canonical source/role facts merged into overlays.
- Produces: `validateRouteRegistry(registry)` returning an array of actionable issues.

- [ ] Write Node tests proving stale overlay routes, copied source mismatches, and hard-coded totals are detected while valid overlays inherit canonical source paths.
- [ ] Run `node --test scripts/route-registry-core.node-test.mjs` and confirm it fails because the loader does not exist.
- [ ] Implement the loader and update consumers to derive membership/count/source data.
- [ ] Run the new test, route-coverage tests, content-review tests, and discoverability contract tests.

### Task 2: Explicit test tiers

**Files:**
- Create: `scripts/vitest-tier-core.mjs`
- Create: `scripts/vitest-tier-core.node-test.mjs`
- Create: `scripts/run-vitest-tier.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `classifyVitestFiles(paths, readText)` returning disjoint `unit` and `ui` file arrays based on `@vitest-environment jsdom`.
- Produces: CLI `node scripts/run-vitest-tier.mjs unit|ui` that invokes Vitest with only the selected files.

- [ ] Write tests proving every current Vitest file belongs to exactly one tier and nested worktrees are excluded.
- [ ] Run the contract test and confirm failure before implementation.
- [ ] Implement tier discovery and commands `test:unit`, `test:ui`, `test:contracts`, and `test:database`; compose `test:all` from unit, UI, and contracts.
- [ ] Update CI labels so each application tier is separately visible while the database job uses `test:database`.
- [ ] Run each tier independently and compare the combined file/test totals with the existing 230-file, 1,622-test baseline.

### Task 3: Split the largest JSDOM bottleneck

**Files:**
- Modify: `src/features/organization/components/settings-workspace.test.tsx`
- Create: `src/features/organization/components/settings-workspace-test-helpers.tsx`
- Create focused `settings-workspace-*.test.tsx` files matching the existing behavior groups.

**Interfaces:**
- Produces: shared test render/build helpers only; production interfaces remain unchanged.

- [ ] Record the existing file duration and assertion count.
- [ ] Move one independent behavior group to a new file and run both files to verify no assertion is lost.
- [ ] Repeat for remaining independent groups, keeping global/mocked state isolated.
- [ ] Run the UI tier twice and retain the split only if behavior is stable and wall time is not materially worse.

### Task 4: Focus the highest-churn production modules

**Files:**
- Modify: `src/features/finance/components/finance-operations-screen.tsx`
- Create: feature-local finance section/model modules selected from cohesive existing regions.
- Modify: corresponding finance tests only when import boundaries change.
- Modify: `src/features/maintenance/components/maintenance-screen.tsx`
- Create: feature-local maintenance section/model modules selected from cohesive existing regions.

**Interfaces:**
- Preserves: public component props and route behavior.
- Produces: focused internal components/helpers with typed props and no direct route ownership.

- [ ] Identify a cohesive extraction whose behavior is already asserted and write a direct contract test for any new pure helper.
- [ ] Confirm the new test fails before the helper exists.
- [ ] Extract the minimal finance region, run targeted finance tests, and keep the screen API unchanged.
- [ ] Repeat for one cohesive maintenance region and run targeted maintenance tests.
- [ ] Run TypeScript and the complete UI tier after both extractions.

### Task 5: Immutable migration guard

**Files:**
- Create: `scripts/migration-discipline-core.mjs`
- Create: `scripts/migration-discipline-core.node-test.mjs`
- Create: `scripts/verify-migration-discipline.mjs`
- Create: `docs/database/migration-policy.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `evaluateMigrationChanges({ baseFiles, currentFiles, changedPaths })` returning violations for edits/deletions, duplicate or non-increasing timestamps, invalid names, and missing final newlines.
- Produces: `npm run db:verify-migrations`, with `MIGRATION_BASE_REF` override and a safe default derived from the pull-request base or `origin/main`.

- [ ] Write table-driven tests for allowed new migrations and rejected historical edits, deletions, duplicate timestamps, bad names, and missing newlines.
- [ ] Run the test and confirm failure before implementation.
- [ ] Implement the pure evaluator and Git-backed CLI.
- [ ] Document forward-only repair, generated-type refresh, deployment ordering, and the future-baseline release gate.
- [ ] Run the verifier against the current branch and add it before Supabase reset in CI.

### Task 6: Script lifecycle inventory

**Files:**
- Create: `scripts/script-inventory-core.mjs`
- Create: `scripts/script-inventory-core.node-test.mjs`
- Create: `scripts/generate-script-inventory.mjs`
- Create: `docs/repository/script-inventory.md`
- Modify: `package.json`
- Move only proven historical files to: `scripts/archive/`

**Interfaces:**
- Produces: a reference graph covering package commands, workflows, source/script imports, and documentation mentions.
- Produces: classifications with evidence and an explicit `unreferenced` list.

- [ ] Write fixture tests proving direct commands, transitive imports, workflow calls, and documentation mentions prevent archival classification.
- [ ] Run the test and confirm failure before implementation.
- [ ] Generate and inspect the repository inventory.
- [ ] Move only unreferenced files whose content is clearly one-off historical output; leave ambiguous operator tools active.
- [ ] Regenerate the inventory and run all script contract tests.

### Task 7: Full verification and review handoff

**Files:**
- Modify generated verification documents only through their owning commands.

**Interfaces:**
- Produces: an uncommitted, reviewable branch state with exact verification evidence.

- [ ] Run `npm run lint` and `npx tsc --noEmit`.
- [ ] Run `npm run test:all` and compare totals with the baseline.
- [ ] Run `npm run build`.
- [ ] Run `npm run db:verify-migrations`, local reset, database lint, generated-type diff, fixture load, and `npm run test:database`.
- [ ] Inspect `git diff --check`, `git status`, worktrees, and stashes.
- [ ] Present changed files, timings, known warnings, and any deliberately retained scripts; do not commit until approval.
