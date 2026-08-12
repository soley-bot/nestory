# Nestory UI/UX Audit — 2026-08-12

Scope: full sweep of `src/app`, `src/components`, `src/features`, `src/app/globals.css`.
Method: static read of all 47 routes and the shared design system, plus visual review of the
captured evidence in `output/design-audit-2026-08-04/` (12 desktop screens at 1280×720) and
`artifacts/ui-redesign/2026-07-20-people-clean-workspace/03-mobile.png`.

**No code was changed.** Every finding below cites a file and, where relevant, a line.

---

## 0. Executive summary

The product is not suffering from bad taste. It is suffering from **four missing constraints**:

1. **No enforced layout primitive.** `WorkspacePage` exists but ~8 major surfaces bypass it and
   invent their own header, gutter, and height strategy. That is why gutters do not line up.
2. **No enforced type scale.** The three typography tokens defined in `globals.css` are used
   **zero** times, while 216 hardcoded `text-[Npx]` values fight 1,090 Tailwind scale classes.
3. **A semantic-token regression.** `--accent` was redefined on 2026-08-09 from an accent
   *colour* to a soft *surface* tint, but ~59 call sites still use it as a foreground colour.
   Several controls are now literally invisible.
4. **Prose is being used as a UI element.** 588 sentence-length strings ship in the product
   surface, including 42 machine-generated "readiness" checks that restate data already on screen.

Fixing 1–3 is mechanical and will remove most of the "looks bad" feeling. Fixing 4 is an editorial
pass. Section 8 ranks all of it.

---

## 1. Severity 1 — Confirmed broken rendering

### 1.1 `bg-accent text-accent` renders an invisible control

The "Filters" button paints its label in the same token as its background whenever a filter is
active.

- [people-filters.tsx:112](src/features/people/components/people-filters.tsx:112)
- [property-filters.tsx:177](src/features/properties/components/property-filters.tsx:177)
- [unit-filters.tsx:122](src/features/units/components/unit-filters.tsx:122)

```
hasAdvancedFilters && "border-accent bg-accent text-accent hover:bg-accent"
```

`--accent` is assigned at runtime in
[organization-theme.ts:128](src/lib/theme/organization-theme.ts:128) as
`color-mix(in oklch, <seed> 18%, <background>)` — a near-background surface tint. Foreground and
background therefore resolve to the same colour. Contrast ≈ 1.0:1.

The active-filter count chip on [people-filters.tsx:119](src/features/people/components/people-filters.tsx:119)
has the same defect (`bg-accent … text-background`, ≈ 1.4:1).

### 1.2 `text-accent` is used as a link colour on a surface token

59 occurrences of `text-accent` / `border-accent` / `outline-accent` / `ring-accent` treat
`--accent` as a chromatic accent. Since the 2026-08-09 change (`d99ccd1 feat(theme): finish
organization theme controls`) it is a background tint, so these are near-invisible in **both**
light and dark:

- light: `color-mix(seed 10%, #FFFFFF)` text on a white card → ≈ 1.1:1
- dark: `color-mix(seed 18%, #101313)` text on `#151919` → ≈ 1.2:1

Highest-traffic call sites:

| File | Count |
|---|---|
| [petty-cash-screen.tsx](src/features/petty-cash/components/petty-cash-screen.tsx) | 5 |
| [timeline-inspector.tsx](src/features/timeline/components/timeline-inspector.tsx) | 4 |
| [maintenance-board-surface.tsx](src/features/maintenance/components/maintenance-board-surface.tsx) | 4 |
| [maintenance-breakdown.tsx](src/features/maintenance/components/maintenance-breakdown.tsx) | 3 |
| [document-screen.tsx](src/features/documents/components/document-screen.tsx) | 3 |
| [searchable-select-control.tsx](src/components/ui/searchable-select-control.tsx) | 3 |
| [ledger-table.tsx](src/features/ledger/components/ledger-table.tsx), [ledger-inspector.tsx](src/features/ledger/components/ledger-inspector.tsx), [lease-inspector.tsx](src/features/leases/components/lease-inspector.tsx), [person-select.tsx](src/features/people/components/person-select.tsx), [date-picker-field.tsx](src/components/ui/date-picker-field.tsx), [file-dropzone-field.tsx](src/components/ui/file-dropzone-field.tsx), … | 2 each |

The correct pairs already exist and are used correctly inside
[dropdown-menu.tsx](src/components/ui/dropdown-menu.tsx) and [select.tsx](src/components/ui/select.tsx):
`bg-accent` + `text-accent-foreground`. For a chromatic accent the token is `--primary`
(or `--org-accent-seed`).

**Evidence of the regression:** in `output/design-audit-2026-08-04/05-leases.png` (captured 5 days
*before* the token change) tenant links render green. That green no longer resolves.

### 1.3 Nested scroll containers / double scrollbars

`AppShell` already owns the page scroller:

- [app-shell.tsx:496](src/components/layout/app-shell.tsx:496) — `SidebarInset` is `h-svh … overflow-hidden`
- [app-shell.tsx:515](src/components/layout/app-shell.tsx:515) — content region is `overflow-y-auto`

Six screens then declare a **second** viewport-height scroller inside it:

| File | Class |
|---|---|
| [overview-screen.tsx:29](src/features/overview/components/overview-screen.tsx:29) | `h-full … overflow-y-auto` |
| [person-detail-screen.tsx:82](src/features/people/components/person-detail-screen.tsx:82) | `min-h-screen lg:h-screen lg:overflow-hidden` |
| [property-detail-screen.tsx:38](src/features/properties/components/property-detail-screen.tsx:38) | `min-h-screen lg:h-screen lg:overflow-hidden` |
| [unit-detail-screen.tsx:49](src/features/units/components/unit-detail-screen.tsx:49) | `min-h-screen lg:h-screen lg:overflow-hidden` |
| [people-screen-skeleton.tsx:13](src/features/people/components/people-screen-skeleton.tsx:13) | `min-h-screen lg:h-screen lg:overflow-hidden` |
| [import-preview-screen.tsx:222](src/features/imports/components/import-preview-screen.tsx:222) | `min-h-screen` + `lg:max-h-[calc(100vh-112px)] lg:overflow-auto` |

`100vh` inside a region whose height is already `100svh − 48px header` guarantees a 48px overflow
and a second scrollbar. **Visible in `01-overview.png`: two scrollbars at x≈1262 and x≈1272.**

Two more pages wrap the screen in another `min-h-screen`:
[maintenance/page.tsx:69](src/app/(dashboard)/maintenance/page.tsx:69),
[tasks/page.tsx:75](src/app/(dashboard)/tasks/page.tsx:75).

### 1.4 Hardcoded chrome-height magic numbers

Four different, mutually inconsistent assumptions about how tall the app chrome is, none of which
reference `--header-height` (declared as `calc(var(--spacing) * 12)` at
[app-shell.tsx:352](src/components/layout/app-shell.tsx:352)):

- `calc(100vh-310px)` — [maintenance-board-surface.tsx:122,326](src/features/maintenance/components/maintenance-board-surface.tsx:122), [petty-cash-screen.tsx:513](src/features/petty-cash/components/petty-cash-screen.tsx:513)
- `calc(100vh-320px)` — [ledger-table.tsx:28](src/features/ledger/components/ledger-table.tsx:28), [timeline-table.tsx:31](src/features/timeline/components/timeline-table.tsx:31), [document-screen.tsx:468](src/features/documents/components/document-screen.tsx:468)
- `calc(100vh-350px)` — [maintenance-screen.tsx:1165](src/features/maintenance/components/maintenance-screen.tsx:1165)
- `calc(100vh-112px)` — [import-preview-screen.tsx:228](src/features/imports/components/import-preview-screen.tsx:228)

### 1.5 Horizontal overflow on the Workspace Access screen

`12-workspace-access.png` shows the right-hand column clipped at the viewport edge — the
"Access scope" header and its cards run past x=1280 with no scroll container.
Source: [access-settings-screen.tsx](src/features/organization/components/access-settings-screen.tsx).

### 1.6 Filter popover background narrower than its content

`11-leases-filters.png`: the filter panel's tinted background terminates at x≈1018 while the
last two controls (`Newest start`, `50`) extend to x≈1223. The panel surface and the control row
are laid out by different parents.
Source: [lease-filters.tsx](src/features/leases/components/lease-filters.tsx).

---

## 2. Severity 1 — Layout system

### 2.1 Two competing page shells

`WorkspacePage` ([workspace-page.tsx](src/components/layout/workspace-page.tsx)) is the intended
primitive: it owns the header slot, the local-nav slot, the toolbar slot, and the flex/height
contract. **12 screens use it. 8 major surfaces do not:**

`overview-screen`, `overview-detail-page`, `account-screen`, `organization-settings-screen`,
`access-settings-screen`, `person-detail-screen`, `property-detail-screen`, `unit-detail-screen`,
`import-preview-screen`, `rent-policy-screen`.

Consequence, visible in the screenshots: three different left gutters on one page.
In `04-people.png` the table container starts at **x=220**, the search field at **x=232**, and
the tab row at **x=240**.

### 2.2 Gutter values are not from a scale

Root-container padding pairs found in `src/features`:

```
190×  px-3 py-2      41×  px-3 py-3      38×  px-4 py-3      28×  px-4 py-5
28×  px-4 py-2       23×  px-4 py-4      17×  px-2 py-2      14×  px-4 py-8
+ px-5 py-4, px-5 py-5, px-3 py-4, px-4 py-1, px-3 py-8, px-1 py-2, px-5 py-3 …
```

`WorkspacePage` and `PageHeader` use `px-4 lg:px-6`; `ModuleLoading` uses `px-4 sm:px-6 lg:px-6`;
`overview-screen` uses `px-4 sm:px-6`. Three different responsive gutter ramps for the same edge.

### 2.3 Local navigation is implemented three different ways

- `LocalWorkspaceNav` ([local-workspace-nav.tsx](src/components/layout/local-workspace-nav.tsx)) —
  used by **People only**.
- Finance ships a horizontal tab row **plus a "More ▾" overflow menu** (`05-leases.png`).
- Maintenance ships a tab row **plus a second row of count chips** (`06-maintenance.png`).
- Records ships **no local nav at all**, despite having 6 sidebar children (`07-records.png`).
- Settings ships **three** nav levels for six destinations: sidebar → `Workspace / Workspace
  Access` tabs → a bordered left-rail card (`08-settings.png`).

### 2.4 Sidebar sub-navigation duplicates local navigation

`FINANCE_CHILDREN` ([app-shell.tsx:77-85](src/components/layout/app-shell.tsx:77)) lists
Finance work / Rent / Expenses / Owner balances / Leases / Ledger / Petty cash. The Finance local
nav lists the same destinations in a different order under different labels, and hides two behind
"More". Users get two disagreeing menus for the same level.

`Reports` appears both as a global sidebar destination and as a Finance local-nav item.

### 2.5 Sidebar expansion state is destroyed on every navigation

[app-shell.tsx:417](src/components/layout/app-shell.tsx:417):

```jsx
key={`${destination.id}:${pathname}`}
```

The key includes `pathname`, so every route change remounts `DomainDestinationMenuItem` and resets
`useState(active)` at [app-shell.tsx:272](src/components/layout/app-shell.tsx:272). A user who
expands Maintenance while working in Finance loses it on the next click; a user who collapses the
active domain sees it re-expand.

---

## 3. Severity 2 — Design tokens and visual consistency

### 3.1 The typography tokens are dead code

`globals.css` declares `--type-body: 14px`, `--type-table: 13px`, `--type-table-header: 11px` and
exposes them at [globals.css:231-233](src/app/globals.css:231) as `text-body`, `text-table`,
`text-table-header`.

**Usage across the whole repo: 0.**

What ships instead:

| | Count |
|---|---|
| `text-sm` | 593 |
| `text-xs` | 416 |
| `text-[13px]` | 98 |
| `text-[11px]` | 67 |
| `text-base` | 32 |
| `text-[10px]` | 19 |
| `text-[12px]` | 15 |
| `text-[15px]` | 8 |
| `text-[9px]` | 7 |
| `text-[8px]` | 2 |

Ten distinct body-text sizes, four of them below 12px. `text-[8px]` and `text-[9px]` are not
legible at normal viewing distance.

### 3.2 Primary actions use the wrong token

`bg-foreground text-background` — 25 occurrences, vs `bg-primary` — 8.

`bg-foreground` is not a button token; it is the body-text colour. Using it as a fill means the
primary action cannot be re-themed by the organization accent system, which *does* drive
`--primary` ([organization-theme.ts:130](src/lib/theme/organization-theme.ts:130)).

Files: [overview-screen.tsx:41](src/features/overview/components/overview-screen.tsx:41),
[person-detail-screen.tsx](src/features/people/components/person-detail-screen.tsx),
[property-detail-screen.tsx:55](src/features/properties/components/property-detail-screen.tsx:55),
[unit-detail-screen.tsx:66](src/features/units/components/unit-detail-screen.tsx:66),
[property-detail-view.tsx](src/features/properties/components/property-detail-view.tsx),
[unit-detail-view.tsx](src/features/units/components/unit-detail-view.tsx),
[property-setup-screen.tsx](src/features/property-setup/components/property-setup-screen.tsx),
[login-form.tsx](src/features/auth/components/login-form.tsx),
[accept-invite/page.tsx](src/app/accept-invite/page.tsx), [no-access/page.tsx](src/app/no-access/page.tsx).

### 3.3 Controls are hand-rolled rather than composed

- `Button` is imported by 57 files, but there are **80** hand-written
  `inline-flex … rounded-md …` button clones outside `components/ui/`, plus **73** raw `<button>`
  elements in `src/features` and `src/app`.
- **129** raw `<input>` elements in features, while `Input` and `SearchInput` exist.
  `SearchInput` ([search-input.tsx](src/components/ui/search-input.tsx)) has **zero** consumers.
- `Card` is imported by **8** files; there are **318** hand-rolled `border border-border` panels.

This is why hover, focus-visible, disabled, and height differ between adjacent buttons on the
same toolbar.

### 3.4 Two container treatments and four radii coexist

`Card` uses `rounded-xl` + `ring-1 ring-foreground/10` and **no** border
([card.tsx](src/components/ui/card.tsx)). Hand-rolled panels use `rounded-md` +
`border border-border`. `Button` uses `rounded-lg`.

```
rounded-md  462      rounded-lg   47      rounded-full 34
rounded-sm   28      rounded-xl    7      rounded-none  6
```

Elevation is equally unmanaged: `shadow-sm` 36, bare `shadow-` 28, `shadow-lg` 19, `shadow-xl` 5,
`shadow-md` 2, `shadow-xs` 1, `shadow-2xl` 1.

### 3.5 Table header casing is inconsistent inside a single table

`02-properties.png`, one table: `Property ↑` · `OWNER` · `OCCUPANCY` · `Net ↕` · `OPEN` ·
`Status ↕`. Sortable columns render sentence-case; non-sortable render uppercase. It reads as a
rendering bug.

### 3.6 Theme is an organization setting, and most users cannot change it

- [app-shell.tsx:509](src/components/layout/app-shell.tsx:509): the toggle renders only for
  `role === "super_admin"`. Every other role is locked to whatever the admin picked.
- [theme-toggle.tsx:42-61](src/components/theme-toggle.tsx:42): toggling writes to the
  organization via `updateOrganizationAppearanceAction`, i.e. one user's light/dark preference
  changes it **for the whole workspace**.
- Two boot scripts race: [layout.tsx:36-47](src/app/layout.tsx:36) sets the theme from
  `prefers-color-scheme` only, ignoring any stored preference; then
  [theme-runtime.tsx:59-72](src/components/theme-runtime.tsx:59) re-resolves it from the org
  theme. Expect a flash on first paint whenever the org mode differs from the OS.

---

## 4. Severity 2 — Copy ("flavor text")

The existing guard, [scripts/verify-ui-copy.mjs](scripts/verify-ui-copy.mjs), checks **five literal
phrases** ([config/ui-copy-rules.json](config/ui-copy-rules.json)) and currently passes. It does
not measure the actual problem.

**588** sentence-length strings (≥45 chars, capitalised, terminated with a period) ship in
`src/features` + `src/app`, excluding marketing.

### 4.1 Machine-generated readiness prose — the biggest single source

Nine data modules build "check" arrays whose every entry carries a full-sentence `description`:

| Module | Checks |
|---|---|
| [people.ts:2288-2337](src/features/people/data/people.ts:2288) | 6 |
| [ledger.ts](src/features/ledger/data/ledger.ts) | 6 |
| [unit-summary.ts](src/features/units/data/unit-summary.ts) | 5 |
| [timeline.ts](src/features/timeline/data/timeline.ts) | 5 |
| [property-detail.ts](src/features/properties/data/property-detail.ts) | 5 |
| [lease-summary.ts](src/features/leases/data/lease-summary.ts) | 5 |
| [overview.ts](src/features/overview/data/overview.ts) | 4 |
| [trusted-report.ts](src/features/reports/data/trusted-report.ts) | 3 |
| [documents.ts](src/features/documents/data/documents.ts) | 3 |

`10-person-record.png` shows the result: a right rail of five stacked cards occupying ~40% of the
record page, each reading like documentation —

> **Active directory record** · Ready · "This person is visible in normal operational views."
> **Role assigned** · Ready · "At least one active tenant, owner, vendor, or staff role is assigned."
> **Contact ready** · Ready · "A usable email or phone is available for follow-up."
> **Operational links** · Ready · "This person is connected to lease, ownership, or vendor context."
> **Evidence missing** · Review · "No related lease, property, or unit documents are attached yet."

Each one restates a field already visible in the left column. Worse, in the same viewport the
`PHONE` field shows an amber **No phone** badge while the rail asserts **Contact ready**. The rail
and the record contradict each other.

### 4.2 Sub-labels that restate the cell above them

`04-people.png`, every row: `dara.sok@example.test` / "Email on file"; `Individual` under a person
name; "Needs phone" under "No phone"; "Company" under "No linked records".

`05-leases.png`, every row: the tenant name is printed, then printed again immediately beneath it
as its own sub-label.

### 4.3 Empty states that say the title twice

- "No cases yet" / "No cases are available in this workspace." (`06-maintenance.png`)
- "No timeline events yet" / "Add the first dated event to this history." (`07-records.png`)
- "No people yet" / "No people records are available in this workspace." (mobile capture)

The `EmptyState` primitive ([empty-state.tsx](src/components/ui/empty-state.tsx)) is well built.
The `body` copy passed to it is the problem.

### 4.4 A helper sentence under every form field

`12-workspace-access.png`:
"The employee or contractor this login belongs to." / "The address used to sign in and receive the
invitation." / "What this person may administer in Nestory." — under `Staff member`,
`Invitation email`, `Access level` respectively.

### 4.5 Headings written as sentences

[overview-screen.tsx:32](src/features/overview/components/overview-screen.tsx:32):
`<h1>Start with your operating records.</h1>` — trailing period in an H1.

### 4.6 Section descriptions that add nothing

`01-overview.png`: "Properties" / "Occupancy and current operating records."
`08-settings.png`: "Organization identity is read-only here."

---

## 5. Severity 2 — Information design

### 5.1 Duplicated data side by side

`08-settings.png`: the middle card "Organization identity" shows Workspace / Subdomain / Branches 1
/ Teams 0. The right card "Workspace scope" shows Scope / Branches 1 / Teams 0 / "Draft: Read only".
Same three values, twice, adjacent — and the right card wraps the workspace name over two lines
while the left card fits it on one.

### 5.2 Status columns that carry no information

`04-people.png`: a green **Active** badge on all six rows. `05-leases.png`: green **Active** on
both rows. A column where every value is identical is pure noise.

### 5.3 Warning colour applied to optional fields

`04-people.png`: amber "No phone / Needs phone" on **all six** rows. Amber is the same tone used
for `MISSING DOCS` and `ENDING RISK` in the leases KPI strip. Using it for an optional contact
field destroys its meaning everywhere else.

### 5.4 KPI strips that report zero

`05-leases.png`: seven cells — `THIS PAGE` (a label masquerading as a metric), `LEASES 2`,
`CURRENT 2`, `ENDING RISK 0`, `TENANT GAPS 0`, `MISSING DOCS 2`, `RENT AT RISK $0`. Five of seven
are 0 or duplicate. `06-maintenance.png`: six filter chips reading `Inbox 0`, `Review 0`,
`Overdue 0`, `Upcoming 0`, `Completed 0`, `All 0`.

The `THIS PAGE` scoping is also wrong for a portfolio metric — "rent at risk" for the current
page of results is not a number anyone can act on.

### 5.5 Actions rendered as data

`05-leases.png`: "Attach evidence" appears as plain text inside the STATUS column, under the badge.
`02-properties.png`: the `OPEN` column value is "Clear", which reads as a button.

### 5.6 Redundant search affordances

Every list screen renders a search field and, immediately to its right, a separate icon-only
submit button (`02`, `04`, `05`, `06`, `07`). The field already submits on Enter
([people-filters.tsx:95](src/features/people/components/people-filters.tsx:95)).

### 5.7 The filter popover has an inert "Done" button

[people-filters.tsx:237-246](src/features/people/components/people-filters.tsx:237) renders a
`Done` button, but every `SelectControl` already calls `replaceParam` → `router.replace` on change.
Nothing is pending, so "Done" implies an apply step that does not exist. Reset is also duplicated:
once inside the popover (line 141) and once outside it (line 251).

`activeFilters` ([people-filters.tsx:44-49](src/features/people/components/people-filters.tsx:44))
counts `sort` and `pageSize` as filters, so changing rows-per-page raises a filter badge.

### 5.8 Empty thumbnails

`02-properties.png`: each row carries an empty bordered square where a property image would be —
no image, no placeholder glyph, no initials.

### 5.9 Sidebar label does not match page title

Sidebar says **Records**; the page breadcrumb says **Timeline History** (`07-records.png`), which
is also the only Title Case string in a sentence-case app.

---

## 6. Severity 2 — Responsive and mobile

Evidence: `artifacts/ui-redesign/2026-07-20-people-clean-workspace/03-mobile.png`.

1. **Two stacked horizontal scrollbars.** The global nav collapses to a horizontally scrolling
   strip, and the local tab row is a second horizontally scrolling strip directly beneath it.
   `LocalWorkspaceNav` is `overflow-x-auto` with `min-w-max`
   ([local-workspace-nav.tsx:62-65](src/components/layout/local-workspace-nav.tsx:62)) and offers
   no fade, chevron, or overflow menu — only a native scrollbar.
2. **The toolbar consumes ~40% of the viewport** before any content: search row, Filters row,
   Add person row, each full width.
3. **Duplicate CTA:** "Add person" appears in the toolbar and again inside the empty state on the
   same screen.
4. **Floating avatar button** overlaps content bottom-left.
5. Only **3** responsive-hide utilities (`hidden md:block`) exist in the entire codebase, against
   **20** fixed `min-w-[600–980px]` table wrappers and only **13** `overflow-x-auto` containers —
   so several wide tables have no scroll parent at all.
6. `LocalWorkspaceNav` calls `scrollIntoView` on mount
   ([local-workspace-nav.tsx:29](src/components/layout/local-workspace-nav.tsx:29)); with
   `block: "nearest"` this can nudge the page vertically on load.

---

## 7. Severity 3 — Accessibility and states

- **Heading hierarchy:** 9 `<h1>` across 47 routes, against 68 `<h2>` and 29 `<h3>`. Most pages
  have no H1; `07-records.png` and `06-maintenance.png` have only a breadcrumb.
- **Form labels:** 49 `<label>` elements but only 8 `htmlFor` attributes in `src/features`.
- **Loading skeletons do not match their pages.** 22 `loading.tsx` files exist; **20** of them use
  the default `kind="list"` skeleton ([module-loading.tsx:85-111](src/components/layout/module-loading.tsx:85)),
  which renders a 4-column list with no local nav and no KPI strip. Real list pages render a local
  nav, a 6–7 cell KPI strip, and a 6–7 column table. Every navigation produces a visible layout jump.
  Only [overview/loading.tsx](src/app/(dashboard)/overview/loading.tsx) and
  [reports/loading.tsx](src/app/(dashboard)/reports/loading.tsx) pass a `kind`.
- **Overlay primitive sprawl:** seven overlay components ship; `side-drawer` (20 files) and `modal`
  (5) carry the load, while `dialog` (1), `alert-dialog` (1), `confirmation-dialog` (1),
  `record-quick-view-dialog` (1), and `sheet` (2) are near-dead. Focus-return and Escape behaviour
  differ between them.
- **Dead component:** [workflow-feedback.test.tsx](src/components/ui/workflow-feedback.test.tsx)
  exists with **zero** production consumers.
- **Orphan route directories** with no `page.tsx`: `(dashboard)/invoices`, `(dashboard)/payments`,
  `(dashboard)/tenant-invoices`, `(dashboard)/finance-dashboard`, `(dashboard)/reports/finance-operations`.
- **Contrast:** `--muted-foreground: oklch(0.556 0 0)` on white measures **4.73:1** — it passes AA
  for normal text but only just, and it is applied to `text-[9px]`/`text-[10px]` content where it
  becomes unreadable in practice.
- **Nested boxes:** `09-property-record.png` shows four levels of bordered container (page frame →
  tab-bar card → "Property context" card → "Owners and leases" card → "Ownership history" sub-card).
  Tabs should never live inside a bordered card.
- **Broken definition grid:** same screenshot — the 4-column `dl` breaks because the `RECORDS`
  value ("2 ledger / 0 timeline / 0 maintenance / 0 docs") wraps to two lines, leaving `NOTES`
  alone on a row with three empty columns and the value "No operating notes recorded".

---

## 8. Recommended order of work

| # | Work | Why first | Effort |
|---|---|---|---|
| 1 | Fix `--accent` misuse (§1.1, §1.2) | Controls are invisible today | S |
| 2 | Delete every `100vh`/`h-screen`/`min-h-screen` inside `(dashboard)` (§1.3, §1.4) | Double scrollbars on every detail page | S |
| 3 | Force all dashboard screens through `WorkspacePage` (§2.1, §2.2) | Fixes the misaligned gutters that read as "not properly laid out" | M |
| 4 | Replace 216 `text-[Npx]` with a 5-step scale; kill `text-[8px]`/`[9px]`/`[10px]` (§3.1) | Single largest visual-noise source | M |
| 5 | Delete/collapse the readiness rails (§4.1) | Removes ~40% of two record pages and 42 prose strings | M |
| 6 | Copy pass: sub-labels, empty states, field helpers, section descriptions (§4.2–4.6) | | M |
| 7 | Route all buttons/inputs through `Button`/`Input` (§3.3) | | M |
| 8 | One local-nav component; delete the Settings third nav level (§2.3, §2.4) | | M |
| 9 | Per-page skeletons matching real layout (§7) | | M |
| 10 | Mobile: replace scrolling nav strips, collapse the toolbar (§6) | | L |
| 11 | Per-user theme preference; expose the toggle to all roles (§3.6) | | M |
| 12 | Extend `verify-ui-copy.mjs` from 5 literals to real rules (§4) | Prevents regression | S |

The precise, executable instruction set for this work is in
[docs/codex-ui-ux-remediation-prompt.md](docs/codex-ui-ux-remediation-prompt.md).
