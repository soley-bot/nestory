BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(12);

\set organization_id 'fa610000-0000-0000-0000-000000000001'
\set actor_id 'fa620000-0000-0000-0000-000000000001'
\set property_one 'fa630000-0000-0000-0000-000000000001'
\set property_two 'fa630000-0000-0000-0000-000000000002'
\set scoped_account 'fa640000-0000-0000-0000-000000000001'

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
);
INSERT INTO public.organizations (id,name,slug)
VALUES (:'organization_id'::uuid,'Activity authority org','activity-authority-org');
INSERT INTO public.organization_members (organization_id,user_id,role)
VALUES (:'organization_id'::uuid, :'actor_id'::uuid, 'super_admin');
INSERT INTO public.properties (id,organization_id,name,code,property_type)
VALUES
  (:'property_one'::uuid, :'organization_id'::uuid, 'One', 'ONE', 'apartment'),
  (:'property_two'::uuid, :'organization_id'::uuid, 'Two', 'TWO', 'apartment');
INSERT INTO public.finance_accounts (
  id,organization_id,account_class,account_subtype,display_name,property_id,created_by
) VALUES (
  :'scoped_account'::uuid, :'organization_id'::uuid, 'expense', 'expense',
  'Scoped expense', :'property_one'::uuid, :'actor_id'::uuid
);

SELECT has_table(
  'app_private', 'finance_account_activity_authority_history',
  'account activity keeps private immutable authority history'
);
SELECT has_function(
  'public', 'get_finance_account_activity_authorities',
  ARRAY['uuid', 'uuid', 'uuid'],
  'account activity exposes a scoped non-disclosing read contract'
);
SELECT function_returns(
  'public', 'get_finance_account_activity_authorities',
  ARRAY['uuid', 'uuid', 'uuid'], 'setof record',
  'activity authority contract is row based'
);

SELECT ok(
  NOT has_table_privilege('authenticated',
    'app_private.finance_account_activity_authority_history', 'SELECT'),
  'authenticated users cannot read private authority history directly'
);
SELECT ok(
  has_function_privilege('authenticated',
    'public.get_finance_account_activity_authorities(uuid,uuid,uuid)', 'EXECUTE'),
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
    NULL::uuid
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
      AND valid_to IS NOT NULL
  ) AND EXISTS (
    SELECT 1 FROM app_private.finance_account_activity_authority_history
    WHERE organization_id = :'organization_id'::uuid
      AND account_id = :'replacement_account_id'::uuid AND authority_kind = 'source'
      AND valid_to IS NULL
  ),
  'replacement closes the old source interval and opens a new interval'
);

SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_finance_account_activity_authorities(
      :'organization_id'::uuid, :'old_account_id'::uuid, NULL
    ) WHERE authority_kind = 'source' AND valid_to IS NOT NULL
  ),
  'inactive accounts retain their closed historical authority'
);
SELECT is(
  (SELECT count(*) FROM public.get_finance_account_activity_authorities(
    :'organization_id'::uuid, :'scoped_account'::uuid, :'property_two'::uuid
  )),
  0::bigint,
  'a property-scoped account returns no rows through another property scope'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
