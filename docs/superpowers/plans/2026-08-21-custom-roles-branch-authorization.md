# Custom Roles And Branch Authorization Implementation Plan

**Goal:** Replace the four legacy ordinary fixed roles with organization-defined
roles, preserve protected Super Admin, and isolate every ordinary user to one
branch across every data and application boundary.

**Baseline:** detached `05e84e9b75c4507f2b133ccaf8e7de93a20a5a92`,
99 local/linked migrations. Local implementation/testing only. No commit, push,
hosted write, PR, deployment, or production release.

**Spec:** `docs/superpowers/specs/2026-08-21-custom-roles-branch-authorization-design.md`

## Rulings from the current audit

1. The five-user transition manifest is approved, but ordinary activation stays
   closed until a separate protected release applies all five assignments
   atomically and proves zero legacy ordinary memberships.
2. Current broad Property/Person member-read access is unintended and closes;
   it is not translated into role permissions.
3. Finance keys remain subject to narrower existing invariants. In particular,
   `finance.submit_expenses` is the compatibility authority for maker
   submissions, not general correction; `finance.correct_records` does not
   grant exceptional reversal/recovery; `finance.close_periods` does not grant
   reopen/unlock. Branch-aware period locks preserve legacy null-branch locks as
   organization-wide blockers while new ordinary closes apply only to the
   caller's branch.
4. `maintenance.complete` retains assignee and execution-mode distinctions.
5. Four Unit RPC overloads are released API and must remain. The handwritten
   TypeScript override must express both overloads and nullable numeric inputs.
6. Scoped creation is approved: add branch-aware Property overloads, preserve
   released unscoped signatures as contained compatibility interfaces, add an
   audited many-to-many Person-to-branch relationship, and make ordinary Person
   creation atomic with the caller's assigned active branch. Standalone Person
   creation remains Super-Admin-only.

## Task 1: Readiness and permission catalogue

- Record baseline SHA, 99-migration parity, approved transition aggregates,
  Unit columns/overloads, explicit Data API grant posture, and unresolved scope.
- Write failing tests for the exact 23-key catalogue, ordering, type guard, and
  View dependency closure.
- Implement `permission-catalog.ts` and update `PROJECT.md` without weakening
  finance, lease, maintenance, rent, evidence, or audit invariants.

## Task 2: Role storage and transition gate

- Create the migration with `npx supabase migration new
  custom_role_catalog_and_memberships`.
- Write pgTAP first for enum contents, role lifecycle, organization isolation,
  dependencies, optimistic versioning, affected-user confirmation, per-key
  audit, direct-write denial, grants, and Super Admin controls.
- Add role/permission tables, nullable membership/invitation custom role link,
  compatibility constraints, and an explicit ordinary-activation gate.
- Never rewrite legacy memberships in a local migration. Store/validate the
  approved manifest contract without applying hosted assignments.
- Explicitly grant intended table/function access; revoke `PUBLIC` and `anon`.

## Task 3: Property branch foundation

- Create `property_branch_scope_foundation` through the CLI.
- Add nullable `properties.branch_id`, composite organization integrity, and
  indexes for every policy/FK predicate.
- Deterministically backfill only single-active-branch organizations. Leave
  zero/multi-branch scope unresolved and Super-Admin-only.
- Add readiness and checked assignment functions. Ordinary assignment requires
  active branch, active non-empty role, resolved organization scope, approved
  transition state, and zero legacy ordinary memberships when activation opens.

## Task 4: Core domain authorization

- Create `branch_scope_domain_enforcement` through the CLI.
- Add private, indexed permission/branch/property/person visibility helpers.
- Replace broad Property, Unit, Lease, and Person member policies with explicit
  `TO authenticated`, organization ownership, permission, and branch predicates.
- Write the same-branch allowed, same-branch missing permission, other-branch
  with permission, cross-organization, unresolved, and Super Admin matrix.
- Update every checked Property/Unit/Person/Lease operation to require exact
  permission plus existing domain invariants.
- Add branch-aware Property creation overloads. Ordinary callers must match
  their assigned active branch; Super Admin may select an active branch. Keep
  old signatures callable but reject unscoped creation after activation.
- Add an indexed, audited Person-to-branch relationship with composite
  organization integrity and no cascaded business deletion. Scoped Person
  creation writes identity and branch relationship atomically; identities may
  have relationships in multiple branches.

## Task 5: Finance, Documents, Maintenance, Activity, and Storage

- Extend branch enforcement through authoritative parents or indexed snapshots.
- Add nullable branch scope to financial month locks: legacy null-branch locks
  block every branch, branch locks block only their branch, and every existing
  lock check must evaluate global-or-matching-branch without weakening the
  current lock invariant.
- Unresolved/multi-parent records remain Super-Admin-only.
- Preserve maker-checker, locks, immutable evidence, publication idempotency,
  owner close ordering, lease-owned rent, assignee/review, and storage metadata
  consistency.
- Storage metadata and object policies must make the same permission/branch
  decision. No client-forged scope.
- Add a full 23-key positive/negative checked-operation matrix.

## Task 6: Application authority and invitations

- Write failing tests for `WorkspacePermissionContext`, Super Admin bypass,
  active role/branch validation, stale/archived/empty denial, and immediate
  permission removal.
- Replace role-name decisions with permission keys in context, navigation,
  loaders, actions, routes, reports/downloads, search, and observability.
- Keep compatibility projections only when derived from permissions plus a
  named business invariant.
- Invitation/member payload is either `{roleKind:"super_admin"}` or
  `{roleKind:"custom",customRoleId,branchId}`. Acceptance persists both
  atomically only after activation/readiness gates pass.

## Task 7: Compact role Settings

- Write red register/editor/action tests before components.
- Keep exact dense columns and one drawer/editor; no catalogue card.
- Implement create, duplicate, save with dependency normalization/removal
  consequence, optimistic conflict reload, assigned archive guard, and concise
  accessibility/responsive behavior.

## Task 8: Branch/team lifecycle

- Create `branch_and_team_lifecycle` through the CLI after failing dependency
  pgTAP.
- Checked update/archive functions lock targets, validate organization
  references, write before/after activity, and never cascade business records.
- Branch archive blocks active ordinary membership/invitation, Property, Team,
  Maintenance/recurrence, or unresolved snapshot dependencies.
- Team archive blocks active named dependencies. Historical labels remain
  resolvable so archived scope never appears as `All branches`.
- Add compact Manage actions/drawers using existing Settings draft patterns.

## Task 9: Unit overload/type reconciliation

- Preserve both create and both update overloads, grants, nullable counts,
  validation, audit values, and rollback semantics.
- Replace the stale handwritten override with an overload-safe explicit union;
  do not rely on `WithArgs` over a generated union.
- Add type-contract tests for both overload families and runtime pgTAP proving
  legacy update retains counts.

## Task 10: Verification and containment checkpoint

- Regenerate types from the local schema and inspect all new contracts.
- Run TypeScript, lint, UI copy/coverage, migration discipline, DB lint, focused
  and full Vitest/pgTAP suites, build, and `git diff --check`.
- Verify authenticated desktop/mobile journeys for Super Admin role management,
  permission dependency/removal, archive guards, branch/team lifecycle, and two
  same-permission users in different branches.
- Prove cross-branch guessed URLs/API calls fail; shared Person relationships
  are partial for ordinary users and complete for Super Admin.
- Rehearse data-preserving containment without applying hosted data.
- Present exact diff, migrations, tests, unresolved inventory, screenshots, and
  containment evidence before any commit or release action.
