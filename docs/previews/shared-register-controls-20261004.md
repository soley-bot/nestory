# Frequent-use shared controls

Follow-on base: `e92c05f660b52f79ef0f8475ed1ee3aef770d1d5`. Earlier shared-spacing commits remain intact. This commit changes shared components only; no feature files, query handlers, routing logic, business rules or permissions changed.

Scope and outcome:
- SearchCombo takes its own row on small screens and a flexible 20rem basis above the small breakpoint, preventing a neighboring filter label from collapsing the input. The existing scope divider remains because it separates two controls. Scope width no longer shrinks away.
- Shared suggestion labels/descriptions wrap instead of truncating. Metadata stacks beneath the label on small screens, and the popup scrolls at a bounded height. Keyboard selection, composition handling, clear and submit handlers are unchanged.
- FilterPopover trigger can wrap long labels; its popup keeps 16px viewport collision gutters. Its boundary remains necessary for overlay hierarchy.
- Table header/cell horizontal padding now matches the 12px pagination gutter, preserving compact row height, row separators, numeric alignment and all columns. Named scroll regions gain visible inset keyboard focus.
- RecordLink exposes full long record names with a first-line external-link icon. Increased row height for long names is deliberate; amounts and actions retain their own columns.
- Pagination wraps its grouping before crowded controls overflow, keeps the page count together, uses tabular numbers and shows keyboard focus on active links. Href construction and disabled semantics are unchanged.

Evidence: `output/playwright/shared-spacing/register-before` and `register-after` contain 320/390/768/1440 screenshots for ready, search focus, filters, table scroll focus, loading, empty and error states, plus HTML and checks.json. Before bundling uses the exact five component sources from `e92c05f` through a read-only esbuild overlay; after uses the working files. Both render the same synthetic fixture, installed React/Radix components and production Tailwind CSS. A small Next navigation/link adapter supplies a fixed local route/query and ordinary anchors; this is not a live routing audit. Animations are disabled and Arial is a controlled font fallback.

Loading/empty/error are synthetic panel messages outside the wide table, rather than simulating feature-specific state-row behavior. The fixture's wide ready table deliberately requires horizontal scrolling. The scrolling screenshot first verifies ArrowRight changes scrollLeft, then scrolls fully right to expose complete amounts and row actions.

Coverage checklist:
- [x] Typical and long property names, long suggestions/messages, large amounts/counts, scope + search + filters, pagination and row actions.
- [x] Fresh matching before/after screenshots at 320/390/768/1440.
- [x] Actual before/after 390 and 1440 ready/search pixels inspected; after 320/768 layouts, mobile filters, scrolled amounts/actions and mobile/desktop loading/empty/error pixels inspected.
- [x] ArrowDown activates a search suggestion; Escape closes it. Keyboard opens/closes filter popover.
- [x] Named table region focuses and ArrowRight scrolls at 320/390/768; 1440 needs no scroll. No document horizontal overflow at any recorded width.
- [x] Table row separators and error boundaries remain visible. Long labels are readable without smaller font sizes or hidden columns.
- [x] 22 focused tests pass with one worker across search-combo, table, pagination-controls, interactive-table and filter-navigation. Scoped ESLint, TypeScript and diff whitespace checks pass.
- [ ] Live signed-in routes, actual feature toolbars/tables, production fonts, native zoom, dark-mode frequent-use controls and all shared consumers.
- [ ] Server search/navigation, real record actions, feature-specific state-row handling and all unbroken-reference extremes; no claim of live audit.

Coordination boundary: only `src/components/ui/{search-combo,filter-popover,table}.tsx` and `src/components/data/{pagination-controls,interactive-table}.tsx` were edited. No feature-specific wrap rules were touched. A cross-thread messaging tool was unavailable in this execution context, so this inventory was reported to the coordinator in progress updates.

Library save succeeded for `shared-register-mobile-search-focus-390.png`, showing the full mobile search row, readable long suggestions and visible keyboard focus. Confirmed identity: `libfile_a244a8d8e10c81918eac7284aa8d7074`; File Service id `file_00000000a8d881f598c82ad38858c977`. The old drawer image was not uploaded again. Python is unavailable, so local Library metadata writeback failed; upload success does not imply local xattrs were persisted. No URL was invented.
