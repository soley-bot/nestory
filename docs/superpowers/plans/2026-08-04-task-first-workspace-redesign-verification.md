# Task-First Workspace Redesign Verification

Verified on 2026-08-04 in the isolated worktree
`D:\nestory\.worktrees\task-first-workspace-redesign`.

## Provenance

- Branch: `codex/task-first-workspace-redesign`
- Baseline: `2bc6cd677ad50110ed2d4df797dfe87f28d403ef`
- Verified implementation SHA before this verification-only documentation
  change: `eb236892900520a1bd9b5bf02a70674d93710f6f`
- Remote state: not pushed; no deployment was requested or performed.

The redesign changes authenticated composition and presentation only. It does
not change a schema, migration, RPC, server action authority boundary, route
URL, or URL parameter contract. Finance terminology, report-period logic,
transaction state, balances, and accounting authority remain unchanged.

## Code and production-build gates

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npm run lint` | 0 | Repository ESLint completed without findings. |
| `npx tsc --noEmit` | 0 | Integrated TypeScript gate passed at the verified implementation SHA. |
| `npm run test:all` | 0 | 176 application test files, 1,310 tests, and 18 demo-tool tests passed at the verified implementation SHA. |
| `npm run build` | 1 | First isolated-worktree attempt compiled and typechecked, then `/no-access` prerender failed because the ignored root `.env.local` was not present in the worktree. |
| Root `.env.local` loaded into the process, then `npm run build` | 0 | Final Next.js production compilation, TypeScript, page-data collection, and all 18 static pages completed. No environment file was copied or committed. The existing multiple-lockfile root-inference warning remains. |
| `npm run test:ui-coverage` | 0 | 54/54 page routes covered. |
| `npm run test:ui-copy` | 0 | Zero prohibited narration occurrences. |
| Task 17 eight-file compatibility suite | 0 | 8/8 files and 63/63 tests passed. |
| Settings, Access, Account integrated suite | 0 | 5/5 files and 89/89 tests passed. |
| Final Access focused suite | 0 | 36/36 tests passed after the inline Access-effect correction. |

The exact automated commands `npm run test:ui-redesign`,
`npm run test:ui-a11y`, `npm run test:properties-flow`, and
`npm run test:maintenance-mobile` were not run because they start a separate
Playwright browser. The governing browser workflow permits only the user's
selected in-app browser unless the user explicitly authorizes Playwright CLI.
The selected-browser checks below cover the redesigned routes without changing
that browser choice.

## Selected-browser evidence

Browser: the user's authenticated in-app browser, fixed at 1280 x 720 CSS
pixels. Role exercised: administrator. Local organization fixture exercised:
Sokha Property Services. Each recorded route had one visible H1 and no
page-level horizontal overflow.

- Pilot Leases states:
  `D:\nestory\output\playwright\task-first-wave-b`
- Overview, People, Records, Properties, Units, Property detail, and Person
  detail:
  `D:\nestory\output\playwright\task-first-wave-c`
- Settings organization/configuration/branches/teams, Branch and Team drawers,
  Account, Workspace Access, and Invite Staff drawer:
  `D:\nestory\output\playwright\task-first-wave-d`
- Finance Operations, Ledger, Petty Cash, Reports, Documents, and Property
  Setup:
  `D:\nestory\output\playwright\task-first-wave-e`

Final 1280 x 720 captures in the Wave E folder cover Finance, Reports, Ledger,
Petty Cash, Documents, Maintenance list, and Leases. Each route had one visible
H1 and no page-level horizontal overflow. Finance's min-width tables retain a
working horizontal scroll owner. Reports keeps its title and row count inline
until wrapping is necessary, and row separators span every visible column.

The exact 1440 x 900, 1280 x 800, and 200% browser-zoom checks remain
unverified because the selected in-app browser cannot resize or set browser
zoom. Switching to Playwright CLI requires explicit user permission. This is a
verification boundary, not a claim that those states failed.

## Interaction and accessibility coverage

- The title, context, local navigation, and actions remain inline when desktop
  width permits; responsive stacking is reserved for narrower layouts or true
  semantic hierarchy.
- Search stays visible where it is the primary retrieval control; advanced
  filters remain disclosed.
- Migrated desktop work surfaces are unframed. Functional controls, semantic
  warnings, confirmation states, drawers, and discrete record objects retain
  containment where it communicates behavior.
- Shared dashboard/list/report loading states are also unframed. AppShell owns
  authenticated loader height, while the standalone auth-completion loader
  explicitly owns the dynamic viewport height. Header context and actions stay
  inline from the small breakpoint upward and reflow only on narrow screens.
- Settings has one header navigation and a two-zone Workspace layout: one
  uncontained rail and one labelled content region.
- Workspace Access groups Needs access, Pending, and Active in one flat surface.
  Invite Staff uses the shared focus-managed drawer with one full-width action
  area. Tests cover dirty close through X/Escape/backdrop, focus restoration,
  client deep links, duplicate handoff, validation focus, save errors,
  persisted invitation delivery failure, permissions, and last-admin safety.
- Property Setup retains its five-step wizard and now has one page H1 plus a
  step H2.

The final residual source audit found zero rejected fixed 300 px workspace
grids, zero forbidden stacked/full-screen patterns in the shared loader, and no
production `Lease summary` or `Timeline records` wrapper. The remaining text
matches for those two labels are negative regression assertions only.

## Verification boundary

This is a local authenticated implementation verification. It does not certify
hosted authentication, a hosted database, production deployment parity,
manager/member fixtures, physical-device behavior, exact 200% zoom, or email
delivery. No production state was changed.
