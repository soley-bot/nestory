BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_function(
  'public',
  'submit_owner_opening_balance_with_document',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'public.currency_code', 'date',
    'public.owner_balance_component', 'numeric', 'text', 'text', 'text',
    'uuid', 'text', 'text', 'text', 'text', 'bigint'
  ],
  'initial evidence submission has one atomic document-and-request wrapper'
);

SELECT has_function(
  'public',
  'submit_owner_opening_balance_correction_with_document',
  ARRAY[
    'uuid', 'uuid', 'numeric', 'text', 'text', 'text', 'uuid', 'text',
    'text', 'text', 'text', 'bigint'
  ],
  'correction evidence submission has one atomic document-and-request wrapper'
);

SELECT ok(
  coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.submit_owner_opening_balance_with_document(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,text,uuid,text,text,text,text,bigint)'),
    'EXECUTE'
  ), false)
  AND NOT coalesce(has_function_privilege(
    'anon',
    to_regprocedure('public.submit_owner_opening_balance_with_document(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,text,uuid,text,text,text,text,bigint)'),
    'EXECUTE'
  ), false)
  AND NOT coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.submit_owner_opening_balance_with_document(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,text,uuid,text,text,text,text,bigint)'),
    'EXECUTE'
  ), false),
  'only authenticated callers can reach the atomic initial wrapper'
);

SELECT ok(
  coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.submit_owner_opening_balance_correction_with_document(uuid,uuid,numeric,text,text,text,uuid,text,text,text,text,bigint)'),
    'EXECUTE'
  ), false)
  AND NOT coalesce(has_function_privilege(
    'anon',
    to_regprocedure('public.submit_owner_opening_balance_correction_with_document(uuid,uuid,numeric,text,text,text,uuid,text,text,text,text,bigint)'),
    'EXECUTE'
  ), false)
  AND NOT coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.submit_owner_opening_balance_correction_with_document(uuid,uuid,numeric,text,text,text,uuid,text,text,text,text,bigint)'),
    'EXECUTE'
  ), false),
  'only authenticated callers can reach the atomic correction wrapper'
);

SELECT results_eq(
  $$
    SELECT procedure.proname, procedure.prosecdef,
      coalesce(procedure.proconfig @> ARRAY['search_path=""']::text[], false)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'submit_owner_opening_balance_with_document',
        'submit_owner_opening_balance_correction_with_document'
      )
    ORDER BY procedure.proname
  $$,
  $$ VALUES
    ('submit_owner_opening_balance_correction_with_document'::name, true, true),
    ('submit_owner_opening_balance_with_document'::name, true, true)
  $$,
  'both public wrappers are security definers with empty search paths'
);

SELECT ok(
  NOT coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('app_private.owner_opening_document_id(uuid,uuid,text,text)'),
    'EXECUTE'
  ), false)
  AND NOT coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('app_private.register_owner_opening_document(uuid,uuid,uuid,text,text,text,text,text,bigint,text)'),
    'EXECUTE'
  ), false),
  'document identity and registration helpers stay private'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', actor_id, 'authenticated',
  'authenticated', label || '@owner-opening-evidence.test',
  extensions.crypt('owner-opening-evidence', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  VALUES
    ('b23b0000-0000-4000-8000-000000000010'::uuid, 'super-submit'),
    ('b23b0000-0000-4000-8000-000000000011'::uuid, 'super-review'),
    ('b23b0000-0000-4000-8000-000000000012'::uuid, 'finance-member'),
    ('b23b0000-0000-4000-8000-000000000013'::uuid, 'finance-manager')
) AS actors(actor_id, label);

INSERT INTO public.organizations (id, name, slug)
VALUES ('b23b0000-0000-4000-8000-000000000001', 'Opening evidence', 'opening-evidence');

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES (
  'b23b0000-0000-4000-8000-000000000002',
  'b23b0000-0000-4000-8000-000000000001',
  'Evidence property', 'EVD-1', 'Apartment'
);

INSERT INTO public.people (id, organization_id, display_name)
VALUES (
  'b23b0000-0000-4000-8000-000000000003',
  'b23b0000-0000-4000-8000-000000000001',
  'Evidence owner'
);

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES (
  'b23b0000-0000-4000-8000-000000000001',
  'b23b0000-0000-4000-8000-000000000003',
  'owner', 'active'
);

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
VALUES (
  'b23b0000-0000-4000-8000-000000000004',
  'b23b0000-0000-4000-8000-000000000001',
  'b23b0000-0000-4000-8000-000000000002',
  'b23b0000-0000-4000-8000-000000000003',
  100.000, '2026-01-01'
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  ('b23b0000-0000-4000-8000-000000000001', 'b23b0000-0000-4000-8000-000000000010', 'super_admin'),
  ('b23b0000-0000-4000-8000-000000000001', 'b23b0000-0000-4000-8000-000000000011', 'super_admin'),
  ('b23b0000-0000-4000-8000-000000000001', 'b23b0000-0000-4000-8000-000000000012', 'finance_member'),
  ('b23b0000-0000-4000-8000-000000000001', 'b23b0000-0000-4000-8000-000000000013', 'finance_manager');

INSERT INTO storage.objects (bucket_id, name)
VALUES
  ('nestory-documents', 'b23b0000-0000-4000-8000-000000000001/owner-opening/7af06f2c-5011-10fa-3aea-782a22ed81e8'),
  ('nestory-documents', 'b23b0000-0000-4000-8000-000000000001/owner-opening/df76be6a-a789-83d1-e5e0-1b5555b01bc6'),
  ('nestory-documents', 'b23b0000-0000-4000-8000-000000000001/owner-opening/3d6f24f3-98cc-b2f9-ea43-4ca23258a5e8');

SELECT set_config('request.jwt.claim.sub', 'b23b0000-0000-4000-8000-000000000012', true);
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance_with_document(
      'b23b0000-0000-4000-8000-000000000001',
      'b23b0000-0000-4000-8000-000000000002',
      'b23b0000-0000-4000-8000-000000000003',
      'USD', '2026-08-01', 'ips_held_owner_cash', 10.00,
      'Uploaded evidence', NULL, repeat('5', 64), NULL,
      'member-document-0001', 'member.pdf',
      'b23b0000-0000-4000-8000-000000000001/owner-opening/member-document',
      'application/pdf', 18
    )
  $$,
  '42501',
  'Only a Super Admin can register opening evidence',
  'Finance Member initial authority does not gain document registration authority'
);

SELECT set_config('request.jwt.claim.sub', 'b23b0000-0000-4000-8000-000000000010', true);

CREATE TEMP TABLE evidence_submission_state (request_id uuid, entry_id uuid) ON COMMIT DROP;

WITH submitted AS (
  SELECT public.submit_owner_opening_balance_with_document(
    'b23b0000-0000-4000-8000-000000000001',
    'b23b0000-0000-4000-8000-000000000002',
    'b23b0000-0000-4000-8000-000000000003',
    'USD', '2026-08-01', 'ips_held_owner_cash', 10.00,
    'Uploaded evidence', NULL, repeat('5', 64), NULL,
    'atomic-initial-0001', 'opening.pdf',
    'b23b0000-0000-4000-8000-000000000001/owner-opening/7af06f2c-5011-10fa-3aea-782a22ed81e8',
    'application/pdf', 18
  ) AS result
)
INSERT INTO evidence_submission_state (request_id)
SELECT (result ->> 'request_id')::uuid FROM submitted;

SELECT results_eq(
  $$
    SELECT
      count(DISTINCT document.id)::bigint,
      count(DISTINCT request.id)::bigint,
      bool_and(request.supporting_document_id = document.id),
      bool_and(document.content_sha256 = repeat('5', 64)),
      bool_and(document.archived_at IS NULL)
    FROM public.documents AS document
    JOIN public.owner_opening_balance_requests AS request
      ON request.supporting_document_id = document.id
    WHERE document.storage_path = 'b23b0000-0000-4000-8000-000000000001/owner-opening/7af06f2c-5011-10fa-3aea-782a22ed81e8'
  $$,
  $$ VALUES (1::bigint, 1::bigint, true, true, true) $$,
  'successful final submit commits exactly one immutable document referenced by one request'
);

UPDATE public.property_owners
SET ownership_percent = 99.999
WHERE id = 'b23b0000-0000-4000-8000-000000000004';

SELECT is(
  (
    SELECT public.submit_owner_opening_balance_with_document(
      'b23b0000-0000-4000-8000-000000000001',
      'b23b0000-0000-4000-8000-000000000002',
      'b23b0000-0000-4000-8000-000000000003',
      'USD', '2026-08-01', 'ips_held_owner_cash', 10.00,
      'Uploaded evidence', NULL, repeat('5', 64), NULL,
      'atomic-initial-0001', 'opening.pdf',
      'b23b0000-0000-4000-8000-000000000001/owner-opening/7af06f2c-5011-10fa-3aea-782a22ed81e8',
      'application/pdf', 18
    ) ->> 'request_id'
  ),
  (SELECT request_id::text FROM evidence_submission_state),
  'completed exact replay returns before mutable roster checks and creates no duplicate'
);

SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance_with_document(
      'b23b0000-0000-4000-8000-000000000001',
      'b23b0000-0000-4000-8000-000000000002',
      'b23b0000-0000-4000-8000-000000000003',
      'USD', '2026-08-01', 'ips_held_owner_cash', 11.00,
      'Changed payload', NULL, repeat('6', 64), NULL,
      'atomic-initial-0001', 'changed.pdf',
      'b23b0000-0000-4000-8000-000000000001/owner-opening/7af06f2c-5011-10fa-3aea-782a22ed81e8',
      'application/pdf', 19
    )
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'changed payload with the same key is rejected before touching referenced evidence'
);

SELECT results_eq(
  $$
    SELECT count(*)::bigint
    FROM public.documents
    WHERE storage_path = 'b23b0000-0000-4000-8000-000000000001/owner-opening/7af06f2c-5011-10fa-3aea-782a22ed81e8'
  $$,
  $$ VALUES (1::bigint) $$,
  'a changed-payload replay neither deletes nor duplicates referenced evidence'
);

SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance_with_document(
      'b23b0000-0000-4000-8000-000000000001',
      'b23b0000-0000-4000-8000-000000000002',
      'b23b0000-0000-4000-8000-000000000003',
      'USD', '2026-08-01', 'owner_due_to_ips', 5.00,
      'Invalid roster failure', NULL, repeat('7', 64), NULL,
      'atomic-failure-0001', 'failed.pdf',
      'b23b0000-0000-4000-8000-000000000001/owner-opening/df76be6a-a789-83d1-e5e0-1b5555b01bc6',
      'application/pdf', 20
    )
  $$,
  '23514',
  'owner_share_total_not_100: expected 100.000, got 99.999',
  'domain failure rolls back both document metadata and opening request'
);

SELECT results_eq(
  $$
    SELECT
      count(*) FILTER (WHERE document.storage_path = 'b23b0000-0000-4000-8000-000000000001/owner-opening/df76be6a-a789-83d1-e5e0-1b5555b01bc6')::bigint,
      (SELECT count(*) FROM public.owner_opening_balance_requests AS request
       WHERE request.organization_id = 'b23b0000-0000-4000-8000-000000000001'
         AND request.component = 'owner_due_to_ips')::bigint
    FROM public.documents AS document
  $$,
  $$ VALUES (0::bigint, 0::bigint) $$,
  'failed final submit leaves zero new database artifacts for Storage API cleanup'
);

UPDATE public.property_owners
SET ownership_percent = 100.000
WHERE id = 'b23b0000-0000-4000-8000-000000000004';

SELECT set_config('request.jwt.claim.sub', 'b23b0000-0000-4000-8000-000000000011', true);
WITH reviewed AS (
  SELECT public.review_owner_opening_balance(
    'b23b0000-0000-4000-8000-000000000001',
    (SELECT request_id FROM evidence_submission_state),
    'approve', 'Independent approval', 'atomic-review-0001'
  ) AS result
)
UPDATE evidence_submission_state
SET entry_id = (reviewed.result -> 'entry_ids' ->> 0)::uuid
FROM reviewed;

SELECT set_config('request.jwt.claim.sub', 'b23b0000-0000-4000-8000-000000000013', true);
SELECT throws_ok(
  $$
    SELECT public.submit_owner_opening_balance_correction_with_document(
      'b23b0000-0000-4000-8000-000000000001',
      (SELECT entry_id FROM evidence_submission_state), 12.00,
      'Manager uploaded correction', NULL, repeat('8', 64), NULL,
      'manager-correction-doc-0001', 'manager.pdf',
      'b23b0000-0000-4000-8000-000000000001/owner-opening/manager-correction',
      'application/pdf', 21
    )
  $$,
  '42501',
  'Only a Super Admin can register opening evidence',
  'Finance Manager correction authority does not gain document registration authority'
);

SELECT set_config('request.jwt.claim.sub', 'b23b0000-0000-4000-8000-000000000010', true);
SELECT lives_ok(
  $$
    SELECT public.submit_owner_opening_balance_correction_with_document(
      'b23b0000-0000-4000-8000-000000000001',
      (SELECT entry_id FROM evidence_submission_state), 12.00,
      'Uploaded correction evidence', NULL, repeat('9', 64), NULL,
      'atomic-correction-0001', 'correction.pdf',
      'b23b0000-0000-4000-8000-000000000001/owner-opening/3d6f24f3-98cc-b2f9-ea43-4ca23258a5e8',
      'application/pdf', 22
    )
  $$,
  'Super Admin correction wrapper preserves the checked correction authority path'
);

SELECT results_eq(
  $$
    SELECT count(*)::bigint
    FROM public.owner_opening_balance_requests AS request
    JOIN public.documents AS document ON document.id = request.supporting_document_id
    WHERE request.correction_of_entry_id = (SELECT entry_id FROM evidence_submission_state)
      AND document.storage_path = 'b23b0000-0000-4000-8000-000000000001/owner-opening/3d6f24f3-98cc-b2f9-ea43-4ca23258a5e8'
  $$,
  $$ VALUES (1::bigint) $$,
  'correction wrapper commits one exact document/request pair'
);

SELECT * FROM finish();
ROLLBACK;
