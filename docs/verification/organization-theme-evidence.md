# Organization theme verification

Verified locally on 2026-08-09 from `codex/organization-theme`.

## Automated gates

- Local Supabase reset and schema lint passed.
- Generated database types matched the reset schema.
- 31 pgTAP files passed (946 assertions) after loading the documented baseline fixture.
- ESLint and TypeScript passed.
- UI copy and route coverage passed (47/47 page routes).
- Vitest passed: 176 files, 1,256 tests passed, 1 skipped.
- The production Next.js build passed with the root checkout's local environment injected into the isolated worktree process.

## Browser verification

Playwright CLI was run against the local fixture at 1440x900 and 1280x800 in both full-page Light and Dark modes.

- Properties: graphite page, panel, toolbar, table, and footer surfaces remain visually distinct without black/gray banding.
- Finance: summary cards, work table, navigation, and primary actions use the same surface hierarchy.
- Maintenance: list controls and rows remain dense and readable; semantic warning/status colors remain independent of the organization accent.
- Timeline: record links use the accessible interaction token rather than the background-accent token.
- Settings / Appearance: Super Admin can preview presets without mutating the workspace, save a preset, refresh, and retain the saved choice.
- The header quick toggle persists the organization mode, immediately reapplies the saved theme after the server action, and refreshes the settings data so the workspace and Theme mode selector do not disagree.
- Forest was used as the non-neutral verification preset. Primary/link contrast is derived to at least 4.5:1 against the active light or dark workspace background.

Preset accent/background ratios ranged from 5.49:1 to 17.53:1 in Light and 4.59:1 to 16.86:1 in Dark. Representative custom seeds (`#000000`, `#FFFFFF`, `#808080`, `#FFFF00`, and `#2563EB`) were also derived above 4.5:1 in both modes; unsafe seeds are automatically lightened or darkened for the active surface.

The People fixture route currently reaches its existing error boundary because its loader selects the retired `leases.tenant_name` column. This predates and is outside the organization-theme change; the shared shell and error surface still demonstrated the new graphite hierarchy.

## Product boundary

- Nestory defaults to neutral black and white with system light/dark mode.
- An organization stores one theme for all members.
- Only Super Admin can change organization appearance.
- Presets and custom hex input derive interaction colors; custom input cannot redefine structural surfaces or semantic success, warning, danger, and informational colors.
