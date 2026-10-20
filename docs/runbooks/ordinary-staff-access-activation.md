# Enable staff access after workspace setup

New workspaces start with ordinary staff access contained. An accepted Super Admin can prepare branches, roles and property scope before enabling it. Installing the activation feature does not enable any workspace, assign a role, accept an invitation or send email.

## Review and activate

1. Sign in through your own accepted Super Admin account in the intended workspace. Do not use another person's session or invitation link.
2. Prepare at least one active branch. Resolve every unscoped or conflicting property, including archived properties, and review the existing users and invitations in Settings → Access. Existing legacy assignments or an incomplete required access-transition manifest must be resolved through their supported workflow first.
3. Open the staff-access review in Settings → Access. Read the current branch/property counts and the exact affected memberships and live invitations, including their people, branches, roles and permissions. These entries come from the same reviewed snapshot as the confirmation fingerprint, even if the access register below was loaded earlier. Enabling access restores eligible existing ordinary memberships immediately. Pending invitations still require each recipient's own acceptance. This operation creates no memberships or invitations and sends no email.
4. Confirm only after reviewing that exact state. The server requires the actual current Super Admin, the effective privileged step-up policy, and the reviewed authorization version and impact fingerprint. A changed review must be reloaded and deliberately confirmed again; do not automatically retry a stale approval.
5. Verify the enabled state and the `organization_ordinary_access_enabled` audit event. A successful retry after an unknown response returns `already_enabled` without another change or duplicate event. It still checks current authority and step-up.

There is no general disable operation in this feature. No ordinary permission or service credential grants permission to activate. Direct writes to `organization_authorization_states` remain unavailable to application roles.

## Supported API contract

`get_organization_ordinary_access_activation(p_organization_id)` returns a Super Admin-only review: enabled/readiness state, blocker codes, authorization version, complete impact fingerprint, counts and exact `impact_memberships`/`impact_invitations` entries. The preview does not require a new step-up email. Its internal locks keep the review coherent with participating authorization and scope writers. Delivery metadata is excluded from the authorization fingerprint; activation does not inspect or redirect sign-in tokens.

`activate_organization_ordinary_access(p_organization_id, p_expected_version, p_expected_impact_fingerprint, p_confirm)` requires `p_confirm = true` and the exact reviewed preconditions. Application code derives the organization from trusted authentication context. The database independently checks the target organization and current actor.

The forward migration preserves existing activation triggers for legacy assignment containment, required applied transition manifests, branch/property scope and active nonempty custom roles. It does not convert legacy roles or relax step-up. An empty new workspace can activate after creating an active branch; it does not need an existing ordinary membership or pending invitation.

If a new email challenge is required by the effective policy while an email hold applies, stop. Do not disable the policy or manufacture a grant. Separately authorized invitation delivery does not authorize redirecting another recipient's authentication token.

## Verification and release

- `supabase/tests/ordinary_staff_access_activation_test.sql` exercises real database roles, accepted-admin authorization, containment/readiness, stale confirmation, organization isolation and idempotency in synthetic transactions.
- `scripts/ordinary-access-activation-concurrency.node-test.mjs` exercises blocked concurrent activation, administrator revocation and branch-readiness changes against a verified isolated Docker target. It is part of the canonical Database CI job.
- Application tests cover trusted scope, explicit confirmation, error recovery and the Settings panel. The canonical generated-type comparison checks both RPC signatures against replayed migrations.
- The PR-only Synthetic daily workflow runs the existing financial journey first, then `scripts/smoke-daily-polish.mjs` against the same attested disposable Linux runtime. Its separate synthetic workspace checks cancel, Escape, stale consent after a second-tab branch change, deliberate activation, one audit event, reload and ordinary staff boundaries. It does not exercise or modify a hosted workspace.
- Browser evidence is recorded separately as `polish-result.json`. Compact viewport checks are layout evidence, not proof of native browser 200% zoom. Treat any unexecuted or failed case as incomplete acceptance.

Release migrations only through exact merged-main CI and the protected production database environment, as required by [the release runbook](production-database-release.md). The migration installs functions only. Any live activation remains a separate deliberate administrator action after deployment.
