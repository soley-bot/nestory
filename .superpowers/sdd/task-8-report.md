# Task 8 report — accessible command palette

## Outcome

Implemented one role-aware `Search or jump…` command palette in the authenticated
AppShell. The controller is rendered once across viewports and supports click,
Ctrl+K, Cmd+K, grouped navigation/entity results, keyboard traversal, click/Enter
activation, modal focus containment, Escape/backdrop close, focus restoration,
and announced loading/error/count/empty states.

## RED evidence

- `npm test -- src/components/layout/workspace-command-palette.test.tsx src/components/layout/app-shell.test.tsx`
  initially failed 13 tests for the expected missing trigger/dialog/behavior.
- A presentation-boundary test then failed because a 501-character untrusted
  label was accepted.
- An untrusted payload-limit test then failed because 25 entity rows rendered.
- The final edge audit added six failing cases for loading/no-results overlap,
  active-option scrolling, pre-validation row bounding, manager/member route
  broadening, and malformed/oversized query encoding.
- A role-transition regression test failed because an admin entity remained
  visible during an in-place downgrade to member.

## GREEN behavior and security decisions

- Local navigation actions come only from `getWorkspaceSearchActions(role)` and
  match immediately without a request.
- Entity requests debounce for 150ms and use a relative URL, same-origin
  credentials, `cache: "no-store"`, AbortController, and request sequencing.
- Query text is made well-formed, normalized, collapsed, lower-cased, and capped
  to 120 Unicode code points before `encodeURIComponent`.
- API payloads are treated as untrusted: the client slices to the server's
  20-row contract before validation, validates kinds and bounded display fields,
  rejects action rows, deduplicates entity rows, and accepts only safe
  same-origin relative hrefs.
- Entity kinds and pathnames are separately allowlisted by shell role. Admin
  record kinds stay on their matching record routes, manager entities stay on
  `/maintenance`, and member entities stay on `/tasks`. Existing results are
  filtered immediately if the shell role narrows.
- Navigation rechecks href safety, closes the modal, and calls `router.push`
  immediately. No server search module, Supabase client, entity result, or query
  data enters localStorage.
- The dialog uses unique React IDs, a labeled combobox/listbox/group/option
  relationship, consistent `aria-activedescendant`/`aria-selected`, initial
  input focus, two-control focus containment, body-scroll cleanup, Escape and
  backdrop close, trigger focus restoration, live status, and active-option
  `scrollIntoView({ block: "nearest" })`.
- Loading does not simultaneously render or announce the terminal `No results`
  state.

## Files

- `src/components/layout/workspace-command-palette.tsx`
- `src/components/layout/workspace-command-palette.test.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/app-shell.test.tsx`

## Verification

- Focused tests: 2 files, 31 tests passed.
- Full tests: 85 files, 526 tests passed.
- Touched ESLint: passed.
- Full `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed on Next.js 16.2.9.
- `npm run test:ui-coverage`: passed, 46/46 page routes covered.
- `npm run test:ui-copy`: still reports the same 10 pre-existing narration
  violations in ledger/people/petty-cash/properties/units; Task 8 adds none.
- `git diff --check`: passed before commit.

## Manual/browser boundary

`http://localhost:3000/login` responded 200, but no E2E credentials were
available and the running process was not proven to be this worktree. I did not
claim a real authenticated browser smoke. Keyboard, focus, abort, activation,
and accessibility relationships are covered in the focused jsdom tests.
The actual visual appearance of the semantic focus ring remains a deferred Minor
for the later Phase 8/release authenticated browser smoke; it is not claimed
from structural class tests alone.

## Commit

- Implementation: `d22d9b2cf8120f44b319f754407f92f3c833c386`
- Review fixes: `c09e42ce4d57f3678e04aa684a18eb5b349914f6`

## Independent review fixes

- One-complete-code-point queries keep local action matching but do not fetch or
  show terminal `No results`; unmatched short queries render and announce
  `Type 2 characters to search records`.
- IME composition start/end is tracked. Arrow, Enter, Escape, and global
  shortcuts ignore tracked composition, native `isComposing`, and keyCode 229;
  commands resume after composition end.
- The shell trigger, combobox frame, and close control now expose explicit
  focus treatment through the approved `focus-ring` semantic token without raw
  colors.

## Known non-task warnings

- Next build warns that multiple lockfiles make it infer `D:\nestory` as the
  Turbopack root. The build still completes successfully.
