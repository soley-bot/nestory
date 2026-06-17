-- Local stress seed for Nestory.
-- This creates a deterministic admin login plus enough records to exercise
-- Timeline, Ledger, Properties, Units, filters, summaries, and period locks.
-- Login for local Supabase: nestory@gmail.com / 123456789

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
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
  '00000000-0000-0000-0000-000000000101',
  'authenticated',
  'authenticated',
  'nestory@gmail.com',
  crypt('123456789', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"name": "Nestory Admin"}'::jsonb,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  confirmation_token = EXCLUDED.confirmation_token,
  recovery_token = EXCLUDED.recovery_token,
  email_change_token_new = EXCLUDED.email_change_token_new,
  email_change = EXCLUDED.email_change,
  email_change_token_current = EXCLUDED.email_change_token_current,
  reauthentication_token = EXCLUDED.reauthentication_token,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = now();

INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000101',
    'email', 'nestory@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
)
ON CONFLICT (provider_id, provider) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  identity_data = EXCLUDED.identity_data,
  updated_at = now();

INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Sample Property Group')
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  updated_at = now();

INSERT INTO public.organization_members (
  id,
  organization_id,
  user_id,
  role
)
VALUES (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'admin'
)
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = EXCLUDED.role;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  owner,
  address,
  status,
  acquisition_date,
  notes,
  created_by,
  updated_by
)
SELECT
  ('10000000-0000-0000-0000-' || lpad(property_number::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  format('Nestory Residence %s', lpad(property_number::text, 2, '0')),
  format('NST-%s', lpad(property_number::text, 3, '0')),
  CASE property_number % 5
    WHEN 0 THEN 'Mixed Use'
    WHEN 1 THEN 'Serviced Apartment'
    WHEN 2 THEN 'Condominium'
    WHEN 3 THEN 'Retail'
    ELSE 'Townhouse'
  END,
  format('Owner Group %s', chr(64 + ((property_number - 1) % 10) + 1)),
  format('District %s, Phnom Penh', ((property_number - 1) % 12) + 1),
  CASE WHEN property_number % 13 = 0 THEN 'under_review' ELSE 'active' END,
  date '2019-01-01' + (property_number * 45),
  format('Stress seed property %s used for local load testing.', property_number),
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
FROM generate_series(1, 25) AS series(property_number)
ON CONFLICT (organization_id, code) DO NOTHING;

WITH unit_seed AS (
  SELECT
    unit_number_index,
    (((unit_number_index - 1) / 20) + 1)::int AS property_number,
    (((unit_number_index - 1) % 20) + 1)::int AS unit_in_property
  FROM generate_series(1, 500) AS series(unit_number_index)
)
INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  floor,
  size_sqm,
  status,
  current_rent_amount,
  current_rent_currency,
  created_by,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  ('20000000-0000-0000-0000-' || lpad(unit_number_index::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  ('10000000-0000-0000-0000-' || lpad(property_number::text, 12, '0'))::uuid,
  format('%s-%s', lpad(((unit_in_property - 1) / 4 + 1)::text, 2, '0'), lpad(unit_in_property::text, 2, '0')),
  ((unit_in_property - 1) / 4 + 1)::text,
  (42 + (unit_in_property * 2.75) + (property_number % 4))::numeric(10, 2),
  CASE
    WHEN unit_number_index <= 350 THEN 'occupied'
    WHEN unit_number_index <= 410 THEN 'reserved'
    WHEN unit_number_index <= 470 THEN 'vacant'
    ELSE 'maintenance'
  END,
  CASE
    WHEN unit_number_index % 7 = 0 THEN (1500000 + (property_number * 30000) + (unit_in_property * 15000))::numeric(14, 2)
    ELSE (420 + (property_number * 12) + (unit_in_property * 18))::numeric(14, 2)
  END,
  CASE WHEN unit_number_index % 7 = 0 THEN 'KHR'::public.currency_code ELSE 'USD'::public.currency_code END,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  CASE WHEN unit_number_index % 97 = 0 THEN now() - interval '5 days' ELSE NULL END,
  CASE WHEN unit_number_index % 97 = 0 THEN '00000000-0000-0000-0000-000000000101'::uuid ELSE NULL END
FROM unit_seed
ON CONFLICT (property_id, unit_number) DO NOTHING;

WITH lease_seed AS (
  SELECT
    lease_number,
    (((lease_number - 1) / 20) + 1)::int AS property_number,
    (((lease_number - 1) % 20) + 1)::int AS unit_in_property
  FROM generate_series(1, 350) AS series(lease_number)
)
INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  unit_id,
  tenant_name,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
  deposit_amount,
  deposit_currency,
  status,
  created_by,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  ('30000000-0000-0000-0000-' || lpad(lease_number::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  ('10000000-0000-0000-0000-' || lpad(property_number::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(lease_number::text, 12, '0'))::uuid,
  format(
    '%s %s',
    (ARRAY['Sokha', 'Dara', 'Malis', 'Vannak', 'Sophea', 'Bopha', 'Rithy', 'Chan', 'Nary', 'Kosal'])[(lease_number % 10) + 1],
    format('Tenant %s', lpad(lease_number::text, 3, '0'))
  ),
  date '2024-01-01' + (lease_number % 540),
  date '2024-01-01' + (lease_number % 540) + 365,
  CASE
    WHEN lease_number % 7 = 0 THEN (1500000 + (property_number * 30000) + (unit_in_property * 15000))::numeric(14, 2)
    ELSE (420 + (property_number * 12) + (unit_in_property * 18))::numeric(14, 2)
  END,
  CASE WHEN lease_number % 7 = 0 THEN 'KHR'::public.currency_code ELSE 'USD'::public.currency_code END,
  CASE
    WHEN lease_number % 7 = 0 THEN ((1500000 + (property_number * 30000) + (unit_in_property * 15000)) * 2)::numeric(14, 2)
    ELSE ((420 + (property_number * 12) + (unit_in_property * 18)) * 2)::numeric(14, 2)
  END,
  CASE WHEN lease_number % 7 = 0 THEN 'KHR'::public.currency_code ELSE 'USD'::public.currency_code END,
  CASE
    WHEN lease_number % 23 = 0 THEN 'ended'
    WHEN lease_number % 17 = 0 THEN 'notice_given'
    ELSE 'active'
  END,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  CASE WHEN lease_number % 23 = 0 THEN now() - interval '20 days' ELSE NULL END,
  CASE WHEN lease_number % 23 = 0 THEN '00000000-0000-0000-0000-000000000101'::uuid ELSE NULL END
FROM lease_seed;

WITH ledger_seed AS (
  SELECT
    entry_number,
    (((entry_number - 1) % 25) + 1)::int AS property_number,
    (((entry_number - 1) % 500) + 1)::int AS unit_number_index
  FROM generate_series(1, 700) AS series(entry_number)
)
INSERT INTO public.ledger_entries (
  id,
  organization_id,
  property_id,
  unit_id,
  transaction_date,
  direction,
  category,
  amount,
  currency,
  description,
  created_by,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  ('40000000-0000-0000-0000-' || lpad(entry_number::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  ('10000000-0000-0000-0000-' || lpad(property_number::text, 12, '0'))::uuid,
  CASE
    WHEN entry_number % 13 = 0 THEN NULL
    ELSE ('20000000-0000-0000-0000-' || lpad(unit_number_index::text, 12, '0'))::uuid
  END,
  date '2026-06-15' - (entry_number % 540),
  CASE WHEN entry_number % 4 = 0 THEN 'expense' ELSE 'income' END,
  CASE
    WHEN entry_number % 4 = 0 THEN (ARRAY['Maintenance', 'Repair', 'Utilities', 'Cleaning'])[(entry_number % 4) + 1]
    ELSE (ARRAY['Rent', 'Deposit', 'Late Fee', 'Parking'])[(entry_number % 4) + 1]
  END,
  CASE
    WHEN entry_number % 9 = 0 THEN (120000 + (entry_number * 1350))::numeric(14, 2)
    WHEN entry_number % 4 = 0 THEN (35 + (entry_number % 160) * 4.25)::numeric(14, 2)
    ELSE (380 + (entry_number % 220) * 5.5)::numeric(14, 2)
  END,
  CASE WHEN entry_number % 9 = 0 THEN 'KHR'::public.currency_code ELSE 'USD'::public.currency_code END,
  format('Stress seed ledger entry %s for load testing.', entry_number),
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  CASE WHEN entry_number % 41 = 0 THEN now() - interval '14 days' ELSE NULL END,
  CASE WHEN entry_number % 41 = 0 THEN '00000000-0000-0000-0000-000000000101'::uuid ELSE NULL END
FROM ledger_seed;

WITH event_seed AS (
  SELECT
    event_number,
    (((event_number - 1) % 25) + 1)::int AS property_number,
    (((event_number - 1) % 500) + 1)::int AS unit_number_index
  FROM generate_series(1, 800) AS series(event_number)
)
INSERT INTO public.timeline_events (
  id,
  organization_id,
  property_id,
  unit_id,
  lease_id,
  ledger_entry_id,
  event_date,
  event_type,
  title,
  description,
  cost_amount,
  cost_currency,
  created_by,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  ('50000000-0000-0000-0000-' || lpad(event_number::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  ('10000000-0000-0000-0000-' || lpad(property_number::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(unit_number_index::text, 12, '0'))::uuid,
  CASE
    WHEN unit_number_index <= 350 AND event_number % 4 = 0 THEN ('30000000-0000-0000-0000-' || lpad(unit_number_index::text, 12, '0'))::uuid
    ELSE NULL
  END,
  CASE
    WHEN event_number <= 700 AND event_number % 5 = 0 THEN ('40000000-0000-0000-0000-' || lpad(event_number::text, 12, '0'))::uuid
    ELSE NULL
  END,
  date '2026-06-15' - (event_number % 620),
  CASE event_number % 11
    WHEN 0 THEN 'Lease Started'::public.timeline_event_type
    WHEN 1 THEN 'Tenant Move In'::public.timeline_event_type
    WHEN 2 THEN 'Rent Increase'::public.timeline_event_type
    WHEN 3 THEN 'Maintenance'::public.timeline_event_type
    WHEN 4 THEN 'Repair'::public.timeline_event_type
    WHEN 5 THEN 'Renovation'::public.timeline_event_type
    WHEN 6 THEN 'Inspection'::public.timeline_event_type
    WHEN 7 THEN 'Document Added'::public.timeline_event_type
    WHEN 8 THEN 'Tenant Move Out'::public.timeline_event_type
    WHEN 9 THEN 'Lease Ended'::public.timeline_event_type
    ELSE 'General Note'::public.timeline_event_type
  END,
  CASE event_number % 11
    WHEN 0 THEN format('Lease started for unit %s', unit_number_index)
    WHEN 1 THEN format('Tenant moved into unit %s', unit_number_index)
    WHEN 2 THEN format('Rent reviewed for unit %s', unit_number_index)
    WHEN 3 THEN format('Maintenance request completed for unit %s', unit_number_index)
    WHEN 4 THEN format('Repair completed for unit %s', unit_number_index)
    WHEN 5 THEN format('Renovation checkpoint for unit %s', unit_number_index)
    WHEN 6 THEN format('Inspection completed for unit %s', unit_number_index)
    WHEN 7 THEN format('Document recorded for unit %s', unit_number_index)
    WHEN 8 THEN format('Tenant move-out noted for unit %s', unit_number_index)
    WHEN 9 THEN format('Lease ended for unit %s', unit_number_index)
    ELSE format('General property note %s', event_number)
  END,
  format('Stress seed timeline event %s. This row is intentionally realistic enough to exercise filters and drawers.', event_number),
  CASE
    WHEN event_number % 11 IN (3, 4, 5) THEN
      CASE WHEN event_number % 9 = 0 THEN (90000 + (event_number * 850))::numeric(14, 2)
      ELSE (45 + (event_number % 300) * 3.75)::numeric(14, 2)
      END
    ELSE NULL
  END,
  CASE
    WHEN event_number % 11 IN (3, 4, 5) THEN
      CASE WHEN event_number % 9 = 0 THEN 'KHR'::public.currency_code ELSE 'USD'::public.currency_code END
    ELSE NULL
  END,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  CASE WHEN event_number % 53 = 0 THEN now() - interval '10 days' ELSE NULL END,
  CASE WHEN event_number % 53 = 0 THEN '00000000-0000-0000-0000-000000000101'::uuid ELSE NULL END
FROM event_seed;

INSERT INTO public.ledger_period_locks (
  id,
  organization_id,
  period_start,
  locked_at,
  locked_by,
  reason
)
SELECT
  ('60000000-0000-0000-0000-' || lpad(lock_number::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  (date '2025-12-01' + ((lock_number - 1) * interval '1 month'))::date,
  now() - (lock_number * interval '3 days'),
  '00000000-0000-0000-0000-000000000101',
  format('Stress seed locked accounting period %s.', lock_number)
FROM generate_series(1, 6) AS series(lock_number)
ON CONFLICT (organization_id, period_start) DO UPDATE
SET
  locked_at = EXCLUDED.locked_at,
  locked_by = EXCLUDED.locked_by,
  reason = EXCLUDED.reason;

WITH log_seed AS (
  SELECT
    log_number,
    CASE WHEN log_number % 2 = 0 THEN 'ledger_entry' ELSE 'timeline_event' END AS entity_type
  FROM generate_series(1, 300) AS series(log_number)
)
INSERT INTO public.activity_logs (
  id,
  organization_id,
  actor_id,
  entity_type,
  entity_id,
  action,
  previous_values,
  new_values,
  created_at
)
SELECT
  ('70000000-0000-0000-0000-' || lpad(log_number::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  entity_type,
  CASE
    WHEN entity_type = 'ledger_entry' THEN ('40000000-0000-0000-0000-' || lpad(log_number::text, 12, '0'))::uuid
    ELSE ('50000000-0000-0000-0000-' || lpad(log_number::text, 12, '0'))::uuid
  END,
  CASE log_number % 5
    WHEN 0 THEN 'created'
    WHEN 1 THEN 'updated'
    WHEN 2 THEN 'archived'
    WHEN 3 THEN 'restored'
    ELSE 'seeded'
  END,
  CASE WHEN log_number % 5 IN (1, 2, 3) THEN jsonb_build_object('seed_index', log_number - 1) ELSE NULL END,
  jsonb_build_object('seed_index', log_number, 'source', 'local stress seed'),
  now() - (log_number * interval '1 hour')
FROM log_seed;
