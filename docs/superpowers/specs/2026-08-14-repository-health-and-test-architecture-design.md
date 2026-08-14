# Repository Health and Test Architecture Design

**Status:** Approved in conversation on 14 August 2026

## Goal

Make Nestory cheaper and safer to change without weakening its operational, browser, or database coverage. The cleanup keeps the existing product behavior and applied database history intact while reducing duplicated route maintenance, clarifying test ownership, shrinking the most expensive test bottleneck, and adding durable repository guardrails.

## Design

### Route contracts

`config/ui-route-coverage.json` remains the canonical inventory of executable routes, their source files, roles, states, and smoke expectations. Discoverability and content-review contracts remain focused overlays because their navigation journeys and manual review findings cannot be inferred from a page path. Shared facts such as route membership, route count, source path, and allowed roles are derived from the canonical inventory and validated through one route-registry loader. Generated reports use live lengths rather than copied numeric totals.

### Test tiers

The JavaScript suite is exposed as four explicit tiers:

- `test:unit` runs Node-environment Vitest files.
- `test:ui` runs JSDOM Vitest files.
- `test:contracts` runs the Node script contracts currently grouped as demo tools.
- `test:database` runs the local pgTAP suite.

`test:all` remains the local and CI application gate and composes the first three tiers. Database verification remains in its own CI job and gains the same public package command. Tier membership is discovered from the test files and checked for overlap or omissions so the split cannot silently drop coverage.

### Test performance

Coverage is preserved. The first performance change targets `settings-workspace.test.tsx`, the largest JSDOM worker bottleneck, by splitting independent behavior groups into focused files that Vitest can schedule separately. Shared render/build helpers live beside those tests. Before and after timings are captured using the same worker count; a split is retained only when all assertions remain and wall time does not regress materially.

### Production modules

Refactoring is behavior-preserving and limited to high-churn files encountered by the active workflows. Large screens keep their server/data boundary while cohesive view sections, action models, and formatting helpers move to feature-local modules. Generated database types are explicitly excluded. Each extraction is protected by the existing feature tests plus a targeted contract for the extracted interface.

### Database migrations

Applied migrations are immutable. A new verifier compares `supabase/migrations` with a configured Git base, rejects modified or deleted historical migrations, and accepts only new timestamped migrations with unique, increasing names and portable trailing newlines. CI runs the verifier before resetting Supabase. A policy document explains when to add a forward repair, when to regenerate types, and how a future baseline may be produced only after all environments have crossed an explicit release boundary. This work does not squash or delete the current 67-file history.

### Script lifecycle

Every script receives one of four classifications: default gate, specialist operational verification, reusable support, or historical candidate. Package scripts, CI, imports, and documentation references are recorded. Only files proven to have no active command, import, CI, or documented operator use may move to `scripts/archive`; ambiguous manual tools remain active and are documented instead of guessed away.

## Safety and verification

- Preserve all existing worktrees and stashes.
- Do not rewrite applied migrations or generated database types manually.
- Do not reduce assertion counts merely to improve timing.
- Run targeted red-green cycles for new behavior.
- Finish with lint, TypeScript, tiered tests, build, migration verification, local database reset/lint/types, and pgTAP.
- Leave the resulting changes uncommitted until the user approves them.
