# Privileged Email Step-Up Enforcement Design

## Scope and security meaning

This phase connects the already-staged Resend email challenge and exact-session grant to every organization-scoped mutation. It remains a Nestory authorization grant, not Supabase MFA or AAL2: Supabase email OTP is AAL1, and no phone, SMS, TOTP, passkey, or additional provider is introduced.

The release remains dormant by default. `app_private.privileged_email_step_up_policies` receives no rows, so deploying the schema and application cannot lock out an organization. A trusted operator must deliberately enable a reviewed organization later.

## Reconciled authority inventory

Two independent inventories found the same boundary gap: `app_private.current_privileged_email_step_up_satisfied` is defined and tested but has no consumer outside its staging migration and pgTAP file.

Privileged human authority is distributed across Super Admin governance, organization identity and access control, finance and owner accounting, billing and settlement, financial documents, imports/cutover, lease mutations with financial effects, and direct Storage policies. The browser application also has service-role bridges for invitations, paid-cost evidence, commercial document artifacts, and owner-close publication. Ordinary member workflows share some of these functions, while maintenance/public intake/cron/provisioning/cleanup jobs legitimately have no end-user session.

## Database enforcement boundary

A new forward-only migration will add a parameterized private predicate for an explicit organization, actor, and Auth session. It will preserve the staged behavior:

- missing or disabled policy succeeds;
- an ordinary authorized member succeeds without a step-up grant;
- a classified privileged member succeeds only with an active, unrevoked, unexpired grant for the exact organization, user, and still-active Auth session;
- missing or malformed actor/session context fails closed for a privileged user when policy is enabled.

The existing current-request predicate will delegate to this explicit predicate. A service-role-only public assertion RPC will expose the same check to trusted server code without allowing an authenticated caller to choose another actor or session.

Every organization-scoped public table mutation will receive a common `BEFORE INSERT OR UPDATE OR DELETE` trigger. For an authenticated Data API request, it derives the actor and `session_id` from the verified request claims and checks the affected organization before any row change. This covers direct table REST, authenticated RPCs, and `SECURITY DEFINER` functions because their writes still carry the originating request claims. `organizations` uses its row `id`; other public tables use `organization_id`. The no-organization public-interest intake table and `notification_delivery_attempts` bookkeeping table are outside this organization mutation boundary. The organization-scoped `notification_outbox` remains attached because authenticated human RPCs can enqueue rows; service-role/cron delivery bypasses the authenticated-only trigger under its separate authority.

`storage.objects` receives the corresponding trigger, deriving the organization from the existing organization-prefixed object path. This protects uploads, updates, and deletes even when a Storage policy would otherwise authorize the role. Existing RLS and Storage policies remain in place as the first authorization layer; the step-up trigger is an additional fail-closed condition.

The migration also installs a regression assertion surface so pgTAP can prove that every current organization-scoped public table has the enforcement trigger. Future migrations that add an organization-scoped table must attach the same trigger in their forward-only SQL.

## Human service-role bridges

Service-role requests bypass RLS and do not carry the end-user Auth session. Human-triggered service operations therefore must prove the exact current actor/session before constructing or using privileged admin clients for a mutation.

A server-only guard will:

1. obtain trusted claims and a verified current Auth user from the request-bound Supabase client;
2. require the expected organization and actor to match server-derived application context;
3. require a non-empty Auth `session_id`;
4. call the service-role-only database assertion RPC with that exact organization, actor, and session;
5. fail before email invitation, admin Storage mutation, artifact registration, or other external side effect when the check is false or unavailable.

The guard will be placed at the human-triggered boundaries for organization invitation delivery, paid-cost evidence, commercial document publication, and owner-close statement publication/resume. Grant issuance and verification remain usable without an existing grant because they are the bootstrap path.

## Separate system authority

No-session work is not converted into human authority. Maintenance cron, due-lease automation, orphan cleanup, provisioning/operator scripts, public marketing intake, authentication bookkeeping, and local fixtures keep their existing cron secret, service-role, operator, exact-command, or public-intake boundaries. Read-only service downloads do not need a mutation step-up. Automated paths must not accept a user identifier as a substitute for their existing authorization.

## Verification and rollout

RED/GREEN unit and pgTAP tests will cover no grant, exact current grant, expired/revoked/different-session grants, missing/malformed session context, ordinary delegated members, direct RPC/REST/Storage denial, and human service-role bridge ordering. Coverage tests will prove all present organization-scoped public tables and Storage writes are attached to the database gate, while system jobs remain separately authorized.

Only local/disposable Supabase is used. Hosted policy rows, hosted Auth/Resend settings, production schema release, deploy, push, merge, and policy enablement remain explicit operator steps outside this task.
