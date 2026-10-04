# Shared spacing cleanup coverage

Base: reviewed `db86c5d09c71c485a5b5d4ad1772cdcc00b51451`, imported from the verified roadmap-reviewed.bundle. Work is isolated in `design/shared-spacing-20261004` in a separate local clone; the source candidate was not edited.

Changes:
- FormSection removes repeated bottom rules, retaining existing group padding, headings, numbered steps and accessible labels.
- CardFooter removes its rule because its shaded background already separates actions; controls can wrap with an 8px gap.
- PageHeader allows desktop wrapping and uses a 12px row gap, avoiding a forced single row for long title/action combinations.

Inventory decisions:
- Repeated FormSection borders inside outer panels: remove the redundant inner rules.
- Card footer border plus shaded background: retain shading, remove the rule.
- Nested card outer rings: retain because independently grouped supporting information needs a boundary.
- Drawer fixed summary/footer borders, warning borders and table row rules: retain for hierarchy and scanning.
- Existing shared gutter/card spacing remains compact (16px mobile gutter/card spacing, 24px tablet gutter, 32px wide gutter); no font sizes or feature text rules changed.
- Toolbars already wrap and shared workspace tests cover their absence of extra bottom rules; no new blanket divider override introduced.

Evidence: `output/playwright/shared-spacing/{before,after}/{320,390,768,1440}.png`, `768-zoom200.png`, `checks.json`, and the generated `fixture.html`. Reproduce with `node node_modules/tsx/dist/cli.mjs scripts/shared-spacing-preview.tsx after`. Uses the installed browser runner as existing repository smoke scripts do, and real shared components with compiled production Tailwind CSS. No Next server, hosted data, credentials, dependencies, or full build are needed. Arial is a controlled fallback, not the signed-in app font.

Coverage checklist:
- [x] Fresh synthetic property, finance, maintenance and settings compositions with long title/name/message content.
- [x] Empty, loading and error states, critical finance values, numbered form grouping and nested supporting panels.
- [x] Before/after screenshots at 320, 390, 768 and 1440; no document horizontal overflow in recorded checks.
- [x] Actual pixels inspected at 320 and 1440 before/after, and 390/768/200% CSS zoom after.
- [x] Table row rules and warning boundaries remain visible.
- [ ] Native browser zoom: CSS zoom is only a synthetic stress check; two-column breakpoint remains active and produces narrow columns at 200%.
- [ ] Live signed-in routes, real production fonts/data, actual feature compositions and browser interaction audit (deferred setup).
- [x] Hydrated shared SideDrawer/FormSection/Card compositions in light and dark mode at 390/1440, long actions, inline warning and actual unsaved dismissal dialog.
- [x] Keyboard Tab reaches the form field and footer action with visible focus; unsaved dialog focuses Keep editing, Tab reaches Discard changes, Escape retains the drawer.
- [ ] Native input scrolling, all card consumers and full platform route coverage; dark-mode verification covers the synthetic drawer only.

Single-line input values scroll natively and are not converted to truncated display labels. No feature-specific text-wrap behavior was changed. Synthetic evidence establishes these shared compositions only, not a live platform audit.

Validation: 23 tests passed in workspace-layout and side-drawer-confirmation with `--maxWorkers=1`; scoped ESLint, `tsc --noEmit --incremental false`, and `git diff --check` passed. Existing installed dependencies were reused through a local junction; no installation or dependency change. Chromium required sandbox escalation for local process launch; the approved run used only synthetic HTML.

## Drawer follow-up

The first hydrated drawer check found three mobile action buttons outside their card/drawer footer boundaries, despite no document overflow. CardFooter and SideDrawer footer now constrain button/link widths and allow multi-line labels at the existing font size. Drawer summary/footer separators remain intact. The original commit `c714d761` is preserved; this correction is a follow-up commit.

`scripts/shared-drawer-capture.mjs drawer-after` bundles the actual shared client components using the installed esbuild, compiles the existing CSS and opens synthetic HTML in Chromium. Animations are disabled for stable capture. `drawer-before` records the initial candidate and `drawer-after` records the correction, with light/dark 390/1440 focus and unsaved screenshots and measured `checks.json`. All four corrected configurations report no action-boundary overflow; warning focus, Tab navigation and Escape retention checks pass. Actual before/after mobile pixels and all corrected theme/width focus and warning pixels were inspected. The action-focus capture also scrolls the content to expose the nested card action.

Library direct single-file creation succeeded for `dark-390-actions-focus.png`, identity `libfile_31afcdcb4c148191bf99900e27644656`, returned File Service id `file_00000000309081f8b0134c453e964d85`. No public URL was returned or invented. The skill metadata helper could not run because Python is unavailable; the upload itself succeeded, but local Library xattrs were not applied.

Follow-up validation: 53 tests passed in workspace-layout, side-drawer-confirmation and workflow-feedback with one worker. Scoped ESLint and TypeScript passed after the correction. The standalone capture script lint was also rerun after its keyboard screenshot refinement.
