BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

SELECT ok(has_function_privilege('service_role', 'public.stage_client_workspace(text,text,text)', 'EXECUTE'), 'service role may stage');
SELECT ok(NOT has_function_privilege('anon', 'public.stage_client_workspace(text,text,text)', 'EXECUTE'), 'anonymous callers cannot stage');
SELECT ok(NOT has_function_privilege('authenticated', 'public.stage_client_workspace(text,text,text)', 'EXECUTE'), 'authenticated callers cannot stage');

SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
SELECT throws_ok(
  $$SELECT * FROM public.stage_client_workspace('Stage Test', 'stage-test', 'admin@example.com')$$,
  '42501', 'Service role required', 'missing service claim is rejected');
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$SELECT * FROM public.stage_client_workspace('Stage Test', 'stage-test', 'admin@example.com')$$,
  '42501', 'Service role required', 'wrong service claim is rejected');
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$SELECT * FROM public.stage_client_workspace('x', 'stage-test', 'admin@example.com')$$,
  '22023', 'Company name must be between 2 and 120 characters', 'invalid name rejected');
SELECT throws_ok(
  $$SELECT * FROM public.stage_client_workspace('Stage Test', 'api', 'admin@example.com')$$,
  '22023', 'Workspace slug is invalid or reserved', 'reserved slug rejected');
SELECT throws_ok(
  $$SELECT * FROM public.stage_client_workspace('Stage Test', 'stage-test', 'invalid')$$,
  '22023', 'Administrator email is invalid', 'invalid email rejected');

-- Count all memberships, so no existing user (including an unrelated operator)
-- can be silently added by staging. This suite uses only synthetic addresses.
CREATE TEMP TABLE staging_before AS
SELECT (SELECT count(*) FROM public.organization_members) AS members;
CREATE TEMP TABLE staged_workspace AS
SELECT * FROM public.stage_client_workspace('  Create Only Test  ', '  CREATE-ONLY-TEST  ', '  ADMIN@EXAMPLE.COM  ');

SELECT is((SELECT organization_name FROM staged_workspace), 'Create Only Test', 'name normalized');
SELECT is((SELECT workspace_slug FROM staged_workspace), 'create-only-test', 'slug normalized');
SELECT is((SELECT invited_email FROM staged_workspace), 'admin@example.com', 'email normalized');
SELECT ok((SELECT i.status = 'pending' AND i.role = 'super_admin'
    AND i.delivery_method IS NULL AND i.last_sent_at IS NULL
    AND i.delivery_error IS NULL AND i.auth_user_id IS NULL
    AND i.expires_at = now() + interval '1 hour'
  FROM public.organization_invitations i JOIN staged_workspace s ON i.id = s.invitation_id),
  'new staging creates an undelivered pending admin invitation with one-hour expiry');
SELECT is((SELECT count(*) FROM public.organization_members), (SELECT members FROM staging_before), 'staging adds no memberships for any user');
SELECT is((SELECT count(*) FROM public.activity_logs a JOIN staged_workspace s ON a.organization_id = s.organization_id
  WHERE a.action IN ('workspace_provisioned', 'organization_invitation_created')), 2::bigint, 'creation is audited');

SELECT throws_ok(
  $$SELECT * FROM public.stage_client_workspace('Create Only Test', 'create-only-test', 'admin@example.com')$$,
  '23505', NULL, 'even an undelivered workspace cannot be resumed');

-- Model an invitation that was previously emailed and is still pending.
UPDATE public.organization_invitations
SET delivery_method = 'invite', last_sent_at = now() - interval '30 minutes',
    invited_at = now() - interval '30 minutes', expires_at = now() + interval '30 minutes'
WHERE id = (SELECT invitation_id FROM staged_workspace);
CREATE TEMP TABLE delivered_snapshot AS
SELECT to_jsonb(i) AS invitation,
  (SELECT count(*) FROM public.activity_logs a WHERE a.organization_id = i.organization_id) AS audit_count
FROM public.organization_invitations i WHERE id = (SELECT invitation_id FROM staged_workspace);

SELECT throws_ok(
  $$SELECT * FROM public.stage_client_workspace('Create Only Test', ' CREATE-ONLY-TEST ', 'admin@example.com')$$,
  '23505', NULL, 'delivered pending invitation cannot be resumed through staging');
SELECT is((SELECT to_jsonb(i) FROM public.organization_invitations i WHERE id = (SELECT invitation_id FROM staged_workspace)),
  (SELECT invitation FROM delivered_snapshot), 'rejected retry preserves entire invitation including identity, status, expiry and delivery state');
SELECT is((SELECT count(*) FROM public.activity_logs a JOIN staged_workspace s ON a.organization_id = s.organization_id),
  (SELECT audit_count FROM delivered_snapshot), 'rejected retries do not add audit events');
SELECT ok((SELECT count(*) FROM public.organizations WHERE slug = 'create-only-test') = 1
  AND (SELECT count(*) FROM public.organization_invitations WHERE organization_id = (SELECT organization_id FROM staged_workspace)) = 1
  AND (SELECT count(*) FROM public.organization_members) = (SELECT members FROM staging_before),
  'duplicate attempts create no organization, invitation or membership');

SELECT * FROM finish();
ROLLBACK;
