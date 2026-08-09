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
  document_request_id uuid
) ON COMMIT DROP;

INSERT INTO owner_opening_workflow_state DEFAULT VALUES;
GRANT SELECT ON owner_opening_workflow_state TO authenticated;

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
  (SELECT count(*) FROM public.owner_opening_balance_entries),
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

SELECT lives_ok(
  $$SELECT pg_temp.submit_reference_opening(
    'b2200000-0000-4000-8000-000000000010', 20.00,
    'owner_due_to_ips', 'Super Admin verified opening', 'IPS cutover row 2',
    repeat('2', 64), NULL, 'super-submit-0001'
  )$$,
  'Super Admin can submit an initial request through the same checked path'
);

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000010',
      (
        SELECT id
        FROM public.owner_opening_balance_requests
        WHERE submitted_by = 'b2200000-0000-4000-8000-000000000010'
          AND component = 'owner_due_to_ips'
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

SELECT throws_ok(
  $$
    SELECT pg_temp.review_opening(
      'b2200000-0000-4000-8000-000000000012',
      (SELECT first_request_id FROM owner_opening_workflow_state),
      'reject', 'Manager review denied', 'manager-review-0001'
    )
  $$,
  '42501',
  'Not authorized to review owner opening balances',
  'Finance Manager cannot review an opening request'
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
SELECT throws_ok(
  format(
    'SELECT public.review_owner_opening_balance(%L,%L,%L,%L,%L)',
    'b2200000-0000-4000-8000-000000000001',
    (SELECT first_request_id FROM owner_opening_workflow_state),
    'approve', 'Approval is not yet available', 'approve-before-2-2c'
  ),
  '22023',
  'Owner opening approval is not available in this workflow milestone',
  'Task 2.2B exposes no approval or entry creation path'
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
  (SELECT count(*) FROM public.owner_opening_balance_entries),
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
  (SELECT count(*) FROM public.owner_opening_balance_entries),
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

SELECT * FROM finish();

ROLLBACK;
