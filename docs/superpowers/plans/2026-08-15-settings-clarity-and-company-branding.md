# Settings Clarity And Company Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Settings visually respect organization appearance, add secure company-logo storage, and clarify Appearance, Teams, and Rent Policy without unnecessary copy.

**Architecture:** Keep existing Settings routes and editors. Add one private organization-assets storage contract, a checked organization logo pointer RPC, pure image validation helpers, and a focused logo editor within Appearance. Use existing theme tokens and existing lease/team data contracts; do not add team membership or report rendering.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Supabase Postgres/Storage/RLS, Vitest, Testing Library, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-15-settings-clarity-and-company-branding-design.md`

## Global Constraints

- Company logos are private organization assets, not public URLs.
- Accept only PNG and JPEG, 1 byte to 2 MB, with dimensions from 128x128 through 4096x4096.
- Generate object keys as `<organization-id>/logos/<uuid>.<ext>` and never overwrite an existing object.
- Only an active Super Admin can upload, select, replace, or remove a logo.
- Store `organizations.logo_storage_path`; never store a signed URL.
- Do not add the logo to reports, email, authentication, or public pages in this pass.
- Do not add team membership or change access permissions.
- Saving rent-policy drafts must not activate them; browser verification must not approve a policy.
- Remove copy unless it explains scope, permissions, an irreversible effect, or a missing relationship.

---

### Task 1: Semantic Settings appearance and compact preview

**Files:**
- Modify: `src/components/layout/settings-section-nav.tsx`
- Modify: `src/features/organization/components/appearance-editor.tsx`
- Test: `src/components/layout/settings-section-nav.test.tsx`
- Test: `src/features/organization/components/appearance-editor.test.tsx`

**Interfaces:**
- Consumes: existing CSS variables `--org-accent-soft`, `--sidebar-accent-foreground`, `--primary`, and `--ring`.
- Produces: active Settings navigation that uses organization theme tokens and `data-testid="appearance-preview"` as a compact sample.

- [ ] **Step 1: Write failing tests**

Add assertions that the active Settings link uses semantic accent classes instead of `bg-foreground text-background`, and that the Appearance preview contains no tall fill region while retaining selected-navigation, primary-action, link, and focus examples.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/components/layout/settings-section-nav.test.tsx src/features/organization/components/appearance-editor.test.tsx`

Expected: FAIL because the active link is hard-coded and the preview still uses the two-column tall panel.

- [ ] **Step 3: Implement the semantic active state and compact preview**

Use a soft organization-accent background, foreground text, and a primary-color indicator for the active link. Replace the two-column preview with one compact horizontal sample below theme controls. Remove repeated shared/default descriptions while preserving the personal-mode distinction once.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

- [ ] **Step 5: Commit**

```powershell
git add src/components/layout/settings-section-nav.tsx src/components/layout/settings-section-nav.test.tsx src/features/organization/components/appearance-editor.tsx src/features/organization/components/appearance-editor.test.tsx
git commit -m "fix(settings): apply semantic appearance tokens"
```

### Task 2: Company-logo database and Storage contract

**Files:**
- Create: `supabase/migrations/<generated>_organization_company_logo.sql`
- Create: `supabase/tests/organization_company_logo_test.sql`
- Modify: `src/types/database.generated.ts`

**Interfaces:**
- Produces: nullable `organizations.logo_storage_path text` and `public.update_organization_logo(uuid,text) returns text`.
- Produces: private bucket `organization-assets` with 2 MB limit and PNG/JPEG allowlist.
- Produces: organization-scoped SELECT, Super Admin INSERT, and Super Admin DELETE policies on `storage.objects`.

- [ ] **Step 1: Create the migration shell with the CLI**

Run: `npx supabase migration new organization_company_logo`

- [ ] **Step 2: Write failing pgTAP coverage**

Cover column/bucket existence, bucket privacy and limits, RPC grants, Super Admin same-organization pointer update, cross-organization rejection, Finance Manager rejection, invalid paths, and activity logging. Exercise storage policies using an object name shaped as `<organization-id>/logos/<uuid>.png`.

- [ ] **Step 3: Verify RED**

Run: `npx supabase test db --local supabase/tests/organization_company_logo_test.sql`

Expected: FAIL because the column, bucket, RPC, and policies do not exist.

- [ ] **Step 4: Implement the migration**

Add the column and a path-format check. Create the private bucket idempotently. Implement the checked RPC with `SECURITY DEFINER`, empty search path, actor/organization/path validation, old/new activity evidence, explicit revokes, and authenticated execute grant. Add RLS policies using `app_private.storage_object_org_id(name)` and existing organization authority helpers. Do not add UPDATE because logo objects are immutable.

- [ ] **Step 5: Reset local schema, regenerate types, and verify GREEN**

Run:

```powershell
npm run db:reset
npm run db:types
npx supabase test db --local supabase/tests/organization_company_logo_test.sql
npm run db:lint
```

Expected: pgTAP passes; lint has no new warnings attributable to this migration.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations supabase/tests/organization_company_logo_test.sql src/types/database.generated.ts
git commit -m "feat(settings): secure company logo storage"
```

### Task 3: Logo validation, upload actions, and data loading

**Files:**
- Create: `src/features/organization/company-logo.ts`
- Create: `src/features/organization/company-logo.test.ts`
- Modify: `src/features/organization/actions.ts`
- Modify: `src/features/organization/appearance-actions.test.ts`
- Modify: `src/features/organization/data.ts`
- Modify: `src/features/organization/data.test.ts`

**Interfaces:**
- Produces: `validateCompanyLogo(file: File): Promise<{ extension: "jpg" | "png" } | { error: string }>`.
- Produces: `getCompanyLogoStoragePath(organizationId: string, extension: "jpg" | "png"): string`.
- Produces: `uploadOrganizationLogoAction` and `removeOrganizationLogoAction` returning `OrganizationActionState`.
- Produces: organization Settings data fields `logoStoragePath: string | null` and `logoUrl: string | null`.

- [ ] **Step 1: Write failing validation and action tests**

Use literal PNG/JPEG byte fixtures to cover correct signatures/dimensions, spoofed MIME, zero/oversized files, dimensions outside bounds, generated organization-prefixed paths, upload failure, RPC failure cleanup, successful replacement cleanup, and remove behavior.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/features/organization/company-logo.test.ts src/features/organization/appearance-actions.test.ts src/features/organization/data.test.ts`

Expected: FAIL because validation helpers, actions, and branding data do not exist.

- [ ] **Step 3: Implement pure validation**

Parse PNG IHDR dimensions and JPEG SOF dimensions from `ArrayBuffer` bytes. Reject all other signatures, mismatched MIME, invalid bounds, and files above 2 MB. Generate UUID-only object names.

- [ ] **Step 4: Implement actions and loader**

Upload to `organization-assets` with `upsert: false`, explicit content type, and one-year immutable cache for versioned objects. Call `update_organization_logo` only after upload. On pointer failure remove the new object. After success, remove the previous object only if it differs. Removal clears the pointer before deleting the old object. Revalidate Settings and the root layout. Generate a signed read URL server-side when a path exists.

- [ ] **Step 5: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

- [ ] **Step 6: Commit**

```powershell
git add src/features/organization/company-logo.ts src/features/organization/company-logo.test.ts src/features/organization/actions.ts src/features/organization/appearance-actions.test.ts src/features/organization/data.ts src/features/organization/data.test.ts
git commit -m "feat(settings): upload company logos"
```

### Task 4: Branding UI in Appearance

**Files:**
- Modify: `src/features/organization/components/appearance-editor.tsx`
- Modify: `src/features/organization/components/appearance-editor.test.tsx`
- Modify: `src/features/organization/components/settings-workspace.tsx`
- Modify: `src/features/organization/components/organization-settings-screen.tsx`
- Modify: `src/features/organization/components/organization-settings-route.tsx`
- Modify: `src/features/organization/components/settings-workspace-test-helpers.tsx`
- Modify: affected Settings workspace tests

**Interfaces:**
- Consumes: `logoUrl`, `logoStoragePath`, `uploadOrganizationLogoAction`, and `removeOrganizationLogoAction`.
- Produces: `Company logo` surface with preview, Upload/Replace, Remove, pending state, and one concise requirements line.

- [ ] **Step 1: Write failing component tests**

Cover empty and existing logo states, accepted input types, replacement label, removal confirmation, error rendering, and proof that company branding does not replace the Nestory product mark.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/features/organization/components/appearance-editor.test.tsx src/features/organization/components/settings-workspace.test.tsx src/features/organization/components/settings-workspace-drafts.test.tsx`

Expected: FAIL because logo props and controls are absent.

- [ ] **Step 3: Implement the logo editor**

Place Branding above the compact theme controls. Keep upload and removal forms separate from the appearance draft form. Show the logo with constrained contain sizing and a neutral initial fallback. Keep only `PNG or JPEG, up to 2 MB.` as helper text.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/organization/components src/features/organization/data.ts
git commit -m "feat(settings): add company branding controls"
```

### Task 5: Rent Policy and Teams clarity

**Files:**
- Modify: `src/features/leases/components/rent-policy-screen.tsx`
- Modify: `src/features/leases/components/rent-policy-screen.test.tsx`
- Modify: `src/features/organization/components/team-editor.tsx`
- Modify: `src/features/organization/components/settings-workspace.test.tsx`

**Interfaces:**
- Produces: grouped rent-policy form, `Save draft`, and confirmed `Approve and apply policy` action.
- Produces: accurate Teams-to-People relationship copy and `/people` navigation.

- [ ] **Step 1: Write failing behavior tests**

Assert the three rent-policy groups, draft-no-impact message, approval consequences, explicit confirmation, absence of internal labels, Teams manager relationship, no-membership/no-access statement, and `Open People` link.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/features/leases/components/rent-policy-screen.test.tsx src/features/organization/components/settings-workspace.test.tsx`

Expected: FAIL because the old flat form and ambiguous Teams copy remain.

- [ ] **Step 3: Implement the clarified surfaces**

Group controls without changing submitted field names. Change only labels/copy and add approval confirmation at submit time. Add one compact Teams context row and clear column headings. Do not add member assignment.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/leases/components/rent-policy-screen.tsx src/features/leases/components/rent-policy-screen.test.tsx src/features/organization/components/team-editor.tsx src/features/organization/components/settings-workspace.test.tsx
git commit -m "fix(settings): clarify policy and team impact"
```

### Task 6: Full verification and browser review

**Files:**
- Modify only if verification reveals a scoped defect.

**Interfaces:**
- Produces: exact-head evidence for Settings UI, database security, responsive behavior, and a clean worktree.

- [ ] **Step 1: Run code gates**

```powershell
npx tsc --noEmit
npm run lint
npm run test:ui-copy
npm run test:ui-coverage
npm run test:route-discoverability
```

- [ ] **Step 2: Run focused regression suites**

Run all touched Settings, theme, organization-data/action, and Rent Policy test files sequentially if the parallel runner approaches its timeout.

- [ ] **Step 3: Run database gates**

```powershell
npx supabase test db --local supabase/tests/organization_company_logo_test.sql
npm run db:lint
npm run db:verify-migrations
```

- [ ] **Step 4: Run the production build**

Load only the existing root checkout's local environment values into the child process and run `npm run build`; do not copy the environment file into the worktree.

- [ ] **Step 5: Browser verification**

Refresh the existing local preview and inspect Appearance, Teams, and Rent Policy at 1440x900 and 390x844. Verify semantic accent selection, compact preview, logo controls, concise copy, approval warning, People link, no document overflow, and zero Settings console errors. Do not upload a real customer logo or approve a rent policy during verification.

- [ ] **Step 6: Final status**

Run `git status --short --branch`, report the exact HEAD and ahead/behind count, and keep the branch local unless the user separately asks to push, merge, migrate, or deploy.
