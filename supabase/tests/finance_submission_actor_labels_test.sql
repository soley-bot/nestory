BEGIN;

SELECT plan(4);

SELECT has_function(
  'public',
  'get_finance_submission_actor_labels',
  ARRAY['uuid', 'uuid[]'],
  'Finance submission actor label lookup exists'
);

SELECT ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      'public.get_finance_submission_actor_labels(uuid,uuid[])',
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'anon',
      'public.get_finance_submission_actor_labels(uuid,uuid[])',
      'EXECUTE'
    ),
    false
  ),
  'Only authenticated users can execute the Finance actor label lookup'
);

CREATE TEMP TABLE finance_actor_label_state (
  organization_id uuid PRIMARY KEY DEFAULT 'ac710000-0000-4000-8000-000000000001',
  property_id uuid NOT NULL DEFAULT 'ac710000-0000-4000-8000-000000000010',
  source_id uuid NOT NULL DEFAULT 'ac710000-0000-4000-8000-000000000020',
  admin_id uuid NOT NULL DEFAULT 'ac710000-0000-4000-8000-000000000100',
  manager_id uuid NOT NULL DEFAULT 'ac710000-0000-4000-8000-000000000101',
  member_id uuid NOT NULL DEFAULT 'ac710000-0000-4000-8000-000000000102',
  non_submitter_id uuid NOT NULL DEFAULT 'ac710000-0000-4000-8000-000000000103',
  outsider_id uuid NOT NULL DEFAULT 'ac710000-0000-4000-8000-000000000104'
) ON COMMIT DROP;

INSERT INTO finance_actor_label_state DEFAULT VALUES;

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
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  email,
  extensions.crypt('finance-label-test', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM finance_actor_label_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.admin_id, 'admin@actor-label.test'),
    (state.manager_id, 'finance.manager@actor-label.test'),
    (state.member_id, 'finance.member@actor-label.test'),
    (state.non_submitter_id, 'another.member@actor-label.test'),
    (state.outsider_id, 'outsider@actor-label.test')
) AS users(user_id, email);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Finance actor label organization', 'finance-actor-label'
FROM finance_actor_label_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM finance_actor_label_state
UNION ALL
SELECT organization_id, manager_id, 'finance_manager'
FROM finance_actor_label_state
UNION ALL
SELECT organization_id, member_id, 'finance_member'
FROM finance_actor_label_state
UNION ALL
SELECT organization_id, non_submitter_id, 'finance_member'
FROM finance_actor_label_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Actor Label Property',
  'ACTOR',
  'apartment',
  'active'
FROM finance_actor_label_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM finance_actor_label_state),
  true
);

UPDATE finance_actor_label_state
SET source_id = public.create_financial_reconciliation_source(
  organization_id,
  'ACTOR-USD',
  'Actor label operating account',
  'bank',
  'property_dedicated',
  'USD',
  property_id,
  '****0001'
);

INSERT INTO public.expense_submissions (
  organization_id,
  property_id,
  customer_category,
  vendor_label,
  expense_date,
  internal_cost_amount,
  responsibility,
  reconciliation_source_id,
  reference,
  idempotency_key,
  request_payload_hash,
  submitted_by
)
SELECT
  organization_id,
  property_id,
  'other',
  'Actor Label Vendor',
  DATE '2026-08-12',
  125.00,
  'owner',
  source_id,
  'ACTOR-LABEL-RECEIPT',
  'actor-label-submission-0001',
  repeat('a', 64),
  member_id
FROM finance_actor_label_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM finance_actor_label_state),
  true
);

SELECT results_eq(
  $$
    SELECT user_id, label
    FROM public.get_finance_submission_actor_labels(
      (SELECT organization_id FROM finance_actor_label_state),
      ARRAY[
        (SELECT member_id FROM finance_actor_label_state),
        (SELECT non_submitter_id FROM finance_actor_label_state)
      ]
    )
    ORDER BY user_id
  $$,
  $$
    SELECT member_id, 'finance.member@actor-label.test'::text
    FROM finance_actor_label_state
  $$,
  'Super Admin can resolve a human label only for an actual paid-cost submitter'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT outsider_id::text FROM finance_actor_label_state),
  true
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.get_finance_submission_actor_labels(
      (SELECT organization_id FROM finance_actor_label_state),
      ARRAY[(SELECT member_id FROM finance_actor_label_state)]
    )
  $$,
  '42501',
  'Finance access is required',
  'A user outside the Finance workspace cannot read submitter labels'
);

SELECT * FROM finish();

ROLLBACK;
