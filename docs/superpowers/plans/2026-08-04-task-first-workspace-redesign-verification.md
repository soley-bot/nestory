# Task-First Workspace Redesign Verification

Verified on 2026-08-04 in the isolated worktree
`D:\nestory\.worktrees\task-first-workspace-redesign`.

## Provenance

- Branch: `codex/task-first-workspace-redesign`
- Baseline: `2bc6cd677ad50110ed2d4df797dfe87f28d403ef`
- Exact candidate HEAD verified before this documentation-only evidence refresh:
  `224f451bf01ff609f7fa028883951a9079bb547b`
- External implementation plan inspected read-only:
  `D:\nestory\docs\superpowers\plans\2026-08-04-task-first-workspace-redesign.md`
- External plan SHA-256:
  `96A42E225A829E5038319F0E64157B814EC2F74F47E25667E62C58A51C4C3EF1`
- Visual gate and direction: user-approved on 2026-08-04, including the
  flatter outer workspace structure and the inline, non-stacked intent for
  related header and control content when width permits.
- The external root plan and every other file in `D:\nestory` were left
  unmodified, unstaged, unmoved, and uncopied by this Task 18 refresh.
- Remote state: not pushed; no deployment was requested or performed.

The redesign changes authenticated composition and presentation only. It does
not change a schema, migration, RPC, server action authority boundary, route
URL, URL parameter contract, or permission contract. Finance terminology,
report-period logic, transaction state, balances, collection labels, and
accounting authority remain unchanged.

## Fresh code and production-build gate

The following commands were run against the exact candidate HEAD above, one at
a time. Time-limited attempts are recorded as attempts, not test failures or
passes.

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npm run lint` | 0 | Repository ESLint completed without findings. |
| `npx tsc --noEmit` | 0 | Integrated TypeScript gate completed without findings. |
| `npm run test:all` (60-second process ceiling) | 124 | The wrapper terminated the process before Vitest returned a verdict. |
| `npm run test:all` (180-second process ceiling) | 124 | The wrapper again terminated the process before Vitest returned a verdict. |
| `npm run test:all` (completed rerun) | 0 | 176/176 application test files and 1,310/1,310 tests passed; 18/18 demo-tool tests passed. The existing jsdom navigation notices remained non-failing output. |
| First read-only root-environment build launcher | 1 | The direct `npm.cmd` launcher exited before invoking Next and emitted no build output. This is not a build verdict. |
| Root environment loaded read-only with `@next/env`, then `npm run build` | 0 | Next production compilation, TypeScript, page-data collection, and all 18 static pages completed. No environment file was copied. The existing multiple-lockfile root-inference warning remains. |
| `npm run test:ui-coverage` | 0 | 54/54 page routes covered. |
| `npm run test:ui-copy` | 0 | Zero prohibited narration occurrences. |
| `Get-FileHash -Algorithm SHA256` on the external plan | 0 | Returned the exact SHA-256 recorded in Provenance. |
| Required residual-pattern `rg` scan | 0 | 410 matching lines across 93 files were reviewed; an exit of 0 means matches were found, not that they were failures. |
| `git diff --check` | 0 | No whitespace errors; Git emitted only the expected LF-to-CRLF working-copy warning on this Markdown file. |
| `git status --short` | 0 | Before staging, only this verification document was modified. |
| `git diff --stat origin/main...HEAD` | 0 | The branch diff contained 76 files, 4,389 insertions, and 1,943 deletions before this documentation refresh. |

The route and copy contracts did not change, so
`scripts/verify-ui-route-coverage.mjs` and `scripts/verify-ui-copy.mjs` require
no adjustment.

## Browser-smoke boundary

The commands below were not run in this session and therefore have no exit
code or pass claim:

- `npm run test:ui-redesign`
- `npm run test:ui-a11y`
- `npm run test:properties-flow`
- `npm run test:maintenance-mobile`

They start a separate Playwright browser. The governing workflow permits the
user's selected in-app browser unless the user explicitly authorizes switching
to Playwright CLI. A controller with that selected browser must complete any
remaining browser-only evidence.

## Selected-browser evidence actually available

Browser: the user's authenticated in-app browser at its fixed 1280 x 720 CSS
viewport. Role exercised: administrator. Local organization fixture exercised:
Sokha Property Services. Existing checkpoint evidence records one visible H1
and no page-level horizontal overflow on the exercised routes.

| Required surface | Existing supporting screenshot |
| --- | --- |
| Overview (`/overview`) | `D:\nestory\output\playwright\task-first-wave-c\overview-1280x720.jpg` |
| Properties (`/properties`) | `D:\nestory\output\playwright\task-first-wave-c\properties-1280x720.jpg` |
| Units (`/units`) | `D:\nestory\output\playwright\task-first-wave-c\units-1280x720.jpg` |
| People (`/people`) | `D:\nestory\output\playwright\task-first-wave-c\people-1280x720.jpg` |
| Leases (`/leases`) | `D:\nestory\output\playwright\task-first-wave-e\leases-final-1280x720.jpg` |
| Maintenance list (`/maintenance`) | `D:\nestory\output\playwright\task-first-wave-e\maintenance-list-final-1280x720.jpg` |
| Maintenance board | Not captured. |
| Records (`/timeline`) | `D:\nestory\output\playwright\task-first-wave-c\records-1280x720.jpg` |
| Settings (`/settings`) | `D:\nestory\output\playwright\task-first-wave-d\settings-task13-organization-1280x720.jpg` |
| Workspace Access (`/users-roles`) | `D:\nestory\output\playwright\task-first-wave-d\access-task16-final-1280x720.jpg` |
| Account (`/account`) | `D:\nestory\output\playwright\task-first-wave-d\account-task16-1280x720.jpg` |
| Finance Operations (`/rent-income`) | `D:\nestory\output\playwright\task-first-wave-e\finance-final-1280x720.jpg` |
| Ledger (`/ledger`) | `D:\nestory\output\playwright\task-first-wave-e\ledger-final-1280x720.jpg` |
| Reports (`/reports`) | `D:\nestory\output\playwright\task-first-wave-e\reports-final-1280x720.jpg` |

Additional fixed-viewport evidence exists for Leases filter and quick-view
states, property and person detail, Settings sections, Branch and Team drawers,
Invite Staff, Petty Cash, Documents, and Property Setup under
`D:\nestory\output\playwright\task-first-wave-b` through
`D:\nestory\output\playwright\task-first-wave-e`.

The required 1440 x 900 and 1280 x 800 captures do not exist. The required 200%
zoom keyboard-only checks for Overview, Leases, Maintenance, Property detail,
and Settings were not exercised. The selected in-app browser cannot set those
viewport sizes or browser zoom. These are open evidence gaps, not pass claims.

No manager, member, anonymous, or hosted role was exercised for this visual
checkpoint. Hosted authentication, hosted database behavior, production deploy
parity, physical-device behavior, and email delivery were not verified.

## Inline-first and interaction contract mapping

The binding-rule evidence in this section is limited to source inspection,
automated regression coverage, and the existing fixed 1280 x 720 administrator
fixture described above. Within that boundary, related title, context,
navigation, actions, controls, summaries, and row facts stay on one readable
line when width permits; stacking is reserved for semantic hierarchy or
accessible responsive reflow. This is not a browser-acceptance claim for the
still-open 1440 x 900, 1280 x 800, Maintenance board saved capture, Playwright
smokes, or 200% zoom keyboard checks.

- Shared `PageHeader` places title, context, local navigation, and actions in
  one flex-wrapping primary composition and uses `lg:flex-nowrap` when laptop
  width permits. Navigation uses full-width responsive reflow below `lg`, then
  returns to the same primary row at `lg`.
- Shared `WorkspacePage` exposes at most one `workspace-controls` region.
  Local navigation and the single labelled toolbar share one row at `lg` and
  stack only below that breakpoint.
- Primary search remains visible on retrieval-heavy workspaces; advanced
  URL-backed filters stay disclosed.
- Migrated desktop work surfaces are unframed. Functional controls, semantic
  warnings, confirmation states, drawers, and discrete record objects retain
  containment where it communicates behavior.
- Settings has one header navigation and a two-zone Workspace layout: one
  uncontained rail and one labelled content region.
- Workspace Access uses one flat surface. Invite Staff uses the shared
  focus-managed drawer with one full-width action area. Existing regression
  coverage includes dirty dismissal, Escape, focus restoration, client deep
  links, validation focus, save errors, duplicate handoff, delivery failure,
  permissions, and last-administrator safety.

## Residual-pattern review

The required scan returned 410 matching lines across 93 files. Each category
was reviewed rather than deleted mechanically:

- `grid-cols-[...300px...]`: zero hits.
- `Lease summary`: two negative regression assertions; no production wrapper.
- `Timeline records`: one negative regression assertion; no production wrapper.
- `Workspace Access`: intentional navigation, search, staff-access copy, and
  regression-test references.
- Rounded-border hits: 368 lines across 82 files. The matches are controls,
  popovers/dialogs, alerts and consequences, drawers/forms, empty/loading
  states, discrete photos/records, detail inspectors, workflow groups, and
  public marketing previews. No hit justified a Task 18 coverage-script or
  documentation-contract change, and none was blindly removed.

This is local authenticated implementation evidence only. It does not certify
the unrun browser-smoke commands or the missing exact viewport and zoom states.
