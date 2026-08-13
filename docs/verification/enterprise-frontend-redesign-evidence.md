# Enterprise frontend redesign verification evidence

**Verification round ended:** 2026-08-13T08:14:18.135Z
**Implementation SHA under test:** `b4754f486e82ebd1ec00311936f42125e0895017`
**Branch:** `codex/enterprise-frontend-redesign`
**Base:** `main` at `b4754f486e82ebd1ec00311936f42125e0895017`
**Worktree:** `D:\nestory\.worktrees\enterprise-frontend-redesign`
**Boundary:** isolated local Next.js runtime and local Supabase only; production, hosted data, remote refs, deployment, merge, and push were untouched.

## Verdict

- 47/47 manifest routes passed the route-role-state contract in complete light and dark runs.
- Each theme passed 188 route/viewport cases, 4 Maintenance board cases, 235 role/access cases, and 6 keyboard/zoom cases.
- 67/67 authenticated visible-link journeys and 4 direct permission denials passed.
- 13/13 major end-to-end workflow suites passed with real local application and database effects.
- Serious/critical axe findings, unexpected application errors, document overflow, blocked-mutation leaks, role mismatches, and unresolved completion blockers: 0.

## Environment and provenance

- Application target: `http://127.0.0.1:3220` (production build served locally).
- Database target: local Supabase project `nestory`, PostgreSQL on `127.0.0.1:54322`, guarded acceptance fixture; credentials omitted.
- Light raw summary: `artifacts/ui-redesign/ui-redesign-2026-08-13T07-33-13.985Z-axe-p6476/summary.json` (2026-08-13T07:40:13.408Z).
- Dark raw summary: `artifacts/ui-redesign/ui-redesign-dark-2026-08-13T07-40-24.109Z-axe-p4308/summary.json` (2026-08-13T07:47:22.824Z).
- The UI smoke blocks non-read HTTP requests. Mutation acceptance uses only scripts that require `ALLOW_LOCAL_MUTATION_SMOKE=1` and reject hosted or credential-bearing URLs.

## Engineering gates

| Command | Result | Status |
| --- | --- | --- |
| `npm run lint` | ESLint passed | passed |
| `npm run test:all` | 226 Vitest files / 1,590 tests and 88 Node contract tests passed | passed |
| `npm run test:ui-copy` | 47-route copy policy passed with 0 prohibited occurrences | passed |
| `npm run test:ui-coverage` | 47/47 executable routes passed | passed |
| `npm run test:route-discoverability` | 38/38 route contracts passed | passed |
| `npm run test:ui-redesign` | 188 route/viewport, 4 Maintenance board, 235 role, and 6 keyboard/zoom cases passed | passed |
| `npm run test:ui-a11y -- --write-evidence` | Complete light-theme Chromium and axe run passed | passed |
| `node scripts/smoke-ui-redesign.mjs --axe --theme=dark` | Complete dark-theme Chromium and axe run passed | passed |
| `npx tsc --noEmit` | TypeScript passed | passed |
| `npm run build` | Next.js production build passed | passed |
| `git diff --check` | Passed; no whitespace errors | passed |

## Database gates

A bare local reset is intentionally empty because `supabase/config.toml` disables automatic seeding. The guarded `db:test:fixture` command is therefore the required prerequisite for fixture-dependent pgTAP files.

| Command | Result | Status |
| --- | --- | --- |
| `npm run db:reset` | All local migrations replayed successfully | passed |
| `npm run db:test:fixture` | Isolated five-role acceptance fixture loaded and verified | passed |
| `npx supabase test db` | 53 pgTAP files / 1,864 assertions passed | passed |
| `npm run db:lint` | Passed with four pre-existing unused-variable warnings and no errors | passed |
| `npm run db:types` | Generated database types completed without a semantic diff | passed |

## End-to-end workflows

| Workflow | Command | Evidence | Status |
| --- | --- | --- | --- |
| finance-manager-day | `npm run test:fixture-finance-manager-day` | Finance Manager lease policy, payments, owner close, statement publication, reports, and retained exceptional denials | passed |
| owner-opening | `npm run test:owner-opening-browser-acceptance` | Independent submission, review, correction lineage, role denial, and database effects | passed |
| owner-balance | `npm run test:owner-balance-browser-acceptance` | Four-component opening authority, allocation, cash activity, reversal, exact two-month roll-forward, and role denial | passed |
| owner-close | `npm run test:owner-close-browser-acceptance` | Readiness, close, reopen, correction, immutable revision history, and role denial | passed |
| owner-statement | `npm run test:owner-statement-browser-acceptance` | Publication, supersession, retained bytes, Finance Member read/download, and Operations denial | passed |
| golden-setup | `npm run test:ips-golden-setup` | Nine-phase property-to-rent-ready setup with independent opening-balance review | passed |
| rent-to-statement | `npm run rent:test-browser` | Ten rent scenarios through late payment, owner close, and byte-verified PDF/Excel publication | passed |
| paid-cost | `npm run paid-cost:test-browser` | Submit, evidence review, approve, reverse, correct, reapprove, and exact database effects | passed |
| cutover | `npm run cutover:test-browser` | Blocked and corrected import plan, reconciliation, replay, exact totals, and role denial | passed |
| maintenance-responsive | `npm run test:maintenance-mobile` | Cases, board, calendar, drawer, tasks, recurring work, inspections, and work orders across four viewports | passed |
| properties | `npm run test:properties-flow` | Property and unit navigation, filters, inspector, and detail flow | passed |
| role-homes | `npm run test:fixture-roles` | All five role homes at desktop, laptop, and phone | passed |
| discoverability | `npm run test:fixture-route-discoverability` | 67/67 visible-link journeys and 4 direct denials | passed |

## Route, role, state, theme, and responsive acceptance

- Machine-readable matrix: `artifacts/enterprise-frontend-redesign/route-role-state-acceptance-matrix.json`.
- Detailed human-readable route matrix: `docs/verification/ui-redesign-evidence.md`.
- Executable route contract: `config/ui-route-coverage.json`; all 47 routes have source, surface, roles, states, expected access, query behavior, workflow evidence, and explicit limitations.
- Complete viewports per theme: desktop 1440x900, laptop 1280x800, compact desktop 1024x768, and phone 390x844.
- The 200% audit verifies reflow, overflow, keyboard reachability, focus visibility, and essential work-surface access at the 720x450 CSS layout viewport produced by zooming 1440x900 to 200%; the owner-opening authority surface additionally passed measured 200% root-font text.
- Reduced-motion CSS and interaction contracts, semantic component tests, live-region/error association tests, and serious/critical axe scans passed in both themes.

## Role architecture and product-contract override

- Super Admin retains organization/access governance, structural setup, reconciliation-source configuration, correction/reversal authority, reopen/recovery, and global unlocks.
- Finance Manager owns routine lease and rent-policy configuration, independent owner-opening review, reconciled month close, statement publication, review queues, reports, and ordinary financial corrections.
- Finance Member prepares rent, paid-cost, owner-opening, evidence, and day-to-day finance work without review or exception authority.
- Operations Manager owns cases, assignments, recurring work, inspections, work orders, and completion-to-Finance handoff. Operations Member receives a task-first worklist and scoped account access.
- The sole `PROJECT.md` override delegates routine Finance completion from Super Admin to Finance Manager. Migration predicates, Storage policies, route access, server actions, generated types, role matrices, pgTAP, and browser acceptance were updated together; maker-checker, tenant scope, locks, immutable evidence, and exceptional authority remain intact.

## Visual evidence

- 15 curated visual artifacts are indexed in `artifacts/enterprise-frontend-redesign/visual/manifest.json`.
- The set includes light/dark Overview, Finance, and owner balances; desktop/mobile Operations; rent policy; dark authentication; landing desktop/mobile; the editorial section; the generated source at 1536x1024; and the image-failure fallback.
- The original editorial image is optimized WebP with meaningful alt text. Its section retains heading, workflow meaning, and actions when the image request is blocked.

## Honest limitations

- Evidence is local Chromium and local Supabase certification, not production, hosted-environment, Safari/Firefox, or physical-device certification.
- Axe covers automated serious/critical rules; contextual screen-reader quality is additionally supported by semantic, keyboard, focus, live-region, form-error, and interaction contracts rather than claimed from axe alone.
- The retained browser fixture has all five linked roles. The unlinked-account `/no-access` presentation is covered by auth/system-state component contracts because no disposable unlinked browser account is retained.
- Vercel CLI is not installed, and deployment is explicitly prohibited by this goal. Hosted verification was therefore neither required nor attempted.
- Responsive checks use Chromium viewports and zoom-equivalent CSS layout dimensions; no physical-device claim is made.

## Evidence index

- Research: `docs/research/enterprise-frontend-redesign-research.md`
- System design: `docs/design/enterprise-frontend-redesign-system.md`
- Goal ledger: `docs/enterprise-frontend-redesign-goal.md`
- UI matrix: `docs/verification/ui-redesign-evidence.md`
- Discoverability: `docs/verification/authenticated-route-discoverability.md`
- Machine matrix and visuals: `artifacts/enterprise-frontend-redesign/`
