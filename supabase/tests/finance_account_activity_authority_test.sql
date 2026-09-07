BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(24);

\set organization_id 'fa610000-0000-0000-0000-000000000001'
\set actor_id 'fa620000-0000-0000-0000-000000000001'
\set restricted_actor_id 'fa620000-0000-0000-0000-000000000002'
\set property_one 'fa630000-0000-0000-0000-000000000001'
\set property_two 'fa630000-0000-0000-0000-000000000002'
\set scoped_account 'fa640000-0000-0000-0000-000000000001'
\set hidden_account 'fa640000-0000-0000-0000-000000000002'
\set exact_account 'fa640000-0000-0000-0000-000000000003'
\set other_deposit_account 'fa640000-0000-0000-0000-000000000004'
\set replacement_equity_account 'fa640000-0000-0000-0000-000000000005'
\set branch_one 'fa650000-0000-0000-0000-000000000001'
\set branch_two 'fa650000-0000-0000-0000-000000000002'
\set finance_role 'fa660000-0000-0000-0000-000000000001'
\set deposit_event 'fa670000-0000-0000-0000-000000000001'
\set deposit_reversal 'fa670000-0000-0000-0000-000000000002'
\set unbound_deposit_event 'fa670000-0000-0000-0000-000000000003'
\set same_day_deposit_event 'fa670000-0000-0000-0000-000000000004'
\set owner_original_set 'fa690000-0000-0000-0000-000000000001'
\set owner_reversal_set 'fa690000-0000-0000-0000-000000000002'

INSERT INTO auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,
  email_change_token_current,reauthentication_token,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000', :'actor_id'::uuid,
  'authenticated','authenticated','activity-authority@test.local',
  extensions.crypt('activity-authority', extensions.gen_salt('bf')),now(),
  '','','','','','', '{"provider":"email","providers":["email"]}', '{}',now(),now()
), (
  '00000000-0000-0000-0000-000000000000', :'restricted_actor_id'::uuid,
  'authenticated','authenticated','activity-restricted@test.local',
  extensions.crypt('activity-restricted', extensions.gen_salt('bf')),now(),
  '','','','','','', '{"provider":"email","providers":["email"]}', '{}',now(),now()
);
INSERT INTO public.organizations (id,name,slug)
VALUES (:'organization_id'::uuid,'Activity authority org','activity-authority-org');
INSERT INTO public.organization_members (organization_id,user_id,role)
VALUES (:'organization_id'::uuid, :'actor_id'::uuid, 'super_admin');

INSERT INTO public.organization_branches (id, organization_id, name, code, status)
VALUES
  (:'branch_one'::uuid, :'organization_id'::uuid, 'Branch one', 'ACT-ONE', 'active'),
  (:'branch_two'::uuid, :'organization_id'::uuid, 'Branch two', 'ACT-TWO', 'active');
INSERT INTO public.organization_roles (id, organization_id, name, status)
VALUES (:'finance_role'::uuid, :'organization_id'::uuid, 'Scoped finance reader', 'active');
INSERT INTO public.organization_role_permissions (organization_id, role_id, permission_key)
VALUES (:'organization_id'::uuid, :'finance_role'::uuid, 'finance.view');
INSERT INTO public.organization_members (
  organization_id, user_id, role, branch_id, custom_role_id
) VALUES (
  :'organization_id'::uuid, :'restricted_actor_id'::uuid, 'custom',
  :'branch_one'::uuid, :'finance_role'::uuid
);
UPDATE public.organization_authorization_states SET ordinary_access_enabled = true
WHERE organization_id = :'organization_id'::uuid;

SELECT pg_catalog.set_config(
  'app.property_branch_assignment_context',
  (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),
  true
);
SELECT pg_catalog.set_config('app.property_creation_branch_id', :'branch_one', true);
INSERT INTO public.properties (id,organization_id,branch_id,name,code,property_type)
VALUES (:'property_one'::uuid, :'organization_id'::uuid, :'branch_one'::uuid, 'One', 'ONE', 'apartment');
SELECT pg_catalog.set_config('app.property_creation_branch_id', :'branch_two', true);
INSERT INTO public.properties (id,organization_id,branch_id,name,code,property_type)
VALUES (:'property_two'::uuid, :'organization_id'::uuid, :'branch_two'::uuid, 'Two', 'TWO', 'apartment');
SELECT pg_catalog.set_config('app.property_creation_branch_id', '', true);
SELECT pg_catalog.set_config('app.property_branch_assignment_context', 'off', true);
INSERT INTO public.finance_accounts (
  id,organization_id,account_class,account_subtype,display_name,property_id,
  use_for_lease_deposits,created_by
) VALUES
(
  :'scoped_account'::uuid, :'organization_id'::uuid, 'asset', 'other_asset',
  'Scoped asset', :'property_one'::uuid, false, :'actor_id'::uuid
), (
  :'hidden_account'::uuid, :'organization_id'::uuid, 'asset', 'other_asset',
  'Hidden asset', :'property_two'::uuid, false, :'actor_id'::uuid
), (
  :'exact_account'::uuid, :'organization_id'::uuid, 'liability', 'current_liability',
  'Exact deposits', NULL, true, :'actor_id'::uuid
), (
  :'other_deposit_account'::uuid, :'organization_id'::uuid, 'liability', 'current_liability',
  'Other deposits', NULL, true, :'actor_id'::uuid
), (
  :'replacement_equity_account'::uuid, :'organization_id'::uuid, 'equity', 'equity',
  'Replacement contributions', NULL, false, :'actor_id'::uuid
);

SELECT has_table(
  'app_private', 'finance_account_activity_authority_history',
  'account activity keeps private immutable authority history'
);
SELECT has_function(
  'public', 'get_finance_account_activity_authorities',
  ARRAY['uuid', 'uuid', 'uuid', 'date', 'date'],
  'account activity exposes a scoped non-disclosing read contract'
);
SELECT function_returns(
  'public', 'get_finance_account_activity_authorities',
  ARRAY['uuid', 'uuid', 'uuid', 'date', 'date'], 'setof record',
  'activity authority contract is row based'
);

SELECT ok(
  NOT has_table_privilege('authenticated',
    'app_private.finance_account_activity_authority_history', 'SELECT'),
  'authenticated users cannot read private authority history directly'
);
SELECT ok(
  has_function_privilege('authenticated',
    'public.get_finance_account_activity_authorities(uuid,uuid,uuid,date,date)', 'EXECUTE'),
  'authenticated users can execute the checked activity authority contract'
);

SELECT results_eq(
  $$SELECT count(*)::bigint
    FROM app_private.finance_account_activity_authority_history
    WHERE valid_to IS NULL$$,
  $$SELECT (
      (SELECT count(*) FROM public.finance_account_source_links) +
      (SELECT count(*) FROM public.finance_account_category_links) +
      (SELECT count(*) FROM public.finance_account_roles) +
      (SELECT count(*) FROM public.finance_accounts WHERE system_role IS NOT NULL)
    )::bigint$$,
  'all live source, category, and role authorities have one open history row'
);

SELECT lives_ok(
  $$UPDATE public.finance_account_source_links SET account_id = account_id WHERE false$$,
  'authority-history trigger accepts lifecycle update statements'
);

SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    NULL::uuid, '2026-08-01'::date, '2026-08-31'::date
  )),
  0::bigint,
  'unknown and unauthorized account identities both disclose no authority rows'
);

SELECT id AS old_account_id
FROM public.finance_accounts
WHERE organization_id = :'organization_id'::uuid AND system_role = 'operating_bank'
\gset

SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SET LOCAL ROLE authenticated;
SELECT public.create_finance_account(
  :'organization_id'::uuid, 'asset', 'bank', 'Replacement bank', '1099',
  NULL, NULL, NULL, false, false, false
) AS replacement_account_id
\gset
SELECT lives_ok(
  format('SELECT public.set_finance_account_archived(%L,%L,true,%L)',
    :'organization_id', :'old_account_id', :'replacement_account_id'),
  'archive/replacement completes while history tracks the transferred authority'
);

RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM app_private.finance_account_activity_authority_history
    WHERE organization_id = :'organization_id'::uuid
      AND account_id = :'old_account_id'::uuid AND authority_kind = 'source'
      AND valid_to IS NULL
  ) AND EXISTS (
    SELECT 1 FROM app_private.finance_account_activity_authority_history
    WHERE organization_id = :'organization_id'::uuid
      AND account_id = :'replacement_account_id'::uuid AND authority_kind = 'source'
      AND valid_to IS NULL
  ),
  'replacement preserves both accounts original source authorities'
);

SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_finance_account_activity_authorities(
      :'organization_id'::uuid, :'old_account_id'::uuid, NULL,
      CURRENT_DATE, CURRENT_DATE
    ) WHERE authority_kind = 'source' AND valid_to IS NULL
  ),
  'inactive accounts retain their original source authority for corrections'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'scoped_account'::uuid, :'property_two'::uuid,
    '2026-08-01'::date, '2026-08-31'::date
  )),
  0::bigint,
  'a property-scoped account returns no rows through another property scope'
);
RESET ROLE;

SELECT throws_ok(
  $$SELECT * FROM public.get_finance_account_activity_authorities(
    'fa610000-0000-0000-0000-000000000001'::uuid,
    'fa640000-0000-0000-0000-000000000001'::uuid,
    NULL::uuid, '2025-01-01'::date, '2026-01-02'::date
  )$$,
  '22023', 'Activity period must be between 1 and 366 days.',
  'authority reads reject periods longer than 366 days'
);

INSERT INTO app_private.finance_account_activity_authority_history (
  organization_id, authority_kind, authority_id, account_id, valid_from
) VALUES
  (:'organization_id'::uuid, 'category', 'fixture-category', :'scoped_account'::uuid, '-infinity'),
  (:'organization_id'::uuid, 'category', 'hidden-category', :'hidden_account'::uuid, '-infinity');

-- Build a real scoped lease/deposit; keep every FK and trigger enabled.
INSERT INTO public.units (id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency)
VALUES ('fa6c0000-0000-4000-8000-000000000001', :'organization_id', :'property_one',
  'ACT-01', 'vacant', 900, 'USD');
INSERT INTO public.people (id, organization_id, display_name, party_type)
VALUES ('fa6d0000-0000-4000-8000-000000000001', :'organization_id', 'Activity tenant', 'individual');
INSERT INTO public.person_roles (organization_id, person_id, role)
VALUES (:'organization_id', 'fa6d0000-0000-4000-8000-000000000001', 'tenant');
SELECT (public.create_simplified_unit_lease(
  :'organization_id', :'property_one', 'fa6c0000-0000-4000-8000-000000000001',
  'fa6d0000-0000-4000-8000-000000000001', CURRENT_DATE + 30, CURRENT_DATE + 395,
  900, 'USD', 1, 'monthly', 'draft', 500, 'USD', 'draft',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', 'fa6d0000-0000-4000-8000-000000000001', 'lifecycle', 'planned',
      'recordSource', 'operator_confirmed', 'reason', 'activity_authority_fixture',
      'startedOn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'endedOn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'reserved', 'recordSource', 'operator_confirmed', 'reason', 'activity_authority_fixture',
      'scheduledMoveIn', jsonb_build_object('date', CURRENT_DATE + 30, 'kind', 'known', 'confidence', 'confirmed'),
      'scheduledMoveOut', jsonb_build_object('date', CURRENT_DATE + 395, 'kind', 'known', 'confidence', 'confirmed'),
      'actualMoveIn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'actualMoveOut', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
    ), 'participants', '[]'::jsonb
  ), 'activity-authority-lease-v1'
)->>'leaseId')::uuid AS authority_lease \gset
SELECT id AS authority_deposit FROM public.lease_deposits
WHERE organization_id = :'organization_id' AND lease_id = :'authority_lease' \gset
INSERT INTO public.lease_deposit_events (
  id, organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reversal_of_id, liability_account_id, created_by
) VALUES
  (:'deposit_event'::uuid, :'organization_id'::uuid, :'property_one'::uuid,
   :'authority_deposit'::uuid, 'received', '2026-08-15',
   100.00, 'USD', NULL, :'exact_account'::uuid, :'actor_id'::uuid),
  (:'deposit_reversal'::uuid, :'organization_id'::uuid, :'property_one'::uuid,
   :'authority_deposit'::uuid, 'reversed', '2026-08-20',
   100.00, 'USD', :'deposit_event'::uuid, NULL, :'actor_id'::uuid),
  (:'unbound_deposit_event'::uuid, :'organization_id'::uuid, :'property_one'::uuid,
   :'authority_deposit'::uuid, 'received', '2026-08-18',
   50.00, 'USD', NULL, NULL, :'actor_id'::uuid),
  (:'same_day_deposit_event'::uuid, :'organization_id'::uuid, :'property_one'::uuid,
   :'authority_deposit'::uuid, 'received', CURRENT_DATE,
   75.00, 'USD', NULL, :'exact_account'::uuid, :'actor_id'::uuid);

SELECT id AS old_equity_account_id
FROM public.finance_accounts
WHERE organization_id = :'organization_id'::uuid
  AND system_role = 'owner_contributions'
\gset

SELECT set_config(
  'app.owner_balance_write_context', 'checked-owner-balance-v1', true
);
-- This synthetic original predates the lifecycle change. Give the fixture's
-- initial role the same legacy interval used by the migration backfill.
UPDATE app_private.finance_account_activity_authority_history
SET valid_from = '-infinity'
WHERE organization_id = :'organization_id'::uuid
  AND account_id = :'old_equity_account_id'::uuid
  AND authority_kind IN ('role', 'system_role');
INSERT INTO public.owner_event_allocation_sets (
  id, organization_id, property_id, currency, event_date, source_type,
  source_id, source_line_id, gross_signed_amount, source_fingerprint,
  allocation_basis, explicit_owner_person_id, reversal_of_allocation_set_id,
  created_at, created_by, idempotency_key, command_payload_hash
) VALUES (
  :'owner_original_set'::uuid, :'organization_id'::uuid, :'property_one'::uuid,
  'USD', CURRENT_DATE - 2, 'owner_contribution',
  'fa6a0000-0000-0000-0000-000000000001'::uuid,
  'fa6b0000-0000-0000-0000-000000000001'::uuid,
  100.00, repeat('a', 64), 'effective_roster', NULL, NULL,
  transaction_timestamp() - interval '1 second', :'actor_id'::uuid,
  'activity-authority-owner-original', repeat('a', 64)
);
SELECT set_config('app.owner_balance_write_context', '', true);

SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SET LOCAL ROLE authenticated;
SELECT public.set_finance_account_archived(
  :'organization_id'::uuid, :'exact_account'::uuid, true,
  :'other_deposit_account'::uuid
);
SELECT public.set_finance_account_archived(
  :'organization_id'::uuid, :'old_equity_account_id'::uuid, true,
  :'replacement_equity_account'::uuid
);
RESET ROLE;

SELECT set_config(
  'app.owner_balance_write_context', 'checked-owner-balance-v1', true
);
INSERT INTO public.owner_event_allocation_sets (
  id, organization_id, property_id, currency, event_date, source_type,
  source_id, source_line_id, gross_signed_amount, source_fingerprint,
  allocation_basis, explicit_owner_person_id, reversal_of_allocation_set_id,
  created_at, created_by, idempotency_key, command_payload_hash
) VALUES (
  :'owner_reversal_set'::uuid, :'organization_id'::uuid, :'property_one'::uuid,
  'USD', CURRENT_DATE, 'reversal',
  'fa6a0000-0000-0000-0000-000000000002'::uuid,
  'fa6b0000-0000-0000-0000-000000000002'::uuid,
  -100.00, repeat('b', 64), 'effective_roster', NULL,
  :'owner_original_set'::uuid,
  transaction_timestamp() + interval '1 second', :'actor_id'::uuid,
  'activity-authority-owner-reversal', repeat('b', 64)
);
SELECT set_config('app.owner_balance_write_context', '', true);

SELECT set_config('request.jwt.claim.sub', :'restricted_actor_id', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'scoped_account'::uuid, :'property_one'::uuid,
    '2026-08-01'::date, '2026-08-31'::date
  ) WHERE authority_kind = 'category' AND authority_id = 'fixture-category'), 1::bigint,
  'a restricted finance member receives known-authorized account authority'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'hidden_account'::uuid, :'property_two'::uuid,
    '2026-08-01'::date, '2026-08-31'::date
  )), 0::bigint,
  'the same restricted member receives no rows for a known unauthorized account'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, 'fa640000-0000-0000-0000-000000000099'::uuid, NULL,
    '2026-08-01'::date, '2026-08-31'::date
  )), 0::bigint,
  'the same restricted member receives the identical empty result for an unknown account'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'exact_account'::uuid, :'property_one'::uuid,
    '2026-08-01'::date, '2026-08-31'::date
  ) WHERE authority_kind = 'event' AND event_matches), 2::bigint,
  'exact bindings include an original deposit and its reversal on their owning account'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'other_deposit_account'::uuid, :'property_one'::uuid,
    '2026-08-01'::date, '2026-08-31'::date
  ) WHERE authority_kind = 'event' AND NOT event_matches), 2::bigint,
  'exact false overrides temporal deposit authority without duplicate attribution'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'exact_account'::uuid, :'property_one'::uuid,
    '2026-08-01'::date, '2026-08-31'::date
  ) WHERE event_key = 'deposit_event:' || :'unbound_deposit_event'), 0::bigint,
  'an unbound legacy deposit is left to the single historical deposit authority'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'exact_account'::uuid, :'property_one'::uuid,
    '2026-07-01'::date, '2026-07-31'::date
  ) WHERE authority_kind = 'event'), 0::bigint,
  'exact activity rows are bounded by the requested dates'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'exact_account'::uuid, :'property_one'::uuid,
    CURRENT_DATE, CURRENT_DATE
  ) WHERE event_key = 'deposit_event:' || :'same_day_deposit_event'
      AND event_matches), 1::bigint,
  'a same-day exact event remains on its archived account after replacement transfer'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'old_equity_account_id'::uuid,
    :'property_one'::uuid, CURRENT_DATE, CURRENT_DATE
  ) WHERE event_key = 'owner_balance_source:' || :'owner_reversal_set'
      AND event_matches), 1::bigint,
  'an owner-allocation reversal inherits the original Equity account authority'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'replacement_equity_account'::uuid,
    :'property_one'::uuid, CURRENT_DATE, CURRENT_DATE
  ) WHERE event_key = 'owner_balance_source:' || :'owner_reversal_set'
      AND NOT event_matches), 1::bigint,
  'a transferred Equity role does not relabel the original allocation reversal'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'app_private'
      AND indexname = 'finance_account_activity_authority_history_lookup_idx'
  ),
  'historical account authority has an account-and-validity lookup index'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
