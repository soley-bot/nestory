# Invitation Onboarding Design

## Goal

Provide one secure invitation flow in which administrators assign workspace
access but never create, view, or transmit user passwords. Opening a valid
invitation email must establish a verified Supabase session and continue
directly to Nestory's access review.

## User Flows

### New Auth identity

1. An administrator creates a Nestory invitation with an email, role, optional
   branch scope, and optional linked staff record.
2. Nestory asks Supabase Auth to send an administrative invitation.
3. The recipient opens the branded invitation link.
4. `/auth/confirm` verifies the Supabase invite token, persists the authenticated
   session, and redirects to the matching `/accept-invite` route.
5. Nestory displays the organization, role, scope, and linked staff record.
6. The recipient creates and confirms a password, then explicitly accepts.
7. Nestory creates the organization membership and routes the user to the
   workspace.

### Existing Auth identity

1. An administrator creates or resends the Nestory invitation.
2. Supabase reports that the email already exists.
3. Nestory sends a non-creating magic link for the same invitation.
4. The recipient opens the branded link.
5. `/auth/confirm` verifies the magic-link token, persists the existing user's
   session, and redirects to `/accept-invite`.
6. Nestory displays the assigned access and an **Accept invitation** action.
   It does not ask for or change the existing password.
7. Acceptance creates the organization membership and opens the workspace.

## Security Boundaries

- Supabase Auth remains authoritative for identities, verified email addresses,
  passwords, sessions, and tokens.
- Nestory remains authoritative for invitation intent, assigned role and scope,
  staff linkage, explicit acceptance, membership creation, and activity history.
- Administrators never choose or receive user passwords.
- Public signup and public workspace creation remain disabled.
- A valid Supabase session alone does not grant workspace access.
- Invitation lookup and acceptance require the authenticated, confirmed email
  to match the invitation email.
- Membership is created only after explicit acceptance of a pending,
  unexpired invitation.
- Redirect destinations remain restricted to Nestory's allowlisted internal
  authentication paths.
- Tokens, passwords, server secrets, and full authentication errors must not be
  written to application logs or invitation delivery records.

## Callback And Cookie Handoff

`/auth/confirm` handles invite, magic-link, and recovery token hashes. For invite
and magic-link verification, it must:

1. Validate the token hash and supported OTP type.
2. Bind Supabase's session-cookie writes to the actual redirect response.
3. Redirect only to the validated invitation acceptance path.
4. Confirm through an integration test that the redirected request can call
   `auth.getUser()` without an intervening password login.

Invalid, expired, or mismatched links return to a clear invitation-unavailable
state. They must not silently downgrade to the ordinary password-login page.
Recovery tokens retain their separate password-recovery marker and route.

## Acceptance And Password Ordering

For a new identity, password validation occurs on the acceptance screen. Nestory
sets the password before creating membership. If password creation fails, the
invitation remains pending and no membership is granted. After the password is
set successfully, the existing checked invitation-acceptance RPC creates the
membership and records the audit event.

For an existing identity, password controls are absent and acceptance calls the
same checked RPC directly.

If the membership RPC fails after a new password was set, the invitation remains
pending and the user can retry acceptance with the new password unchanged.

## Email Templates

Nestory maintains three branded Supabase Auth templates:

- **New-user invitation:** explains the organization invitation, verification,
  access review, and user-owned password creation.
- **Existing-user invitation:** explains that the link signs in the existing
  identity for access review and does not change the current password.
- **Password recovery:** explains that the link permits choosing a replacement
  password.

All templates use inline email-safe styling, a plain-language fallback URL, a
clear expiry/security notice, and the existing token-hash redirect contract.
Template copy must not imply that opening the email alone grants membership.

Hosted template configuration is applied through the linked Supabase project
only after comparing the relevant local authentication settings with production.
The operation must not overwrite unrelated SMTP, signup, URL, provider, or rate
limit settings.

## Error Handling

- Existing-user detection accepts Supabase's current `email_exists` code and the
  legacy `user_already_exists` code.
- Delivery failures remain visible as `send_failed` with a safe, bounded error.
- Token verification failures show that the invitation link is invalid or
  expired and direct the recipient to request a resend.
- Email/account mismatches identify the signed-in address and offer a safe
  sign-out/use-another-account action.
- Password failures do not create membership.
- Acceptance is idempotent for an already-accepted invitation and membership.

## Verification

Automated verification includes:

- Callback tests proving invite and magic-link verification writes the session
  to the redirect response.
- Acceptance tests for new-user password creation before membership.
- Acceptance tests proving existing-user invitations do not render or update a
  password.
- Error tests for invalid tokens, mismatched emails, password update failure,
  and acceptance failure.
- Template assertions preserving `TokenHash`, `RedirectTo`, and the correct OTP
  type.
- Focused lint, TypeScript, unit tests, and a production build.

Hosted verification uses disposable addresses:

1. Invite a new Auth email, open the delivered link, create a password, accept,
   and confirm membership plus workspace routing.
2. Invite an existing confirmed Auth email, open the delivered magic link,
   accept without a password prompt, and confirm its original password still
   works.
3. Confirm Supabase Auth logs show token verification and no unexpected signup.
4. Confirm the Nestory invitation records show the correct delivery method,
   accepted state, Auth user link, and audit history.

## Delivery And Provenance

Implementation remains on the isolated authentication branch until tests,
hosted configuration, and production verification are complete. Repository
changes, Supabase configuration changes, deployment IDs, commit SHAs, and any
manual SMTP limitation are reported separately so this work does not overlap or
obscure the other active development session.
