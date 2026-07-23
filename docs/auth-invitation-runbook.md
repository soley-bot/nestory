# Invite-only authentication runbook

Nestory access has two separate records:

1. Supabase Auth owns the identity, verified email, password, recovery,
   session, and JWT.
2. Nestory owns the organization invitation and the active
   `organization_members` row.

An Auth user without an accepted Nestory membership has no workspace access.
An invitation is not access until its verified recipient explicitly accepts
it.

## Normal operations

### Invite a user

1. Sign in as an organization administrator.
2. Open **Workspace Access** and use **Invite Staff**.
3. Choose an active Staff record, confirm or edit its prefilled invitation
   email, then choose the access level and optional access scope. Editing the
   sign-in email does not change the Staff record's operational email.
4. Confirm the record appears under **Pending invitations**, not **Active
   members**.
5. The recipient opens the Supabase email link. A new Auth user creates a
   password; an existing confirmed user keeps the existing password. Both
   review and explicitly accept the Nestory access.
6. Confirm the invitation leaves the pending list and the account appears under
   active members.

Use **Resend** after correcting an email-delivery problem. Resend refreshes the
expiry and delivery state on the same active invitation. Use **Revoke** when
the access offer is no longer valid.

### Provision the first administrator

Run from a trusted server or operator workstation with the local project URL
and a server-only secret/service-role key in the environment:

```powershell
$env:SUPABASE_URL='https://project-ref.supabase.co'
$env:SUPABASE_SECRET_KEY='<server-only secret key>'
$env:NESTORY_APP_URL='https://app.example.com'
npm run workspace:provision -- --name="Example PM" --slug="example-pm" --admin="admin@example.com"
```

`NEXT_PUBLIC_SUPABASE_URL` and the legacy `SUPABASE_SERVICE_ROLE_KEY` are
supported fallbacks. The command validates input, creates the organization and
one pending admin invitation, sends through Supabase Auth, records delivery
failure honestly, and prints only the organization, slug, invited email,
delivery method, and invitation state. It never creates an active membership.
A duplicate slug fails without modifying the existing workspace.

### Remove or change access

Use **Workspace Access**. Removing a membership immediately removes
membership-based RLS access. SQL prevents demoting or removing the final
administrator even if a UI check is bypassed. Do not delete the Auth identity
merely to remove one organization membership.

## Recovery and exceptional cases

- **Invitation delivery failed:** correct the SMTP/provider problem, then use
  **Resend**. Do not add a membership as a workaround.
- **Auth identity exists without Nestory access:** send or resend a Nestory
  invitation. Supabase sends an existing-user magic link with account creation
  disabled; the user explicitly accepts after email authentication.
- **Auth identity was created but membership finalization failed:** keep or
  refresh the pending invitation and resend it. Acceptance is idempotent and
  will create at most one membership.
- **Manual Dashboard invitation:** an operator may use Supabase Dashboard
  **Authentication > Users > Invite user** to establish an Auth identity, but
  that email alone cannot grant Nestory access. Create the pending access in
  Nestory, then use **Resend** after the identity is confirmed; Nestory will
  deliver the matching existing-user claim link and invitation identifier.
- **Forgotten password:** use `/forgot-password`. Responses are neutral whether
  the address exists. The recipient must establish a valid Supabase
  recovery session before `/update-password` succeeds.
- **Break-glass membership repair:** direct database repair is an exceptional,
  reviewed operation. Preserve the final-admin invariant, organization scope,
  and an equivalent `activity_logs` audit record. Prefer repairing/resending
  the invitation and invoking the normal acceptance boundary.

Never insert directly into `auth.users`. Never expose the service-role/secret
key to browser code, logs, tickets, or chat. Never manually insert
`organization_members` during ordinary operations. Nestory never stores custom
invitation tokens or Supabase email tokens.

## Production Supabase checklist

These hosted settings are manual; the repository does not change the Supabase
Dashboard:

- Disable **Allow new users to sign up** in Auth settings. Administrative
  invites remain enabled.
- Set the production **Site URL** to the canonical HTTPS application origin.
- Add only required HTTPS redirect patterns for `/auth/confirm` and
  `/auth/callback`; remove localhost values from production.
- Configure a supported custom SMTP provider with sender address, sender name,
  SMTP host, port, username, and secret/password. Do not commit credentials.
- Apply the branded invite, magic-link, and recovery templates under
  `supabase/templates/`, preserving `TokenHash`, `RedirectTo`, and the correct
  Supabase verification type.
- Verify the provider's sender domain and review rate limits, bounce handling,
  and delivery logs.
- Send one production invitation to a controlled new address and verify
  password setup, acceptance, membership, and `/workspace` routing.
- Send one invitation to a controlled existing Auth user and verify the magic
  link does not reset its password.
- Run one production password recovery and verify the recovery-session gate.

For local testing, Supabase CLI delivers messages to Mailpit at
`http://127.0.0.1:54324`. `supabase/config.toml` disables account creation at
the global Auth gate while leaving the email provider enabled for sign-in,
recovery, administrative invites, and non-creating magic links. It points the
templates at the repository files and allowlists only loopback app URLs. Use
one canonical hostname through each test because session cookies are
host-scoped.
