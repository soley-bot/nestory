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

Playwright CLI was run against the local fixture at 1440x900 and 1280x800.

- Properties: graphite page, panel, toolbar, table, and footer surfaces remain visually distinct without black/gray banding.
- Finance: summary cards, work table, navigation, and primary actions use the same surface hierarchy.
- Maintenance: list controls and rows remain dense and readable; semantic warning/status colors remain independent of the organization accent.
- Timeline: record links use the accessible interaction token rather than the background-accent token.
- Settings / Appearance: Super Admin can preview presets without mutating the workspace, save a preset, refresh, and retain the saved choice.
- Forest was used as the non-neutral verification preset. Primary/link contrast is derived to at least 4.5:1 against the active light or dark workspace background.

The People fixture route currently reaches its existing error boundary because its loader selects the retired `leases.tenant_name` column. This predates and is outside the organization-theme change; the shared shell and error surface still demonstrated the new graphite hierarchy.

## Product boundary

- Nestory defaults to neutral black and white with system light/dark mode.
- An organization stores one theme for all members.
- Only Super Admin can change organization appearance.
- Presets and custom hex input derive interaction colors; custom input cannot redefine structural surfaces or semantic success, warning, danger, and informational colors.
