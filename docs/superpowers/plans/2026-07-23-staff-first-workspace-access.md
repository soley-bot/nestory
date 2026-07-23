# Staff-first Workspace Access Implementation Plan

**Goal:** Clarify Staff records versus workspace authentication and make Staff the primary entry point for granting, reviewing, and managing workspace access without changing the underlying auth enums or duplicating the access-management surface.

**Architecture:** Keep operational Staff identity in `people` / `person_roles` and authentication authorization in `organization_invitations` / `organization_members`. Add a server-derived, presentation-safe access-status adapter in the organization feature, reuse it in Staff list/detail views, and hand all mutations to the existing admin-only server actions and RPCs. Keep `/users-roles` as the compatible route while renaming its visible surface to Workspace Access.

**Constraints:** No commit, push, pull request, deploy, linked production Supabase mutation, or broad toast migration. Preserve last-admin, self-removal, invitation verification, uniqueness, scope, expiry, resend/retry/revoke, audit, RLS, and service-role delivery boundaries.

---

## Slice 1: Access status model and loader

- Add a pure discriminated view model for `no_access`, `invitation_pending`, `delivery_failed`, `expired`, and `active_workspace_access`.
- Derive it from active memberships and relevant invitations without exposing raw provider errors or secrets.
- Define deterministic precedence and safe action metadata.
- Load by Staff person ID for list and detail consumers; deduplicate multi-role Staff.
- Add focused unit/data tests for all states, precedence, expiration, and legacy unlinked records.

## Slice 2: Staff list and detail entry points

- Pass access status through the Staff module instead of dropping it in `PeopleScreen`.
- Add a compact table-first status/action treatment on `/staff`.
- Load the same status on `/people/[personId]` and show a Workspace Access section for Staff records.
- Use state-specific primary actions: grant, review/retry, resend, or manage.
- Build Staff-first links using only the person ID as trusted identity; directory email is a convenience prefill.
- Revalidate Staff/list/detail routes after access mutations.
- Add component and route tests for all states and inactive/archived behavior.

## Slice 3: Workspace Access terminology and form workflow

- Rename all user-facing Users & Roles references to Workspace Access while retaining `/users-roles` compatibility.
- Rename Role to Access level, Scope to Access scope, and Staff link to Staff member or Linked staff record.
- Display Admin as Administrator and Member as Team Member while retaining stored enum values.
- Reorder invite fields to Staff member, Invitation email, Access level, Access scope, review effect, send.
- Replace the generic Staff select with the shared accessible `PersonSelect` configured for active Staff only.
- Make Staff creation go through `/staff?action=create`.
- Preserve a validated selected Staff after failed submissions; treat URL email as untrusted and source the initial email from current Staff data.
- Keep legacy unlinked memberships visible with “Not linked to a Staff record” and allow linking through the existing guarded member-update action.
- Keep resend available, retain explicit confirmation for revoke/removal/unlink, and use bounded action feedback; revalidate after final delivery state.
- Update accept-invite, no-access, settings tabs, search/navigation, and related tests/copy.

## Slice 4: Server validation and compatibility tests

- Validate every submitted person ID belongs to the current organization and has an active, non-archived Staff role before invitation creation or member linking.
- Add an append-only local migration that enforces one non-null Staff person link per organization membership and prevents multiple live invitations for the same Staff person, while preserving multiple legacy unlinked accounts.
- Return bounded, actionable RPC errors for an already-linked or already-invited Staff record.
- Confirm duplicate membership/invitation protection at the RPC/database boundary with pgTAP coverage.
- Test cross-organization, inactive, archived, missing Staff, tampered email/defaults, last-admin, self-removal, and scope behavior.

## Slice 5: Verification and handoff

- Run focused tests throughout implementation.
- Run lint, TypeScript, full tests, and production build.
- If no SQL changes, record database reset/pgTAP/db-lint as not required; otherwise run all database checks locally.
- Run authenticated browser smoke for Staff list, Staff detail, deep-linked invitation defaults, validation recovery, pending/failed/expired/active states, legacy unlinked membership linking, resend/revoke, editing, and removal confirmation.
- Review the complete diff for terminology, auth regressions, scope leakage, and unrelated changes.
- Report exact files/behavior, verification evidence, remaining boundaries, and confirmation that no external release action was taken.
