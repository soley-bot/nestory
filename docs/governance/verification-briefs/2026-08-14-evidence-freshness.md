# Evidence freshness brief — 2026-08-14

Observed at `2026-08-14T02:03:54Z`.

## Boundary

This is a bounded governance record. It does not rewrite historical verification evidence, certify the dirty worktree, run a database reset, mutate local or hosted data, contact production, deploy, push, or activate Cron.

The requested governing files `AGENTS.md`, `docs/governance/maintenance-agent-operating-model.md`, and `docs/governance/agents/evidence-steward-prompt.md` are absent from the checkout and all visible local/remote refs. This brief therefore records only conservative freshness findings and does not infer missing policy.

## Git target

- Branch: `main`
- Committed HEAD: `fd571781e1900e4b977529c1abeb2e1abf5a88f4`
- Upstream: `origin/main`, ahead 0 / behind 0
- Worktree: dirty before this brief, with 14 modified and 4 untracked implementation/test files across shell/theme, properties, property account, finance operations, and owner balances
- Historical redesign evidence implementation SHA: `b443b59dba8fc91a92e629dd53359e6ccf3f8752`

## Freshness by domain

| Domain | SHA/state | Finding | Reason |
| --- | --- | --- | --- |
| Database schema, migrations, generated types | Tree-equivalent between redesign evidence SHA and committed HEAD; no current dirty changes | Current for local historical behavior only | `supabase` and `src/types` have no tree diff from `b443b59...` to HEAD and are untouched in the dirty worktree. This does not promote hosted or production claims. |
| Hosted/production release | Candidate `fdd0c915...`; not current HEAD | Blocked, not current | The retained readiness report explicitly lacks real IPS reconciliation, independent approvals, restorable backup/restore rehearsal, and Cron activation. |
| UI route/state/accessibility evidence | Evidence SHA `b443b59...`; committed HEAD `fd57178...`; dirty worktree | Stale | Route contract and UI implementation changed after the evidence SHA, and shell/theme/property/finance/owner-balance files have further uncommitted changes. Referenced light/dark raw summary files are not present locally. |
| Authenticated route discoverability | Generated contract at HEAD; browser JSON SHA `006e164...`; dirty shell | Stale and internally inconsistent | The markdown says browser evidence is pending while the JSON is historical and the redesign report claims a later 67/67 run. Current shell changes invalidate browser correlation. |
| Properties and portfolio presentation | Dirty worktree | Stale | Property list, table, screen, summary data, and tests changed or are untracked. |
| Property account / owner balances | Dirty worktree | Stale | Account page, finance-safe account model, owner-balance ledger, and tests changed or are untracked. |
| Finance workspace | Dirty worktree | Stale | Finance screen, loader/types, and tests changed. |
| Theme and application shell | Dirty worktree | Stale | Runtime theme and shell/navigation changed, affecting role discoverability, responsive behavior, dark/light presentation, and accessibility evidence. |
| Historical Track 2–12 local evidence | Historical milestone SHAs | Historical only; not exact-HEAD certification | Records remain useful and must not be rewritten, but their SHA-scoped claims do not certify HEAD or the dirty tree. |

## Smallest safe refresh commands

Run only after the implementation is committed so evidence can bind to one exact SHA. Use local/disposable services only.

### Focused code gates

```bash
npx vitest run \
  'src/app/(dashboard)/properties/[propertyId]/account/page.test.tsx' \
  src/components/layout/app-shell.test.tsx \
  src/components/theme-runtime.test.tsx \
  src/features/finance-operations/components/finance-operations-screen.test.tsx \
  src/features/properties/components/property-screen.test.tsx \
  src/features/properties/data/property-portfolio-summary.test.ts
npx tsc --noEmit
npm run lint
npm run build
```

### Route and browser evidence

```bash
npm run test:ui-coverage
npm run test:route-discoverability
npm run test:ui-copy
npm run test:properties-flow
npm run test:fixture-route-discoverability
npm run test:fixture-roles
npm run test:ui-redesign
npm run test:ui-a11y -- --write-evidence
```

Fixture-dependent browser commands require a confirmed local Supabase target and guarded disposable fixture. If that local state is unavailable, the bounded setup is:

```bash
npm run supabase:start
npm run db:reset
npm run db:test:fixture
```

Do not substitute a hosted URL and do not run the reset against a linked/hosted project.

### Evidence correlation

After all gates pass, regenerate the current evidence through the repository-owned generator, verify the recorded full SHA equals `git rev-parse HEAD`, verify referenced raw artifacts exist, and run `git diff --check`. Do not edit prior milestone results to make them appear current.

## Limitations

- Missing governance source files prevented validation against the requested operating model and steward prompt.
- No engineering, browser, database, hosted, or production gate was run in this stewardship pass.
- The working tree cannot receive exact-SHA certification until implementation changes are committed.
- Raw light/dark summary paths cited by the redesign evidence are absent locally; only the tracked acceptance matrix and visual manifest were found.
