# Organization Theme And Dark Surface Design

## Outcome

Nestory keeps a neutral black-and-white identity by default while allowing a
Super Admin to choose one organization-wide accent theme. Dark mode uses one
deliberate graphite surface hierarchy across every authenticated workspace.
Accent choices never recolor structural surfaces or semantic status colors.

## Product Boundary

- The organization has one shared theme configuration; individual members do
  not have personal accent themes.
- The Super Admin can choose the organization theme mode: `light`, `dark`, or
  `system`.
- The Super Admin can choose a curated accent preset or enter a custom hex
  color. Nestory's default preset is neutral black-and-white.
- The header theme toggle remains a convenient preview/control, but the saved
  organization setting is authoritative for authenticated workspaces.
- Success, warning, danger, financial meaning, and record-state colors are not
  derived from the accent seed.
- Public marketing, authentication photography, and the workspace-arrival
  composition retain their purpose-built palettes.

## Surface Hierarchy

Dark mode stops mixing the stock Shadcn grayscale with separate partial dark
overrides. Existing semantic tokens remain the public component contract, but
their values follow one graphite hierarchy:

| Role | Default dark value | Use |
| --- | --- | --- |
| Canvas | `#101313` | App shell, page header, workspace background |
| Work surface | `#151919` | Registers, empty work areas, default content |
| Raised surface | `#1b2020` | Cards, inputs, segmented controls |
| Interactive surface | `#242a29` | Hover, selected, pressed |
| Border | `#343b3a` | Restrained component and region boundaries |
| Primary text | `#f1f4f2` | Headings and primary content |
| Secondary text | `#aeb7b3` | Supporting labels and metadata |

The shared `WorkspacePage` uses the canvas directly instead of blending
`muted` with opacity. A register or intentionally grouped work area may use the
work surface. Raised color is reserved for controls and compact cards; it does
not become another full-width page band. Overlays remain the lightest dark
surface and retain a shadow.

This follows the dark-layering rule used by Carbon and Atlassian: higher layers
become incrementally lighter, while borders or whitespace separate flat
regions. Text and meaningful component states retain WCAG 2.2 contrast.

## Accent Model

The accent value is a seed, not a raw replacement for every color token.

Curated choices are Neutral, Forest, Ocean, Indigo, Plum, and Terracotta.
Neutral is the Nestory default. A custom hex color is an advanced choice shown
beside the presets.

The seed deterministically derives a constrained accent family in OKLCH:

- primary action background and readable foreground;
- hover and pressed action states;
- selected navigation and selected-control states;
- links and compact emphasis;
- focus ring;
- a low-emphasis selected background.

The derivation clamps lightness and chroma separately for light and dark modes.
If the entered color cannot yield accessible foreground and focus combinations,
the UI adjusts the derived values and shows the effective preview. Invalid hex
input is rejected before persistence. Arbitrary accent values never feed
`success`, `warning`, `danger`, charts with fixed meaning, or surface tokens.

## Settings Experience

Appearance becomes a compact section in Organization Settings and is visible
only to the Super Admin.

The editor contains:

1. Theme mode: Light, Dark, or System.
2. Accent presets, with Neutral selected by default.
3. An optional custom color picker and hex field.
4. A live preview containing a primary button, selected navigation item, input
   focus treatment, link, status badge, and the dark/light surface stack.
5. `Save changes` and `Restore Nestory default` actions.

The preview uses draft values without changing the active workspace. Saving
updates the organization theme atomically, refreshes the server context, and
applies the new attributes without a page flash. The existing header toggle
updates the organization setting for Super Admins. Other roles see the current
mode but cannot persist a different organization theme.

## Data And Runtime Flow

The organizations record stores the authoritative mode, preset name, and
optional normalized accent seed. A checked Super-Admin-only RPC owns updates;
direct client writes remain unavailable. The authenticated layout reads the
theme with the existing organization context and emits `data-theme` and
`data-accent` on the document root.

An inline bootstrap script uses a server-provided theme payload (with a small
local cache as a no-flash fallback) before React hydration. The server value
wins whenever it is available. The cache is namespaced by organization so
switching workspaces cannot leak one organization's appearance into another.

Preset and custom accent variables are applied at the document root. Shared UI
components continue consuming semantic Tailwind/Shadcn variables and do not
need organization-aware branching.

## Accessibility And Failure Handling

- Normal text maintains at least 4.5:1 contrast and large text at least 3:1.
- Focus indicators and meaningful icon/state boundaries remain distinguishable
  from adjacent colors.
- Status is never communicated by the organization accent.
- Invalid or unusable custom colors produce inline validation and cannot save.
- A missing, malformed, or unavailable saved theme falls back to Neutral and
  the system color-scheme preference.
- Theme changes preserve keyboard focus and announce successful persistence.
- The settings preview works at 200% zoom without horizontal document overflow.

## Verification

- Unit tests cover seed normalization, preset mapping, accessible foreground
  selection, clamping, and neutral fallback.
- Database tests cover Super Admin update authority, denial for the other four
  roles, cross-organization isolation, and valid-value constraints.
- Settings tests cover draft preview, save, restore-default, invalid hex, and
  capability visibility.
- Theme contract tests prevent a second competing dark token block and verify
  that semantic status tokens do not depend on the accent seed.
- Browser checks cover the Properties, People, Finance, Maintenance, and
  Timeline patterns shown in the audit at 1440 x 900 and 1280 x 800, in both
  Neutral and one colored accent, plus a mobile settings check.

## Out Of Scope

- Per-user appearance preferences.
- Arbitrary user-authored palettes, typography, radius, or layout themes.
- Recoloring public marketing or photographic authentication surfaces.
- Using organization accents to encode finance, maintenance, or record status.
