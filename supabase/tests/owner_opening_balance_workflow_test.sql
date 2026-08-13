BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT has_function(
  'app_private',
  'lock_owner_opening_property_month',
  ARRAY['uuid', 'uuid', 'public.currency_code', 'date'],
  'owner opening workflow has one private ordered property-month lock helper'
);

SELECT has_function(
  'public',
  'submit_owner_opening_balance',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'public.currency_code', 'date',
    'public.owner_balance_component', 'numeric', 'text', 'text', 'uuid',
    'text', 'uuid', 'text'
  ],
  'initial submit exposes only the approved public argument contract'
);

SELECT has_function(
  'public',
  'review_owner_opening_balance',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text'],
  'review exposes the fixed request decision contract'
);

SELECT has_function(
  'public',
  'submit_owner_opening_balance_correction',
  ARRAY[
    'uuid', 'uuid', 'numeric', 'text', 'text', 'uuid', 'text', 'uuid', 'text'
  ],
  'correction submit exposes only the approved target-derived public contract'
);

SELECT ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)'
      ),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'anon',
      to_regprocedure(
        'public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)'
      ),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure(
        'public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'only authenticated can execute initial submit'
);

SELECT ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.review_owner_opening_balance(uuid,uuid,text,text,text)'
      ),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'anon',
      to_regprocedure(
        'public.review_owner_opening_balance(uuid,uuid,text,text,text)'
      ),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure(
        'public.review_owner_opening_balance(uuid,uuid,text,text,text)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'only authenticated can execute review'
);

SELECT ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text)'
      ),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'anon',
      to_regprocedure(
        'public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text)'
      ),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure(
        'public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'only authenticated can execute correction submission'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'app_private.lock_owner_opening_property_month(uuid,uuid,public.currency_code,date)'
      ),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure(
        'app_private.lock_owner_opening_property_month(uuid,uuid,public.currency_code,date)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'the ordered lock helper is never an application API'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000003',
      'b2200000-0000-4000-8000-000000000004',
      'USD', '2026-08-01', 'ips_held_owner_cash', 1.00,
      'Anonymous opening probe', 'Anonymous source probe', NULL,
      repeat('1', 64), NULL, 'anonymous-submit-0001'
    )
  $$,
  '42501',
  'permission denied for function submit_owner_opening_balance',
  'anonymous callers are denied before workflow code executes'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$
    SELECT public.review_owner_opening_balance(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000099',
      'reject', 'Service role review probe', 'service-review-0001'
    )
  $$,
  '42501',
  'permission denied for function review_owner_opening_balance',
  'service_role has no unnamed review bypass'
);
RESET ROLE;

CREATE TEMP TABLE owner_opening_workflow_state (
  organization_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000001',
  cross_organization_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000002',
  property_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000003',
  owner_person_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000004',
  property_owner_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000005',
  super_admin_submitter_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000010',
  super_admin_reviewer_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000011',
  finance_manager_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000012',
  finance_member_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000013',
  operations_manager_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000014',
  operations_member_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000015',
  unaffiliated_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000016',
  cross_super_admin_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000017',
  evidence_document_id uuid NOT NULL DEFAULT 'b2200000-0000-4000-8000-000000000018',
  first_request_id uuid,
  resubmitted_request_id uuid,
  document_request_id uuid,
  super_request_id uuid,
  super_opening_entry_id uuid,
  zero_request_id uuid,
  zero_opening_entry_id uuid,
  rejected_correction_request_id uuid,
  correction_request_id uuid,
  correction_reversal_entry_id uuid,
  correction_replacement_entry_id uuid,
  zero_correction_request_id uuid,
  zero_correction_reversal_entry_id uuid,
  zero_correction_replacement_entry_id uuid,
  second_correction_request_id uuid,
  second_correction_reversal_entry_id uuid,
  second_correction_replacement_entry_id uuid,
  pending_locked_correction_request_id uuid
) ON COMMIT DROP;

INSERT INTO owner_opening_workflow_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON owner_opening_workflow_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', actor_id, 'authenticated',
  'authenticated', label || '@owner-opening-workflow.test',
  extensions.crypt('owner-opening-workflow', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  VALUES
    ('b2200000-0000-4000-8000-000000000010'::uuid, 'super-submit'),
    ('b2200000-0000-4000-8000-000000000011'::uuid, 'super-review'),
    ('b2200000-0000-4000-8000-000000000012'::uuid, 'finance-manager'),
    ('b2200000-0000-4000-8000-000000000013'::uuid, 'finance-member'),
    ('b2200000-0000-4000-8000-000000000014'::uuid, 'operations-manager'),
    ('b2200000-0000-4000-8000-000000000015'::uuid, 'operations-member'),
    ('b2200000-0000-4000-8000-000000000016'::uuid, 'unaffiliated'),
    ('b2200000-0000-4000-8000-000000000017'::uuid, 'cross-super')
) AS actors(actor_id, label);

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('b2200000-0000-4000-8000-000000000001', 'Opening workflow', 'opening-workflow'),
  ('b2200000-0000-4000-8000-000000000002', 'Cross opening workflow', 'cross-opening-workflow');

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES (
  'b2200000-0000-4000-8000-000000000003',
  'b2200000-0000-4000-8000-000000000001',
  'Opening workflow property', 'OWF-1', 'Apartment'
);

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  ('b2200000-0000-4000-8000-000000000004', 'b2200000-0000-4000-8000-000000000001', 'Opening workflow owner'),
  ('b2200000-0000-4000-8000-000000000024', 'b2200000-0000-4000-8000-000000000001', 'Workflow operations manager'),
  ('b2200000-0000-4000-8000-000000000025', 'b2200000-0000-4000-8000-000000000001', 'Workflow operations member');

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000004', 'owner', 'active'),
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000024', 'staff', 'active'),
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000025', 'staff', 'active');

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
VALUES (
  'b2200000-0000-4000-8000-000000000005',
  'b2200000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000003',
  'b2200000-0000-4000-8000-000000000004',
  100.000, '2026-01-01'
);

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES (
  'b2200000-0000-4000-8000-000000000026',
  'b2200000-0000-4000-8000-000000000001',
  'Workflow operations', 'OWF-OPS'
);

INSERT INTO public.organization_members (
  organization_id, user_id, role, person_id, branch_id
)
VALUES
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000010', 'super_admin', NULL, NULL),
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000011', 'super_admin', NULL, NULL),
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000012', 'finance_manager', NULL, NULL),
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000013', 'finance_member', NULL, NULL),
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000014', 'operations_manager', 'b2200000-0000-4000-8000-000000000024', 'b2200000-0000-4000-8000-000000000026'),
  ('b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000015', 'operations_member', 'b2200000-0000-4000-8000-000000000025', 'b2200000-0000-4000-8000-000000000026'),
  ('b2200000-0000-4000-8000-000000000002', 'b2200000-0000-4000-8000-000000000017', 'super_admin', NULL, NULL);

INSERT INTO storage.objects (bucket_id, name)
VALUES (
  'nestory-documents',
  'b2200000-0000-4000-8000-000000000001/documents/opening-evidence.pdf'
);

INSERT INTO public.documents (
  id, organization_id, property_id, category, file_name, storage_path,
  mime_type, size_bytes, uploaded_by
)
VALUES (
  'b2200000-0000-4000-8000-000000000018',
  'b2200000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000003',
  'owner_opening_balance_evidence',
  'opening-evidence.pdf',
  'b2200000-0000-4000-8000-000000000001/documents/opening-evidence.pdf',
  'application/pdf', 18,
  'b2200000-0000-4000-8000-000000000010'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000010',
  true
);
SELECT public.fingerprint_document_content(
  'b2200000-0000-4000-8000-000000000018',
  'b2200000-0000-4000-8000-000000000001',
  repeat('5', 64)
);

CREATE OR REPLACE FUNCTION pg_temp.submit_reference_opening(
  p_actor_id uuid,
  p_amount numeric,
  p_component public.owner_balance_component,
  p_reason text,
  p_reference text,
  p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
  SELECT public.submit_owner_opening_balance(
    'b2200000-0000-4000-8000-000000000001',
    'b2200000-0000-4000-8000-000000000003',
    'b2200000-0000-4000-8000-000000000004',
    'USD', '2026-08-01', p_component, p_amount, p_reason, p_reference,
    NULL, p_evidence_sha256, p_resubmission_of_request_id, p_idempotency_key
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.review_opening(
  p_actor_id uuid,
  p_request_id uuid,
  p_decision text,
  p_review_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
  SELECT public.review_owner_opening_balance(
    'b2200000-0000-4000-8000-000000000001',
    p_request_id,
    p_decision,
    p_review_reason,
    p_idempotency_key
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.submit_opening_correction(
  p_actor_id uuid,
  p_entry_id uuid,
  p_replacement_amount numeric,
  p_reason text,
  p_reference text,
  p_supporting_document_id uuid,
  p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
  SELECT public.submit_owner_opening_balance_correction(
    'b2200000-0000-4000-8000-000000000001',
    p_entry_id,
    p_replacement_amount,
    p_reason,
    p_reference,
    p_supporting_document_id,
    p_evidence_sha256,
    p_resubmission_of_request_id,
    p_idempotency_key
  ) INTO v_result;
  RETURN v_result;
END;
$$;

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000012', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'manager-submit-0001'
  )$$,
  '42501',
  'Not authorized to submit owner opening balances',
  'Finance Manager cannot submit an initial opening request'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000014', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'ops-manager-submit-0001'
  )$$,
  '42501',
  'Not authorized to submit owner opening balances',
  'Operations Manager cannot submit an initial opening request'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000015', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'ops-member-submit-0001'
  )$$,
  '42501',
  'Not authorized to submit owner opening balances',
  'Operations Member cannot submit an initial opening request'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000016', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'unaffiliated-submit-0001'
  )$$,
  '42501',
  'Not authorized to submit owner opening balances',
  'an unaffiliated actor cannot submit an initial opening request'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000017', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'cross-submit-0001'
  )$$,
  '42501',
  'Not authorized to submit owner opening balances',
  'a cross-organization Super Admin cannot submit into another organization'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.001,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'scale-submit-0001'
  )$$,
  '22023',
  'Opening amount must be nonnegative and use at most two decimal places',
  'initial submit rejects more than two amount decimals before storage'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', -0.01,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'negative-submit-0001'
  )$$,
  '22023',
  'Opening amount must be nonnegative and use at most two decimal places',
  'initial submit rejects a negative amount'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000013',
  true
);
SELECT throws_ok(
  format(
    'SELECT public.submit_owner_opening_balance(%L,%L,%L,%L,%L,%L,%s,%L,%L,NULL,%L,NULL,%L)',
    'b2200000-0000-4000-8000-000000000001',
    'b2200000-0000-4000-8000-000000000003',
    'b2200000-0000-4000-8000-000000000004',
    'USD', '2026-08-02', 'ips_held_owner_cash', 10.00,
    'Verified opening amount', 'IPS cutover row 1', repeat('1', 64),
    'non-month-submit-0001'
  ),
  '22023',
  'Opening effective date must be the first day of a month',
  'initial submit rejects a non-first-of-month authority date'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    'ABC', NULL, 'hash-submit-0001'
  )$$,
  '22023',
  'Opening evidence fingerprint is invalid',
  'initial submit rejects a malformed source fingerprint'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000013',
  true
);
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000099',
      'b2200000-0000-4000-8000-000000000004',
      'USD', '2026-08-01', 'ips_due_to_owner', 10.00,
      'Missing property probe', 'IPS cutover missing property', NULL,
      repeat('1', 64), NULL, 'missing-property-0001'
    )
  $$,
  '23503',
  'Property not found',
  'initial submit rejects a missing or cross-organization property scope'
);

SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000003',
      'b2200000-0000-4000-8000-000000000099',
      'USD', '2026-08-01', 'ips_due_to_owner', 10.00,
      'Missing owner probe', 'IPS cutover missing owner', NULL,
      repeat('1', 64), NULL, 'missing-owner-0001'
    )
  $$,
  '23503',
  'Owner person not found',
  'initial submit rejects a missing or non-roster owner identity'
);

UPDATE public.property_owners
SET ownership_percent = 99.999
WHERE id = 'b2200000-0000-4000-8000-000000000005';

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'ips_due_to_owner', 'Incomplete roster probe', 'IPS cutover roster probe',
    repeat('1', 64), NULL, 'invalid-roster-0001'
  )$$,
  '23514',
  'owner_share_total_not_100: expected 100.000, got 99.999',
  'initial submit requires the exact ready half-open roster without a sole-owner default'
);

UPDATE public.property_owners
SET ownership_percent = 100.000
WHERE id = 'b2200000-0000-4000-8000-000000000005';

WITH submitted AS (
  SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'member-submit-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET first_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

SELECT results_eq(
  $$
    SELECT
      request.request_kind,
      request.status,
      request.proposed_amount::text,
      request.ownership_percent_snapshot::text,
      request.ownership_roster_hash,
      request.submitted_by,
      request.resubmission_of_request_id
    FROM public.owner_opening_balance_requests AS request
    WHERE request.id = (
      SELECT first_request_id FROM owner_opening_workflow_state
    )
  $$,
  $$
    SELECT
      'initial'::text,
      'submitted'::text,
      '10.00'::text,
      '100.000'::text,
      roster.ownership_roster_hash,
      'b2200000-0000-4000-8000-000000000013'::uuid,
      NULL::uuid
    FROM app_private.validate_owner_roster_on_date(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000003',
      '2026-08-01'
    ) AS roster
  $$,
  'Finance Member submit stores exact cents and the server-resolved ready roster snapshot'
);

SELECT is(
  (SELECT count(*) FROM public.owner_opening_balance_entries
   WHERE organization_id = 'b2200000-0000-4000-8000-000000000001'),
  0::bigint,
  'submit creates no approved entry'
);

SELECT is(
  (
    SELECT pg_temp.submit_reference_opening(
      'b2200000-0000-4000-8000-000000000013', 10.00,
      'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
      repeat('1', 64), NULL, 'member-submit-0001'
    ) ->> 'request_id'
  ),
  (SELECT first_request_id::text FROM owner_opening_workflow_state),
  'an exact completed submit replay returns the original request ID'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 11.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'member-submit-0001'
  )$$,
  '22023',
  'Conflicting financial idempotency request',
  'the same submit key with a different canonical public amount conflicts'
);

WITH submitted AS (
  SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000010', 20.00,
    'owner_due_to_ips', 'Super Admin verified opening', 'IPS cutover row 2',
    repeat('2', 64), NULL, 'super-submit-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET super_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

SELECT isnt(
  (SELECT super_request_id FROM owner_opening_workflow_state),
  NULL::uuid,
  'Super Admin can submit an initial request through the same checked path'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000010',
      (
        SELECT super_request_id FROM owner_opening_workflow_state
      ),
      'reject',
      'Independent review is required',
      'self-review-0001'
    )
  $$,
  '22023',
  'Owner opening submitter cannot review the same request',
  'a Super Admin submitter cannot review their own opening request'
);

SELECT ok(
  app_private.can_review_owner_opening_balance(
    'b2200000-0000-4000-8000-000000000001'
  ),
  'Finance Manager can independently review a Finance Member opening request'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000014',
      (SELECT first_request_id FROM owner_opening_workflow_state),
      'reject', 'Operations review denied', 'ops-review-0001'
    )
  $$,
  '42501',
  'Not authorized to review owner opening balances',
  'Operations Manager cannot review an opening request'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000015',
      (SELECT first_request_id FROM owner_opening_workflow_state),
      'reject', 'Operations review denied', 'ops-member-review-0001'
    )
  $$,
  '42501',
  'Not authorized to review owner opening balances',
  'Operations Member cannot review an opening request'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      'b2200000-0000-4000-8000-000000000099',
      'reject', 'Unknown request denied', 'unknown-review-0001'
    )
  $$,
  '23503',
  'Owner opening request not found',
  'a guessed request ID fails closed for an authorized reviewer'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT first_request_id FROM owner_opening_workflow_state),
      'reject', NULL, 'reasonless-review-0001'
    )
  $$,
  '22023',
  'A rejection reason is required',
  'rejection requires an auditable review reason'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000013',
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.review_owner_opening_balance(%L,%L,%L,%L,%L)',
    'b2200000-0000-4000-8000-000000000001',
    (SELECT first_request_id FROM owner_opening_workflow_state),
    'reject', 'Insufficient source detail', 'member-review-0001'
  ),
  '42501',
  'Not authorized to review owner opening balances',
  'Finance Member cannot review an opening request'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000013',
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.review_owner_opening_balance(%L,%L,%L,%L,%L)',
    'b2200000-0000-4000-8000-000000000001',
    (SELECT first_request_id FROM owner_opening_workflow_state),
    'approve', 'Approval is not yet available', 'approve-before-2-2c'
  ),
  '42501',
  'Not authorized to review owner opening balances',
  'a non-reviewer cannot reach an approval path'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000011',
  true
);
SET LOCAL ROLE authenticated;
WITH approved AS (
  SELECT public.review_owner_opening_balance(
    'b2200000-0000-4000-8000-000000000001',
    (SELECT super_request_id FROM owner_opening_workflow_state),
    'approve', 'Independent opening approval', 'approve-initial-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET super_opening_entry_id = (approved.result -> 'entry_ids' ->> 0)::uuid
FROM approved;
RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      request.status,
      request.reviewed_by,
      entry.entry_kind,
      entry.signed_amount::text,
      entry.created_by,
      entry.property_owner_id,
      entry.ownership_percent_snapshot::text,
      entry.ownership_roster_hash
    FROM public.owner_opening_balance_requests AS request
    JOIN public.owner_opening_balance_entries AS entry
      ON entry.request_id = request.id
    WHERE request.id = (
      SELECT super_request_id FROM owner_opening_workflow_state
    )
  $$,
  $$
    SELECT
      'approved'::text,
      'b2200000-0000-4000-8000-000000000011'::uuid,
      'opening'::text,
      '20.00'::text,
      'b2200000-0000-4000-8000-000000000011'::uuid,
      request.property_owner_id,
      request.ownership_percent_snapshot::text,
      request.ownership_roster_hash
    FROM public.owner_opening_balance_requests AS request
    WHERE request.id = (
      SELECT super_request_id FROM owner_opening_workflow_state
    )
  $$,
  'initial approval atomically creates one opening entry copied from the immutable request snapshot'
);

SELECT is(
  (
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT super_request_id FROM owner_opening_workflow_state),
      'approve', 'Independent opening approval', 'approve-initial-0001'
    ) -> 'entry_ids' ->> 0
  ),
  (SELECT super_opening_entry_id::text FROM owner_opening_workflow_state),
  'completed initial approval replay returns the original opening entry ID'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 21.00,
    'owner_due_to_ips', 'Duplicate approved opening', 'IPS cutover duplicate',
    repeat('8', 64), NULL, 'duplicate-approved-0001'
  )$$,
  '23505',
  'Initial owner opening authority already exists',
  'an approved initial authority blocks a duplicate initial request'
);

WITH submitted AS (
  SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 0.00,
    'ips_due_to_owner', 'Explicit known zero', 'IPS cutover known zero',
    repeat('9', 64), NULL, 'known-zero-submit-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET zero_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

UPDATE public.property_owners
SET ownership_percent = 99.999
WHERE id = 'b2200000-0000-4000-8000-000000000005';

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT zero_request_id FROM owner_opening_workflow_state),
      'approve', 'Known zero independently reviewed', 'known-zero-approve-0001'
    )
  $$,
  '23514',
  'owner_share_total_not_100: expected 100.000, got 99.999',
  'initial approval revalidates the effective roster and leaves no partial approved authority when it changed'
);

UPDATE public.property_owners
SET ownership_percent = 100.000
WHERE id = 'b2200000-0000-4000-8000-000000000005';

WITH approved AS (
  SELECT pg_temp.review_opening(
    'b2200000-0000-4000-8000-000000000011',
    (SELECT zero_request_id FROM owner_opening_workflow_state),
    'approve', 'Known zero independently reviewed', 'known-zero-approve-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET zero_opening_entry_id = (approved.result -> 'entry_ids' ->> 0)::uuid
FROM approved;

SELECT results_eq(
  $$
    SELECT request.status, entry.entry_kind, entry.signed_amount::text
    FROM public.owner_opening_balance_requests AS request
    JOIN public.owner_opening_balance_entries AS entry
      ON entry.request_id = request.id
    WHERE request.id = (
      SELECT zero_request_id FROM owner_opening_workflow_state
    )
  $$,
  $$ VALUES ('approved'::text, 'opening'::text, '0.00'::text) $$,
  'approved explicit zero creates known-zero authority instead of remaining unknown'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance_correction(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000099',
      1.00, 'Anonymous correction probe', 'Anonymous correction source',
      NULL, repeat('a', 64), NULL, 'anonymous-correction-0001'
    )
  $$,
  '42501',
  'permission denied for function submit_owner_opening_balance_correction',
  'anonymous callers cannot execute correction submission'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance_correction(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000099',
      1.00, 'Service correction probe', 'Service correction source',
      NULL, repeat('a', 64), NULL, 'service-correction-0001'
    )
  $$,
  '42501',
  'permission denied for function submit_owner_opening_balance_correction',
  'service_role has no correction submission bypass'
);
RESET ROLE;

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000014',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Operations correction denied', 'Operations source', NULL,
      repeat('a', 64), NULL, 'ops-correction-0001'
    )
  $$,
  '42501',
  'Not authorized to request owner opening balance corrections',
  'Operations Manager cannot submit a correction'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000015',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Operations correction denied', 'Operations source', NULL,
      repeat('a', 64), NULL, 'ops-member-correction-0001'
    )
  $$,
  '42501',
  'Not authorized to request owner opening balance corrections',
  'Operations Member cannot submit a correction'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000016',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Unaffiliated correction denied', 'Unaffiliated source', NULL,
      repeat('a', 64), NULL, 'unaffiliated-correction-0001'
    )
  $$,
  '42501',
  'Not authorized to request owner opening balance corrections',
  'an unaffiliated actor cannot submit a correction'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000013',
      'b2200000-0000-4000-8000-000000000099',
      25.00, 'Finance Member guessed target', 'Guessed source', NULL,
      repeat('a', 64), NULL, 'member-guessed-correction-0001'
    )
  $$,
  '23503',
  'Owner opening correction target not found',
  'Finance Member reaches the correction capability but a guessed target fails closed'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000010',
      'b2200000-0000-4000-8000-000000000099',
      25.00, 'Super Admin guessed target', 'Guessed source', NULL,
      repeat('a', 64), NULL, 'super-guessed-correction-0001'
    )
  $$,
  '23503',
  'Owner opening correction target not found',
  'Super Admin reaches the correction capability but a guessed target fails closed'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000017',
  true
);
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance_correction(
      'b2200000-0000-4000-8000-000000000002',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Cross organization target', 'Cross source', NULL,
      repeat('a', 64), NULL, 'cross-correction-0001'
    )
  $$,
  '23503',
  'Owner opening correction target not found',
  'an authorized actor in another organization cannot repoint a foreign entry'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.001, 'Invalid correction scale', 'Scale source', NULL,
      repeat('a', 64), NULL, 'scale-correction-0001'
    )
  $$,
  '22023',
  'Replacement amount must be nonnegative and use at most two decimal places',
  'Finance Manager correction rejects more than two decimal places'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      -0.01, 'Invalid negative correction', 'Negative source', NULL,
      repeat('a', 64), NULL, 'negative-correction-0001'
    )
  $$,
  '22023',
  'Replacement amount must be nonnegative and use at most two decimal places',
  'Finance Manager correction rejects a negative replacement amount'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Correction evidence mismatch', NULL,
      'b2200000-0000-4000-8000-000000000018', repeat('b', 64), NULL,
      'correction-doc-mismatch-0001'
    )
  $$,
  '22023',
  'Opening evidence document is not eligible',
  'correction submission enforces exact immutable document evidence equality'
);

UPDATE public.property_owners
SET started_on = '2025-12-01'
WHERE id = 'b2200000-0000-4000-8000-000000000005';

WITH submitted AS (
  SELECT pg_temp.submit_opening_correction(
    'b2200000-0000-4000-8000-000000000012',
    (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
    25.00, 'Correct opening authority', 'IPS correction source 1', NULL,
    repeat('a', 64), NULL, 'manager-correction-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET rejected_correction_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

SELECT is(
  (
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Correct opening authority', 'IPS correction source 1', NULL,
      repeat('a', 64), NULL, 'manager-correction-0001'
    ) ->> 'request_id'
  ),
  (SELECT rejected_correction_request_id::text FROM owner_opening_workflow_state),
  'completed correction submission replay returns the original request ID'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      26.00, 'Correct opening authority', 'IPS correction source 1', NULL,
      repeat('a', 64), NULL, 'manager-correction-0001'
    )
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'correction submission rejects reuse of a key with a different public amount'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000013',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Correct opening authority', 'IPS correction source 1', NULL,
      repeat('a', 64), NULL, 'manager-correction-0001'
    )
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'correction submission rejects another actor reusing the completed identity'
);

SELECT lives_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT rejected_correction_request_id FROM owner_opening_workflow_state),
      'reject', 'Correction requires another source', 'reject-correction-0001'
    )
  $$,
  'independent Super Admin can reject a correction without creating entries'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Corrected source supplied', 'IPS correction source 2', NULL,
      repeat('c', 64), NULL, 'missing-correction-predecessor-0001'
    )
  $$,
  '22023',
  'Latest rejected predecessor is required for correction resubmission',
  'a rejected correction chain cannot be silently abandoned'
);

WITH submitted AS (
  SELECT pg_temp.submit_opening_correction(
    'b2200000-0000-4000-8000-000000000012',
    (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
    25.00, 'Corrected source supplied', 'IPS correction source 2', NULL,
    repeat('c', 64),
    (SELECT rejected_correction_request_id FROM owner_opening_workflow_state),
    'manager-correction-resubmit-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET correction_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

SELECT results_eq(
  $$
    SELECT
      child.request_kind,
      child.status,
      child.correction_of_entry_id,
      child.resubmission_of_request_id,
      child.submitted_by,
      child.ownership_roster_hash <> target.ownership_roster_hash
    FROM public.owner_opening_balance_requests AS child
    JOIN public.owner_opening_balance_entries AS target
      ON target.id = child.correction_of_entry_id
    WHERE child.id = (
      SELECT correction_request_id FROM owner_opening_workflow_state
    )
  $$,
  $$
    SELECT
      'correction'::text,
      'submitted'::text,
      state.super_opening_entry_id,
      state.rejected_correction_request_id,
      'b2200000-0000-4000-8000-000000000012'::uuid,
      true
    FROM owner_opening_workflow_state AS state
  $$,
  'Finance Manager resubmits one linked correction with the current server roster snapshot'
);

UPDATE public.property_owners
SET started_on = '2025-11-01'
WHERE id = 'b2200000-0000-4000-8000-000000000005';

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT correction_request_id FROM owner_opening_workflow_state),
      'approve', 'Approve corrected authority', 'approve-correction-0001'
    )
  $$,
  '22023',
  'ownership_roster_changed',
  'correction approval fails atomically when the roster snapshot changed after submission'
);

SELECT results_eq(
  $$
    SELECT request.status, count(entry.id)::bigint
    FROM public.owner_opening_balance_requests AS request
    LEFT JOIN public.owner_opening_balance_entries AS entry
      ON entry.request_id = request.id
    WHERE request.id = (
      SELECT correction_request_id FROM owner_opening_workflow_state
    )
    GROUP BY request.status
  $$,
  $$ VALUES ('submitted'::text, 0::bigint) $$,
  'failed correction approval leaves the request submitted with no partial entry pair'
);

UPDATE public.property_owners
SET started_on = '2025-12-01'
WHERE id = 'b2200000-0000-4000-8000-000000000005';

WITH approved AS (
  SELECT pg_temp.review_opening(
    'b2200000-0000-4000-8000-000000000011',
    (SELECT correction_request_id FROM owner_opening_workflow_state),
    'approve', 'Approve corrected authority', 'approve-correction-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET correction_reversal_entry_id = (approved.result -> 'entry_ids' ->> 0)::uuid,
    correction_replacement_entry_id = (approved.result -> 'entry_ids' ->> 1)::uuid
FROM approved;

SELECT results_eq(
  $$
    SELECT
      entry.entry_kind,
      entry.signed_amount::text,
      entry.reversal_of_entry_id,
      entry.created_by,
      entry.property_owner_id,
      entry.ownership_percent_snapshot::text,
      entry.ownership_roster_hash
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.request_id = (
      SELECT correction_request_id FROM owner_opening_workflow_state
    )
    ORDER BY CASE entry.entry_kind
      WHEN 'correction_reversal' THEN 1
      ELSE 2
    END
  $$,
  $$
    SELECT
      'correction_reversal'::text,
      '-20.00'::text,
      state.super_opening_entry_id,
      'b2200000-0000-4000-8000-000000000011'::uuid,
      opening_entry.property_owner_id,
      opening_entry.ownership_percent_snapshot::text,
      opening_entry.ownership_roster_hash
    FROM owner_opening_workflow_state AS state
    JOIN public.owner_opening_balance_entries AS opening_entry
      ON opening_entry.id = state.super_opening_entry_id
    UNION ALL
    SELECT
      'correction_replacement'::text,
      '25.00'::text,
      NULL::uuid,
      'b2200000-0000-4000-8000-000000000011'::uuid,
      request.property_owner_id,
      request.ownership_percent_snapshot::text,
      request.ownership_roster_hash
    FROM owner_opening_workflow_state AS state
    JOIN public.owner_opening_balance_requests AS request
      ON request.id = state.correction_request_id
  $$,
  'correction approval inserts one exact reversal with the old snapshot and one replacement with the new snapshot'
);

SELECT results_eq(
  $$
    SELECT
      count(*)::bigint,
      sum(entry.signed_amount)::text,
      count(*) FILTER (
        WHERE entry.reversal_of_entry_id = (
          SELECT super_opening_entry_id FROM owner_opening_workflow_state
        )
      )::bigint
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = 'b2200000-0000-4000-8000-000000000001'
      AND entry.property_id = 'b2200000-0000-4000-8000-000000000003'
      AND entry.owner_person_id = 'b2200000-0000-4000-8000-000000000004'
      AND entry.currency = 'USD'
      AND entry.effective_date = '2026-08-01'
      AND entry.component = 'owner_due_to_ips'
  $$,
  $$ VALUES (3::bigint, '25.00'::text, 1::bigint) $$,
  'the original opening is retained, reversed once, and the exact current authority sum is 25.00'
);

SELECT results_eq(
  $$
    SELECT
      pg_temp.review_opening(
        'b2200000-0000-4000-8000-000000000011',
        (SELECT correction_request_id FROM owner_opening_workflow_state),
        'approve', 'Approve corrected authority', 'approve-correction-0001'
      ) -> 'entry_ids'
  $$,
  $$
    SELECT pg_catalog.jsonb_build_array(
      correction_reversal_entry_id,
      correction_replacement_entry_id
    )
    FROM owner_opening_workflow_state
  $$,
  'completed correction approval replay returns the original ordered entry IDs'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT correction_request_id FROM owner_opening_workflow_state),
      'reject', 'Conflicting correction decision', 'approve-correction-0001'
    )
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'review idempotency rejects a different decision under the completed approval key'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000013',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      24.00, 'Stale opening correction', 'Stale source', NULL,
      repeat('d', 64), NULL, 'stale-correction-0001'
    )
  $$,
  '22023',
  'Owner opening correction target is stale',
  'a second correction cannot target the already reversed original opening'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000013',
      (SELECT correction_reversal_entry_id FROM owner_opening_workflow_state),
      24.00, 'Wrong entry kind correction', 'Wrong kind source', NULL,
      repeat('d', 64), NULL, 'wrong-kind-correction-0001'
    )
  $$,
  '22023',
  'Owner opening correction target must carry current authority',
  'a correction reversal entry cannot itself become the next authority target'
);

WITH submitted AS (
  SELECT pg_temp.submit_opening_correction(
    'b2200000-0000-4000-8000-000000000013',
    (SELECT correction_replacement_entry_id FROM owner_opening_workflow_state),
    22.00, 'Second current correction', 'IPS correction source 3', NULL,
    repeat('e', 64), NULL, 'member-second-correction-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET second_correction_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

WITH approved AS (
  SELECT pg_temp.review_opening(
    'b2200000-0000-4000-8000-000000000011',
    (SELECT second_correction_request_id FROM owner_opening_workflow_state),
    'approve', 'Approve second correction', 'approve-second-correction-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET second_correction_reversal_entry_id = (approved.result -> 'entry_ids' ->> 0)::uuid,
    second_correction_replacement_entry_id = (approved.result -> 'entry_ids' ->> 1)::uuid
FROM approved;

SELECT results_eq(
  $$
    SELECT
      count(*)::bigint,
      sum(entry.signed_amount)::text,
      count(*) FILTER (WHERE entry.entry_kind = 'opening')::bigint,
      count(*) FILTER (WHERE entry.entry_kind = 'correction_reversal')::bigint,
      count(*) FILTER (WHERE entry.entry_kind = 'correction_replacement')::bigint
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = 'b2200000-0000-4000-8000-000000000001'
      AND entry.property_id = 'b2200000-0000-4000-8000-000000000003'
      AND entry.owner_person_id = 'b2200000-0000-4000-8000-000000000004'
      AND entry.currency = 'USD'
      AND entry.effective_date = '2026-08-01'
      AND entry.component = 'owner_due_to_ips'
  $$,
  $$ VALUES (5::bigint, '22.00'::text, 1::bigint, 2::bigint, 2::bigint) $$,
  'a second correction targets only the latest replacement and preserves the complete exact chain'
);

WITH submitted AS (
  SELECT pg_temp.submit_opening_correction(
    'b2200000-0000-4000-8000-000000000010',
    (SELECT zero_opening_entry_id FROM owner_opening_workflow_state),
    0.00, 'Reconfirm explicit zero', 'Zero correction source', NULL,
    repeat('f', 64), NULL, 'zero-correction-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET zero_correction_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000010',
      (SELECT zero_correction_request_id FROM owner_opening_workflow_state),
      'approve', 'Self review zero denied', 'self-zero-approve-0001'
    )
  $$,
  '22023',
  'Owner opening submitter cannot review the same request',
  'Super Admin cannot approve their own zero correction request'
);

WITH approved AS (
  SELECT pg_temp.review_opening(
    'b2200000-0000-4000-8000-000000000011',
    (SELECT zero_correction_request_id FROM owner_opening_workflow_state),
    'approve', 'Approve explicit zero correction', 'approve-zero-correction-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET zero_correction_reversal_entry_id = (approved.result -> 'entry_ids' ->> 0)::uuid,
    zero_correction_replacement_entry_id = (approved.result -> 'entry_ids' ->> 1)::uuid
FROM approved;

SELECT results_eq(
  $$
    SELECT
      entry.entry_kind,
      entry.signed_amount::text,
      entry.reversal_of_entry_id
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.request_id = (
      SELECT zero_correction_request_id FROM owner_opening_workflow_state
    )
    ORDER BY CASE entry.entry_kind
      WHEN 'correction_reversal' THEN 1
      ELSE 2
    END
  $$,
  $$
    SELECT
      'correction_reversal'::text,
      '0.00'::text,
      zero_opening_entry_id
    FROM owner_opening_workflow_state
    UNION ALL
    SELECT 'correction_replacement'::text, '0.00'::text, NULL::uuid
  $$,
  'known zero correction appends an explicit zero reversal and zero replacement'
);

SELECT is(
  (
    SELECT sum(entry.signed_amount)::text
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = 'b2200000-0000-4000-8000-000000000001'
      AND entry.property_id = 'b2200000-0000-4000-8000-000000000003'
      AND entry.owner_person_id = 'b2200000-0000-4000-8000-000000000004'
      AND entry.currency = 'USD'
      AND entry.effective_date = '2026-08-01'
      AND entry.component = 'ips_due_to_owner'
  ),
  '0.00'::text,
  'zero correction remains known authority with an exact zero chain sum'
);

WITH submitted AS (
  SELECT pg_temp.submit_opening_correction(
    'b2200000-0000-4000-8000-000000000012',
    (SELECT second_correction_replacement_entry_id FROM owner_opening_workflow_state),
    23.00, 'Pending locked correction', 'IPS correction source 4', NULL,
    repeat('1', 64), NULL, 'pending-lock-correction-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET pending_locked_correction_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000011',
  true
);

SELECT lives_ok(
  format(
    'SELECT public.review_owner_opening_balance(%L,%L,%L,%L,%L)',
    'b2200000-0000-4000-8000-000000000001',
    (SELECT first_request_id FROM owner_opening_workflow_state),
    'reject', 'Insufficient source detail', 'review-reject-0001'
  ),
  'an independent Super Admin can reject a submitted opening request'
);
RESET ROLE;

SELECT results_eq(
  $$
    SELECT status, reviewed_by, review_reason
    FROM public.owner_opening_balance_requests
    WHERE id = (SELECT first_request_id FROM owner_opening_workflow_state)
  $$,
  $$ VALUES (
    'rejected'::text,
    'b2200000-0000-4000-8000-000000000011'::uuid,
    'Insufficient source detail'::text
  ) $$,
  'rejection preserves the request and records independent review authority'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_opening_balance_entries
    WHERE request_id = (
      SELECT first_request_id FROM owner_opening_workflow_state
    )
  ),
  0::bigint,
  'rejection creates no opening entry'
);

SELECT is(
  (
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT first_request_id FROM owner_opening_workflow_state),
      'reject', 'Insufficient source detail', 'review-reject-0001'
    ) -> 'entry_ids'
  ),
  '[]'::jsonb,
  'an exact completed rejection replay returns the original empty entry list'
);

SELECT matches(
  (
    SELECT activity.new_values ->> 'payload_hash'
    FROM public.activity_logs AS activity
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = (
        SELECT first_request_id FROM owner_opening_workflow_state
      )
      AND activity.action = 'rejected'
  ),
  '^[0-9a-f]{64}$',
  'rejection activity stores one lowercase canonical payload hash'
);

SELECT is(
  (
    SELECT activity.new_values ->> 'payload_hash'
    FROM public.activity_logs AS activity
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = (
        SELECT first_request_id FROM owner_opening_workflow_state
      )
      AND activity.action = 'rejected'
  ),
  (
    SELECT pg_catalog.encode(
      extensions.digest(
        pg_catalog.jsonb_build_object(
          'organization_id', state.organization_id::text,
          'request_id', state.first_request_id::text,
          'decision', 'reject',
          'review_reason', 'Insufficient source detail'
        )::text,
        'sha256'
      ),
      'hex'
    )
    FROM owner_opening_workflow_state AS state
  ),
  'rejection activity payload hash equals the independently hashed canonical public arguments'
);

SELECT is(
  (
    SELECT activity.new_values ->> 'payload_hash'
    FROM public.activity_logs AS activity
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = (
        SELECT first_request_id FROM owner_opening_workflow_state
      )
      AND activity.action = 'rejected'
  ),
  (
    SELECT request.payload_hash
    FROM app_private.financial_idempotency_requests AS request
    WHERE request.id = (
      SELECT (activity.new_values ->> 'financial_idempotency_request_id')::uuid
      FROM public.activity_logs AS activity
      WHERE activity.entity_type = 'owner_opening_balance_request'
        AND activity.entity_id = (
          SELECT first_request_id FROM owner_opening_workflow_state
        )
        AND activity.action = 'rejected'
    )
  ),
  'rejection activity payload hash equals its linked idempotency request payload hash'
);

SELECT results_eq(
  $$
    SELECT
      count(*)::bigint,
      count(DISTINCT activity.new_values ->> 'payload_hash')::bigint
    FROM public.activity_logs AS activity
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = (
        SELECT first_request_id FROM owner_opening_workflow_state
      )
      AND activity.action = 'rejected'
  $$,
  $$ VALUES (1::bigint, 1::bigint) $$,
  'exact rejection replay creates no duplicate activity or divergent payload hash'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000010', 10.00,
    'ips_held_owner_cash', 'Verified opening amount', 'IPS cutover row 1',
    repeat('1', 64), NULL, 'member-submit-0001'
  )$$,
  '22023',
  'Conflicting financial idempotency request',
  'a different actor cannot reuse a completed submit idempotency identity'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'ips_held_owner_cash', 'More detail supplied', 'IPS cutover row 1 amended',
    repeat('3', 64), NULL, 'missing-predecessor-0001'
  )$$,
  '22023',
  'Latest rejected predecessor is required for resubmission',
  'a rejected authority key cannot silently begin a new unlinked chain'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'ips_held_owner_cash', 'Guessed predecessor attempt', 'IPS cutover guessed',
    repeat('3', 64),
    'b2200000-0000-4000-8000-000000000099',
    'guessed-predecessor-0001'
  )$$,
  '23503',
  'Rejected predecessor not found',
  'a guessed or cross-scope rejected predecessor ID fails closed'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'owner_due_to_ips', 'Wrong predecessor scope', 'IPS cutover wrong component',
    repeat('3', 64),
    (SELECT first_request_id FROM owner_opening_workflow_state),
    'wrong-predecessor-0001'
  )$$,
  '22023',
  'Rejected predecessor does not match the opening authority key',
  'a rejected predecessor cannot be repointed to another component'
);

WITH resubmitted AS (
  SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'ips_held_owner_cash', 'More detail supplied', 'IPS cutover row 1 amended',
    repeat('3', 64),
    (SELECT first_request_id FROM owner_opening_workflow_state),
    'member-resubmit-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET resubmitted_request_id = (resubmitted.result ->> 'request_id')::uuid
FROM resubmitted;

SELECT results_eq(
  $$
    SELECT child.status, child.resubmission_of_request_id, parent.status
    FROM public.owner_opening_balance_requests AS child
    JOIN public.owner_opening_balance_requests AS parent
      ON parent.id = child.resubmission_of_request_id
    WHERE child.id = (
      SELECT resubmitted_request_id FROM owner_opening_workflow_state
    )
  $$,
  $$
    SELECT
      'submitted'::text,
      first_request_id,
      'rejected'::text
    FROM owner_opening_workflow_state
  $$,
  'resubmission creates one linked child and leaves its rejected predecessor immutable'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 10.00,
    'ips_held_owner_cash', 'Another child attempt', 'IPS cutover row 1 third',
    repeat('4', 64),
    (SELECT first_request_id FROM owner_opening_workflow_state),
    'second-child-0001'
  )$$,
  '22023',
  'Rejected predecessor already has a successor',
  'one rejected request cannot have a second successor'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000013',
  true
);
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000003',
      'b2200000-0000-4000-8000-000000000004',
      'USD', '2026-08-01', 'security_deposit_custody', 25.00,
      'Document-backed opening amount', NULL,
      'b2200000-0000-4000-8000-000000000018', repeat('6', 64),
      NULL, 'document-mismatch-0001'
    )
  $$,
  '22023',
  'Opening evidence document is not eligible',
  'document-backed submit requires exact immutable metadata hash equality'
);

WITH submitted AS (
  SELECT public.submit_owner_opening_balance(
    'b2200000-0000-4000-8000-000000000001',
    'b2200000-0000-4000-8000-000000000003',
    'b2200000-0000-4000-8000-000000000004',
    'USD', '2026-08-01', 'security_deposit_custody', 25.00,
    'Document-backed opening amount', NULL,
    'b2200000-0000-4000-8000-000000000018', repeat('5', 64),
    NULL, 'document-submit-0001'
  ) AS result
)
UPDATE owner_opening_workflow_state
SET document_request_id = (submitted.result ->> 'request_id')::uuid
FROM submitted;

SELECT lives_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT document_request_id FROM owner_opening_workflow_state),
      'reject', 'Replace the source extract', 'document-reject-0001'
    )
  $$,
  'document-backed request can be rejected before its evidence becomes mutable again'
);

UPDATE public.documents
SET archived_at = pg_catalog.now(),
    archived_by = 'b2200000-0000-4000-8000-000000000011'
WHERE id = 'b2200000-0000-4000-8000-000000000018';

UPDATE public.property_owners
SET ownership_percent = 99.999
WHERE id = 'b2200000-0000-4000-8000-000000000005';

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000011',
  true
);
SELECT public.set_financial_month_lock(
  'b2200000-0000-4000-8000-000000000001',
  '2026-08-01',
  true,
  'Owner opening replay lock probe'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b2200000-0000-4000-8000-000000000013',
  true
);
SELECT is(
  (
    SELECT public.submit_owner_opening_balance(
      'b2200000-0000-4000-8000-000000000001',
      'b2200000-0000-4000-8000-000000000003',
      'b2200000-0000-4000-8000-000000000004',
      'USD', '2026-08-01', 'security_deposit_custody', 25.00,
      'Document-backed opening amount', NULL,
      'b2200000-0000-4000-8000-000000000018', repeat('5', 64),
      NULL, 'document-submit-0001'
    ) ->> 'request_id'
  ),
  (SELECT document_request_id::text FROM owner_opening_workflow_state),
  'completed submit replay returns the original ID before archived-document, changed-roster, and locked-month checks'
);

SELECT is(
  (
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT super_request_id FROM owner_opening_workflow_state),
      'approve', 'Independent opening approval', 'approve-initial-0001'
    ) -> 'entry_ids' ->> 0
  ),
  (SELECT super_opening_entry_id::text FROM owner_opening_workflow_state),
  'completed initial approval replay returns before changed-roster and locked-month checks'
);

SELECT is(
  (
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT super_opening_entry_id FROM owner_opening_workflow_state),
      25.00, 'Corrected source supplied', 'IPS correction source 2', NULL,
      repeat('c', 64),
      (SELECT rejected_correction_request_id FROM owner_opening_workflow_state),
      'manager-correction-resubmit-0001'
    ) ->> 'request_id'
  ),
  (SELECT correction_request_id::text FROM owner_opening_workflow_state),
  'completed correction submission replay returns before stale-target, changed-roster, and locked-month checks'
);

SELECT results_eq(
  $$
    SELECT
      pg_temp.review_opening(
        'b2200000-0000-4000-8000-000000000011',
        (SELECT second_correction_request_id FROM owner_opening_workflow_state),
        'approve', 'Approve second correction', 'approve-second-correction-0001'
      ) -> 'entry_ids'
  $$,
  $$
    SELECT pg_catalog.jsonb_build_array(
      second_correction_reversal_entry_id,
      second_correction_replacement_entry_id
    )
    FROM owner_opening_workflow_state
  $$,
  'completed correction approval replay returns original IDs before changed-roster and locked-month checks'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.submit_opening_correction(
      'b2200000-0000-4000-8000-000000000013',
      (SELECT second_correction_replacement_entry_id FROM owner_opening_workflow_state),
      24.00, 'New locked correction denied', 'Locked correction source', NULL,
      repeat('2', 64), NULL, 'locked-new-correction-0001'
    )
  $$,
  '22023',
  'Financial month is locked',
  'new correction submission fails before domain mutation when the month is locked'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT pending_locked_correction_request_id FROM owner_opening_workflow_state),
      'approve', 'Locked correction approval denied', 'locked-correction-approve-0001'
    )
  $$,
  '22023',
  'Financial month is locked',
  'new correction approval fails before status transition or entry creation while locked'
);

SELECT lives_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT pending_locked_correction_request_id FROM owner_opening_workflow_state),
      'reject', 'Locked correction remains rejectable', 'locked-correction-reject-0001'
    )
  $$,
  'correction rejection remains available while the month is locked'
);

SELECT is(
  (
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT pending_locked_correction_request_id FROM owner_opening_workflow_state),
      'reject', 'Locked correction remains rejectable', 'locked-correction-reject-0001'
    ) ->> 'request_id'
  ),
  (SELECT pending_locked_correction_request_id::text FROM owner_opening_workflow_state),
  'completed locked correction rejection replay returns the original request'
);

SELECT throws_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000013', 5.00,
    'ips_due_to_owner', 'New locked opening attempt', 'IPS cutover locked row',
    repeat('7', 64), NULL, 'locked-submit-0001'
  )$$,
  '22023',
  'Financial month is locked',
  'new initial submission fails before domain mutation when the month is locked'
);

SELECT lives_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT resubmitted_request_id FROM owner_opening_workflow_state),
      'reject', 'Locked month still permits rejection', 'locked-reject-0001'
    )
  $$,
  'rejection takes the serialization locks but deliberately skips the open-month assertion'
);

SELECT is(
  (
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000011',
      (SELECT resubmitted_request_id FROM owner_opening_workflow_state),
      'reject', 'Locked month still permits rejection', 'locked-reject-0001'
    ) ->> 'request_id'
  ),
  (SELECT resubmitted_request_id::text FROM owner_opening_workflow_state),
  'completed rejection replay returns the original request while the month remains locked'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.request_id IN (
      SELECT state.first_request_id
      FROM owner_opening_workflow_state AS state
      UNION ALL
      SELECT state.resubmitted_request_id
      FROM owner_opening_workflow_state AS state
      UNION ALL
      SELECT state.document_request_id
      FROM owner_opening_workflow_state AS state
    )
  ),
  0::bigint,
  'Task 2.2B submit, reject, replay, and resubmit paths never create an entry'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.activity_logs AS activity
    JOIN owner_opening_workflow_state AS state
      ON activity.organization_id = state.organization_id
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id IN (
        state.first_request_id,
        state.resubmitted_request_id
      )
      AND activity.actor_id = state.finance_member_id
      AND activity.new_values ->> 'source' = 'checked_rpc'
      AND activity.new_values ? 'financial_idempotency_request_id'
  ),
  'submit activity records the authenticated actor, checked source, and idempotency provenance'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.activity_logs AS activity
    JOIN owner_opening_workflow_state AS state
      ON activity.organization_id = state.organization_id
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = state.resubmitted_request_id
      AND activity.action = 'rejected'
      AND activity.actor_id = state.super_admin_reviewer_id
      AND activity.new_values ->> 'source' = 'checked_rpc'
      AND activity.new_values -> 'entry_ids' = '[]'::jsonb
  ),
  'rejection activity records independent actor, checked source, idempotency provenance, and no entries'
);

SELECT results_eq(
  $$
    SELECT
      activity.actor_id,
      activity.new_values ->> 'source',
      activity.new_values ->> 'operation',
      activity.new_values ->> 'target_entry_id',
      activity.new_values ->> 'replacement_amount',
      activity.new_values ->> 'payload_hash',
      request.payload_hash
    FROM public.activity_logs AS activity
    JOIN app_private.financial_idempotency_requests AS request
      ON request.id = (
        activity.new_values ->> 'financial_idempotency_request_id'
      )::uuid
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = (
        SELECT correction_request_id FROM owner_opening_workflow_state
      )
      AND activity.action = 'resubmitted'
  $$,
  $$
    SELECT
      'b2200000-0000-4000-8000-000000000012'::uuid,
      'checked_rpc'::text,
      'submit_owner_opening_balance_correction'::text,
      state.super_opening_entry_id::text,
      '25.00'::text,
      request.payload_hash,
      request.payload_hash
    FROM owner_opening_workflow_state AS state
    JOIN app_private.financial_idempotency_requests AS request
      ON request.operation = 'submit_owner_opening_balance_correction'
      AND request.idempotency_key = 'manager-correction-resubmit-0001'
  $$,
  'correction submission activity binds actor, target, exact decimal, canonical payload hash, and idempotency provenance'
);

SELECT results_eq(
  $$
    SELECT
      activity.actor_id,
      activity.new_values ->> 'source',
      activity.new_values ->> 'operation',
      activity.new_values -> 'entry_ids',
      activity.new_values ->> 'payload_hash',
      request.payload_hash
    FROM public.activity_logs AS activity
    JOIN app_private.financial_idempotency_requests AS request
      ON request.id = (
        activity.new_values ->> 'financial_idempotency_request_id'
      )::uuid
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = (
        SELECT correction_request_id FROM owner_opening_workflow_state
      )
      AND activity.action = 'approved'
  $$,
  $$
    SELECT
      'b2200000-0000-4000-8000-000000000011'::uuid,
      'checked_rpc'::text,
      'review_owner_opening_balance'::text,
      pg_catalog.jsonb_build_array(
        state.correction_reversal_entry_id,
        state.correction_replacement_entry_id
      ),
      request.payload_hash,
      request.payload_hash
    FROM owner_opening_workflow_state AS state
    JOIN app_private.financial_idempotency_requests AS request
      ON request.operation = 'review_owner_opening_balance'
      AND request.idempotency_key = 'approve-correction-0001'
  $$,
  'correction approval activity binds independent reviewer, ordered entry IDs, canonical payload hash, and idempotency provenance'
);

SELECT results_eq(
  $$
    SELECT
      count(*)::bigint,
      count(DISTINCT activity.new_values ->> 'payload_hash')::bigint
    FROM public.activity_logs AS activity
    WHERE activity.entity_type = 'owner_opening_balance_request'
      AND activity.entity_id = (
        SELECT correction_request_id FROM owner_opening_workflow_state
      )
      AND activity.action IN ('resubmitted', 'approved')
  $$,
  $$ VALUES (2::bigint, 2::bigint) $$,
  'completed correction submission and approval replays create no duplicate or divergent activity'
);

SELECT * FROM finish();

ROLLBACK;
