BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

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
  'c1000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'session-lifetime@example.com',
  now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'c1000000-0000-0000-0000-000000000010',
  'Session Lifetime Test',
  'session-lifetime-test'
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (
  'c1000000-0000-0000-0000-000000000010',
  'c1000000-0000-0000-0000-000000000001',
  'super_admin'
);

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, aal)
VALUES
  (
    'c1000000-0000-0000-0000-000000000101',
    'c1000000-0000-0000-0000-000000000001',
    now(), now(), 'aal1'
  ),
  (
    'c1000000-0000-0000-0000-000000000102',
    'c1000000-0000-0000-0000-000000000001',
    now(), now(), 'aal1'
  );

SELECT set_config('request.jwt.claim.role', 'service_role', true);

CREATE TEMP TABLE first_challenge AS
SELECT *
FROM public.prepare_privileged_email_step_up(
  'c1000000-0000-0000-0000-000000000010',
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000101',
  repeat('a', 64),
  repeat('b', 64)
);

SELECT lives_ok(
  format(
    'SELECT public.mark_privileged_email_step_up_sent(%L::uuid)',
    (SELECT challenge_id FROM first_challenge)
  ),
  'the trusted sender can deliver the first session challenge'
);

SELECT is(
  public.verify_privileged_email_step_up(
    (SELECT challenge_id FROM first_challenge),
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101',
    repeat('a', 64),
    repeat('b', 64)
  ),
  true,
  'a fresh delivered code verifies the exact Auth session'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_grants AS step_up_grant
    WHERE step_up_grant.organization_id = 'c1000000-0000-0000-0000-000000000010'
      AND step_up_grant.user_id = 'c1000000-0000-0000-0000-000000000001'
      AND step_up_grant.session_id = 'c1000000-0000-0000-0000-000000000101'
      AND step_up_grant.expires_at IS NULL
      AND step_up_grant.revoked_at IS NULL
  ),
  'a newly verified grant lasts for the exact Auth session without an independent timeout'
);

SELECT is(
  (
    public.get_privileged_email_step_up_status(
      'c1000000-0000-0000-0000-000000000010',
      'c1000000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000101'
    ) ->> 'verified'
  )::boolean,
  true,
  'status reports the exact session as verified'
);

SELECT is(
  public.get_privileged_email_step_up_status(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ) -> 'verifiedUntil',
  'null'::jsonb,
  'a session-lifetime grant preserves verifiedUntil as JSON null'
);

INSERT INTO app_private.privileged_email_step_up_policies (
  organization_id,
  enforcement_enabled,
  enabled_at,
  enabled_by
)
VALUES (
  'c1000000-0000-0000-0000-000000000010',
  true,
  now(),
  'c1000000-0000-0000-0000-000000000001'
);

SELECT is(
  app_private.privileged_email_step_up_satisfied_for_actor(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  true,
  'the exact live Auth session satisfies the private predicate'
);

SELECT is(
  app_private.privileged_email_step_up_satisfied_for_actor(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000102'
  ),
  false,
  'another live session for the same user does not inherit verification'
);

SELECT is(
  public.assert_privileged_email_step_up_satisfied(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  true,
  'the service assertion accepts the exact verified session'
);

SELECT is(
  public.assert_privileged_email_step_up_satisfied(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000102'
  ),
  false,
  'the service assertion denies a second session'
);

UPDATE auth.sessions
SET not_after = now() - interval '1 minute'
WHERE id = 'c1000000-0000-0000-0000-000000000101';

SELECT is(
  app_private.privileged_email_step_up_satisfied_for_actor(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  false,
  'an Auth session past not_after ends verification'
);

SELECT is(
  public.assert_privileged_email_step_up_satisfied(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  false,
  'the service assertion also denies an expired Auth session'
);

UPDATE auth.sessions
SET not_after = NULL
WHERE id = 'c1000000-0000-0000-0000-000000000101';

UPDATE app_private.privileged_email_step_up_grants
SET
  verified_at = now() - interval '10 minutes',
  expires_at = now() + interval '5 minutes',
  revoked_at = NULL
WHERE organization_id = 'c1000000-0000-0000-0000-000000000010'
  AND user_id = 'c1000000-0000-0000-0000-000000000001'
  AND session_id = 'c1000000-0000-0000-0000-000000000101';

SELECT is(
  app_private.privileged_email_step_up_satisfied_for_actor(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  true,
  'a legacy timed grant remains compatible before its expiry'
);

UPDATE app_private.privileged_email_step_up_grants
SET
  verified_at = now() - interval '20 minutes',
  expires_at = now() - interval '5 minutes'
WHERE organization_id = 'c1000000-0000-0000-0000-000000000010'
  AND user_id = 'c1000000-0000-0000-0000-000000000001'
  AND session_id = 'c1000000-0000-0000-0000-000000000101';

SELECT is(
  app_private.privileged_email_step_up_satisfied_for_actor(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  false,
  'an expired legacy grant is not promoted to session lifetime'
);

UPDATE app_private.privileged_email_step_up_grants
SET
  expires_at = now() + interval '5 minutes',
  revoked_at = now()
WHERE organization_id = 'c1000000-0000-0000-0000-000000000010'
  AND user_id = 'c1000000-0000-0000-0000-000000000001'
  AND session_id = 'c1000000-0000-0000-0000-000000000101';

SELECT is(
  app_private.privileged_email_step_up_satisfied_for_actor(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  false,
  'a revoked legacy grant is not promoted to session lifetime'
);

SELECT is(
  (
    public.get_privileged_email_step_up_status(
      'c1000000-0000-0000-0000-000000000010',
      'c1000000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000101'
    ) ->> 'verified'
  )::boolean,
  false,
  'status does not revive an expired or revoked grant'
);

UPDATE app_private.privileged_email_step_up_challenges
SET
  created_at = now() - interval '2 minutes',
  resend_available_at = now() - interval '1 minute'
WHERE id = (SELECT challenge_id FROM first_challenge);

CREATE TEMP TABLE fresh_challenge AS
SELECT *
FROM public.prepare_privileged_email_step_up(
  'c1000000-0000-0000-0000-000000000010',
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000101',
  repeat('c', 64),
  repeat('d', 64)
);

SELECT lives_ok(
  format(
    'SELECT public.mark_privileged_email_step_up_sent(%L::uuid)',
    (SELECT challenge_id FROM fresh_challenge)
  ),
  'the trusted sender can deliver a fresh challenge'
);

SELECT is(
  public.verify_privileged_email_step_up(
    (SELECT challenge_id FROM fresh_challenge),
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101',
    repeat('c', 64),
    repeat('d', 64)
  ),
  true,
  'a fresh successful challenge can replace the inactive legacy grant'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_grants AS step_up_grant
    WHERE step_up_grant.organization_id = 'c1000000-0000-0000-0000-000000000010'
      AND step_up_grant.user_id = 'c1000000-0000-0000-0000-000000000001'
      AND step_up_grant.session_id = 'c1000000-0000-0000-0000-000000000101'
      AND step_up_grant.challenge_id = (SELECT challenge_id FROM fresh_challenge)
      AND step_up_grant.expires_at IS NULL
      AND step_up_grant.revoked_at IS NULL
  ),
  'only the newly successful exact-session challenge converts the grant to session lifetime'
);

SELECT is(
  app_private.privileged_email_step_up_satisfied_for_actor(
    'c1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000101'
  ),
  true,
  'the fresh session-lifetime grant restores exact-session authority'
);

DELETE FROM auth.sessions
WHERE id = 'c1000000-0000-0000-0000-000000000101';

SELECT is(
  (
    SELECT count(*)
    FROM app_private.privileged_email_step_up_grants
    WHERE session_id = 'c1000000-0000-0000-0000-000000000101'
  ),
  0::bigint,
  'logout or explicit session deletion cascades every grant for that session'
);

SELECT * FROM finish();

ROLLBACK;
