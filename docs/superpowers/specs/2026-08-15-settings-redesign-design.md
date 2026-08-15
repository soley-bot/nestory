# Settings Redesign Design

**Date:** 2026-08-15  
**Status:** Approved in chat  
**Audience:** Nestory Super Admins and Finance Managers with rent-policy authority

## Objective

Turn Settings from a mostly read-only collection of loosely connected pages into a clean, trustworthy administration surface that is ready for a customer demonstration. Preserve Nestory's quiet, dense operating style while making editable values, locked values, permissions, save state, and recovery actions immediately understandable.

## Product Decisions

- A workspace subdomain is immutable after provisioning. Settings displays the complete workspace address with a lock state and copy action, but exposes no rename control and no slug mutation.
- A Super Admin may edit the organization display name.
- Personal account preferences remain under `/account` and are not presented as workspace settings.
- Configuration registry definitions remain internal reference data. The current catalogue is removed from customer-facing Settings because it does not persist workspace values.
- Super Admins manage organization identity, appearance, branches, teams, and workspace access.
- Super Admins and Finance Managers may manage rent policy. Every settings destination and control is filtered by capability on the server and repeated at the mutation boundary.

## Information Architecture

Settings becomes one path-based surface:

- `/settings/organization`
- `/settings/appearance`
- `/settings/branches`
- `/settings/teams`
- `/settings/access`
- `/settings/rent-policy`

`/settings` redirects to the first destination allowed for the current role. Legacy destinations remain compatible:

- `/settings?section=organization` redirects to `/settings/organization`.
- The remaining supported `section` values redirect to their matching path.
- `/users-roles` redirects to `/settings/access`.
- The removed `configuration` section redirects to `/settings/organization`.

The application shell treats `/account` as personal account navigation only. It no longer activates the Settings destination.

## Navigation And Page Composition

The page has one visible title and one dominant work surface.

At the top, a compact local navigation separates `Workspace` from `Access`. The Workspace view uses a muted section rail for Organization, Appearance, Branches, Teams, and Rent policy. Access opens the member and invitation workspace. Capability filtering means a Finance Manager sees only Rent policy; a Super Admin sees the complete surface.

On narrower screens, the section rail becomes a horizontally scrollable labelled navigation row without document-level horizontal overflow. Navigation participates in the existing unsaved-change guard.

The content panel uses a readable form width while lists such as branches, teams, and access may use the available workspace width. There is no stack of decorative cards around a second stack of cards.

## Visual Direction

Nestory Settings should feel like a calm control room rather than a marketing dashboard.

- **Palette:** existing neutral background, card, border, foreground, and organization accent tokens. Accent is reserved for selection, focus, links, and primary actions. Semantic success, warning, and danger tokens keep their existing meanings.
- **Typography:** Geist for headings, labels, controls, and body copy. Geist Mono is used sparingly for the workspace address and technical identifiers.
- **Density:** compact navigation and metadata, comfortable form rows, consistent 12/16/24-pixel spacing rhythm, and restrained borders.
- **Signature:** the locked workspace-address row combines a lock marker, the complete subdomain, concise explanation, and a copy action. It communicates a durable tenant boundary without looking disabled or broken.
- **Motion:** only brief state transitions for save feedback and navigation emphasis; reduced-motion preferences remove them.

Each section begins with a plain-language heading and one sentence explaining what changes affect. Empty, blocked, error, saving, and success states tell the operator what happened and what to do next.

## Organization Identity

The Organization page contains:

1. An editable `Workspace name` text field containing the organization display name.
2. A locked `Workspace address` row showing `<slug>.<root-domain>` when the root domain is available, or the slug alone as a safe fallback.
3. A copy-address action that writes the address to the clipboard and announces success.
4. Compact branch and team counts as context, with links to their Settings sections; counts are not presented as editable form fields.

The name form trims surrounding whitespace, requires a non-empty value, enforces the database-compatible maximum length, and disables Save until the value differs from the persisted name. Cancel restores the persisted value.

## Save And Navigation Behaviour

All editable sections use one user-facing save contract:

- Explicit `Save changes` and `Cancel` actions.
- A dirty state appears only after a meaningful value change.
- Saving disables conflicting controls and announces progress.
- Success updates the persisted baseline and briefly confirms `Changes saved`.
- Validation errors appear beside the affected control.
- Server errors remain visible and actionable; they are never converted into apparent success.
- Leaving a dirty section invokes the existing navigation guard with Save, Discard, and Stay choices.

A compact sticky save bar appears only while the current section is dirty or saving. Existing editors may retain their internal implementation while conforming to this shared visible contract; the redesign does not introduce a generic workflow engine.

## Data And Authorization

Organization-name updates use a checked PostgreSQL RPC invoked through a server action. The RPC:

- accepts the target organization ID and trimmed display name;
- resolves the authenticated user server-side;
- requires an active Super Admin membership for that organization;
- validates the name and updates only `organizations.name`;
- never accepts or updates `organizations.slug`;
- appends an `activity_logs` row for the organization with actor, `updated` action, and old/new name values;
- revokes execution from `anon` and grants only the authenticated role.

The action uses Zod validation, returns typed field or form errors, and revalidates only affected Settings and shell destinations.

Workspace access loading no longer silently substitutes a reduced direct-table result when its checked RPC fails. A failed authoritative access load produces an explicit Settings error state instead of blank email values. Unknown database roles do not crash the whole page: they produce a visible data-integrity error while valid rows remain safe to inspect where the contract permits.

Role constants and labels have one feature-owned definition consumed by loaders, actions, and UI controls. English PostgreSQL exception text is translated at one boundary rather than scattered across components.

## Component Boundaries

- `settings-shell`: capability-aware local navigation and responsive page composition.
- `settings-navigation`: route metadata, labels, grouping, and active state.
- `organization-identity-editor`: name draft, locked workspace address, counts, and save controls.
- `settings-save-bar`: shared visible save/cancel/status presentation.
- Existing appearance, branch, team, access, and rent-policy feature components remain feature-owned and are adapted to the shell.
- The oversized access screen is split only along existing responsibilities such as summary, member register, invitations, and dialogs. Behaviour is preserved while render-time state updates and duplicated draft conventions are removed.

No component receives authority solely from visibility. Page contexts, server actions, checked RPCs, grants, and RLS retain enforcement.

## Error Handling

- Invalid or unavailable destinations resolve to the first allowed Settings route or a typed permission page; they do not render an empty shell.
- Failed data loads show a section-level error with a retry route.
- Clipboard failure leaves the address selectable and announces that it could not be copied.
- A failed save preserves the draft and focuses the first field or form error.
- A stale write reports that Settings changed elsewhere and asks the operator to reload; it never overwrites silently.

## Accessibility And Responsive Requirements

- One `h1` for Settings and one `h2` for the active section.
- Navigation exposes its current destination and remains keyboard operable.
- Save and clipboard confirmations use polite live regions; blocking errors use alert semantics.
- Labels, descriptions, and errors are programmatically associated with controls.
- Focus is visible with organization accent tokens and restored after dialogs.
- At 200% zoom and at the 1280x800 target, the document has no horizontal overflow.
- Light and dark themes preserve readable contrast.
- Reduced-motion preferences are respected.

## Test Strategy

Implementation follows test-first development.

- Route tests cover canonical paths, legacy redirects, and role-filtered destinations.
- Component tests cover locked subdomain presentation, copy feedback, organization-name dirty/save/cancel/error states, responsive navigation semantics, and unsaved-navigation protection.
- Data/action tests cover validation, targeted revalidation, authoritative load failure, and unknown-role handling.
- pgTAP tests cover Super Admin success, non-admin rejection, cross-organization rejection, blank/oversized names, grants, and proof that the slug cannot change.
- Existing Settings, Access, Appearance, Branch, Team, and Rent Policy suites remain green.
- Final gates include focused Vitest, TypeScript, ESLint for touched files, database lint/tests for the new RPC, production build, and browser screenshots at 1440x900 and 1280x800 in light and dark themes where the local fixture is available.

## Delivery Boundaries

This change does not add custom roles, generic configuration persistence, subdomain renaming, old-subdomain redirects, public workspace creation, or new account preferences. It does not merge, deploy, or mutate the hosted Supabase project without a separate explicit release instruction.

The work is performed in `D:\nestory\.worktrees\settings-redesign` on `codex/settings-redesign`, based on current `origin/main`, so the active finance-session checkout remains untouched.
