BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(4);

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
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd1000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'revoked-session-step-up@example.com',
  now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'd1000000-0000-0000-0000-000000000010',
  'Revoked Session Step-up Test',
  'revoked-session-step-up-test'
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (
  'd1000000-0000-0000-0000-000000000010',
  'd1000000-0000-0000-0000-000000000001',
  'super_admin'
);

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, aal)
VALUES (
  'd1000000-0000-0000-0000-000000000101',
  'd1000000-0000-0000-0000-000000000001',
  now(), now(), 'aal1'
);

INSERT INTO app_private.privileged_email_step_up_policies (
  organization_id,
  enforcement_enabled,
  enabled_at,
  enabled_by
)
VALUES (
  'd1000000-0000-0000-0000-000000000010',
  true,
  now(),
  'd1000000-0000-0000-0000-000000000001'
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT is(
  public.assert_privileged_email_step_up_satisfied(
    'd1000000-0000-0000-0000-000000000010',
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000101'
  ),
  false,
  'a live unverified Auth session is denied by the privileged assertion'
);

SELECT is(
  (
    public.get_privileged_email_step_up_status(
      'd1000000-0000-0000-0000-000000000010',
      'd1000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000101'
    ) ->> 'verified'
  )::boolean,
  false,
  'a live unverified Auth session has ordinary verification-required status'
);

DELETE FROM auth.sessions
WHERE id = 'd1000000-0000-0000-0000-000000000101';

SELECT is(
  public.assert_privileged_email_step_up_satisfied(
    'd1000000-0000-0000-0000-000000000010',
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000101'
  ),
  false,
  'the database assertion denies a still-referenced but deleted Auth session'
);

SELECT throws_ok(
  $sql$
    SELECT public.get_privileged_email_step_up_status(
      'd1000000-0000-0000-0000-000000000010',
      'd1000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000101'
    )
  $sql$,
  '42501',
  'Status unavailable',
  'a deleted Auth session exposes only the exact revoked-session discriminator'
);

SELECT * FROM finish();

ROLLBACK;
