# UI workstream — parallel-work boundary

Branch: `ui/layout-foundation`, based on `origin/main` (`cff61d5`).
Established: 2026-08-12.

## Why this document exists

Codex is running the business-core workstream on `codex/ips-operational-readiness`
([PR #54](https://github.com/soley-bot/nestory/pull/54)) — an **open draft** carrying
**388 files, +98,343 / −1,864**, last updated 2026-08-12.

That PR is not confined to data and migrations. It touches **132 files under `src/components`
and `src/features`**, including several the UI plan wants to rewrite:

| File the UI plan targets | Status |
|---|---|
| `src/app/globals.css` | in PR #54 |
| `src/components/ui/table.tsx` | in PR #54 |
| `src/components/ui/badge.tsx` | in PR #54 |
| `src/components/layout/app-shell.tsx` | in PR #54 |
| `src/features/leases/components/leases-table.tsx` | in PR #54 |
| `src/features/maintenance/components/maintenance-screen.tsx` | in PR #54 |

So "work in parallel" cannot mean "work anywhere." It means **work only on files PR #54 does
not touch**, and defer the rest until it merges.

Of 230 non-test UI files, **194 (84%) are clean** and available now.

## The rule

> This branch modifies only files absent from
> `git diff --name-only origin/main...origin/codex/ips-operational-readiness`.

Re-verify before starting any slice, because PR #54 is still moving:

```bash
git fetch origin && git diff --name-only origin/main...origin/codex/ips-operational-readiness > /tmp/contested.txt && grep -xF "<file-you-want-to-edit>" /tmp/contested.txt && echo "BLOCKED" || echo "clear"
```

Two further constraints, so this branch cannot break Codex's work:

1. **Presentation only.** No changes to loaders, server actions, RPCs, Zod schemas, URL
   parameters, money handling, or database access. If a UI fix appears to need one, it is
   out of scope and gets recorded here instead.
2. **No shared-primitive signature changes.** Adding a prop to a component PR #54 also edits
   would conflict even if the hunks differ. New primitives are added as *new files*.

## Work status by phase

Phases refer to `docs/codex-ui-ux-remediation-prompt.md`.

### Green — every target file is clean

| Phase | Work | Files |
|---|---|---|
| A1 (partial) | Fix `bg-accent text-accent` invisible filter buttons | `people-filters.tsx`, `property-filters.tsx`, `unit-filters.tsx` |
| A1 (partial) | `bg-foreground` → `bg-primary` on interactive elements | `overview-screen.tsx`, `person-detail-screen.tsx`, `property-detail-screen.tsx`, `unit-detail-screen.tsx`, `property-detail-view.tsx`, `unit-detail-view.tsx`, `login-form.tsx`, `accept-invite/page.tsx`, `no-access/page.tsx` |
| B1 | One padding owner — the page gutter | `workspace-page.tsx`, `page-header.tsx`, `module-loading.tsx` |
| B2 | Kill the card-in-a-padded-page; attach pagination | `pagination-controls.tsx`, `people-screen.tsx`, `properties-table.tsx`, `units-table.tsx`, `people-table.tsx` |
| B5 (partial) | Remove `100vh` / `h-screen` inside the shell | `overview-screen.tsx`, `person-detail-screen.tsx`, `property-detail-screen.tsx`, `unit-detail-screen.tsx`, `people-screen-skeleton.tsx`, `overview-detail-page.tsx`, `tasks/page.tsx` |
| B6 | Record-detail archetype (**Prototype sheet 01**) | `person-detail-screen.tsx`, `property-detail-screen.tsx`, `unit-detail-screen.tsx` |
| B6 | Properties list archetype (**Prototype sheet 02, plate 03**) | `property-screen.tsx`, `properties-table.tsx`, `property-filters.tsx` |
| B9 | Skeletons matching the archetype | `module-loading.tsx` and the `loading.tsx` files |
| C3 | Copy pass on People / Properties / Units | `*/data/*.ts` for those three domains |

### Blocked — a target file is inside PR #54

| Phase | Work | Blocking file |
|---|---|---|
| A2, A3 | Token cleanup and the type scale | `src/app/globals.css` |
| B3 | Move the seven tables onto shadcn `Table` | `src/components/ui/table.tsx` |
| B4 | Delete `WorkspaceSplitView` | consumers `lease-screen.tsx`, `ledger-screen.tsx`, `petty-cash-screen.tsx` |
| B7 | One navigation model | `src/components/layout/app-shell.tsx` |
| B8 | Mobile navigation | depends on B7 |
| — | Leases list (**sheet 02, plate 02**) | `leases-table.tsx`, `lease-screen.tsx` |
| — | Maintenance list (**sheet 02, plate 04**) | `maintenance-screen.tsx`, `maintenance/page.tsx` |

Note that the contested hunks are small — `globals.css` is a **one-line** change in PR #54 and
`ui/table.tsx` is **+8/−1**. These are cheap to rebase onto *after* PR #54 merges. They are
blocked because of merge mechanics, not because the work is hard.

## Merge protocol

1. This branch stays small and merges to `main` **independently** of PR #54.
2. Whichever merges second rebases. Because this branch touches no file in PR #54, that rebase
   should be a fast-forward.
3. Once PR #54 merges, re-run the contested check — it will return empty — and unblock the
   phases above in the order given in the remediation prompt (A2 → A3 → B3 → B4 → B7).
4. Prototypes live in `docs/prototypes/` and are the visual acceptance target:
   - `01-person-record.html` — record-detail archetype
   - `02-list-pages.html` — list archetype across Leases, Properties, Maintenance

## Verification gate for every slice

```bash
npm run lint && npm run test && npm run test:ui-copy && npm run test:ui-coverage
```
