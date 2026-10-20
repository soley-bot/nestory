# Renew an exact first-admin reservation

Use `public.resume_client_workspace_invitation_exact` only after its forward
migration has reached production through the protected database release workflow.
This service-only RPC renews an existing expired, undelivered first-admin
invitation. It does not create a company, send email, create or modify an Auth
user, accept an invitation, add membership, create a branch, or enable ordinary
access. Existing provisioning and authenticated administrator recovery remain
separate workflows.

## Review and authorization

Read and approve one exact organization and invitation before the request:

- Organization ID, exact stored name and slug.
- Invitation ID and exact original administrator email.
- Original `expires_at`, preserving all timestamp digits, and authorization
  state `version`. Do not pass the expiry through JavaScript `Date`, which loses
  PostgreSQL microseconds.
- Status `pending`, already expired, role `super_admin`, no branch, custom role,
  person, inviter, accepted/revoked marker, Auth-user binding, delivery method,
  or last-sent marker.
- Zero organization members and branches; ordinary access and the transition
  flag both false.
- Exactly one invitation eligible for the provisioner's original-admin resume
  selection. A competing pending, failed, or expired invitation for that
  administrator makes recovery ambiguous.

An account-linked invitation can be unaccepted. This endpoint deliberately
rejects that wider case; a non-null `auth_user_id` is not proof of acceptance.
The person accepting later must personally sign in to the confirmed email that
matches the invitation. A signed-in browser alone does not verify that identity.

## One authorized request

Use the existing protected Supabase service credential for this project through
an approved server-side caller. An anonymous key or the owner's browser session
cannot execute this RPC. Never retrieve browser tokens, expose a service
credential, emulate service claims in production SQL, or rerun an Auth invitation
helper to recover this reservation.

The Supabase client invocation is:

```ts
await protectedServiceClient.rpc("resume_client_workspace_invitation_exact", {
  p_organization_id: reviewed.organizationId,
  p_invitation_id: reviewed.invitationId,
  p_expected_name: reviewed.organizationName,
  p_expected_slug: reviewed.workspaceSlug,
  p_expected_email: reviewed.administratorEmail,
  p_expected_expires_at: reviewed.originalExpiresAt,
  p_expected_authorization_version: reviewed.authorizationVersion,
})
```

`reviewed` is a fixed operator-approved record, not a lookup that automatically
refreshes changed expectations. The successful response contains exactly
`organization_id`, `invitation_id`, and the new `expires_at`.

The transaction locks the organization, authorization state, and same-company
invitations with `NOWAIT`, checks the reviewed values, calls the existing
provisioner once, and verifies its result. Only the target invitation's
`invited_at`, `expires_at`, `updated_at`, and cleared `delivery_error` may change;
status stays `pending`. Exactly one `workspace_provisioning_resumed` audit event
is added. Company identity, all other invitations, prior audit rows, membership,
branches, and the entire authorization state must remain unchanged. A failed
postcondition rolls back the entire renewal.

## Stop and reconcile

Do not automatically retry, including after a timeout or lost response.

- `42501`: the request is not authorized.
- `22023`: a required expectation is missing or invalid.
- `55P03`: a competing operation holds a required lock. Nothing was renewed by
  this attempt.
- `55000`: the reservation changed, its scope is unsupported, the transaction is
  too old to issue a future deadline, or a postcondition failed.

After an uncertain response, read the exact stored invitation and its resume
audit event. Compare the expected and returned identities, old and current
expiry, unchanged membership and authorization state, and the one new audit
entry. A stale-CAS rejection prevents a second renewal; it does not identify
which competing caller committed. Do not silently replace the original expected
expiry/version to make a retry succeed.

After confirmed success, the owner personally accepts the existing invitation
using the matching confirmed account before the new deadline. Verify the
accepted membership and the owner's usable session separately. This operation
does not authorize ordinary access, staff invitations, or asset copying.
