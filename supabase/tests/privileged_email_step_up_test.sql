BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(34);

SELECT has_table(
  'app_private',
  'privileged_email_step_up_challenges',
  'email step-up challenges stay in the private schema'
);
SELECT has_table(
  'app_private',
  'privileged_email_step_up_grants',
  'verified step-up grants stay in the private schema'
);
SELECT has_table(
  'app_private',
  'privileged_email_step_up_events',
  'step-up attempts are auditable in the private schema'
);
SELECT has_table(
  'app_private',
  'privileged_email_step_up_policies',
  'organization enforcement has an explicit rollout switch'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app_private'
      AND table_name = 'privileged_email_step_up_challenges'
      AND column_name IN ('code', 'email', 'token')
  ),
  'challenges never store a plaintext code, token, or email'
);

SELECT ok(
  NOT has_table_privilege(
    'anon',
    'app_private.privileged_email_step_up_challenges',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'app_private.privileged_email_step_up_challenges',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'service_role',
    'app_private.privileged_email_step_up_challenges',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'no API role has direct challenge table access'
);

SELECT has_function(
  'public',
  'prepare_privileged_email_step_up',
  ARRAY['uuid', 'uuid', 'uuid', 'text', 'text'],
  'service boundary can prepare a challenge'
);
SELECT has_function(
  'public',
  'mark_privileged_email_step_up_sent',
  ARRAY['uuid'],
  'service boundary marks successful delivery'
);
SELECT has_function(
  'public',
  'mark_privileged_email_step_up_failed',
  ARRAY['uuid'],
  'service boundary records failed delivery'
);
SELECT has_function(
  'public',
  'verify_privileged_email_step_up',
  ARRAY['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text'],
  'service boundary verifies a challenge'
);
SELECT has_function(
  'public',
  'get_privileged_email_step_up_status',
  ARRAY['uuid', 'uuid', 'uuid'],
  'service boundary reports session-scoped status'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.prepare_privileged_email_step_up(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.prepare_privileged_email_step_up(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.prepare_privileged_email_step_up(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'only the trusted service role can create challenges'
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'stepup.admin@example.com',
    now(),
    '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'stepup.finance@example.com',
    now(),
    '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'stepup.custom-finance@example.com',
    now(),
    '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  );

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'a1000000-0000-0000-0000-000000000010',
  'Step-up Test',
  'step-up-test'
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001',
    'super_admin'
  ),
  (
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000002',
    'finance_member'
  );

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES (
  'a1000000-0000-0000-0000-000000000020',
  'a1000000-0000-0000-0000-000000000010',
  'Step-up Branch',
  'STEP'
);

INSERT INTO public.organization_roles (id, organization_id, name)
VALUES (
  'a1000000-0000-0000-0000-000000000030',
  'a1000000-0000-0000-0000-000000000010',
  'Custom Finance Viewer'
);

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key
)
VALUES (
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000030',
  'finance.view'
);

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  branch_id,
  custom_role_id
)
VALUES (
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000003',
  'custom',
  'a1000000-0000-0000-0000-000000000020',
  'a1000000-0000-0000-0000-000000000030'
);

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, aal)
VALUES
  (
    'a1000000-0000-0000-0000-000000000101',
    'a1000000-0000-0000-0000-000000000001',
    now(), now(), 'aal1'
  ),
  (
    'a1000000-0000-0000-0000-000000000102',
    'a1000000-0000-0000-0000-000000000002',
    now(), now(), 'aal1'
  );

SELECT ok(
  app_private.user_requires_privileged_step_up(
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001'
  ),
  'Super Admin requires privileged step-up'
);
SELECT ok(
  app_private.user_requires_privileged_step_up(
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000002'
  ),
  'legacy finance-capable membership requires privileged step-up'
);
SELECT ok(
  app_private.user_requires_privileged_step_up(
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000003'
  ),
  'a custom role with any Finance permission requires privileged step-up'
);

CREATE TEMP TABLE prepared_challenge (
  challenge_id uuid,
  expires_at timestamptz,
  resend_available_at timestamptz
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO prepared_challenge
SELECT *
FROM public.prepare_privileged_email_step_up(
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000101',
  repeat('a', 64),
  repeat('b', 64)
);

SELECT ok(
  (SELECT challenge_id IS NOT NULL FROM prepared_challenge),
  'a privileged confirmed-email session can prepare a challenge'
);
SELECT throws_ok(
  $$
    SELECT *
    FROM public.prepare_privileged_email_step_up(
      'a1000000-0000-0000-0000-000000000010',
      'a1000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000101',
      repeat('d', 64),
      repeat('b', 64)
    )
  $$,
  '55000',
  'Challenge unavailable',
  'a second email is throttled for 60 seconds'
);
SELECT is(
  (
    SELECT delivery_status
    FROM app_private.privileged_email_step_up_challenges
    WHERE id = (SELECT challenge_id FROM prepared_challenge)
  ),
  'pending',
  'a challenge is not usable before email delivery succeeds'
);

SELECT lives_ok(
  format(
    'SELECT public.mark_privileged_email_step_up_sent(%L::uuid)',
    (SELECT challenge_id FROM prepared_challenge)
  ),
  'the trusted sender can mark delivery complete'
);

SELECT is(
  public.verify_privileged_email_step_up(
    (SELECT challenge_id FROM prepared_challenge),
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000101',
    repeat('c', 64),
    repeat('b', 64)
  ),
  false,
  'an incorrect digest does not establish a grant'
);
SELECT is(
  (
    SELECT attempt_count
    FROM app_private.privileged_email_step_up_challenges
    WHERE id = (SELECT challenge_id FROM prepared_challenge)
  ),
  1,
  'an incorrect code consumes one attempt'
);
SELECT is(
  public.verify_privileged_email_step_up(
    (SELECT challenge_id FROM prepared_challenge),
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000101',
    repeat('a', 64),
    repeat('b', 64)
  ),
  true,
  'the delivered one-time digest establishes a session grant'
);
SELECT is(
  public.verify_privileged_email_step_up(
    (SELECT challenge_id FROM prepared_challenge),
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000101',
    repeat('a', 64),
    repeat('b', 64)
  ),
  false,
  'a consumed challenge cannot be replayed'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_grants
    WHERE organization_id = 'a1000000-0000-0000-0000-000000000010'
      AND user_id = 'a1000000-0000-0000-0000-000000000001'
      AND session_id = 'a1000000-0000-0000-0000-000000000101'
      AND expires_at IS NULL
      AND revoked_at IS NULL
  ),
  'the grant lasts for and remains bound to the exact Auth session'
);

UPDATE app_private.privileged_email_step_up_challenges
SET
  created_at = now() - interval '61 seconds',
  resend_available_at = now() - interval '1 second'
WHERE id = (SELECT challenge_id FROM prepared_challenge);

CREATE TEMP TABLE email_changed_challenge AS
SELECT *
FROM public.prepare_privileged_email_step_up(
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000101',
  repeat('f', 64),
  repeat('b', 64)
);
DO $$
BEGIN
  PERFORM public.mark_privileged_email_step_up_sent(
    (SELECT challenge_id FROM email_changed_challenge)
  );
END;
$$;
SELECT is(
  public.verify_privileged_email_step_up(
    (SELECT challenge_id FROM email_changed_challenge),
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000101',
    repeat('f', 64),
    repeat('c', 64)
  ),
  false,
  'a code sent to a previous confirmed email cannot establish a grant'
);
UPDATE app_private.privileged_email_step_up_challenges
SET
  created_at = now() - interval '61 seconds',
  resend_available_at = now() - interval '1 second'
WHERE id = (SELECT challenge_id FROM email_changed_challenge);

CREATE TEMP TABLE exhausted_challenge AS
SELECT *
FROM public.prepare_privileged_email_step_up(
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000101',
  repeat('d', 64),
  repeat('b', 64)
);
DO $$
DECLARE
  v_attempt integer;
BEGIN
  PERFORM public.mark_privileged_email_step_up_sent(
    (SELECT challenge_id FROM exhausted_challenge)
  );
  FOR v_attempt IN 1..5 LOOP
    PERFORM public.verify_privileged_email_step_up(
      (SELECT challenge_id FROM exhausted_challenge),
      'a1000000-0000-0000-0000-000000000010',
      'a1000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000101',
      repeat('e', 64),
      repeat('b', 64)
    );
  END LOOP;
END;
$$;
SELECT is(
  (
    SELECT attempt_count
    FROM app_private.privileged_email_step_up_challenges
    WHERE id = (SELECT challenge_id FROM exhausted_challenge)
  ),
  5,
  'five failed attempts exhaust a challenge'
);
SELECT is(
  public.verify_privileged_email_step_up(
    (SELECT challenge_id FROM exhausted_challenge),
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000101',
    repeat('d', 64),
    repeat('b', 64)
  ),
  false,
  'the correct code cannot revive an exhausted challenge'
);
SELECT ok(
  (
    SELECT
      (status_payload ->> 'verified')::boolean
      AND status_payload -> 'verifiedUntil' = 'null'::jsonb
    FROM (
      SELECT public.get_privileged_email_step_up_status(
        'a1000000-0000-0000-0000-000000000010',
        'a1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000101'
      ) AS status_payload
    ) AS status_result
  ),
  'status reports session verification without an independent expiry'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', 'a1000000-0000-0000-0000-000000000002',
    'session_id', 'a1000000-0000-0000-0000-000000000102'
  )::text,
  true
);
SELECT ok(
  app_private.current_privileged_email_step_up_satisfied(
    'a1000000-0000-0000-0000-000000000010'
  ),
  'the rollout-safe default does not lock out an existing privileged user'
);

INSERT INTO app_private.privileged_email_step_up_policies (
  organization_id,
  enforcement_enabled,
  enabled_at,
  enabled_by
)
VALUES (
  'a1000000-0000-0000-0000-000000000010',
  true,
  now(),
  'a1000000-0000-0000-0000-000000000001'
);

SELECT is(
  app_private.current_privileged_email_step_up_satisfied(
    'a1000000-0000-0000-0000-000000000010'
  ),
  false,
  'the future enforcement predicate fails closed for an unverified privileged session'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_events
    WHERE organization_id = 'a1000000-0000-0000-0000-000000000010'
      AND user_id = 'a1000000-0000-0000-0000-000000000001'
      AND event_type IN ('challenge_prepared', 'delivery_succeeded', 'verification_failed', 'verification_succeeded')
  ),
  'challenge delivery and verification leave a private audit trail'
);

DELETE FROM auth.sessions
WHERE id = 'a1000000-0000-0000-0000-000000000101';
SELECT is(
  (
    SELECT count(*)
    FROM app_private.privileged_email_step_up_grants
    WHERE session_id = 'a1000000-0000-0000-0000-000000000101'
  ),
  0::bigint,
  'ending the Auth session removes every grant bound to it'
);

DELETE FROM auth.users
WHERE id = 'a1000000-0000-0000-0000-000000000001';
SELECT ok(
  EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_policies
    WHERE organization_id = 'a1000000-0000-0000-0000-000000000010'
      AND enforcement_enabled
      AND enabled_at IS NOT NULL
      AND enabled_by IS NULL
  ),
  'deleting the enabler preserves a valid enabled policy provenance state'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_events
    WHERE organization_id = 'a1000000-0000-0000-0000-000000000010'
      AND user_id IS NULL
  ),
  'deleting a user preserves the private step-up audit trail'
);

SELECT * FROM finish();

ROLLBACK;
