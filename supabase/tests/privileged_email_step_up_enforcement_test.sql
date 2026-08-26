BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(31);

INSERT INTO auth.users (id, email)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'enforcement-admin@example.test'),
  ('b1000000-0000-0000-0000-000000000002', 'enforcement-writer@example.test'),
  ('b1000000-0000-0000-0000-000000000003', 'enforcement-finance@example.test');

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'b2000000-0000-0000-0000-000000000001',
  'Step-up Enforcement',
  'step-up-enforcement'
);

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES (
  'b3000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  'Enforcement Branch',
  'ENF'
);

INSERT INTO public.organization_roles (id, organization_id, name)
VALUES
  (
    'b4000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000001',
    'Property writer'
  ),
  (
    'b4000000-0000-0000-0000-000000000002',
    'b2000000-0000-0000-0000-000000000001',
    'Finance period closer'
  );

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key
)
VALUES
  (
    'b2000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000001',
    'properties.view'
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000001',
    'properties.write'
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000002',
    'finance.view'
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000002',
    'finance.close_periods'
  );

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  branch_id,
  custom_role_id
)
VALUES
  (
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'super_admin',
    NULL,
    NULL
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002',
    'custom',
    'b3000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000001'
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000003',
    'custom',
    'b3000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000002'
  );

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = 'b2000000-0000-0000-0000-000000000001';

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, aal)
VALUES
  (
    'b5000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    now(), now(), 'aal1'
  ),
  (
    'b5000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000001',
    now(), now(), 'aal1'
  ),
  (
    'b5000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000002',
    now(), now(), 'aal1'
  ),
  (
    'b5000000-0000-0000-0000-000000000004',
    'b1000000-0000-0000-0000-000000000003',
    now(), now(), 'aal1'
  );

INSERT INTO app_private.privileged_email_step_up_policies (
  organization_id,
  enforcement_enabled,
  enabled_at,
  enabled_by
)
VALUES (
  'b2000000-0000-0000-0000-000000000001',
  true,
  now(),
  'b1000000-0000-0000-0000-000000000001'
);

INSERT INTO app_private.privileged_email_step_up_challenges (
  id,
  organization_id,
  user_id,
  session_id,
  code_digest,
  email_digest,
  delivery_status,
  created_at,
  expires_at,
  resend_available_at,
  sent_at,
  consumed_at
)
VALUES
  (
    'b6000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'b5000000-0000-0000-0000-000000000001',
    repeat('a', 64),
    repeat('b', 64),
    'sent',
    now() - interval '1 minute',
    now() + interval '9 minutes',
    now() + interval '30 seconds',
    now() - interval '50 seconds',
    now() - interval '40 seconds'
  ),
  (
    'b6000000-0000-0000-0000-000000000002',
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000003',
    'b5000000-0000-0000-0000-000000000004',
    repeat('c', 64),
    repeat('d', 64),
    'sent',
    now() - interval '1 minute',
    now() + interval '9 minutes',
    now() + interval '30 seconds',
    now() - interval '50 seconds',
    now() - interval '40 seconds'
  );

SELECT has_function(
  'app_private',
  'privileged_email_step_up_satisfied_for_actor',
  ARRAY['uuid', 'uuid', 'uuid'],
  'an explicit actor and session predicate exists'
);
SELECT has_function(
  'public',
  'assert_privileged_email_step_up_satisfied',
  ARRAY['uuid', 'uuid', 'uuid'],
  'trusted server code has an explicit assertion RPC'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.assert_privileged_email_step_up_satisfied(uuid,uuid,uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.assert_privileged_email_step_up_satisfied(uuid,uuid,uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.assert_privileged_email_step_up_satisfied(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'only service_role can execute the explicit assertion RPC'
);

SELECT ok(
  (
    SELECT bool_and(
      has_function_privilege('service_role', signature, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', signature, 'EXECUTE')
      AND NOT has_function_privilege('anon', signature, 'EXECUTE')
    )
    FROM unnest(ARRAY[
      'public.prepare_privileged_email_step_up(uuid,uuid,uuid,text,text)',
      'public.mark_privileged_email_step_up_sent(uuid)',
      'public.mark_privileged_email_step_up_failed(uuid)',
      'public.verify_privileged_email_step_up(uuid,uuid,uuid,uuid,text,text)',
      'public.get_privileged_email_step_up_status(uuid,uuid,uuid)'
    ]) AS signature
  ),
  'all five grant-lifecycle RPCs remain service-role-only bootstrap controls'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS table_class
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    WHERE table_namespace.nspname = 'public'
      AND table_class.relkind IN ('r', 'p')
      AND (
        table_class.relname = 'organizations'
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS column_attribute
          WHERE column_attribute.attrelid = table_class.oid
            AND column_attribute.attname = 'organization_id'
            AND column_attribute.attnum > 0
            AND NOT column_attribute.attisdropped
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger AS enforcement_trigger
        WHERE enforcement_trigger.tgrelid = table_class.oid
          AND enforcement_trigger.tgname = 'privileged_email_step_up_enforcement'
          AND NOT enforcement_trigger.tgisinternal
          AND enforcement_trigger.tgenabled <> 'D'
      )
  ),
  'every current organization-scoped public table has the enforcement trigger'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS enforcement_trigger
    WHERE enforcement_trigger.tgrelid = 'storage.objects'::regclass
      AND enforcement_trigger.tgname = 'privileged_email_step_up_enforcement'
      AND NOT enforcement_trigger.tgisinternal
      AND enforcement_trigger.tgenabled <> 'D'
  ),
  'Storage object mutations have the enforcement trigger'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001","session_id":"b5000000-0000-0000-0000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.update_organization_appearance('b2000000-0000-0000-0000-000000000001','system','neutral',NULL)$$,
  '42501',
  NULL,
  'privileged RPC mutation fails closed without a grant'
);

RESET ROLE;
INSERT INTO app_private.privileged_email_step_up_grants (
  organization_id,
  user_id,
  session_id,
  challenge_id,
  verified_at,
  expires_at
)
VALUES (
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001',
  'b6000000-0000-0000-0000-000000000001',
  now(),
  now() + interval '15 minutes'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.update_organization_appearance('b2000000-0000-0000-0000-000000000001','dark','ocean',NULL)$$,
  'the exact active session grant authorizes a privileged RPC mutation'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001","session_id":"b5000000-0000-0000-0000-000000000002"}',
  true
);
SELECT throws_ok(
  $$SELECT public.update_organization_appearance('b2000000-0000-0000-0000-000000000001','system','forest',NULL)$$,
  '42501', NULL,
  'a grant for another Auth session does not authorize the mutation'
);

RESET ROLE;
UPDATE app_private.privileged_email_step_up_grants
SET verified_at = now() - interval '20 minutes',
    expires_at = now() - interval '5 minutes'
WHERE organization_id = 'b2000000-0000-0000-0000-000000000001';
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001","session_id":"b5000000-0000-0000-0000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.update_organization_appearance('b2000000-0000-0000-0000-000000000001','system','forest',NULL)$$,
  '42501', NULL,
  'an expired grant does not authorize the mutation'
);

RESET ROLE;
UPDATE app_private.privileged_email_step_up_grants
SET verified_at = now(),
    expires_at = now() + interval '15 minutes',
    revoked_at = now()
WHERE organization_id = 'b2000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.update_organization_appearance('b2000000-0000-0000-0000-000000000001','system','forest',NULL)$$,
  '42501', NULL,
  'a revoked grant does not authorize the mutation'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001","session_id":"not-a-uuid"}',
  true
);
SELECT throws_ok(
  $$SELECT public.update_organization_appearance('b2000000-0000-0000-0000-000000000001','system','forest',NULL)$$,
  '42501', NULL,
  'a malformed session claim fails closed'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001"}',
  true
);
SELECT throws_ok(
  $$SELECT public.update_organization_appearance('b2000000-0000-0000-0000-000000000001','system','forest',NULL)$$,
  '42501', NULL,
  'a missing session claim fails closed'
);

SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000002","session_id":"b5000000-0000-0000-0000-000000000003"}',
  true
);
SELECT lives_ok(
  $$SELECT public.create_property_minimal('b2000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','Ordinary property','ENF-1','apartment','Address',current_date,'enforcement-ordinary',NULL,NULL,NULL)$$,
  'an authorized ordinary delegated member mutates without a step-up grant'
);

SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000003","session_id":"b5000000-0000-0000-0000-000000000004"}',
  true
);
SELECT throws_ok(
  $$SELECT public.set_financial_month_lock('b2000000-0000-0000-0000-000000000001',date_trunc('month',current_date)::date,true,'Step-up enforcement test')$$,
  '42501', NULL,
  'custom Finance authority cannot lock a month without an exact-session grant'
);

RESET ROLE;
INSERT INTO app_private.privileged_email_step_up_grants (
  organization_id,
  user_id,
  session_id,
  challenge_id,
  verified_at,
  expires_at
)
VALUES (
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000003',
  'b5000000-0000-0000-0000-000000000004',
  'b6000000-0000-0000-0000-000000000002',
  now(),
  now() + interval '15 minutes'
);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.set_financial_month_lock('b2000000-0000-0000-0000-000000000001',date_trunc('month',current_date)::date,true,'Step-up enforcement test')$$,
  'custom Finance authority can lock a month with its exact-session grant'
);

RESET ROLE;
GRANT INSERT, UPDATE, DELETE ON public.organization_teams TO authenticated;
CREATE POLICY privileged_email_step_up_enforcement_test_policy
  ON public.organization_teams
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.organization_teams (id, organization_id, name)
VALUES
  ('b7000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001', 'Update target'),
  ('b7000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'Delete target');

UPDATE app_private.privileged_email_step_up_grants
SET revoked_at = now()
WHERE organization_id = 'b2000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001","session_id":"b5000000-0000-0000-0000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.organization_teams (id, organization_id, name) VALUES ('b7000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','Insert denied')$$,
  '42501', NULL,
  'direct authenticated table INSERT fails closed without a grant'
);
SELECT throws_ok(
  $$UPDATE public.organization_teams SET name='Update denied' WHERE id='b7000000-0000-0000-0000-000000000002'$$,
  '42501', NULL,
  'direct authenticated table UPDATE fails closed without a grant'
);
SELECT throws_ok(
  $$DELETE FROM public.organization_teams WHERE id='b7000000-0000-0000-0000-000000000003'$$,
  '42501', NULL,
  'direct authenticated table DELETE fails closed without a grant'
);

RESET ROLE;
UPDATE app_private.privileged_email_step_up_grants
SET revoked_at = NULL
WHERE organization_id = 'b2000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO public.organization_teams (id, organization_id, name) VALUES ('b7000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','Insert allowed')$$,
  'direct authenticated table INSERT accepts the exact active grant'
);
SELECT lives_ok(
  $$UPDATE public.organization_teams SET name='Update allowed' WHERE id='b7000000-0000-0000-0000-000000000002'$$,
  'direct authenticated table UPDATE accepts the exact active grant'
);
SELECT lives_ok(
  $$DELETE FROM public.organization_teams WHERE id='b7000000-0000-0000-0000-000000000003'$$,
  'direct authenticated table DELETE accepts the exact active grant'
);

RESET ROLE;
GRANT SELECT, UPDATE ON public.organization_teams TO service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$UPDATE public.organization_teams SET name='System update' WHERE id='b7000000-0000-0000-0000-000000000002'$$,
  'service_role organization mutation remains a separately authorized no-session system path'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO storage.objects (id, bucket_id, name, version, metadata)
VALUES
  (
    'b8000000-0000-0000-0000-000000000002',
    'nestory-photos',
    'b2000000-0000-0000-0000-000000000001/enforcement/update.jpg',
    'fixture-v1',
    '{"mimetype":"image/jpeg","size":10}'::jsonb
  ),
  (
    'b8000000-0000-0000-0000-000000000003',
    'nestory-photos',
    'b2000000-0000-0000-0000-000000000001/enforcement/delete.jpg',
    'fixture-v1',
    '{"mimetype":"image/jpeg","size":10}'::jsonb
  );

UPDATE app_private.privileged_email_step_up_grants
SET revoked_at = now()
WHERE organization_id = 'b2000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001","session_id":"b5000000-0000-0000-0000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT set_config('storage.allow_delete_query', 'true', true);

SELECT throws_ok(
  $$INSERT INTO storage.objects (id,bucket_id,name,version,metadata) VALUES ('b8000000-0000-0000-0000-000000000001','nestory-photos','b2000000-0000-0000-0000-000000000001/enforcement/insert.jpg','fixture-v1','{"mimetype":"image/jpeg","size":10}'::jsonb)$$,
  '42501', NULL,
  'authenticated Storage INSERT fails closed without a grant'
);
SELECT throws_ok(
  $$UPDATE storage.objects SET metadata='{"mimetype":"image/jpeg","size":11}'::jsonb WHERE id='b8000000-0000-0000-0000-000000000002'$$,
  '42501', NULL,
  'authenticated Storage UPDATE fails closed without a grant'
);
SELECT throws_ok(
  $$DELETE FROM storage.objects WHERE id='b8000000-0000-0000-0000-000000000003'$$,
  '42501', NULL,
  'authenticated Storage DELETE fails closed without a grant'
);

RESET ROLE;
UPDATE app_private.privileged_email_step_up_grants
SET revoked_at = NULL
WHERE organization_id = 'b2000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO storage.objects (id,bucket_id,name,version,metadata) VALUES ('b8000000-0000-0000-0000-000000000001','nestory-photos','b2000000-0000-0000-0000-000000000001/enforcement/insert.jpg','fixture-v1','{"mimetype":"image/jpeg","size":10}'::jsonb)$$,
  'authenticated Storage INSERT accepts the exact active grant'
);
SELECT lives_ok(
  $$UPDATE storage.objects SET metadata='{"mimetype":"image/jpeg","size":11}'::jsonb WHERE id='b8000000-0000-0000-0000-000000000002'$$,
  'authenticated Storage UPDATE accepts the exact active grant'
);
SELECT lives_ok(
  $$DELETE FROM storage.objects WHERE id='b8000000-0000-0000-0000-000000000003'$$,
  'authenticated Storage DELETE accepts the exact active grant'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;

SELECT results_eq(
  $$SELECT public.assert_privileged_email_step_up_satisfied('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001')$$,
  $$VALUES (true)$$,
  'the service assertion accepts an exact active actor and session grant'
);
SELECT results_eq(
  $$SELECT public.assert_privileged_email_step_up_satisfied('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000002')$$,
  $$VALUES (false)$$,
  'the service assertion rejects a different session'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
