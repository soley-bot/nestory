-- Rollback-only pgTAP regression; requires the standard local fixture.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE charge_scope_state AS
SELECT lease.organization_id AS org, lease.id AS lease, property.branch_id AS branch,
  '00000000-0000-0000-0000-000000000101'::uuid AS admin,
  'f4950000-0000-4000-8000-000000000001'::uuid AS outsider,
  'f4950000-0000-4000-8000-000000000002'::uuid AS allowed,
  'f4950000-0000-4000-8000-000000000003'::uuid AS wrong_branch,
  'f4950000-0000-4000-8000-000000000004'::uuid AS viewer,
  'f4950000-0000-4000-8000-000000000005'::uuid AS foreign_org,
  'f4950000-0000-4000-8000-000000000006'::uuid AS other_branch,
  'f4950000-0000-4000-8000-000000000007'::uuid AS writer_role,
  'f4950000-0000-4000-8000-000000000008'::uuid AS viewer_role,
  'f4950000-0000-4000-8000-000000000009'::uuid AS missing_lease,
  'f4950000-0000-4000-8000-000000000010'::uuid AS missing_account
FROM public.leases AS lease
JOIN public.properties AS property ON property.organization_id=lease.organization_id
  AND property.id=lease.property_id
WHERE lease.organization_id='00000000-0000-0000-0000-000000000001'::uuid
  AND property.branch_id IS NOT NULL
ORDER BY lease.id LIMIT 1;
SELECT is((SELECT count(*) FROM charge_scope_state),1::bigint,
  'fixture resolves one lease with a canonical branch');

INSERT INTO auth.users(id,email)
SELECT actor.id,actor.label||'@charge-scope.example.test'
FROM charge_scope_state s
CROSS JOIN LATERAL (VALUES (s.outsider,'outsider'),(s.allowed,'allowed'),
  (s.wrong_branch,'wrong-branch'),(s.viewer,'viewer')) actor(id,label);
INSERT INTO public.organizations(id,name,slug)
SELECT foreign_org,'Charge scope foreign organization','charge-scope-foreign-test' FROM charge_scope_state;
INSERT INTO public.organization_members(organization_id,user_id,role)
SELECT foreign_org,outsider,'super_admin' FROM charge_scope_state;
INSERT INTO public.organization_branches(id,organization_id,name,code)
SELECT other_branch,org,'Charge scope other branch','CHARGE-SCOPE' FROM charge_scope_state;
INSERT INTO public.organization_roles(id,organization_id,name)
SELECT writer_role,org,'Charge scope writer' FROM charge_scope_state
UNION ALL SELECT viewer_role,org,'Charge scope viewer' FROM charge_scope_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT org,writer_role,'finance.view'::public.organization_permission_key FROM charge_scope_state
UNION ALL SELECT org,writer_role,'finance.record_payments'::public.organization_permission_key FROM charge_scope_state
UNION ALL SELECT org,viewer_role,'finance.view'::public.organization_permission_key FROM charge_scope_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT org,allowed,'custom',branch,writer_role FROM charge_scope_state
UNION ALL SELECT org,wrong_branch,'custom',other_branch,writer_role FROM charge_scope_state
UNION ALL SELECT org,viewer,'custom',branch,viewer_role FROM charge_scope_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
WHERE organization_id=(SELECT org FROM charge_scope_state);

CREATE TEMP TABLE charge_scope_before AS
SELECT (SELECT count(*) FROM public.tenant_invoice_lines WHERE organization_id=s.org) AS lines,
  (SELECT count(*) FROM public.activity_logs WHERE organization_id=s.org) AS activity,
  (SELECT count(*) FROM app_private.finance_chart_workflow_idempotency_bindings WHERE organization_id=s.org) AS bindings
FROM charge_scope_state s;
GRANT SELECT ON charge_scope_state TO authenticated;
CREATE FUNCTION pg_temp.attempt_scoped_charge(p_missing_lease boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_manual_tenant_charge_with_account(s.org,
    CASE WHEN p_missing_lease THEN s.missing_lease ELSE s.lease END,
    s.missing_account,CURRENT_DATE,CURRENT_DATE,1,'Scope regression','charge-scope-unavailable')
  FROM charge_scope_state s
$$;

SELECT ok(NOT has_function_privilege('anon',
  'public.create_manual_tenant_charge_with_account(uuid,uuid,uuid,date,date,numeric,text,text)','EXECUTE'),
  'anonymous role still cannot execute the wrapper');
SELECT set_config('request.jwt.claim.sub',outsider::text,true) FROM charge_scope_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(false)$$,'42501','Not authorized',
  'foreign organization admin cannot probe an existing foreign lease through account validation');
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(true)$$,'42501','Not authorized',
  'missing foreign lease returns the same denial');

SELECT set_config('request.jwt.claim.sub',wrong_branch::text,true) FROM charge_scope_state;
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(false)$$,'42501','Not authorized',
  'record-payments permission in another branch cannot probe the lease');
SELECT set_config('request.jwt.claim.sub',viewer::text,true) FROM charge_scope_state;
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(false)$$,'42501','Not authorized',
  'same-branch finance viewer without record-payments permission is denied first');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(false)$$,'42501','Not authorized',
  'authenticated database role without an authenticated user is denied first');

SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM charge_scope_state;
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(false)$$,'22023',
  'Choose a compatible active lease-charge account',
  'organization administrator retains access to ordinary account validation');
SELECT set_config('request.jwt.claim.sub',allowed::text,true) FROM charge_scope_state;
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(false)$$,'22023',
  'Choose a compatible active lease-charge account',
  'same-branch record-payments holder retains access to ordinary account validation');
SELECT throws_ok($$SELECT pg_temp.attempt_scoped_charge(true)$$,'42501','Not authorized',
  'permitted caller cannot probe a nonexistent lease');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.tenant_invoice_lines WHERE organization_id=s.org),before.lines,
  'rejected requests create no invoice lines') FROM charge_scope_state s CROSS JOIN charge_scope_before before;
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id=s.org),before.activity,
  'rejected requests record no activity') FROM charge_scope_state s CROSS JOIN charge_scope_before before;
SELECT is((SELECT count(*) FROM app_private.finance_chart_workflow_idempotency_bindings WHERE organization_id=s.org),before.bindings,
  'rejected requests leave no idempotency bindings') FROM charge_scope_state s CROSS JOIN charge_scope_before before;
SELECT * FROM finish();
ROLLBACK;
