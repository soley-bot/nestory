BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_function(
  'public',
  'resume_client_workspace_invitation_exact',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone', 'bigint'],
  'an exact existing reservation can be renewed without the create-or-resume endpoint'
);

SELECT ok(has_function_privilege('service_role',
  'public.resume_client_workspace_invitation_exact(uuid,uuid,text,text,text,timestamptz,bigint)', 'EXECUTE'),
  'the service role can request exact renewal');
SELECT ok(NOT has_function_privilege('anon',
  'public.resume_client_workspace_invitation_exact(uuid,uuid,text,text,text,timestamptz,bigint)', 'EXECUTE'),
  'anonymous users cannot request exact renewal');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.resume_client_workspace_invitation_exact(uuid,uuid,text,text,text,timestamptz,bigint)', 'EXECUTE'),
  'authenticated users cannot request exact renewal');

-- Synthetic, rollback-only fixtures. Claim emulation is confined to this local
-- database test; operators must use a real authorized service request.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
CREATE TEMP TABLE exact_cases (
  label text PRIMARY KEY,
  organization_id uuid,
  invitation_id uuid,
  name text,
  slug text,
  email text,
  expiry timestamptz,
  version bigint
);

CREATE FUNCTION pg_temp.seed_exact_case(p_label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_reservation record;
BEGIN
  SELECT * INTO v_reservation FROM public.stage_client_workspace(
    'Exact Renewal ' || p_label, 'exact-renewal-' || p_label,
    p_label || '@exact-renewal.example.com'
  );
  UPDATE public.organization_invitations
  SET invited_at = now() - interval '2 hours',
      expires_at = date_trunc('second', now()) - interval '1 hour'
        + interval '0.123456 seconds'
  WHERE id = v_reservation.invitation_id;
  INSERT INTO exact_cases
  SELECT p_label, o.id, i.id, o.name, o.slug, i.email, i.expires_at, s.version
  FROM public.organizations o
  JOIN public.organization_invitations i ON i.organization_id = o.id
  JOIN public.organization_authorization_states s ON s.organization_id = o.id
  WHERE i.id = v_reservation.invitation_id;
END;
$$;

CREATE FUNCTION pg_temp.exact_call(p_label text, p_overrides jsonb DEFAULT '{}')
RETURNS text LANGUAGE sql AS $$
  SELECT format(
    'SELECT * FROM public.resume_client_workspace_invitation_exact(%L::uuid,%L::uuid,%L,%L,%L,%L::timestamptz,%L::bigint)',
    args->>'organization_id', args->>'invitation_id', args->>'name',
    args->>'slug', args->>'email', args->>'expiry', args->>'version'
  ) FROM (
    SELECT to_jsonb(c) || p_overrides AS args FROM exact_cases c WHERE label = p_label
  ) supplied;
$$;

CREATE FUNCTION pg_temp.exact_snapshot(p_organization_id uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'organization', (SELECT to_jsonb(o) FROM public.organizations o WHERE o.id = p_organization_id),
    'authorization', (SELECT to_jsonb(s) FROM public.organization_authorization_states s WHERE s.organization_id = p_organization_id),
    'invitations', (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.organization_invitations i WHERE i.organization_id = p_organization_id),
    'members', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.organization_members m WHERE m.organization_id = p_organization_id),
    'branches', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.organization_branches b WHERE b.organization_id = p_organization_id),
    'audit', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.activity_logs a WHERE a.organization_id = p_organization_id)
  );
$$;

CREATE FUNCTION pg_temp.refuses_exact(
  p_label text, p_overrides jsonb, p_state text, p_description text
) RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  v_organization_id uuid := (SELECT organization_id FROM exact_cases WHERE label = p_label);
  v_before jsonb := pg_temp.exact_snapshot(v_organization_id);
BEGIN
  RETURN NEXT throws_ok(pg_temp.exact_call(p_label, p_overrides),
    p_state, NULL, p_description);
  RETURN NEXT is(pg_temp.exact_snapshot(v_organization_id), v_before,
    p_description || ' leaves reservation and audit unchanged');
END;
$$;

SELECT pg_temp.seed_exact_case(label)
FROM unnest(ARRAY['happy', 'other', 'accepted', 'revoked', 'sent', 'bound',
  'unexpired', 'version', 'ordinary', 'transition', 'member', 'branch',
  'duplicate', 'failed', 'expired-status', 'fault', 'postcondition']) label;

SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
SELECT * FROM pg_temp.refuses_exact('happy', '{}', '42501', 'missing service claim is rejected');
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT * FROM pg_temp.refuses_exact('happy', '{}', '42501', 'wrong service claim is rejected');
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT result.* FROM unnest(ARRAY['organization_id', 'invitation_id', 'name', 'slug', 'email', 'expiry', 'version']) field
CROSS JOIN LATERAL pg_temp.refuses_exact('happy', jsonb_build_object(field, NULL), '22023',
  'null expected ' || field || ' is rejected') result;
SELECT * FROM pg_temp.refuses_exact('happy', '{"version":0}', '22023', 'invalid expected version is rejected');
SELECT * FROM pg_temp.refuses_exact('happy', '{"organization_id":"10000000-0000-0000-0000-000000000001"}',
  '55000', 'missing organization cannot create a reservation');
SELECT * FROM pg_temp.refuses_exact('happy', '{"invitation_id":"10000000-0000-0000-0000-000000000002"}',
  '55000', 'missing invitation cannot create a reservation');
SELECT * FROM pg_temp.refuses_exact('happy',
  jsonb_build_object('invitation_id', (SELECT invitation_id FROM exact_cases WHERE label = 'other')),
  '55000', 'an invitation in another organization is rejected');
SELECT * FROM pg_temp.refuses_exact('happy', '{"name":"Unexpected Company"}', '55000', 'changed company name is rejected');
SELECT * FROM pg_temp.refuses_exact('happy', '{"slug":"unused-exact-renewal-slug"}', '55000', 'changed slug cannot create a new company');
SELECT * FROM pg_temp.refuses_exact('happy', '{"email":"replacement@example.com"}', '55000', 'replacement email is rejected');
SELECT * FROM pg_temp.refuses_exact('happy',
  jsonb_build_object('expiry', (SELECT date_trunc('milliseconds', expiry) FROM exact_cases WHERE label = 'happy')),
  '55000', 'expiry comparison retains microseconds');

INSERT INTO auth.users (id, email, email_confirmed_at, created_at)
VALUES ('10000000-0000-0000-0000-000000000010', 'existing@exact-renewal.example.com', now(), now() - interval '1 day');

-- Insert accepted history directly as test setup; the application acceptance
-- path has its own authenticated, confirmed-email and password checks.
DELETE FROM public.organization_invitations WHERE id = (SELECT invitation_id FROM exact_cases WHERE label = 'accepted');
INSERT INTO public.organization_invitations (id, organization_id, email, role, status, auth_user_id, accepted_at, expires_at)
SELECT invitation_id, organization_id, email, 'super_admin', 'accepted',
  '10000000-0000-0000-0000-000000000010', now(), expiry FROM exact_cases WHERE label = 'accepted';
UPDATE public.organization_invitations SET status = 'revoked', revoked_at = now()
WHERE id = (SELECT invitation_id FROM exact_cases WHERE label = 'revoked');
UPDATE public.organization_invitations SET delivery_method = 'invite', last_sent_at = now() - interval '2 hours'
WHERE id = (SELECT invitation_id FROM exact_cases WHERE label = 'sent');
UPDATE public.organization_invitations SET auth_user_id = '10000000-0000-0000-0000-000000000010'
WHERE id = (SELECT invitation_id FROM exact_cases WHERE label = 'bound');
UPDATE public.organization_invitations SET expires_at = now() + interval '1 hour'
WHERE id = (SELECT invitation_id FROM exact_cases WHERE label = 'unexpired');
UPDATE exact_cases SET expiry = now() + interval '1 hour' WHERE label = 'unexpired';
UPDATE public.organization_invitations SET status = 'send_failed'
WHERE id = (SELECT invitation_id FROM exact_cases WHERE label = 'failed');
UPDATE public.organization_invitations SET status = 'expired'
WHERE id = (SELECT invitation_id FROM exact_cases WHERE label = 'expired-status');
UPDATE public.organization_authorization_states SET version = version + 1
WHERE organization_id = (SELECT organization_id FROM exact_cases WHERE label = 'version');
UPDATE public.organization_authorization_states SET ordinary_access_enabled = true
WHERE organization_id = (SELECT organization_id FROM exact_cases WHERE label = 'ordinary');
-- Supply the current version here so the ordinary-access guard is exercised
-- independently of the separate stale-version fixture.
UPDATE exact_cases c SET version = s.version
FROM public.organization_authorization_states s
WHERE c.label = 'ordinary' AND s.organization_id = c.organization_id;
UPDATE public.organization_authorization_states SET transition_manifest_required = true
WHERE organization_id = (SELECT organization_id FROM exact_cases WHERE label = 'transition');
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, '10000000-0000-0000-0000-000000000010', 'super_admin' FROM exact_cases WHERE label = 'member';
INSERT INTO public.organization_branches (organization_id, name, code)
SELECT organization_id, 'Synthetic branch', 'SYN' FROM exact_cases WHERE label = 'branch';
-- A historical, eligible second row makes the old provisioner's latest-row
-- selection ambiguous, even if only one row is currently pending.
INSERT INTO public.organization_invitations (organization_id, email, role, status, invited_at, expires_at)
SELECT organization_id, email, 'super_admin', 'expired', now() - interval '3 hours', expiry - interval '1 hour'
FROM exact_cases WHERE label = 'duplicate';

SELECT result.* FROM unnest(ARRAY['accepted', 'revoked', 'sent', 'bound', 'unexpired', 'version',
  'ordinary', 'transition', 'member', 'branch', 'duplicate', 'failed', 'expired-status']) label
CROSS JOIN LATERAL pg_temp.refuses_exact(label, '{}', '55000',
  label || ' reservation is outside this recovery contract') result;

CREATE TEMP TABLE successful_before AS
SELECT pg_temp.exact_snapshot(organization_id) AS snapshot FROM exact_cases WHERE label = 'happy';
CREATE TEMP TABLE unrelated_before AS
SELECT pg_temp.exact_snapshot(organization_id) AS snapshot FROM exact_cases WHERE label = 'other';
CREATE TEMP TABLE auth_before AS SELECT
  (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM auth.users u) AS users,
  (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.invitation_id) FROM app_private.invitation_password_challenges c) AS challenges;
CREATE TEMP TABLE exact_result AS
SELECT renewed.* FROM exact_cases c
CROSS JOIN LATERAL public.resume_client_workspace_invitation_exact(
  c.organization_id, c.invitation_id, c.name, c.slug, c.email, c.expiry, c.version
) renewed WHERE c.label = 'happy';
SELECT is((SELECT count(*) FROM exact_result), 1::bigint, 'renewal returns one result');
SELECT is((SELECT organization_id FROM exact_result),
  (SELECT organization_id FROM exact_cases WHERE label = 'happy'), 'renewal returns the reviewed organization ID');
SELECT is((SELECT invitation_id FROM exact_result),
  (SELECT invitation_id FROM exact_cases WHERE label = 'happy'), 'renewal returns the reviewed invitation ID');
SELECT ok((SELECT expires_at > clock_timestamp() AND expires_at = now() + interval '1 hour' FROM exact_result),
  'renewal provides a future one-hour deadline');
SELECT is(
  (SELECT to_jsonb(i) - ARRAY['invited_at', 'expires_at', 'updated_at', 'delivery_error'] FROM public.organization_invitations i
    JOIN exact_cases c ON c.invitation_id = i.id WHERE c.label = 'happy'),
  (SELECT (snapshot->'invitations'->0) - ARRAY['invited_at', 'expires_at', 'updated_at', 'delivery_error'] FROM successful_before),
  'renewal preserves every other invitation field');
SELECT is((SELECT to_jsonb(o) FROM public.organizations o JOIN exact_cases c ON c.organization_id = o.id WHERE c.label = 'happy'),
  (SELECT snapshot->'organization' FROM successful_before), 'company identity and data are unchanged');
SELECT is((SELECT to_jsonb(s) FROM public.organization_authorization_states s JOIN exact_cases c USING (organization_id) WHERE c.label = 'happy'),
  (SELECT snapshot->'authorization' FROM successful_before), 'ordinary hold and authorization version are unchanged');
SELECT is((SELECT count(*) FROM public.organization_members m JOIN exact_cases c USING (organization_id) WHERE c.label = 'happy'),
  0::bigint, 'renewal creates no membership');
SELECT is((SELECT count(*) FROM public.organization_branches b JOIN exact_cases c USING (organization_id) WHERE c.label = 'happy'),
  0::bigint, 'renewal creates no branch');
SELECT is((SELECT count(*) FROM public.activity_logs a JOIN exact_cases c USING (organization_id) WHERE c.label = 'happy'),
  (SELECT jsonb_array_length(snapshot->'audit')::bigint + 1 FROM successful_before), 'renewal adds exactly one audit event');
SELECT ok((SELECT count(*) = 1 FROM public.activity_logs a JOIN exact_cases c USING (organization_id)
  WHERE c.label = 'happy' AND a.entity_id = c.invitation_id AND a.entity_type = 'organization_invitation'
    AND a.actor_id IS NULL AND a.action = 'workspace_provisioning_resumed'
    AND a.new_values = jsonb_build_object('email', c.email, 'role', 'super_admin')),
  'the audit event identifies the same administrator reservation');
SELECT is((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM auth.users u),
  (SELECT users FROM auth_before), 'renewal does not create or modify an Auth user');
SELECT is((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.invitation_id) FROM app_private.invitation_password_challenges c),
  (SELECT challenges FROM auth_before), 'renewal does not create or modify password challenges');
SELECT is(pg_temp.exact_snapshot((SELECT organization_id FROM exact_cases WHERE label = 'other')),
  (SELECT snapshot FROM unrelated_before), 'another company remains unchanged');
SELECT * FROM pg_temp.refuses_exact('happy', '{}', '55000',
  'replaying original expected values after success cannot renew or audit again');

-- Faults after the old provisioner's UPDATE must roll back the UPDATE and audit.
CREATE FUNCTION pg_temp.fail_exact_renewal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action = 'workspace_provisioning_resumed' AND NEW.organization_id =
    (SELECT organization_id FROM exact_cases WHERE label = 'fault') THEN
    RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.action = 'workspace_provisioning_resumed' AND NEW.organization_id =
    (SELECT organization_id FROM exact_cases WHERE label = 'postcondition') THEN
    UPDATE public.organizations SET name = name || ' changed' WHERE id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER exact_recovery_test_fault BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_exact_renewal();
SELECT * FROM pg_temp.refuses_exact('fault', '{}', 'P0001', 'an audit failure rolls back the underlying renewal');
SELECT * FROM pg_temp.refuses_exact('postcondition', '{}', '55000', 'a failed postcondition rolls back the underlying renewal');

SELECT * FROM finish();
ROLLBACK;
