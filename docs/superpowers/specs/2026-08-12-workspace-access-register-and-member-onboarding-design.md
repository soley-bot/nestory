# Workspace Access Register and Member Onboarding Design

Date: 2026-08-12
Status: Approved direction; implementation pending written-spec review
Scope: `/users-roles`, its Staff handoff from People, and presentation-layer integration with the existing invitation contracts

## Purpose

Turn Workspace Access into a compact enterprise access register and replace the separate `Add Staff` and `Invite Staff` actions on that page with one `Add member` workflow.

The redesign preserves Nestory's product boundary:

- People owns operational Staff records.
- Workspace Access owns invitations, memberships, roles, branch scope, Staff linkage, and access recovery.
- Operations roles require an active Staff record and active branch.
- Super Admin and Finance roles are organization-wide and cannot carry Staff or branch scope.
- Supabase Auth remains the identity, session, and email-delivery authority.

The administrator sees one continuous workflow even though Staff persistence, invitation persistence, and provider email delivery remain separate recoverable operations.

## Goals

1. Make review and management of current access the first and dominant task.
2. Give the page one primary action: `Add member`.
3. Let an Operations invitation select an existing Staff record or create one inline without leaving the dialog.
4. Keep People capable of creating Staff who do not need application access.
5. Preserve all existing access invariants, invitation recovery states, deep links, duplicate guards, dirty-draft protection, and final-Super-Admin protection.
6. Use existing shadcn/Radix primitives and Nestory tokens without a persistent side inspector.
7. Keep the page dense and direct: no generic introduction paragraph, redundant metric strip, or decorative nested cards.

## Non-goals

- Public signup or self-service workspace creation.
- Changing the five fixed workspace roles.
- Making Staff creation and invitation delivery one database transaction.
- Editing an invitation email in place.
- Showing revoked invitation history without a dedicated read-model decision.
- Replacing People as the Staff directory.
- Changing invitation acceptance, password proof, tenant routing, or Supabase Auth behavior.
- Editing backend-owned invitation actions while the admin-onboarding backend worktree is active.

## Page Layout

### Settings navigation

Keep the existing Settings header and settings-section navigation, but render the section rail compactly with the current section visibly selected. The rail may horizontally scroll at narrow widths; it must not create document-level horizontal overflow.

### Workspace Access header

The content header contains only:

- `Workspace access` as the page title; and
- one primary `Add member` button.

Remove the separate `Add Staff` action from Workspace Access. Do not add permanent helper copy under the title.

### Access register

Use one full-width bordered register surface with line-style tabs:

1. `Active` — default view; current memberships.
2. `Invitations` — pending, failed-delivery, and expired invitations.
3. `No access` — active Staff records without a live invitation or membership.

Do not add a `Revoked` tab. The current access loader intentionally returns only pending, `send_failed`, and expired invitations.

The toolbar contains:

- always-visible name/email search;
- access-level filter;
- scope filter; and
- a compact column-visibility menu only if it materially helps narrower desktop widths.

The default Active columns are:

- Member;
- Access level;
- Scope;
- Staff record; and
- row actions.

Row actions use shadcn `DropdownMenu` or visible compact buttons when there are fewer than three actions. Row selection does not open a side inspector. `Manage` expands a single inline edit row or opens a focused dialog; it must preserve the current draft, consequence, removal, and final-admin protections.

Invitations use the same register rhythm with visible delivery-state badges and resend, correct, or revoke actions. No-access Staff rows use `Add access`, which opens the unified dialog prefilled to that Staff record.

## Unified Add Member Workflow

Use a responsive shadcn `Dialog`, not `SideDrawer`. The dialog is centered on desktop and becomes a contained near-full-screen surface on small screens. It has one title, one step indicator, one primary action per step, and no generic instructional paragraph.

### Step 1: Identity and access

Fields:

- Invitation email;
- Access level; and
- Access scope when the selected role is Operations.

Selecting Super Admin or a Finance role clears Staff and branch values and skips the Staff step. Selecting an Operations role requires branch scope and continues to Step 2.

### Step 2: Staff record, Operations only

The administrator can:

- select an existing active Staff record without active access or a live invitation; or
- create a Staff record inline.

Inline Staff creation requests only the fields needed to establish an operational record safely:

- Staff name;
- party type, defaulting to Individual;
- primary email, prefilled from the invitation email but independently editable;
- primary phone, optional; and
- Staff role, fixed and hidden from ordinary editing.

The invitation email and Staff primary email are not forced to match. Preserve the existing warning when they differ.

Before creating a new Staff record, show matching existing Staff candidates by normalized email when available so the workflow does not encourage duplicate People records.

### Step 3: Review and invite

Show only the consequential values:

- invitation email;
- access level;
- scope; and
- Staff record when applicable.

The primary action is `Send invitation`. Back returns to the previous applicable step without losing values.

## People Integration

People and Staff pages retain `Add Staff` because operational Staff may not need application access.

After Staff creation, the existing success action becomes `Grant workspace access` and opens:

```text
/users-roles?personId=<person-id>
```

Workspace Access opens the unified dialog with that Staff record and its primary email prefilled. Staff detail and Staff register access-status actions continue to use the same destination rather than embedding a second access form in People.

## Deep Links and Focus

Preserve these URL contracts:

- `personId` with no access opens Add member prefilled to that Staff record;
- `personId` plus `invitationId` selects Invitations and focuses the invitation row;
- `personId` plus `memberId` selects Active and focuses the membership row; and
- a direct valid `invitationId` or `memberId` focuses the corresponding row when no person is supplied.

After closing a dialog or confirmation, restore focus to its opener. After an invitation persistence result, focus the resulting invitation row or the relevant recovery action.

## Mutation and Recovery Model

### Existing Staff

Submit the existing Staff ID, email, role, and scope through the finalized backend invitation action. Preserve server-side organization, active-Staff, branch, role-shape, duplicate, and authorization checks.

### New Staff

The client-visible workflow has two durable phases:

1. create the Staff record through the existing People mutation boundary; then
2. create and deliver the invitation through the finalized organization invitation boundary.

The UI must never claim these phases are atomic.

Recovery behavior:

- If Staff creation fails, remain on Step 2 with field or server errors and do not attempt an invitation.
- If Staff creation succeeds but invitation creation fails, retain the Staff record, report `Staff saved; invitation not created`, and offer `Retry invitation`. The Staff appears in `No access` after refresh.
- If invitation persistence succeeds but provider delivery fails, close or transition to Invitations, focus the failed row, and report `Invitation saved; delivery failed`. The row offers resend.
- If delivery may have happened but state finalization fails, do not claim success. Surface the finalized backend's bounded recovery state and direct the administrator to Invitations.

Do not roll back or delete a valid Staff record because a later external email step fails.

## Backend Worktree Boundary

The active backend worktree owns:

- `src/features/organization/actions.ts`;
- invitation-delivery classification;
- invitation completion URLs;
- pending-invitation correction actions; and
- related Supabase migrations and tests.

Frontend implementation in this worktree must consume the finalized exports after integration and must not edit that shared action file in parallel.

The presentation work can remain isolated in:

- `src/features/organization/components/access-settings-screen.tsx`;
- focused new components under `src/features/organization/components/`;
- focused component tests; and
- People presentation only where the existing handoff label or link needs adjustment.

## Component Boundaries

Keep the current feature from growing into one larger component file:

### `AccessSettingsScreen`

Owns settings-navigation guard registration, URL-derived focus, loaded access data, active register view, and dialog open state.

### `AccessRegister`

Owns tabs, toolbar, table composition, responsive columns, row focus, empty states, and pagination presentation. It receives already-loaded memberships, invitations, Staff options, and callbacks.

### `AddMemberDialog`

Owns the three-step state machine, field validation presentation, existing/new Staff choice, draft dismissal guard, and recovery transitions. It calls existing server actions but does not own authorization rules.

### Existing row editors

Membership update/removal and invitation resend/revoke/correction remain focused units. Their consequential confirmations and draft behavior are preserved rather than rewritten into generic table state.

## shadcn Primitive Contract

Use the repository's existing primitives:

- `Button`;
- `Tabs`;
- `Input`;
- `SelectControl` or the existing Staff combobox;
- `Table`;
- `Badge`;
- `DropdownMenu`;
- `Dialog`;
- `AlertDialog` or the existing confirmation primitive; and
- the existing feedback/toast surface.

Do not install a second component system. Extend primitive class names through existing tokens rather than hard-coded page colors.

## Visual Direction

The page remains quiet, neutral, and operational:

- existing foreground, muted, border, background, primary, warning, and danger tokens;
- compact 32-36px controls;
- 40-48px table rows depending on whether member email occupies a second line;
- one restrained border around the register;
- line-style selected tabs;
- sentence-case labels; and
- organization accent used only for selection, focus, links, and primary actions.

The signature element is the lifecycle register: Active, Invitations, and No access are three views of the same access-control system rather than three unrelated cards.

## Responsive Behavior

### Desktop and laptop

The register uses the available content width. At 1440x900 and 1280x800, the page title, Add member action, tabs, toolbar, table header, and first rows remain in the initial viewport.

### Narrow desktop and tablet

Hide lower-priority Staff-record detail before truncating names, email, role, or scope. The table may scroll inside its own bordered region only when necessary; the document must not scroll horizontally.

### Mobile

Use compact access cards or a semantic stacked table treatment. Preserve the Active, Invitations, and No access views, search, status, primary row action, and deep-link focus. The Add member dialog uses the viewport safely and keeps its Back/Continue/Send controls reachable without covering fields.

## Accessibility

- Dialog title and current step are announced.
- Focus enters at the first relevant field, remains trapped, and returns to the opener.
- Escape or overlay dismissal of a dirty dialog opens a discard confirmation.
- Back and Continue are ordinary buttons with stable accessible names.
- Required fields, inline errors, and the first invalid focus target remain explicit.
- Conditional Staff fields are removed from the accessibility tree when not applicable.
- Status changes use an existing live feedback surface.
- Tabs expose selected state and keyboard behavior through the shadcn primitive.
- Table headers, action names, focused rows, and empty states remain semantic.
- The design must survive keyboard-only use, reduced motion, 200% zoom, and mobile reflow without document-level horizontal overflow.

Removing generic help text does not remove labels, required indicators, validation, consequences, recovery messages, or destructive-action confirmations.

## Testing and Verification

### Component tests

- Active is the default register view.
- Invitations includes pending, failed, and expired states.
- No access includes only eligible active Staff without live access.
- No Revoked view is rendered.
- Add member opens one dialog.
- Finance and Super Admin skip Staff and clear branch/Staff values.
- Operations requires branch plus existing or newly created Staff.
- Existing Staff duplicate and invitation duplicate paths focus the existing record.
- Staff-email mismatch remains a warning, not a forced equality rule.
- New Staff success proceeds to review without losing the returned person ID.
- Each partial-failure state exposes the correct recovery action.
- Dirty dismissal, settings navigation, and focus restoration remain guarded.
- `personId`, `invitationId`, and `memberId` deep links choose the correct view and focus target.
- Final-Super-Admin protections remain visible and enforced.

### Focused regression gate

- organization invitation action tests;
- access settings component and SSR tests;
- People form, People screen, Staff detail, and access-status tests;
- settings navigation guard tests;
- TypeScript and lint for touched files; and
- UI copy and route coverage.

### Browser gate

With the local five-role fixture:

1. open Active and manage an existing member;
2. open Add member and invite a Finance role without Staff;
3. open Add member and choose an existing Staff member for Operations;
4. create Staff inline for Operations and exercise the recoverable invitation path;
5. enter from People through `Grant workspace access`;
6. open pending, failed, expired, member, and no-access deep links;
7. verify keyboard focus, Escape/dirty confirmation, success/error announcements, and browser back behavior; and
8. verify 1440x900, 1280x800, 390px mobile, and 200% zoom without document overflow.

Do not send a real hosted invitation or mutate production during frontend verification.

## Evidence and Research Basis

The design was checked against:

- the live local Workspace Access, Invite Staff, and Add Staff states;
- the current role-scope and invitation SQL contracts;
- People-to-Workspace-Access deep links;
- the active admin-onboarding backend design and worktree ownership;
- Carbon data-table guidance for full-width toolbars and progressive disclosure;
- Atlassian hierarchy and spacing guidance; and
- shadcn Table, Tabs, Dialog, and DropdownMenu primitives.

The conflict audit is saved at `artifacts/access-flow-conflict-audit-2026-08-12/audit.md` and is intentionally excluded from the specification commit.
