# Handoff to Codex — backend items from the admin / onboarding / invitations audit

From: UI workstream (`claude/admin-onboarding-invites-audit-7d2a99`, based on `main` @ `db18b2e`)
Date: 2026-08-12
Companion doc: [`docs/ui-ux-audit-admin-onboarding-invites-2026-08-12.md`](docs/ui-ux-audit-admin-onboarding-invites-2026-08-12.md)

These are the items found while auditing the first-admin, workspace-onboarding, and invitation
flows that are **not** presentation work. Nothing here has been changed. Item 1 is blocking and
independent of the audit — please take it first.

---

## 1. BLOCKING — `supabase db reset` fails on any Windows checkout

**Impact:** nobody on a Windows machine can bring up a local database from a clean clone. This is
on `main` today.

**Reproduce:**

```bash
npm run db:reset
```

```
Applying migration 20260810073506_project_owner_distribution_reversals.sql...
ERROR: property cash distribution projection insertion point not found (SQLSTATE P0001)
```

**Cause — confirmed, not inferred.** The repo has **no `.gitattributes`**, and `core.autocrlf`
is `true` on Windows, so migrations check out with CRLF: **60 of 61 files** in
`supabase/migrations/` are CRLF on a fresh Windows checkout.

`20260810073506_project_owner_distribution_reversals.sql` normalises **only one side** of its
comparison. It fetches the predecessor body and strips CRLF:

```sql
v_definition := pg_catalog.replace(
  v_definition, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10)
);
```

but `v_target` and `v_replacement` are dollar-quoted literals **inside the CRLF file**, so they
still contain `\r\n`. `strpos(v_definition, v_target)` is therefore always 0 and the guard at
line 137 raises.

Normalising that one file to LF gets past it and straight into a second instance of the same
bug:

```
ERROR: resolve_owner_event_source_patch_contract_changed (SQLSTATE P0001)
```

Converting **all** migrations to LF makes `npm run db:reset` complete cleanly, and
`npm run db:test:fixture` then loads without error. That was verified end to end in this
worktree; the normalised files were reverted afterwards, so the tree is unchanged.

**The existing guard does not cover these.**
`scripts/migration-newline-portability.node-test.mjs` passes (4/4) — it asserts LF/CRLF
invariance for the petty-cash, branch, owner-opening-roster and owner-import rewrites, but not
for these two migrations.

**Suggested fix, in order of preference:**

1. Add `.gitattributes` with `*.sql text eol=lf` (and probably `* text=auto`). This fixes the
   class of bug rather than the instance. It is a repo-root file, so please land it on your side
   rather than ours to avoid a conflict.
2. Additionally, normalise `v_target` / `v_replacement` in `20260810073506` and the
   `resolve_owner_event_source` patch the same way `v_definition` is normalised, so the
   migrations are self-defending regardless of checkout settings.
3. Extend `migration-newline-portability.node-test.mjs` to cover every migration that performs a
   text rewrite, so the next one cannot slip through.

---

## 2. The first-admin invitation and the in-app invitation use different redirect routes

Two code paths deliver the same kind of invitation to two different landing routes:

| Caller | `redirectTo` |
|---|---|
| [`scripts/workspace-provision-core.mjs:122`](scripts/workspace-provision-core.mjs:122) | `/auth/confirm?next=/accept-invite?invitation=…` |
| [`src/features/organization/actions.ts:513`](src/features/organization/actions.ts:513) | `/auth/complete?next=/accept-invite?invitation=…` |

`/auth/confirm` is the PKCE/`token_hash` route ([route.ts](src/app/auth/confirm/route.ts));
`/auth/complete` is the implicit-fragment route
([page.tsx](src/app/auth/complete/page.tsx)). They are not interchangeable — which one works
depends on the Supabase email template and flow type in use.

So the very first invitation a workspace ever receives — the one that creates its Super Admin —
travels a different path from every subsequent invitation, and only one of the two is exercised
by the in-app flow that gets regular use. Please confirm which is correct for the configured
email templates and converge them.

## 3. Resend reports a delivery failure as if nothing were recorded

[`resendOrganizationInvitationAction`](src/features/organization/actions.ts:320) collapses two
different outcomes into one message:

```ts
if (finalizeResult.error || delivery.error) {
  return { message: "Invitation email could not be resent.", status: "error" };
}
```

When `delivery.error` is set, the action has *already* called
`mark_organization_invitation_delivery_failed` and the invitation's state has changed on the
server. The user is told the resend failed, with no indication that the record moved to
`send_failed`. The initial-invite path handles this correctly — it says "Invitation saved, but
email delivery failed. Retry from Pending invitations."
([actions.ts:281](src/features/organization/actions.ts:281)) — so the two paths should agree.

## 4. `isExistingAuthUserError` matches on substrings

Both delivery paths fall back to string matching when the provider returns no error code:

```ts
normalized.includes("already") || normalized.includes("registered") || normalized.includes("exists")
```

([actions.ts:499](src/features/organization/actions.ts:499),
[workspace-provision-core.mjs:139](scripts/workspace-provision-core.mjs:139))

Any unrelated provider error containing one of those words — a rate-limit or SMTP message that
happens to say "already" — silently reroutes an invite into the magic-link branch with
`shouldCreateUser: false`, which then fails for a different reason. Worth narrowing to the known
codes and treating the rest as a hard failure.

## 5. Needed to fix UI findings — server-side work that does not exist yet

Two items in the audit cannot be fixed from the presentation layer:

- **§2.4 — editing a pending invitation.** The UI can only resend or revoke. There is no RPC to
  amend a pending invitation's role, branch, or email, so a typo'd invite must be revoked and
  recreated (invalidating a link the invitee may already hold). An
  `update_organization_invitation` alongside `refresh_organization_invitation` would let us add
  an edit affordance to the pending row.
- **§2.6 / §2.7 — organization structure is create-only.** There are
  `create_organization_branch` and `create_organization_team` RPCs and no update or deactivate
  counterparts, and no way to change the workspace name or slug. So a branch code typed wrong
  during onboarding is permanent from the UI, and that code is what every invite screen shows in
  its Access-scope dropdown. We can build the editors as soon as there is something to call.

## 6. Coordination point — one shared file

Audit §1.1: a member who lacks a capability is sent to `/no-access` and told they are "not linked
to this workspace", with sign-out as the primary action. Fixing the page copy is ours, but the
page cannot tell the two cases apart without a signal from the redirect:

```
src/lib/auth/context.ts:192   redirect("/no-access")   // capability denied
src/lib/auth/context.ts:175   redirect("/no-access")   // genuinely no membership
```

We would like line 192 to become `redirect("/no-access?reason=capability")` and leave 175 alone.
That is a one-line change in shared auth plumbing — **tell us whether you want to make it or
whether we should**, so we don't both touch `context.ts`.

## 7. Dead data (low priority)

`accessRows` renders a "Linked staff record" value of `"Not linked to a Staff record"` for
Operations roles before a person is chosen, which the UI treats as a description of the pending
grant. It is really an unmet requirement. Not a backend bug, but if `create_organization_invitation`
ever grows a dry-run/preview shape, that is the natural place for the distinction to live.

---

## What was touched in this worktree

Nothing in `src/`, `supabase/`, or `scripts/`. `supabase/migrations/` was temporarily normalised
to LF to reproduce item 1 and then reverted (`git checkout -- supabase/migrations`; tree
verified clean). Added: the two docs above, and `.claude/launch.json` so the dev server can be
started on an auto-assigned port without colliding with your `compact-end-to-end-fixture` server
on 3000.

One environment note: reproducing item 1 required `npm run db:reset`, which wiped the local
Supabase database. It has been re-migrated and `npm run db:test:fixture` reloaded successfully,
so the local stack is back to a seeded state — but if you had unsaved local data outside the
fixture, it is gone.
