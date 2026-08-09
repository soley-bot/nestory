# Organization Theme And Dark Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish Nestory's dark workspace surfaces and let a Super Admin select one accessible organization-wide theme with a neutral black-and-white default.

**Architecture:** Keep Shadcn semantic tokens as the component API, replace the competing dark palettes with one graphite layer model, and derive only interactive accent tokens from a validated organization seed. Persist the organization theme through a checked Supabase RPC, load it with workspace membership, apply it before the authenticated shell renders, and edit it from a dedicated Appearance settings section.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Tailwind CSS 4, Shadcn/Radix, Zod 4, Supabase PostgreSQL/RLS/RPC, Vitest/Testing Library, pgTAP, Playwright.

## Global Constraints

- Nestory's default theme is neutral black-and-white.
- Theme configuration is organization-wide and Super-Admin-managed; there are no per-user accent preferences.
- Custom hex is an accent seed only. It never recolors structural surfaces, success, warning, danger, finance meaning, record states, or fixed-meaning charts.
- Public marketing, photographic authentication, and workspace-arrival palettes remain unchanged.
- Dark layers become incrementally lighter: canvas `#101313`, work surface `#151919`, raised `#1b2020`, interactive `#242a29`, border `#343b3a`.
- Primary dark text is `#f1f4f2`; secondary dark text is `#aeb7b3`.
- Normal text must retain 4.5:1 contrast; large text and meaningful control boundaries/focus indicators must retain 3:1 where WCAG 2.2 requires it.
- Treat 1440 x 900 and 1280 x 800 as laptop-first visual checks; verify Settings on mobile and at 200% zoom.
- Do not add a generic theming engine or user-authored typography, radius, layout, or status palettes.

---

## File Structure

- `src/app/globals.css`: owns the neutral surface hierarchy and semantic accent CSS variables.
- `src/components/layout/workspace-page.tsx`: owns the shared authenticated canvas background.
- `src/lib/theme/organization-theme.ts`: owns theme types, presets, hex normalization, accessible foreground selection, and derived CSS variables.
- `src/lib/theme/organization-theme.test.ts`: proves deterministic, accessible derivation and safe fallback.
- `supabase/migrations/20260809120000_organization_appearance.sql`: stores organization appearance and exposes the checked mutation RPC.
- `supabase/tests/organization_appearance_test.sql`: proves validation, authority, and cross-organization isolation.
- `src/lib/auth/context.ts`: carries saved appearance with authenticated workspace context.
- `src/components/theme-runtime.tsx`: applies server theme state, system-mode changes, and organization-scoped cache.
- `src/components/theme-toggle.tsx`: performs the Super-Admin-only organization mode toggle.
- `src/features/organization/components/appearance-editor.tsx`: owns the settings form, live preview, validation, save, and reset experience.
- `src/features/organization/actions.ts`: validates and persists appearance settings.
- `src/features/organization/data.ts`: returns appearance to Settings.
- `src/features/organization/components/settings-workspace.tsx`: adds the Appearance section.
- `src/app/(dashboard)/layout.tsx`: mounts the runtime before the shell.
- `src/app/(dashboard)/settings/page.tsx`: supplies saved appearance to the editor.
- `src/components/layout/app-shell.tsx`: consumes the shared capability-aware toggle instead of a duplicate local implementation.
- `src/types/database.generated.ts`, `src/types/database.ts`: regenerated database contract plus intentional local overrides only.

---

### Task 1: Normalize The Dark Surface Hierarchy

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/layout/workspace-page.tsx`
- Modify: `src/lib/ui/theme-contract.test.ts`
- Test: `src/lib/ui/theme-contract.test.ts`

**Interfaces:**
- Consumes: existing Shadcn variables `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--border`, `--input`, `--ring`.
- Produces: one `.dark` semantic palette and a workspace canvas without opacity blending.

- [ ] **Step 1: Write the failing dark hierarchy contract**

Add assertions that `.dark` contains the approved values, that `[data-theme="dark"]` owns state variables only, and that the shared workspace class no longer contains `bg-muted/30`:

```ts
const workspacePage = fs.readFileSync(
  path.join(root, "src/components/layout/workspace-page.tsx"),
  "utf8",
);

it("uses one graphite dark surface hierarchy", () => {
  expect(globals).toContain("--background: #101313");
  expect(globals).toContain("--card: #151919");
  expect(globals).toContain("--popover: #1b2020");
  expect(globals).toContain("--muted: #1b2020");
  expect(globals).toContain("--border: #343b3a");
  expect(globals).toContain("--foreground: #f1f4f2");
  expect(globals).toContain("--muted-foreground: #aeb7b3");
  expect(workspacePage).toContain("bg-background");
  expect(workspacePage).not.toContain("bg-muted/30");
});
```

- [ ] **Step 2: Run the focused contract and confirm failure**

Run: `npm test -- src/lib/ui/theme-contract.test.ts`

Expected: FAIL because the stock OKLCH `.dark` values and `bg-muted/30` remain.

- [ ] **Step 3: Replace only the authenticated semantic dark palette**

Keep the purpose-built landing/auth/workspace-arrival blocks intact. Set `.dark` to the approved graphite sequence, use `#151919` for cards/work surfaces, `#1b2020` for raised controls/popovers, `#242a29` for hover/selected secondary surfaces, and `#343b3a` for visible boundaries. Change `WorkspacePage` to `bg-background`.

```css
.dark {
  --background: #101313;
  --foreground: #f1f4f2;
  --card: #151919;
  --card-foreground: #f1f4f2;
  --popover: #1b2020;
  --popover-foreground: #f1f4f2;
  --secondary: #1b2020;
  --secondary-foreground: #f1f4f2;
  --muted: #1b2020;
  --muted-foreground: #aeb7b3;
  --accent: #242a29;
  --accent-foreground: #f1f4f2;
  --border: #343b3a;
  --input: #343b3a;
  --ring: #c4cbc7;
  --sidebar: #101313;
  --sidebar-accent: #242a29;
  --sidebar-border: #343b3a;
}
```

- [ ] **Step 4: Run theme and representative workspace tests**

Run: `npm test -- src/lib/ui/theme-contract.test.ts src/features/people/components/people-screen.test.tsx src/features/properties/components/property-screen.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the surface correction**

```powershell
git add -- src/app/globals.css src/components/layout/workspace-page.tsx src/lib/ui/theme-contract.test.ts
git commit -m "fix(ui): unify dark workspace surfaces"
```

### Task 2: Build The Safe Accent Derivation Contract

**Files:**
- Create: `src/lib/theme/organization-theme.ts`
- Create: `src/lib/theme/organization-theme.test.ts`

**Interfaces:**
- Produces: `ThemeMode`, `AccentPreset`, `OrganizationTheme`, `DEFAULT_ORGANIZATION_THEME`, `normalizeHexColor(value)`, `resolveOrganizationTheme(theme, prefersDark)`, and `getOrganizationThemeStyle(theme)`.
- `getOrganizationThemeStyle` returns `React.CSSProperties & Record<"--org-accent-seed" | "--primary" | "--primary-foreground" | "--ring" | "--org-accent-soft", string>`.

- [ ] **Step 1: Write failing preset, normalization, and contrast tests**

```ts
expect(DEFAULT_ORGANIZATION_THEME).toEqual({
  accentPreset: "neutral",
  accentSeed: null,
  mode: "system",
});
expect(normalizeHexColor("  #2563eb ")).toBe("#2563EB");
expect(normalizeHexColor("2563EB")).toBe("#2563EB");
expect(normalizeHexColor("#12GG00")).toBeNull();

const style = getOrganizationThemeStyle({
  accentPreset: "custom",
  accentSeed: "#2563EB",
  mode: "dark",
});
expect(style["--org-accent-seed"]).toBe("#2563EB");
expect(["#101313", "#FFFFFF"]).toContain(style["--primary-foreground"]);
expect(contrastRatio(style["--primary"], style["--primary-foreground"])).toBeGreaterThanOrEqual(4.5);
```

- [ ] **Step 2: Run the new tests and confirm module-not-found failure**

Run: `npm test -- src/lib/theme/organization-theme.test.ts`

Expected: FAIL because the theme module does not exist.

- [ ] **Step 3: Implement the narrow theme domain**

Define presets `neutral`, `forest`, `ocean`, `indigo`, `plum`, `terracotta`, `custom`. Parse 3/6-digit hex, normalize to uppercase 6-digit hex, convert sRGB to linear luminance for foreground selection, convert seed colors to OKLCH for bounded lightness/chroma derivation, and serialize results back to hex. Neutral maps to monochrome values and never uses a hidden green seed.

```ts
export type ThemeMode = "light" | "dark" | "system";
export type AccentPreset =
  | "neutral" | "forest" | "ocean" | "indigo"
  | "plum" | "terracotta" | "custom";

export type OrganizationTheme = {
  accentPreset: AccentPreset;
  accentSeed: string | null;
  mode: ThemeMode;
};

export const DEFAULT_ORGANIZATION_THEME: OrganizationTheme = {
  accentPreset: "neutral",
  accentSeed: null,
  mode: "system",
};
```

Clamp the light primary to an accessible range for white text and the dark primary to an accessible range for `#101313` or white text. Derive hover/pressed/soft/focus via OKLCH adjustments, not status variables.

- [ ] **Step 4: Run derivation tests and typecheck**

Run: `npm test -- src/lib/theme/organization-theme.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the theme domain**

```powershell
git add -- src/lib/theme/organization-theme.ts src/lib/theme/organization-theme.test.ts
git commit -m "feat(theme): derive accessible organization accents"
```

### Task 3: Add Organization Theme Persistence And Authority

**Files:**
- Create: `supabase/migrations/20260809120000_organization_appearance.sql`
- Create: `supabase/tests/organization_appearance_test.sql`
- Modify after reset: `src/types/database.generated.ts`
- Modify only if required: `src/types/database.ts`

**Interfaces:**
- Produces columns `organizations.theme_mode text`, `organizations.accent_preset text`, `organizations.accent_seed text`.
- Produces checked RPC `public.update_organization_appearance(p_organization_id uuid, p_theme_mode text, p_accent_preset text, p_accent_seed text) returns uuid`.

- [ ] **Step 1: Write the failing pgTAP authority contract**

Cover defaults, valid preset/custom saves, malformed custom hex, seed supplied for non-custom preset, non-Super-Admin denial for all four roles, cross-organization denial, and normalized uppercase persistence.

```sql
SELECT lives_ok(
  $$ SELECT public.update_organization_appearance(
    app_test.organization_id('Nestory Test'), 'dark', 'custom', '#2563eb'
  ) $$,
  'Super Admin can save a custom organization accent'
);

SELECT is(
  (SELECT accent_seed FROM public.organizations WHERE id = app_test.organization_id('Nestory Test')),
  '#2563EB',
  'custom seed is normalized'
);
```

- [ ] **Step 2: Run the database test and confirm missing-object failure**

Run: `npm run db:reset`

Run: `npx supabase test db supabase/tests/organization_appearance_test.sql`

Expected: FAIL because columns/RPC do not exist.

- [ ] **Step 3: Implement constrained columns and checked RPC**

Use check constraints exactly matching the TypeScript unions. Default to `system`, `neutral`, `NULL`. Require `accent_seed` only for `custom`, normalize it with `upper`, authorize with `app_private.is_org_admin(p_organization_id)`, verify the current user's organization, set `search_path = ''`, revoke public execution, and grant only `authenticated`.

```sql
ALTER TABLE public.organizations
  ADD COLUMN theme_mode text NOT NULL DEFAULT 'system'
    CHECK (theme_mode IN ('light', 'dark', 'system')),
  ADD COLUMN accent_preset text NOT NULL DEFAULT 'neutral'
    CHECK (accent_preset IN ('neutral','forest','ocean','indigo','plum','terracotta','custom')),
  ADD COLUMN accent_seed text,
  ADD CONSTRAINT organizations_accent_seed_check CHECK (
    (accent_preset = 'custom' AND accent_seed ~ '^#[0-9A-F]{6}$')
    OR (accent_preset <> 'custom' AND accent_seed IS NULL)
  );
```

- [ ] **Step 4: Reset, run pgTAP, lint, and regenerate types**

Run: `npm run db:reset`

Run: `npx supabase test db supabase/tests/organization_appearance_test.sql`

Run: `npm run db:lint`

Run: `npm run db:types`

Expected: all commands PASS; generated organization row and RPC types include the new contract.

- [ ] **Step 5: Commit persistence and generated contract**

```powershell
git add -- supabase/migrations supabase/tests/organization_appearance_test.sql src/types/database.generated.ts src/types/database.ts
git commit -m "feat(theme): persist organization appearance"
```

### Task 4: Apply Saved Theme Before The Authenticated Shell

**Files:**
- Modify: `src/lib/auth/context.ts`
- Modify: `src/lib/auth/context.test.ts`
- Create: `src/components/theme-runtime.tsx`
- Create: `src/components/theme-runtime.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/theme-toggle.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `OrganizationTheme`, `resolveOrganizationTheme`, `getOrganizationThemeStyle` from Task 2.
- Produces: `ThemeRuntime({ organizationId, theme, children })` and `ThemeToggle({ canManage, organizationId, mode })`.
- Adds `theme: OrganizationTheme` to `WorkspaceMembership` and `requireWorkspaceContext()`.

- [ ] **Step 1: Write failing context and runtime tests**

Assert the membership query selects `theme_mode, accent_preset, accent_seed`, malformed DB values fall back to `DEFAULT_ORGANIZATION_THEME`, the runtime sets `data-theme`, `data-accent`, `.dark`, and organization-scoped cache, and system mode reacts to `matchMedia`.

```tsx
render(
  <ThemeRuntime
    organizationId="org-1"
    theme={{ accentPreset: "ocean", accentSeed: null, mode: "dark" }}
  >
    <span>Workspace</span>
  </ThemeRuntime>,
);
expect(document.documentElement.dataset.theme).toBe("dark");
expect(document.documentElement.dataset.accent).toBe("ocean");
expect(document.documentElement.classList.contains("dark")).toBe(true);
expect(localStorage.getItem("nestory-theme:org-1")).toContain('"mode":"dark"');
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/lib/auth/context.test.ts src/components/theme-runtime.test.tsx`

Expected: FAIL because appearance is absent from context/runtime.

- [ ] **Step 3: Carry organization appearance through auth context**

Extend the joined organization select and normalize DB strings through the Task 2 domain. Never trust unchecked strings from generated row types.

- [ ] **Step 4: Implement runtime and remove duplicate toggling logic**

`ThemeRuntime` emits a small inline pre-shell script using serialized, escaped server values, then keeps system preference synchronized client-side. Apply derived custom properties to `document.documentElement.style`. Namespace cache as `nestory-theme:<organizationId>`. Replace the AppShell-local toggle with the shared `ThemeToggle`; render it only for `canManage` Super Admin context. Keep the public root bootstrap as a system-preference fallback and remove the unscoped `nestory-theme` preference.

- [ ] **Step 5: Run runtime, shell, hydration, and type tests**

Run: `npm test -- src/lib/auth/context.test.ts src/components/theme-runtime.test.tsx src/components/layout/app-shell.test.tsx src/app/layout.test.tsx`

Run: `npm run typecheck`

Expected: PASS with no hydration warning or cross-organization cache key.

- [ ] **Step 6: Commit authenticated theme runtime**

```powershell
git add -- src/lib/auth/context.ts src/lib/auth/context.test.ts src/components/theme-runtime.tsx src/components/theme-runtime.test.tsx src/app/'(dashboard)'/layout.tsx src/components/layout/app-shell.tsx src/components/theme-toggle.tsx src/app/layout.tsx
git commit -m "feat(theme): apply organization appearance"
```

### Task 5: Add The Appearance Settings Editor

**Files:**
- Create: `src/features/organization/components/appearance-editor.tsx`
- Create: `src/features/organization/components/appearance-editor.test.tsx`
- Modify: `src/features/organization/actions.ts`
- Modify: `src/features/organization/actions.test.ts`
- Modify: `src/features/organization/data.ts`
- Modify: `src/features/organization/data.test.ts`
- Modify: `src/features/organization/components/settings-workspace.tsx`
- Modify: `src/features/organization/components/settings-workspace.test.tsx`
- Modify: `src/features/organization/components/organization-settings-screen.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/(dashboard)/settings/page.test.tsx`

**Interfaces:**
- Consumes: organization theme domain and `update_organization_appearance` RPC.
- Produces: `updateOrganizationAppearanceAction(previousState, formData)` and `AppearanceEditor({ organizationId, theme, onDraftStatusChange })`.
- Adds `appearance: OrganizationTheme` to `getOrganizationSettingsData()`.
- Adds `"appearance"` to `SettingsSection`.

- [ ] **Step 1: Write failing server-action tests**

Test valid neutral/preset/custom payloads, invalid hex, seed removal for presets, Super Admin context requirement, RPC payload, error mapping, and `/settings` plus dashboard-layout revalidation.

```ts
const form = new FormData();
form.set("mode", "dark");
form.set("accentPreset", "custom");
form.set("accentSeed", "#2563eb");
await expect(updateOrganizationAppearanceAction({}, form)).resolves.toEqual({
  message: "Appearance updated.",
  status: "success",
});
expect(rpc).toHaveBeenCalledWith("update_organization_appearance", {
  p_accent_preset: "custom",
  p_accent_seed: "#2563EB",
  p_organization_id: "org-1",
  p_theme_mode: "dark",
});
```

- [ ] **Step 2: Write failing editor and route tests**

Assert Appearance appears in the section rail, Neutral is the default, presets and custom picker update only the preview, invalid custom input blocks save with inline feedback, Restore Nestory default produces `system/neutral/null`, status badges retain semantic classes, and the page passes loaded appearance through.

- [ ] **Step 3: Run the focused tests and confirm failure**

Run: `npm test -- src/features/organization/actions.test.ts src/features/organization/data.test.ts src/features/organization/components/appearance-editor.test.tsx src/features/organization/components/settings-workspace.test.tsx src/app/'(dashboard)'/settings/page.test.tsx`

Expected: FAIL because Appearance contracts do not exist.

- [ ] **Step 4: Implement action and settings data flow**

Use Zod enums for mode/preset, `normalizeHexColor` for custom, null seed for every non-custom preset, `requireSuperAdminContext`, and the checked RPC. Load `theme_mode, accent_preset, accent_seed` directly from the scoped organization row and normalize through the shared domain.

- [ ] **Step 5: Implement the compact editor and preview**

Use shared `Button`, `Input`, and selection primitives. Presets render as named swatches with an explicit selected state. The custom option reveals `<input type="color">` synchronized with the text field. Apply `getOrganizationThemeStyle(draft)` only to the preview root; do not mutate `<html>` until the action succeeds and `router.refresh()` returns authoritative state. The preview contains one surface stack, selected navigation row, primary action, focused-input sample, link, and an unchanged success badge.

- [ ] **Step 6: Run settings tests and accessibility contracts**

Run: `npm test -- src/features/organization/actions.test.ts src/features/organization/data.test.ts src/features/organization/components/appearance-editor.test.tsx src/features/organization/components/settings-workspace.test.tsx src/app/'(dashboard)'/settings/page.test.tsx src/lib/ui/accessibility-contract.test.tsx`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the Appearance workspace**

```powershell
git add -- src/features/organization src/app/'(dashboard)'/settings
git commit -m "feat(settings): manage organization appearance"
```

### Task 6: Integrate The Super Admin Toggle And Theme CSS

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/theme-toggle.tsx`
- Modify: `src/components/theme-toggle.test.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/layout/app-shell.test.tsx`
- Modify: `PROJECT.md`

**Interfaces:**
- Consumes: persisted organization mode/action and derived root variables.
- Produces: capability-correct quick mode switching and complete semantic CSS mapping for presets/custom values.

- [ ] **Step 1: Write failing toggle and semantic-isolation tests**

Assert the toggle is absent for four non-Super-Admin roles, calls the appearance action with the current accent preserved for Super Admin, and cycles resolved light/dark without introducing personal storage. Extend theme-contract tests so `--state-success`, `--state-attention`, and `--state-danger` never reference `--org-accent`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/components/theme-toggle.test.tsx src/components/layout/app-shell.test.tsx src/lib/ui/theme-contract.test.ts`

Expected: FAIL until the toggle and accent mappings are complete.

- [ ] **Step 3: Map preset/custom accent variables**

Keep Neutral monochrome. Add `[data-accent="forest"]`, `ocean`, `indigo`, `plum`, and `terracotta` blocks that set interactive semantic tokens only. The custom runtime writes the equivalent variables inline. Preserve state variables and graphite surfaces outside those selectors.

- [ ] **Step 4: Persist Super Admin quick toggles**

Use a form/server-action transition with an optimistic root update and rollback on failure. Preserve preset/seed, toggle `light`/`dark`, and set `aria-busy` while saving. System mode resolves first and then saves the opposite explicit mode.

- [ ] **Step 5: Update the canonical interface contract**

Add two concise bullets to `PROJECT.md`: organization appearance is Super-Admin-managed with a neutral default; accents affect interaction emphasis only and never semantic status or structural surfaces.

- [ ] **Step 6: Run focused and full application gates**

Run: `npm test -- src/components/theme-toggle.test.tsx src/components/layout/app-shell.test.tsx src/lib/ui/theme-contract.test.ts`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test -- --maxWorkers=4`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit integration and contract**

```powershell
git add -- src/app/globals.css src/components/theme-toggle.tsx src/components/theme-toggle.test.tsx src/components/layout/app-shell.tsx src/components/layout/app-shell.test.tsx src/lib/ui/theme-contract.test.ts PROJECT.md
git commit -m "feat(theme): finish organization theme controls"
```

### Task 7: Database And Live Visual Verification

**Files:**
- Modify only for verified defects: files owned by Tasks 1-6
- Create: `docs/verification/organization-theme-evidence.md`

**Interfaces:**
- Consumes: completed organization appearance system.
- Produces: reproducible evidence for schema, authorization, contrast, responsive rendering, and the five reported workspace patterns.

- [ ] **Step 1: Run the full database gate**

Run: `npm run db:reset`

Run: `npm run db:lint`

Run: `npm run db:types:check`

Run: `npm run db:test`

Expected: reset succeeds; all pgTAP and generated-type checks pass.

- [ ] **Step 2: Start the local app with fixture data**

Run: `npm run db:fixture`

Run in a hidden process: `npm run dev`

Authenticate with the local Super Admin fixture documented by the repo scripts; do not place credentials in the evidence file.

- [ ] **Step 3: Verify the five reported desktop patterns**

At 1440 x 900 and 1280 x 800, capture and inspect `/people`, `/properties`, `/finance`, `/maintenance`, and `/timeline` in dark Neutral. Confirm one consistent canvas, lighter work/register surfaces, lighter controls/cards, no accidental full-width black bands, visible boundaries, readable empty states, and no document-level horizontal overflow.

- [ ] **Step 4: Verify customization and permissions**

In Settings, save Ocean, custom `#7C3AED`, Restore Nestory default, light, dark, and system. Confirm every authenticated route updates together, statuses retain fixed colors, custom preview matches the saved theme, and reload has no neutral-color flash. Sign in as Finance Manager and Operations Manager fixtures; confirm they receive the theme but cannot see Appearance or the quick toggle.

- [ ] **Step 5: Verify accessibility and mobile Settings**

At 390 x 844 and 200% browser zoom, verify the Appearance editor, picker/text synchronization, keyboard selection, focus indicators, live-region save/error feedback, and no horizontal document overflow. Measure representative text and focus pairs and record ratios.

- [ ] **Step 6: Write concise evidence**

Document exact commit SHA, commands, pass counts, viewport/routes, tested accents, measured contrast pairs, screenshots/artifact paths, and any unverified boundary. Do not claim hosted or physical-device behavior from local proof.

- [ ] **Step 7: Run final cleanliness checks and commit evidence**

Run: `git diff --check`

Run: `git status --short --branch`

Expected: only the evidence file is uncommitted before the final commit.

```powershell
git add -- docs/verification/organization-theme-evidence.md
git commit -m "test(theme): document appearance verification"
```

## Final Self-Review Gate

- Every design requirement maps to Tasks 1-7.
- The plan introduces no per-user preference or arbitrary semantic palette.
- `OrganizationTheme`, `ThemeMode`, and `AccentPreset` names are consistent across database, runtime, settings, and tests.
- All mutation paths are Super-Admin-checked and cross-organization-safe.
- Neutral is a real monochrome default, not a hidden green preset.
- Public/auth/photo palettes remain isolated from authenticated workspace tokens.
- Verification covers the five user-supplied screen patterns and the saved-theme data path end to end.
