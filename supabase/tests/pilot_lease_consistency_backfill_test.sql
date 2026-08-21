BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated',
  'authenticated',
  'pilot-repair@example.test',
  extensions.crypt('pilot-repair', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  '752a87b8-bd04-4a45-9cb8-00687af66e73',
  'Pilot repair fixture',
  'pilot-repair-fixture'
);

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status,
  rental_structure, archived_at
)
VALUES (
  '17e1d5fe-d0b4-463e-881b-48c8724f3fef',
  '752a87b8-bd04-4a45-9cb8-00687af66e73',
  'Archived Pilot property',
  'PILOT-ARCHIVED',
  'apartment',
  'active',
  'multi_unit',
  '2026-08-19 07:22:47.618714+00'
);

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency, archived_at
)
VALUES
  (
    '23a55cc6-0a9c-4a5c-8abd-06fc811d42e7',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '17e1d5fe-d0b4-463e-881b-48c8724f3fef',
    'PILOT-ZERO',
    'vacant',
    350,
    'USD',
    '2026-08-19 07:22:13.155322+00'
  ),
  (
    'ec2a01f5-1fea-48cf-87df-68e7f2acda31',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '17e1d5fe-d0b4-463e-881b-48c8724f3fef',
    'PILOT-TERM',
    'vacant',
    1000,
    'USD',
    '2026-08-19 07:21:55.87346+00'
  );

INSERT INTO public.people(id, organization_id, display_name, party_type)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '752a87b8-bd04-4a45-9cb8-00687af66e73',
  'Pilot repair tenant',
  'individual'
);

INSERT INTO public.leases(
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  deposit_amount, deposit_currency, status, archived_at
)
VALUES
  (
    '4cc6c6ef-f37f-45cf-94cf-0cc4fc34cba8',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '17e1d5fe-d0b4-463e-881b-48c8724f3fef',
    '23a55cc6-0a9c-4a5c-8abd-06fc811d42e7',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    0,
    'USD',
    'cancelled',
    '2026-08-21 09:10:49.34408+00'
  ),
  (
    '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '17e1d5fe-d0b4-463e-881b-48c8724f3fef',
    'ec2a01f5-1fea-48cf-87df-68e7f2acda31',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    1000,
    'USD',
    'terminated',
    '2026-08-21 09:15:52.228399+00'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '17e1d5fe-d0b4-463e-881b-48c8724f3fef',
    'ec2a01f5-1fea-48cf-87df-68e7f2acda31',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    500,
    'USD',
    'terminated',
    '2026-08-21 09:20:00+00'
  );

INSERT INTO public.lease_deposits(
  id, organization_id, lease_id, deposit_type, amount, currency, status
)
VALUES
  (
    'eccc7414-feb2-4f26-91cb-7b86e2c302ae',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '4cc6c6ef-f37f-45cf-94cf-0cc4fc34cba8',
    'security',
    0,
    'USD',
    'pending'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'security',
    500,
    'USD',
    'held'
  );

INSERT INTO public.lease_terms(
  id, organization_id, lease_id, term_sequence, start_date, end_date,
  rent_amount, rent_currency, rent_due_day, payment_frequency, status,
  authority_kind, supersedes_term_id, confirmed_at, confirmed_by
)
VALUES
  (
    'f07b0734-025c-49b6-8781-bda08d682fd3',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12',
    1, '2026-08-15', '2026-10-24', 1000, 'USD', 5, 'monthly',
    'superseded', 'authoritative', NULL, statement_timestamp(),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    'ffceebfe-cc6d-4188-bd64-9044f1bc651c',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12',
    2, '2026-08-15', '2026-08-15', 1000, 'USD', 5, 'monthly',
    'active', 'authoritative',
    ('f07b0734-025c-' || '49b6-8781-bda08d682fd3')::uuid,
    statement_timestamp(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '0cd38538-8a00-49b4-9188-c637d59c8ea8',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12',
    3, '2026-08-16', '2026-10-24', 1000, 'USD', 5, 'monthly',
    'superseded', 'authoritative',
    ('ffceebfe-cc6d-' || '4188-bd64-9044f1bc651c')::uuid,
    statement_timestamp(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '980a5152-e5f5-478a-8e09-6129fb3a804f',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12',
    4, '2026-08-16', '2026-08-21', 1000, 'USD', 5, 'monthly',
    'terminated', 'authoritative',
    ('0cd38538-8a00-' || '49b4-9188-c637d59c8ea8')::uuid,
    statement_timestamp(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '752a87b8-bd04-4a45-9cb8-00687af66e73',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    1, '2026-01-01', '2026-01-31', 500, 'USD', 5, 'monthly',
    'active', 'authoritative', NULL, statement_timestamp(),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

INSERT INTO public.lease_lifecycle_events(
  id, organization_id, lease_id, transition, from_status, to_status,
  expected_occupancy_id, occupancy_id, term_id, effective_date,
  reason, idempotency_key
)
VALUES (
  'd62d7e16-1430-4da0-8022-bed51bb42512',
  '752a87b8-bd04-4a45-9cb8-00687af66e73',
  '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12',
  'terminate',
  'active',
  'terminated',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '980a5152-e5f5-478a-8e09-6129fb3a804f',
  '2026-08-21',
  'Pilot repair lifecycle fixture',
  'pilot-repair-terminate-v1'
);

SET LOCAL session_replication_role = origin;

SELECT is(
  app_private.repair_pilot_zero_deposit(),
  'repaired',
  'the exact empty Pilot zero-deposit artifact is repaired'
);

SELECT is(
  app_private.repair_pilot_stale_rent_term(),
  'repaired',
  'the exact stale Pilot rent-term status is repaired'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.leases
    WHERE id = '4cc6c6ef-f37f-45cf-94cf-0cc4fc34cba8'
      AND deposit_amount IS NULL
      AND deposit_currency IS NULL
  ),
  'the zero-deposit Lease header now says no deposit required'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.lease_deposits
    WHERE id = 'eccc7414-feb2-4f26-91cb-7b86e2c302ae'
      AND amount = 0
      AND archived_at IS NOT NULL
  ),
  'the empty artifact is archived rather than deleted'
);

SELECT is(
  (
    SELECT status FROM public.lease_terms
    WHERE id = 'ffceebfe-cc6d-4188-bd64-9044f1bc651c'
  ),
  'superseded',
  'the stale one-day term is no longer current'
);

SELECT is(
  (
    SELECT count(*)::integer FROM public.lease_terms
    WHERE lease_id = '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12'
  ),
  4,
  'all Pilot rent-term history remains present'
);

SELECT is(
  (
    SELECT count(*)::integer FROM public.lease_lifecycle_events
    WHERE lease_id = '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12'
  ),
  1,
  'the termination event remains present'
);

SELECT is(
  (
    SELECT amount FROM public.lease_deposits
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      AND archived_at IS NULL
  ),
  500::numeric,
  'an unrelated positive deposit is unchanged'
);

SELECT is(
  (
    SELECT status FROM public.lease_terms
    WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ),
  'active',
  'an unrelated active term is unchanged'
);

SELECT is(
  (
    SELECT count(*)::integer FROM public.activity_logs
    WHERE organization_id = '752a87b8-bd04-4a45-9cb8-00687af66e73'
      AND action IN ('lease_zero_deposit_normalized', 'lease_stale_term_closed')
  ),
  2,
  'both repairs leave one calm audit entry'
);

SELECT is(
  app_private.repair_pilot_zero_deposit(),
  'already_repaired',
  'the zero-deposit repair is idempotent'
);

SELECT is(
  app_private.repair_pilot_stale_rent_term(),
  'already_repaired',
  'the stale-term repair is idempotent'
);

SET LOCAL session_replication_role = replica;

UPDATE public.leases
SET deposit_amount = 0,
    deposit_currency = 'USD'
WHERE id = '4cc6c6ef-f37f-45cf-94cf-0cc4fc34cba8';

UPDATE public.lease_deposits
SET archived_at = NULL
WHERE id = 'eccc7414-feb2-4f26-91cb-7b86e2c302ae';

INSERT INTO public.lease_deposit_events(
  id, organization_id, lease_deposit_id, property_id, event_type,
  event_date, amount, currency, reference
)
VALUES (
  '12121212-1212-4212-8212-121212121212',
  '752a87b8-bd04-4a45-9cb8-00687af66e73',
  'eccc7414-feb2-4f26-91cb-7b86e2c302ae',
  '17e1d5fe-d0b4-463e-881b-48c8724f3fef',
  'received',
  '2026-08-20',
  100,
  'USD',
  'Evidence appeared after inspection'
);

SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  'SELECT app_private.repair_pilot_zero_deposit()',
  '55000',
  'Pilot zero deposit now has financial evidence',
  'the zero-deposit repair fails closed when financial evidence exists'
);

SELECT is(
  (
    SELECT deposit_amount FROM public.leases
    WHERE id = '4cc6c6ef-f37f-45cf-94cf-0cc4fc34cba8'
  ),
  0::numeric,
  'the failed zero-deposit repair leaves the Lease header unchanged'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.lease_deposits
    WHERE id = 'eccc7414-feb2-4f26-91cb-7b86e2c302ae'
      AND archived_at IS NULL
  ),
  'the failed zero-deposit repair preserves the artifact and its evidence'
);

SET LOCAL session_replication_role = replica;

UPDATE public.lease_terms
SET status = 'active',
    rent_amount = 1001
WHERE id = 'ffceebfe-cc6d-4188-bd64-9044f1bc651c';

SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  'SELECT app_private.repair_pilot_stale_rent_term()',
  '55000',
  'Pilot stale-term history precondition changed',
  'the stale-term repair fails closed when the inspected history differs'
);

SELECT is(
  (
    SELECT status FROM public.lease_terms
    WHERE id = '980a5152-e5f5-478a-8e09-6129fb3a804f'
  ),
  'terminated',
  'the failed stale-term repair leaves terminal history unchanged'
);

SELECT * FROM finish();

ROLLBACK;
