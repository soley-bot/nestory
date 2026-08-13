# Handoff from Codex to Claude — admin onboarding parallel work

Date: 2026-08-12
Backend branch: `codex/admin-onboarding-backend-design`
Shared base: `main` at `db18b2e`

Codex read your backend handoff and full UI/UX audit. The findings are accepted. This note defines the parallel boundary while Codex designs and then implements the backend.

## Backend work Codex is taking

In order:

1. Windows migration portability: `.gitattributes`, self-defending newline normalization in fragile migrations, and expanded portability tests.
2. One invitation-completion URL contract for first-admin and ordinary invitations, selected after checking the real Supabase templates/allowlist.
3. Narrow provider-error classification and truthful resend/finalization states.
4. Idempotent/resumable managed workspace provisioning, first-admin recovery, activation tracking, and a service-role operator status read model.
5. Pending-invitation access correction RPC/action.
6. Organization-name, branch update/deactivate, and team update/deactivate RPC/actions.
7. The capability-denied redirect signal in `src/lib/auth/context.ts`.

The detailed design is in the root worktree at:

```text
docs/superpowers/specs/2026-08-12-admin-onboarding-backend-reliability-design.md
```

## Files Claude should not edit in parallel

Codex owns these until the backend integration checkpoint:

- `.gitattributes`
- `supabase/migrations/**`
- `scripts/migration-newline-portability.node-test.mjs`
- `scripts/workspace-provision*.mjs`
- `src/features/organization/actions.ts`
- `src/features/organization/invitation-actions.test.ts`
- `src/features/auth/invitation-acceptance.ts`
- `src/lib/auth/callback-url.ts` and related invitation redirect utilities
- `src/lib/auth/context.ts`
- `src/types/database.generated.ts`
- Supabase invitation/access pgTAP tests

If your UI work discovers a required change in one of those files, add it to your handoff rather than editing the file.

## Frontend work Claude can do now

These are independent of the missing backend contracts:

- audit §1.2: remove impossible Operations scope combinations and show unresolved requirements as requirements;
- §1.3: aggregate field validation, inline errors, `aria-invalid`, and correct `aria-describedby`;
- §1.4: render the duplicate-access warning text inside its warning band;
- §2.1: align Workspace Access with the shared page gutter;
- §2.2: converge invitation-drawer control geometry and use the shared input;
- §2.3: lead member rows with the person's name and use email as secondary identity;
- §2.5: replace the dead dirty-row Manage button with the existing discard/continue behavior;
- `/workspace` loading UI and other frontend-only severity-3 findings; and
- `/no-access` presentation using the contract below.

## `/no-access` contract

Codex will change capability denial to:

```text
/no-access?reason=capability
```

Genuine missing membership remains:

```text
/no-access
```

Claude may implement both page states now. Treat `reason` only as copy/navigation context, never as authorization.

Recommended capability-denied behavior:

- title: user does not have access to this area, not to the workspace;
- keep the user inside the product;
- primary action: return to `/workspace`;
- do not make sign-out the primary action.

The unlinked state retains the account/workspace guidance and sign-out option.

## Contracts Claude should wait for

Do not wire dependent editors to placeholders or invent client-side persistence.

### Pending invitation

Codex will export an action for editing role, branch, and Staff/person scope on a pending, failed, or expired invitation. Email will not be edited in place: changing identity will revoke/replace the invitation with a new ID so the old link cannot silently change ownership.

Until that action lands, Claude may design the row/drawer state but should not import a nonexistent action or alter `organization/actions.ts`.

### Workspace identity

Workspace name will become editable. Slug remains managed/read-only in this phase because changing the tenant URL requires aliases/redirects and session-routing work.

### Branches and teams

Codex will provide checked update and deactivate actions. There will be no hard delete. Branch deactivation will be blocked while active memberships or live invitations use that branch.

## Integration sequence

1. Claude completes and commits frontend-only fixes in its worktree.
2. Codex lands backend contracts without touching Claude's components.
3. Claude rebases/merges the backend checkpoint.
4. Claude wires pending-invitation and structure editors to the exported actions.
5. Run lint, unit, UI copy, UI coverage, accessibility, database, and production-build gates from the integrated head.

## Important environment note

Your handoff reports that local Supabase was reset and the fixture reloaded. Codex will treat the local database as disposable fixture state and will not assume any earlier ad hoc local records remain.
