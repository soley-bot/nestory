# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished, path-based Settings workspace with editable organization identity, immutable subdomain, capability-aware navigation, and trustworthy access data.

**Architecture:** Canonical route files compose a shared Settings shell while each feature keeps its own loader and authorization context. A checked Supabase RPC owns the only new mutation, updating `organizations.name` and appending activity without accepting a slug. Existing editors are adapted to a consistent visual contract instead of introducing a generic settings engine.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Zod 4, Supabase PostgreSQL/RPC/RLS, Vitest/Testing Library, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-15-settings-redesign-design.md`

## Global Constraints

- Workspace subdomains are immutable after provisioning; no UI, action, or RPC accepts a slug.
- Super Admin manages organization identity, appearance, branches, teams, and access.
- Super Admin and Finance Manager manage rent policy.
- `/account` remains personal and outside workspace Settings.
- Configuration registry remains internal and gains no persistence.
- Use checked server mutations, explicit grants, organization scoping, and existing RLS conventions.
- Preserve the active root checkout; work only in `D:\nestory\.worktrees\settings-redesign`.
- Preserve light/dark themes, keyboard operation, reduced motion, 200% zoom, 1440x900, and 1280x800.

---

### Task 1: Canonical Settings routes and capability-aware navigation

**Files:**
- Create: `src/features/organization/settings-navigation.ts`
- Create: `src/components/layout/settings-shell.tsx`
- Create: `src/app/(dashboard)/settings/organization/page.tsx`
- Create: `src/app/(dashboard)/settings/appearance/page.tsx`
- Create: `src/app/(dashboard)/settings/branches/page.tsx`
- Create: `src/app/(dashboard)/settings/teams/page.tsx`
- Create: `src/app/(dashboard)/settings/access/page.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/(dashboard)/settings/rent-policy/page.tsx`
- Modify: `src/app/(dashboard)/users-roles/page.tsx`
- Modify: `src/components/layout/settings-tabs.tsx`
- Test: `src/features/organization/settings-navigation.test.ts`
- Test: `src/components/layout/settings-tabs.test.tsx`
- Test: `src/app/(dashboard)/settings/page.test.tsx`
- Test: `src/app/(dashboard)/settings/rent-policy/page.test.tsx`
- Test: `src/app/(dashboard)/users-roles/page.test.tsx`

**Interfaces:**
- Produces: `SettingsDestination`, `getSettingsDestinations(role)`, `getSettingsLandingHref(role)`, and a `SettingsShell` that owns the Settings heading, local navigation, navigation guard, and content region.
- Consumes: `WorkspaceRole`, `PageHeader`, `LocalWorkspaceNav`, and `SettingsNavigationGuardProvider`.

- [ ] **Step 1: Write failing navigation and route tests**

```ts
expect(getSettingsDestinations("super_admin").map((item) => item.href)).toEqual([
  "/settings/organization",
  "/settings/appearance",
  "/settings/branches",
  "/settings/teams",
  "/settings/rent-policy",
  "/settings/access",
]);
expect(getSettingsDestinations("finance_manager").map((item) => item.href)).toEqual([
  "/settings/rent-policy",
]);
expect(getSettingsLandingHref("super_admin")).toBe("/settings/organization");
expect(getSettingsLandingHref("finance_manager")).toBe("/settings/rent-policy");
```

Add route expectations proving `/settings?section=teams` redirects to `/settings/teams`, unknown/configuration sections redirect to `/settings/organization`, `/users-roles` preserves validated query parameters while redirecting to `/settings/access`, and Finance Manager rent policy renders Settings navigation.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx vitest run src/features/organization/settings-navigation.test.ts src/components/layout/settings-tabs.test.tsx "src/app/(dashboard)/settings/page.test.tsx" "src/app/(dashboard)/settings/rent-policy/page.test.tsx" "src/app/(dashboard)/users-roles/page.test.tsx"
```

Expected: failures name missing canonical destinations, missing redirects, and absent Finance Manager navigation.

- [ ] **Step 3: Implement route metadata and shell**

```ts
export type SettingsDestination = {
  group: "workspace" | "access";
  href: string;
  label: string;
};

export function getSettingsDestinations(role: WorkspaceRole): SettingsDestination[] {
  if (role === "super_admin") return SUPER_ADMIN_SETTINGS;
  if (role === "finance_manager") return RENT_POLICY_SETTINGS;
  return [];
}
```

Build `SettingsShell` with `PageHeader title="Settings"`, a compact group navigation, a responsive section rail, `aria-current="page"`, and the existing navigation guard. Organization, Appearance, Branches, Teams, and Access use `requireSuperAdminContext`; Rent policy uses `requireLeaseConfigurationContext`. The root and legacy pages use `redirect()` and preserve only the validated access focus parameters.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all listed tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/organization/settings-navigation.ts src/features/organization/settings-navigation.test.ts src/components/layout/settings-shell.tsx src/components/layout/settings-tabs.tsx src/components/layout/settings-tabs.test.tsx "src/app/(dashboard)/settings" "src/app/(dashboard)/users-roles"
git commit -m "refactor(settings): unify workspace routes"
```

### Task 2: Checked organization-name mutation and immutable address

**Files:**
- Create: generated migration via `npx supabase migration new update_organization_identity`
- Create: `supabase/tests/organization_identity_test.sql`
- Create: `src/features/organization/components/organization-identity-editor.tsx`
- Create: `src/features/organization/components/organization-identity-editor.test.tsx`
- Modify: `src/features/organization/actions.ts`
- Modify: `src/features/organization/appearance-actions.test.ts`
- Modify: `src/features/organization/components/settings-workspace.tsx`
- Modify: `src/features/organization/components/settings-workspace.test.tsx`
- Modify: `src/types/database.generated.ts`

**Interfaces:**
- Produces: `updateOrganizationIdentityAction(state, formData): Promise<OrganizationActionState>` and `public.update_organization_identity(p_organization_id uuid, p_name text) returns text`.
- Consumes: authenticated Super Admin context, existing `activity_logs`, `organizations`, `app_private.is_org_admin`, and Settings draft guard.

- [ ] **Step 1: Write failing pgTAP and action tests**

The SQL tests assert:

```sql
select has_function('public', 'update_organization_identity', array['uuid', 'text']);
select function_returns('public', 'update_organization_identity', array['uuid', 'text'], 'text');
```

They also set authenticated fixture users and prove Super Admin success, non-admin rejection, cross-organization rejection, blank and 121-character rejection, `anon` execute denial, authenticated execute grant, activity insertion, and unchanged `organizations.slug`.

The action test sends `name = '  Soley Property Management  '` and expects:

```ts
expect(rpc).toHaveBeenCalledWith("update_organization_identity", {
  p_name: "Soley Property Management",
  p_organization_id: "organization-1",
});
expect(revalidatePath).toHaveBeenCalledWith("/settings/organization");
expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx vitest run src/features/organization/appearance-actions.test.ts src/features/organization/components/organization-identity-editor.test.tsx src/features/organization/components/settings-workspace.test.tsx
```

Expected: missing action/editor/RPC expectations fail for the absent feature.

- [ ] **Step 3: Create the migration through the CLI**

Run:

```powershell
npx supabase --version
npx supabase migration new update_organization_identity
```

Define a `SECURITY DEFINER SET search_path = ''` function that validates `auth.uid()`, checks `app_private.is_org_admin`, locks the organization row, updates only `public.organizations.name`, and inserts `public.activity_logs(entity_type='organization', action='updated', old_values, new_values)`. Revoke from `PUBLIC` and `anon`; grant only to `authenticated`.

- [ ] **Step 4: Implement the action and identity editor**

Use this schema and payload boundary:

```ts
const organizationIdentitySchema = z.object({
  name: z.string().trim().min(2).max(120),
});
```

The editor exposes a labelled Workspace name input, a locked Workspace address row, a clipboard button with polite feedback, contextual branch/team links, and explicit Save changes/Cancel controls. It never renders a slug input or appends a slug to form data.

- [ ] **Step 5: Verify GREEN and database behaviour**

Run:

```powershell
npx vitest run src/features/organization/appearance-actions.test.ts src/features/organization/components/organization-identity-editor.test.tsx src/features/organization/components/settings-workspace.test.tsx
npx supabase test db --local supabase/tests/organization_identity_test.sql
npm run db:lint
npm run db:types
```

Expected: all focused tests pass, database lint reports no new errors, and generated types include `update_organization_identity`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations supabase/tests/organization_identity_test.sql src/features/organization/actions.ts src/features/organization/appearance-actions.test.ts src/features/organization/components/organization-identity-editor.tsx src/features/organization/components/organization-identity-editor.test.tsx src/features/organization/components/settings-workspace.tsx src/features/organization/components/settings-workspace.test.tsx src/types/database.generated.ts
git commit -m "feat(settings): edit organization identity safely"
```

### Task 3: Polish Settings sections and save presentation

**Files:**
- Create: `src/features/organization/components/settings-section-header.tsx`
- Create: `src/features/organization/components/settings-save-bar.tsx`
- Create: `src/features/organization/components/settings-save-bar.test.tsx`
- Modify: `src/features/organization/components/organization-settings-screen.tsx`
- Modify: `src/features/organization/components/settings-workspace.tsx`
- Modify: `src/features/organization/components/appearance-editor.tsx`
- Modify: `src/features/organization/components/appearance-editor.test.tsx`
- Modify: `src/features/organization/components/branch-editor.tsx`
- Modify: `src/features/organization/components/team-editor.tsx`
- Modify: `src/features/organization/components/settings-workspace-drafts.test.tsx`

**Interfaces:**
- Produces: `SettingsSectionHeader({title, description, eyebrow?})` and `SettingsSaveBar({dirty, pending, message, onCancel})`.
- Consumes: existing `useSettingsDraft`, server actions, and navigation guard draft controller.

- [ ] **Step 1: Write failing UI behaviour tests**

Assert that the save bar is absent for a pristine editor, appears after a meaningful change, says `Saving changes…` while pending, announces `Changes saved`, and Cancel restores persisted values. Assert every section has one `h2` and plain-language description, and that dark/light classes use tokens rather than hardcoded structural accent colors.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/features/organization/components/settings-save-bar.test.tsx src/features/organization/components/appearance-editor.test.tsx src/features/organization/components/settings-workspace-drafts.test.tsx
```

- [ ] **Step 3: Implement the shared visual contract**

Use a single bordered work surface, `max-w-3xl` for forms, `gap-6` between content groups, compact muted helper copy, and a sticky bottom action row only for dirty/saving states. Keep organization accent on focus, links, selected navigation, and primary buttons only. Avoid page-load animation and nested decorative shells.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/organization/components
git commit -m "style(settings): polish editing surfaces"
```

### Task 4: Make Workspace Access truthful and maintainable

**Files:**
- Create: `src/features/organization/workspace-roles.ts`
- Create: `src/features/organization/workspace-roles.test.ts`
- Modify: `src/features/organization/data.ts`
- Modify: `src/features/organization/data.test.ts`
- Modify: `src/features/organization/actions.ts`
- Modify: `src/features/organization/components/access-settings-screen.tsx`
- Modify: `src/features/organization/components/access-settings-screen.test.tsx`
- Modify: `src/features/organization/components/access-settings-screen.ssr.test.tsx`

**Interfaces:**
- Produces: one `WORKSPACE_ACCESS_ROLES` label/description registry and authoritative membership load failures.
- Consumes: `isWorkspaceRole`, `get_organization_access_members`, and existing access screen flows.

- [ ] **Step 1: Write failing data-integrity tests**

```ts
await expect(getAccessSettingsData("organization-1")).rejects.toThrow(
  "Could not load workspace members",
);
```

The client fixture returns an RPC error and a successful direct-table fallback. The test proves the fallback is not called. Add a malformed-role fixture and expect a typed `Workspace access contains an unsupported role` error rather than blank email data or an unlabelled crash.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/features/organization/workspace-roles.test.ts src/features/organization/data.test.ts src/features/organization/components/access-settings-screen.test.tsx src/features/organization/components/access-settings-screen.ssr.test.tsx
```

- [ ] **Step 3: Implement the authoritative loader and shared role registry**

Remove the direct `organization_members` fallback. Translate RPC failure and malformed role data into explicit feature errors. Replace duplicated role arrays/labels in actions and access controls with the shared five-role registry while retaining Zod's exact enum.

Polish Access with a concise section introduction, summary counts, clearer Active/Pending/No access states, and existing dialogs/actions. Remove render-time state updates; synchronize external focus in an effect or derive it without state mutation during render.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all tests pass and no fallback query occurs.

- [ ] **Step 5: Commit**

```powershell
git add src/features/organization
git commit -m "fix(settings): make access data authoritative"
```

### Task 5: Update links, app-shell ownership, and route contracts

**Files:**
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/layout/app-shell.test.tsx`
- Modify: `src/features/activity/entity-target.ts`
- Modify: `src/features/activity/entity-target.test.ts`
- Modify: `src/features/account/components/account-screen.tsx`
- Modify: `src/features/account/components/account-screen.test.tsx`
- Modify: `src/features/people/people.insights.ts`
- Modify: `src/features/people/people.insights.test.ts`
- Modify: `src/features/people/components/workspace-access-status.tsx`
- Modify affected People component tests
- Modify: `config/ui-route-coverage.json`
- Modify: `scripts/smoke-ui-redesign-policy.mjs`
- Modify: `scripts/smoke-ui-redesign-policy.test.mjs`
- Modify: `PROJECT.md`

**Interfaces:**
- Produces: all internal access links target `/settings/access`; Settings route ownership excludes `/account`; executable route coverage includes canonical Settings paths.

- [ ] **Step 1: Write failing link and navigation tests**

Replace expected `/users-roles?...` values with `/settings/access?...`, expect Settings shell routes to exclude `/account`, and require the route coverage manifest to classify all six canonical Settings routes.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/components/layout/app-shell.test.tsx src/features/activity/entity-target.test.ts src/features/account/components/account-screen.test.tsx src/features/people/people.insights.test.ts src/features/people/components/people-screen.test.tsx src/features/people/components/person-detail-screen.test.tsx scripts/smoke-ui-redesign-policy.test.mjs
```

- [ ] **Step 3: Update consumers and durable project contract**

Change internal links to the canonical paths while leaving redirect compatibility. Update `PROJECT.md` to name the path-based capability-aware Settings surface and immutable post-provisioning workspace address.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command, then:

```powershell
npm run test:ui-coverage
npm run test:ui-copy
```

- [ ] **Step 5: Commit**

```powershell
git add src config/ui-route-coverage.json scripts/smoke-ui-redesign-policy.mjs scripts/smoke-ui-redesign-policy.test.mjs PROJECT.md
git commit -m "chore(settings): migrate canonical links"
```

### Task 6: Full verification and meeting-ready browser review

**Files:**
- Modify only files required by failures that are directly caused by Tasks 1-5.

**Interfaces:**
- Produces: fresh evidence for unit, UI, type, lint, build, database, responsive, theme, keyboard, and dirty-navigation behaviour.

- [ ] **Step 1: Run static and focused regression gates**

```powershell
npx tsc --noEmit
npm run lint
npx vitest run src/components/layout/settings-tabs.test.tsx "src/app/(dashboard)/settings/page.test.tsx" "src/app/(dashboard)/settings/rent-policy/page.test.tsx" "src/app/(dashboard)/users-roles/page.test.tsx" src/features/organization src/features/activity/entity-target.test.ts src/features/account/components/account-screen.test.tsx
npm run test:ui-coverage
npm run test:ui-copy
npm run build
```

- [ ] **Step 2: Run database gates**

```powershell
npm run db:lint
npx supabase test db --local supabase/tests/organization_identity_test.sql
npm run db:verify-migrations
```

- [ ] **Step 3: Run browser review when the disposable fixture is available**

Verify `/settings/organization`, `/settings/appearance`, `/settings/branches`, `/settings/teams`, `/settings/access`, and `/settings/rent-policy` at 1440x900 and 1280x800. Capture light/dark screenshots. Confirm keyboard navigation, visible focus, no horizontal overflow, locked subdomain, copy feedback, name dirty/save/cancel, access empty/error states, and Finance Manager rent-policy-only navigation.

- [ ] **Step 4: Inspect the final diff and commit verification fixes**

```powershell
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

If verification required tracked fixes, commit only those fixes with:

```powershell
git add -u
git commit -m "test(settings): close redesign verification"
```
