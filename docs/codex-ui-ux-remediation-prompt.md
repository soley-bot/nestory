# Codex handoff — Nestory layout rebuild on shadcn defaults

**Direction (set by the product owner, 2026-08-12):**
1. Use **shadcn defaults**. Do not invent tokens, variants, or primitives. If shadcn ships it, use it.
2. **Layout is the primary problem.** Each page invents its own body layout. Fix that first.

Reference audit with screenshots and measurements: `docs/ui-ux-audit-2026-08-12.md`.

---

## The core diagnosis

The shadcn layer is fine. `components.json` is on the `radix-nova` style with `baseColor: neutral`,
and `src/components/ui/*` is largely stock. The `:root` palette in `src/app/globals.css:36-64` is
shadcn's stock neutral.

**The feature layer ignores it.** Concretely:

| shadcn primitive | Files importing it | Hand-rolled equivalents |
|---|---|---|
| `Card` | 8 | 318 `border border-border` panels |
| `Table` | 3 | 7 bespoke `<table className="min-w-[Npx] table-fixed">` |
| `Button` | 57 | 80 `inline-flex … rounded-md` clones + 73 raw `<button>` |
| `Input` / `SearchInput` | — / **0** | 129 raw `<input>` |

And nobody owns the page gutter. Here is the exact mechanism behind the misalignment in
`output/design-audit-2026-08-04/04-people.png`:

```
WorkspacePage                                  → workspace-body slot has NO padding
  └─ localNav band          px-4 sm:px-6       → tabs render at x=240
  └─ WorkspaceSplitView                        → adds a 3rd scroll container, bg-popover
       └─ <section rounded-lg border bg-card>  → card edge at x=220
            └─ filter band  px-3 sm:px-4       → search field at x=232
            └─ <table>                         → cells at x=232
       └─ PaginationControls attached={false}  → floats OUTSIDE the card
```

Three left edges (220 / 232 / 240) on one screen, plus detached pagination. Every list page repeats
this with different numbers. That is what "not properly laid out" is.

Root causes, in order:

1. `src/components/layout/workspace-page.tsx:78` — the `workspace-body` slot applies no padding, so
   each screen improvises. 17 distinct `px-N py-N` root pairs exist across `src/features`.
2. A **card inside a padded page** creates a second gutter. shadcn's dashboard layout pads once, at
   the content wrapper, and the card is full-bleed inside it.
3. `src/components/layout/workspace-split-view.tsx:45` is named "split view" but is
   `grid-cols-[minmax(0,1fr)]` — a **single column**. The inspector is a modal, not a pane. It is a
   vestigial wrapper that contributes a third scroll container and a pointless `bg-popover` →
   `bg-card` background switch. 7 screens use it.
4. Six screens declare `100vh`/`h-screen` inside a shell that is already `h-svh` and scrolled
   (`app-shell.tsx:496,515`), producing the double scrollbars visible in `01-overview.png`.

---

## Global rules

- Presentation only. Do not change loaders, server actions, RPCs, Zod schemas, URL params, money
  handling, or database access. If a fix seems to need a data change, stop and report.
- **No new design tokens.** Use the stock shadcn set: `background/foreground`, `card/card-foreground`,
  `popover/popover-foreground`, `primary/primary-foreground`, `secondary`, `muted/muted-foreground`,
  `accent/accent-foreground`, `destructive`, `border`, `input`, `ring`, `--radius`.
- **No new component variants.** If a design needs a variant `Button` does not have, use the closest
  existing one and report it.
- No new dependencies.
- Keep every `data-slot`, `data-testid`, `aria-label`, and `role`. Tests key off them.
- After each phase: `npm run lint` · `npm run test` · `npm run test:ui-copy` · `npm run test:ui-coverage`
- Report file:line for every change, and anything you chose not to act on.

---

# PART A — Restore shadcn semantics

Small, mechanical, and unblocks everything else. Ship it on its own.

## A1. `--accent` is being used as a colour when shadcn defines it as a surface

In shadcn, `--accent` is the **hover/selected background** and `--accent-foreground` is the text on
it. They are always used as a pair.

On 2026-08-09, commit `d99ccd1` made `src/lib/theme/organization-theme.ts:128` overwrite `--accent`
at runtime with `color-mix(in oklch, <seed> 18%, <background>)` — correct as a surface, fatal as a
foreground. 59 call sites still use it as a foreground.

**Fix:**

1. Three filter buttons currently paint their label in their own background — `bg-accent text-accent`,
   contrast ≈ 1.0:1, invisible whenever a filter is active:
   - `src/features/people/components/people-filters.tsx:112`
   - `src/features/properties/components/property-filters.tsx:177`
   - `src/features/units/components/unit-filters.tsx:122`

   Replace the whole active-state string with the shadcn pair: `"bg-accent text-accent-foreground"`.

2. The active-filter count chip at `people-filters.tsx:119` uses `bg-accent … text-background`
   (≈ 1.4:1). Use `bg-primary text-primary-foreground`. Same for the property and unit equivalents.

3. Sweep the rest:

   ```bash
   rg -n 'text-accent\b|border-accent\b|ring-accent\b|outline-accent\b' src --glob '!**/*.test.*' | rg -v 'accent-foreground'
   ```

   - link / emphasis text → `text-primary`
   - text sitting on `bg-accent` → `text-accent-foreground`
   - selection border or ring → `border-primary` / `ring-primary`
   - `focus-visible:outline-accent` → `focus-visible:outline-ring`

   Do **not** touch `src/components/ui/dropdown-menu.tsx` or `src/components/ui/select.tsx` — they
   already pair correctly.

4. `bg-foreground text-background` is not a shadcn button pair; it is body-text colour used as a fill,
   and it cannot be re-themed by the org accent. Replace all 25 interactive uses with
   `bg-primary text-primary-foreground` — or better, delete the hand-rolled element entirely in
   Part B and use `<Button>`.

   Files: `overview-screen.tsx:41`, `person-detail-screen.tsx`, `property-detail-screen.tsx:55`,
   `unit-detail-screen.tsx:66`, `property-detail-view.tsx`, `unit-detail-view.tsx`,
   `property-setup-screen.tsx`, `login-form.tsx`, `app/accept-invite/page.tsx`,
   `app/no-access/page.tsx`.
   Leave decorative non-interactive uses alone (`ui/tabs.tsx`, `ui/tooltip.tsx`,
   `people-screen-skeleton.tsx`).

**Done when:** `rg 'text-accent\b' src` returns only lines that also contain `accent-foreground`.
No element sets foreground and background to the same token.

## A2. Delete the custom token layer

`src/app/globals.css` adds three token families on top of shadcn. Two are dead, one duplicates
shadcn.

1. **Typography tokens — dead.** `--type-body`, `--type-table`, `--type-table-header`
   (`globals.css:21-23`, exposed at `:231-233`) have **zero** consumers. Delete them, and delete the
   bare `table { font-size }` / `thead { font-size }` rules at `:278-284`. Use shadcn's Tailwind
   scale (`text-xs`, `text-sm`, `text-base`) everywhere — see A3.

2. **Table tokens — replace with shadcn.** `--table-header-bg`, `--table-row-hover`,
   `--table-row-selected`, `--table-row-selected-indicator` (`globals.css:17-20`) exist only because
   the feature tables are hand-rolled. shadcn's `Table` already ships `hover:bg-muted/50` and
   `data-[state=selected]:bg-muted`. Delete these four tokens as part of B3.

3. **State tokens — keep, but only these.** `--state-success`, `--state-attention`, `--state-danger`
   and their `-soft` variants are legitimate; shadcn has no success/warning. Keep them. Delete the
   duplicate aliases `--danger`, `--warning`, `--success` and their `-soft` forms
   (`globals.css:27-32, 76-81`) — they are pass-throughs to the `--state-*` set and double the
   vocabulary for no gain.

4. **Restore the stock dark palette.** The `.dark` block at `globals.css:434-466` replaces shadcn's
   stock dark values with custom hex (`#101313`, `#151919`, `#1b2020`, `#343b3a`…). Restore shadcn's
   stock neutral dark oklch values so light and dark are generated from the same system. Keep the
   `[data-theme="dark"]` `--state-*` overrides.

5. **Fix the theme selector split.** `globals.css:5` declares `@custom-variant dark (&:is(.dark *))`
   while all the state and page-scope overrides key off `[data-theme="dark"]`. Two selectors for one
   concept. Pick `.dark` (shadcn's default) and convert the `[data-theme="dark"]` blocks at
   `:67, :105, :143, :184` to `.dark`. `applyOrganizationTheme` already sets both
   (`theme-runtime.tsx:81-83`), so nothing breaks.

**Done when:** `globals.css` contains the stock shadcn `:root` and `.dark` blocks plus exactly one
extra family (`--state-*`) and the `.landing-page` / `.auth-photo-page` / `.workspace-arrival-page`
page scopes. Nothing else.

## A3. One type scale — shadcn's

216 hardcoded `text-[Npx]` values ship, including `text-[9px]` and `text-[8px]`. Ten distinct body
sizes total.

Map every one onto the stock Tailwind scale:

| Current | Use |
|---|---|
| `text-[15px]`, `text-[14px]` | `text-sm` |
| `text-[13px]`, `text-[12px]` | `text-sm` in prose, `text-xs` in table cells |
| `text-[11px]`, `text-[10px]`, `text-[9px]`, `text-[8px]` | `text-xs` |

**Nothing below `text-xs` (12px) ships.** If a layout only fits at 9px, the layout is wrong — report
it instead of shrinking the type.

Column headers and field labels standardise on shadcn's convention:
`text-xs font-medium text-muted-foreground` — and **uppercase or not, but the same everywhere**.
Today one table renders `Property ↑` · `OWNER` · `OCCUPANCY` · `Net ↕` · `OPEN` · `Status ↕`
(`02-properties.png`): sortable headers are sentence case, non-sortable are uppercase. Pick one.
shadcn's default `TableHead` is sentence case — use that.

Add a guard: a `test:ui-tokens` npm script that fails on any `text-\[\d+px\]` in `src/`.

**Done when:** `rg 'text-\[\d+px\]' src` returns zero matches.

---

# PART B — The layout rebuild

This is the main work.

## B1. One padding owner

**Rule: the page content wrapper pads. Nothing inside it pads its own outer edge.**

This is how shadcn's dashboard block works — `SidebarInset` → header → a single padded content
wrapper → full-bleed children.

1. In `src/components/layout/workspace-page.tsx`, give the `workspace-body` slot (line 78) the gutter:
   `px-4 py-4 md:px-6 md:py-6` — shadcn's dashboard spacing. Add `flex flex-col gap-4 md:gap-6`.

2. Make the header and controls slots use the **same** horizontal value. Today:
   - `workspace-page.tsx:69` (toolbar) → `px-4 sm:px-6`
   - `page-header.tsx:26` → `px-4 lg:px-6`
   - `module-loading.tsx:27,49` → `px-4 sm:px-6 lg:px-6`

   Three ramps for one edge. Set all three to `px-4 md:px-6`.

3. Delete every root-level `px-*` / `py-*` from feature screens. They inherit it now.

   ```bash
   rg -n 'className="[^"]*\b(px|py|p)-\d' src/features --glob '!**/*.test.*' | rg 'main|<section className="flex h-full'
   ```

4. Collapse the interior padding vocabulary from 17 pairs to three, and take them from the shadcn
   primitives rather than writing them:
   - card body → `CardContent` (ships its own `px-(--card-spacing)`)
   - table cell → `TableCell` (ships `p-2`)
   - toolbar / control row → `px-3 py-2`

**Done when:** every route's content shares one left edge at every breakpoint. Verify by asserting
that `[data-slot="workspace-body"] > *` and `[data-slot="page-header-primary-row"]` have the same
`getBoundingClientRect().left`.

## B2. Delete the card-in-a-padded-page pattern

`people-screen.tsx:138` wraps the whole list in
`rounded-lg border border-border bg-card shadow-sm` **inside** a page that also pads. That is the
second gutter. Every list screen does this.

**Rule: a list page has one surface, not a surface inside a surface.**

Choose one and apply it to all seven list screens (`people`, `properties`, `units`, `leases`,
`ledger`, `timeline`, `documents`):

- **Option 1 (shadcn dashboard-01 default, recommended):** the toolbar and table sit directly on the
  page background, no card. Section boundaries come from `border-b`, not from a box.
- **Option 2:** one `<Card>` per page, full-bleed, containing toolbar + table + pagination, with the
  page gutter as its only outer margin.

Do not mix. Whichever you pick, **pagination goes inside the surface**:
`PaginationControls` defaults to `attached={false}` (`pagination-controls.tsx:24`) and only one call
site overrides it, so today "Showing 1-6 of 6" floats below the box on every list page. Flip the
default to `attached={true}` and drop the explicit prop at `people-screen.tsx:192`.

## B3. Move the tables onto shadcn's `Table`

Seven feature tables hand-roll the same markup with divergent numbers:

| File | Declaration |
|---|---|
| `people-table.tsx:68,87` | `min-w-[840px] table-fixed text-[13px]`, header `text-xs` |
| `properties-table.tsx:62,71` | `min-w-[760px] table-fixed text-[13px]`, header `text-[11px] uppercase` |
| `leases-table.tsx:49,58` | `min-w-[980px] table-fixed text-[13px]`, header `text-[11px] uppercase` |
| `units-table.tsx`, `ledger-table.tsx`, `timeline-table.tsx`, `property-units-table.tsx` | same shape, other numbers |

Each also repeats `sticky top-0 z-10 bg-[var(--table-header-bg)] shadow-[0_1px_0_var(--border)]`.

**Fix:**

1. Rebuild all seven on `src/components/ui/table.tsx` (`Table`, `TableHeader`, `TableRow`,
   `TableHead`, `TableBody`, `TableCell`). It is currently used by only 3 files.
2. Add the sticky header **once**, inside `ui/table.tsx`, behind a `stickyHeader` prop — not seven times.
3. Use shadcn's row states: `hover:bg-muted/50`, `data-[state=selected]:bg-muted`. Delete the
   `--table-*` tokens (A2.2) and the exported class-name strings `previewRowClassName` /
   `selectedPreviewRowClassName` in `src/components/data/interactive-table.tsx:6-9` — styling should
   be composed, not copy-pasted as strings.
4. Replace the seven different `min-w-[Npx]` values with one shared constant, and guarantee every
   table has an `overflow-x-auto` parent. There are currently 20 fixed-width wrappers and only 13
   scroll containers, so some have none.
5. Drop `table-fixed` unless a column genuinely needs a fixed width. It is why `PERSON` occupies
   ~800px while `LINKED` truncates with "…" in `04-people.png`.

## B4. Delete `WorkspaceSplitView`

`src/components/layout/workspace-split-view.tsx:45` is `grid-cols-[minmax(0,1fr)]` — one column. The
inspector renders as `RecordQuickViewDialog`, a modal. So the component is a single-column grid that
adds:

- a third scroll container (`overflow-auto`, line 50)
- a `bg-popover` outer / `bg-card` inner background switch with no visual intent
- an extra `tabIndex={0}` focus stop in the tab order

Inline the modal into the seven consuming screens (`people`, `properties`, `units`, `leases`,
`ledger`, `timeline`, `documents`, `petty-cash`) and delete the file.

If a real split view is wanted later, use shadcn's `ResizablePanelGroup`. Do not rebuild this one.

## B5. One height and scroll contract

`AppShell` already owns the scroller: `app-shell.tsx:496` (`h-svh … overflow-hidden`) and `:515`
(`overflow-y-auto`). Children must never declare viewport height.

1. Remove `min-h-screen`, `h-screen`, `h-dvh`, and all `100vh` arithmetic from everything under
   `src/app/(dashboard)` and the dashboard screens in `src/features`. Children use
   `h-full min-h-0 flex-1`.

   - `overview-screen.tsx:29` (also drop its `overflow-y-auto`)
   - `person-detail-screen.tsx:82`
   - `property-detail-screen.tsx:38`
   - `unit-detail-screen.tsx:49`
   - `people-screen-skeleton.tsx:13`
   - `import-preview-screen.tsx:222,228`
   - `overview-detail-page.tsx:27`
   - `app/(dashboard)/maintenance/page.tsx:69`
   - `app/(dashboard)/tasks/page.tsx:75`

2. Delete the four contradictory chrome-height magic numbers. None of them matches
   `--header-height` (`app-shell.tsx:352`):
   - `calc(100vh-310px)` — `maintenance-board-surface.tsx:122,326`, `petty-cash-screen.tsx:513`
   - `calc(100vh-320px)` — `ledger-table.tsx:28`, `timeline-table.tsx:31`, `document-screen.tsx:468`
   - `calc(100vh-350px)` — `maintenance-screen.tsx:1165`
   - `calc(100vh-112px)` — `import-preview-screen.tsx:228`

   Replace with `flex-1 min-h-0` — the parent is already a flex column in every case.

**Done when:** at 1280×720 and 1440×900, every dashboard route has exactly **one** vertical scrollbar
and `document.documentElement.scrollWidth === clientWidth`. Verify with `npm run test:ui-redesign`.

## B6. Four page archetypes, no exceptions

Every route must match one of these. Build each as a component and migrate onto it.

**1. List** — `people`, `properties`, `units`, `leases`, `ledger`, `timeline`, `documents`,
`rent-income`, `bills-expenses`, `maintenance`, `tasks`, `inspections`, `recurring-tasks`, `work-orders`

```
WorkspacePage
  header    → PageHeader (title, primary action)
  localNav  → LocalWorkspaceNav
  body      → toolbar row (search + filters + view toggle)
            → Table (shadcn, sticky header, overflow-x-auto)
            → PaginationControls (attached)
```

**2. Record detail** — `properties/[id]`, `units/[id]`, `people/[id]`

```
WorkspacePage
  header → PageHeader (record title, status, actions)
  body   → Tabs (shadcn, NOT wrapped in a card)
         → active tab content: at most TWO levels of container
```

`09-property-record.png` currently nests four: page frame → bordered tab-bar card → "Property
context" card → "Owners and leases" card → "Ownership history" sub-card. Tabs are never inside a
bordered card. Sub-sections use `border-t`, not a nested box.

Also fix the broken definition grid on that screen: the 4-column `dl` collapses when the `RECORDS`
value wraps to two lines, stranding `NOTES` alone with three empty columns. Give the grid
`auto-rows-min` with explicit `col-span`, or split `RECORDS` into separate cells.

**3. Dashboard** — `overview`, `overview/[view]`, `reports`

```
WorkspacePage
  header → PageHeader
  body   → metric row: shadcn Card grid, `grid gap-4 md:grid-cols-2 lg:grid-cols-4`
         → content sections
```

**4. Settings / form** — `settings`, `settings/rent-policy`, `account`, `users-roles`,
`properties/setup`, `import`

```
WorkspacePage
  header → PageHeader
  body   → Tabs (top level only — see B7)
         → shadcn Card per section, `max-w-3xl`
```

There are currently **~40 distinct `grid-cols-[...]` templates**, most used once or twice, including
`grid-cols-[24%_16%_25%_26%_9%]` and
`grid-cols-[minmax(180px,240px)_minmax(180px,240px)_minmax(150px,180px)_…]`. Once the tables move to
shadcn `Table` (B3), delete every grid template that was emulating a table.

## B7. One navigation model

Local nav is implemented four ways: `LocalWorkspaceNav` (People only), a tab row plus a "More ▾"
overflow (Finance), a tab row plus a second row of count chips (Maintenance), and nothing at all
(Records — despite six sidebar children).

1. Make `src/components/layout/local-workspace-nav.tsx` the only local nav, or replace it outright
   with shadcn `Tabs` in `variant="line"`. Adopt it in Finance, Maintenance, Records, Settings, and
   Properties. Delete the bespoke rows.

2. Derive its items from the **same constants** as the sidebar children —
   `FINANCE_CHILDREN`, `MAINTENANCE_CHILDREN`, `RECORDS_CHILDREN` at `app-shell.tsx:77-118`. Export
   them and consume in both places so the two menus cannot disagree. This also fixes the Finance
   ordering mismatch and the two destinations currently hidden behind "More".

3. `Reports` is currently both a global sidebar destination and a Finance local-nav item. Keep the
   global one; remove it from Finance.

4. Settings has **three** nav levels for six destinations (`08-settings.png`): sidebar →
   `Workspace | Workspace Access` tabs → a bordered left-rail card. Merge the left rail into the tab
   row. Two levels, maximum.

5. Give Records a local nav; it has six sidebar children and no tabs.

6. Fix the sidebar expansion bug at `app-shell.tsx:417`: the key
   `` `${destination.id}:${pathname}` `` forces a remount on every navigation, resetting
   `useState(active)` at `:272` and destroying the user's expand/collapse choice. Key on
   `destination.id` and derive expansion with an effect that opens the active domain without closing
   domains the user opened manually.

## B8. Mobile

`artifacts/ui-redesign/2026-07-20-people-clean-workspace/03-mobile.png` shows two stacked
horizontally-scrolling nav strips, a toolbar eating ~40% of the viewport, a duplicated "Add person"
CTA, and a floating avatar overlapping content. The codebase has 3 responsive-hide utilities total.

1. Kill both horizontal nav scrollers. `local-workspace-nav.tsx:62-65` (`overflow-x-auto` +
   `min-w-max`) must collapse below `md` into a `Select` or a `DropdownMenu` — not a scroll strip.
   The global nav uses the existing sidebar `Sheet` on mobile.
2. Collapse the mobile toolbar to one row: search full-width, Filters and the primary action become
   icon buttons with accessible names.
3. Remove the duplicated CTA — "Add person" appears in the toolbar and again in the empty state on
   the same screen.
4. Reposition the floating avatar so it does not overlap content.
5. Remove the `scrollIntoView` at `local-workspace-nav.tsx:29`; with `block: "nearest"` it can nudge
   the page vertically on load.

**Done when:** at 375×812 no route scrolls horizontally and no subtree shows more than one horizontal
scrollbar. Verify with `npm run test:ui-redesign` and `npm run test:maintenance-mobile`.

## B9. Skeletons that match the layout

22 `loading.tsx` files exist; **20** use the default `kind="list"` skeleton
(`module-loading.tsx:85-111`) — a 4-column list with no local nav and no metric strip. Real list
pages render a local nav, a 6–7 cell metric strip, and a 6–7 column table. Every navigation jumps.

Once B6 defines four archetypes, `ModuleLoading` takes one prop: the archetype. Each `loading.tsx`
passes the archetype its route uses. Align its gutter with B1.

---

# PART C — Composition and content

Lower priority, but this is where the remaining "hand-made" feel lives.

## C1. Compose controls instead of hand-rolling them

```bash
rg -n 'className="[^"]*inline-flex[^"]*rounded-md[^"]*"' src --glob '!src/components/ui/**' --glob '!**/*.test.*'
```

- 80 button clones + 73 raw `<button>` → `<Button>` / `<Button asChild><Link>`.
  Filled → `variant="default"`; bordered → `outline`; text-only → `ghost`; destructive →
  `destructive`. Heights: `h-7` → `size="sm"`, `h-8` → `size="default"`, `h-9` → `size="lg"`.
- 129 raw `<input>` → `Input`; search fields → `SearchInput` (currently **0** consumers).
- 318 `border border-border` panels → `Card` / `CardHeader` / `CardContent`.
- Radii: shadcn derives everything from `--radius`. Use only `rounded-md`, `rounded-lg`,
  `rounded-full`. Delete `rounded-sm` (28), `rounded-xl` (7), `rounded-none` (6).
- Elevation: `shadow-sm` for raised cards, `shadow-lg` for overlays. Delete `shadow-xs`,
  `shadow-md`, `shadow-xl`, `shadow-2xl`, and bare `shadow-`.
- Overlays: seven primitives ship. Keep `side-drawer` (20 files) for record inspection, `modal` (5)
  for focused writes, `alert-dialog` for destructive confirmation. Migrate and delete `dialog` (1),
  `confirmation-dialog` (1), `record-quick-view-dialog` (1), `sheet` (2).

## C2. Toolbar cleanup

- Remove the redundant icon-only search submit button on every list toolbar. The field already
  submits on Enter (`people-filters.tsx:95`). Keep only the leading magnifier inside the field.
- Delete the `Done` button in the filter popover (`people-filters.tsx:237-246`) — every
  `SelectControl` already commits on change via `replaceParam`, so nothing is pending.
- Keep exactly one Reset. There are two: inside the popover (`:141`) and outside it (`:251`).
- Stop counting `sort` and `pageSize` as active filters (`people-filters.tsx:44-49`); changing
  rows-per-page must not raise a filter badge.

## C3. Copy

588 sentence-length strings ship in the product surface. The existing guard
(`scripts/verify-ui-copy.mjs`) checks five literal phrases and passes — it does not measure this.

**Biggest single source:** nine data modules generate 42 "readiness check" objects, each carrying a
full-sentence `description`. On the person record they render as five stacked cards filling ~40% of
the page — and they contradict the record. In `10-person-record.png` the rail asserts
**"Contact ready — A usable email or phone is available for follow-up"** while the `PHONE` field in
the same viewport shows an amber **No phone** badge.

1. Drop every check whose `tone` is `"success"` from the rendered output. A satisfied condition is
   not information.
2. Collapse surviving warnings from stacked cards into inline `Badge` chips under the record title —
   label only, no sentence.
3. Delete the now-unused `description` fields in `people.ts:2288-2337` (6), `ledger.ts` (6),
   `unit-summary.ts` (5), `timeline.ts` (5), `property-detail.ts` (5), `lease-summary.ts` (5),
   `overview.ts` (4), `trusted-report.ts` (3), `documents.ts` (3).
4. Unify the "Contact ready" predicate with the one driving the `PHONE` badge.
5. Delete sub-labels that restate the cell above: "Email on file" under an email address,
   "Needs phone" under "No phone", "Individual"/"Company" under a name, and — in the lease table —
   the tenant name printed a second time as its own sub-label.
6. Empty states: the title states the fact; the body states a next action or is omitted. Drop
   "No cases are available in this workspace.", "No people records are available in this workspace.",
   "Add the first dated event to this history." Do not change `ui/empty-state.tsx`; it is correct.
7. Delete field helper text unless it states a consequence, permission, risk, accounting meaning, or
   irreversible action — the categories already whitelisted in `config/ui-copy-rules.json`. Remove
   the three in `access-settings-screen.tsx`. **Keep** the `ConsequencePanel` summaries in
   `petty-cash-screen.tsx`, `ledger-screen.tsx`, `maintenance-workflow-panel.tsx`.
8. No trailing periods in headings — `overview-screen.tsx:32` ships
   `<h1>Start with your operating records.</h1>`.
9. Sentence case everywhere: "Invite Staff" / "Add Staff" in `access-settings-screen.tsx`.
10. The sidebar says **Records**; the page calls itself **Timeline History**. Use "Records" in the
    breadcrumb, page title, and metadata.
11. Rewrite the guard: fail on user-facing strings ≥60 chars outside the whitelisted categories,
    on headings ending in `.`, and on any `EmptyState` `body` sharing ≥4 consecutive words with its
    `title`.

**Done when:** the ≥45-char-sentence count in `src/features` + `src/app` (excluding marketing and
tests) drops below 250 from 588.

## C4. Information density

1. Delete columns where every value is identical — `STATUS` shows a green "Active" badge on every row
   in both `people-table.tsx` and `lease-table.tsx`.
2. Stop using the warning tone for optional fields. "No phone / Needs phone" renders amber on all six
   people rows, the same tone as `MISSING DOCS` and `ENDING RISK`. Use `text-muted-foreground`;
   reserve amber for conditions that block work.
3. Fix the metric strips. Remove the `THIS PAGE` cell from leases — it is a label in a metric slot.
   Scope metrics to the filtered set, not the page; "rent at risk on page 1" is not actionable.
   Collapse strips that are entirely zero — the Maintenance chip row currently reads
   `Inbox 0 · Review 0 · Overdue 0 · Upcoming 0 · Completed 0 · All 0`.
4. Move actions out of data columns: "Attach evidence" is plain text inside the leases `STATUS`
   column. The properties `OPEN` column's value "Clear" reads as a button — rename one of them.
5. Delete the duplicate Settings card. "Workspace scope" repeats every value in the adjacent
   "Organization identity" card and wraps the workspace name over two lines while the other fits it
   on one.
6. Give the property thumbnail a placeholder — rows currently show an empty bordered square.
7. Remove the "Directory overview / 6 people · 6 to review" band; it restates the breadcrumb count.

## C5. Accessibility and cleanup

- One `<h1>` per route. There are 9 across 47 routes, against 68 `<h2>`. After B1, `PageHeader`
  renders it — verify every route reaches it and demote orphaned `<h2>` page titles.
- 49 `<label>` elements in `src/features`, only 8 `htmlFor`. Associate them.
- Delete dead code: `src/components/ui/workflow-feedback.test.tsx` has no production consumer;
  the empty route directories `(dashboard)/invoices`, `(dashboard)/payments`,
  `(dashboard)/tenant-invoices`, `(dashboard)/finance-dashboard`,
  `(dashboard)/reports/finance-operations` have no `page.tsx`.
- Theme model, three separate defects:
  - the toggle renders only for `role === "super_admin"` (`app-shell.tsx:509`) — every other role is
    locked to the admin's choice;
  - toggling writes to the **organization** (`theme-toggle.tsx:42-61`), so one user's light/dark
    preference changes it workspace-wide. Split mode into a per-user `localStorage` preference; keep
    only the accent preset org-level;
  - two boot scripts race — `layout.tsx:36-47` resolves from `prefers-color-scheme` only, then
    `theme-runtime.tsx:59-72` re-resolves from the org theme, flashing when they disagree. Collapse
    to one script reading the per-user preference first.
- Re-run `npm run test:ui-a11y` and confirm zero axe violations.

---

## Execution order

**A1 → A2 → A3** first: small, mechanical, and A1 fixes controls that are invisible today.

**B1 → B2 → B3 → B4 → B5** is the layout rebuild and will account for most of the perceived quality
jump. B1 and B2 together fix the three-different-left-edges problem; B3 and B4 remove the duplicated
table markup and the vestigial wrapper.

**B6 → B9** consolidate the archetypes. **Part C** is composition and content cleanup and can be
interleaved once the layout is stable.

Report after each phase: files touched, findings deferred, and anywhere the instruction conflicted
with what the code actually does.
