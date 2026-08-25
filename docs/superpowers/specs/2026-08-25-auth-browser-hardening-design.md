# Authentication and Browser Hardening Design

## Scope

This remediation enforces application-level and local source-controlled password protections plus browser protections now, and stages an email-only privileged step-up without changing hosted services. It preserves host-scoped authentication, invitation email binding, same-origin `/auth/session`, recovery markers, ordinary-user access, and current RLS behavior.

Supabase email/password, magic links, and email OTP remain AAL1. Nestory's Resend-delivered code is therefore named **privileged email step-up**, never Supabase MFA or AAL2. Phone and user-facing TOTP are out of scope.

## Enforced now

- Application invitation and recovery flows require new and changed passwords to contain at least 12 characters, lowercase, uppercase, and a digit. `supabase/config.toml` mirrors that policy for local GoTrue. Hosted Auth configuration is unchanged in this lane, so direct hosted GoTrue password updates are not claimed as enforced until the approved hosted-setting rollout gate is completed. Existing password sign-in remains valid, avoiding an immediate lockout.
- Every rendered page receives a per-request CSP nonce. The nonce is forwarded through Next.js Proxy, placed on the response policy, and applied to the root theme bootstrap.
- Production script policy uses `self`, a nonce, and `strict-dynamic`; `unsafe-eval` and loopback WebSocket sources are development-only.
- CSP allows only exact configured Supabase and Sentry origins, the existing Unsplash image origin, self-hosted fonts, and required `blob:`/`data:` image or worker behavior. Style elements require the request nonce; only existing inline style attributes retain a scoped `style-src-attr 'unsafe-inline'` exception. Scripts do not receive an unsafe-inline exception.
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and legacy `X-Frame-Options` are emitted with `frame-ancestors 'none'` in CSP.

## Privileged email step-up staged infrastructure

The forward-only migration creates private challenge, grant, audit-event, and per-organization enforcement-policy records. No challenge secret is stored in plaintext. Browser roles cannot read or mutate the private records.

Server actions derive the user, confirmed email, organization, and JWT `session_id` from the verified current request. They never accept those authority fields from form input. An eight-digit random code is HMAC-SHA-256 digested with a server-only pepper, expires after ten minutes, permits five attempts, and is subject to a sixty-second resend cooldown. A challenge is usable only after Resend delivery succeeds. Verification atomically consumes it and grants fifteen minutes of step-up for the exact user, session, and organization. Audit events record lifecycle outcomes without the code, digest, email, or full session material.

The Account screen exposes the staged flow only to Super Admin and current custom roles with a `finance.*` permission. The database classifier also contains legacy Finance roles during the role migration. Missing Resend or pepper configuration fails closed with generic errors and does not affect ordinary workspace access.

## Mandatory enforcement remains off

The migration installs reusable predicates but defaults enforcement to off and does not rewrite existing RLS, Storage policies, or privileged RPC authorization. This is intentional: current direct Data API, RPC, and Storage authority is distributed across many role/permission helpers, and source code cannot prove the hosted Resend sender, privileged-address reachability, or a recovery path.

A later reviewed forward-only migration may enable one organization only after all authority paths are wired to the step-up predicate and negative direct REST/RPC/Storage tests prove that an AAL1 JWT cannot bypass it. Enabling an application route guard alone is prohibited.

## Rollout gate

Before mandatory enforcement:

1. Apply and verify the hosted Auth password policy through the approved operator workflow before claiming that direct hosted GoTrue password updates enforce it.
2. Confirm the existing Resend integration, API key, verified sender/domain, and delivery without exposing secrets.
3. Confirm every privileged account has a reachable, confirmed email and approve a break-glass recovery procedure.
4. Deploy schema and application with enforcement off; complete request, delivery, verify, replay, expiry, throttle, and session-revocation tests.
5. Audit every authenticated privileged RPC, finance/admin RLS predicate, Storage policy, route handler, and downstream service-role path.
6. Prove direct REST/RPC/Storage denial without a grant and exact-session success with one.
7. Enable one approved organization in a later migration, monitor, then expand. Rollback disables the database gate before reverting application challenge support.

## Verification

RED/GREEN tests cover password rules, CSP construction/nonce propagation, root theme nonce use, privilege classification, server-derived challenge identity, generic failures, delivery-before-verification, attempt limits, resend throttling, one-time consumption, grant session/organization binding, private grants, and enforcement-off compatibility. Existing invitation, recovery, host, `/auth/session`, finance-context, lint, typecheck, build, and migration/database gates must remain green.
