BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(37);

SELECT has_function(
  'public',
  'submit_expense',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'date',
    'numeric', 'numeric', 'currency_code', 'text', 'uuid', 'uuid', 'uuid',
    'uuid', 'text', 'text'
  ],
  'paid cost submission retains one checked financial command'
);

SELECT has_function(
  'public',
  'review_expense',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'uuid'],
  'paid cost review retains one checked maker-checker command'
);

SELECT has_function(
  'public',
  'reverse_expense',
  ARRAY['uuid', 'uuid', 'date', 'text', 'text'],
  'paid cost reversal retains one checked append-only command'
);

SELECT ok(
  to_regprocedure(
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)'
  ) IS NOT NULL,
  'service verification can resolve one exact paid-cost Storage object'
);

SELECT ok(
  to_regprocedure(
    'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)'
  ) IS NOT NULL,
  'service verification can register one immutable paid-cost document'
);

SELECT ok(
  to_regprocedure(
    'public.get_paid_cost_submission_evidence(uuid,uuid[])'
  ) IS NOT NULL,
  'Finance history can read the immutable paid-cost evidence fingerprint'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.get_paid_cost_submission_evidence(uuid,uuid[])'),
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    to_regprocedure('public.get_paid_cost_submission_evidence(uuid,uuid[])'),
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    to_regprocedure('public.get_paid_cost_submission_evidence(uuid,uuid[])'),
    'EXECUTE'
  ),
  'paid-cost evidence history is exposed only through Finance-authenticated reads'
);

SELECT ok(
  (
    SELECT strpos(
      pg_catalog.pg_get_functiondef(
        'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
      ),
      'IF p_supporting_document_id IS NULL THEN'
    ) > 0
  ),
  'general paid-cost submission requires an immutable document even when a reference exists'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot inspect unregistered paid-cost Storage objects'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot forge paid-cost evidence registration metadata'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)',
    'EXECUTE'
  ),
  'only the trusted server service boundary can inspect and register evidence'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.submit_expense_baseline(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'app_private.submit_expense_baseline(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'no application role can bypass the strict public paid-cost wrapper'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'the checked paid-cost command is exposed only to authenticated actors'
);

SELECT ok(
  (
    SELECT
      routine.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'postgres')
      AND routine.prosecdef
      AND coalesce(
        pg_catalog.array_to_string(routine.proconfig, ','),
        ''
      ) = 'search_path=""'
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = 'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ),
  'the public paid-cost wrapper is postgres-owned, checked, and search-path locked'
);

SELECT ok(
  (
    SELECT routine.prosecdef
      AND coalesce(
        pg_catalog.array_to_string(routine.proconfig, ','),
        ''
      ) = 'search_path=""'
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = 'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)'::regprocedure
  ),
  'verified evidence registration is a search-path-locked definer boundary'
);

SELECT ok(
  (
    SELECT
      strpos(policy.qual, '/paid-cost-evidence/%') > 0
      AND policy.cmd = 'DELETE'
    FROM pg_catalog.pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'Admins can delete Nestory documents'
  ),
  'authenticated document cleanup cannot delete the paid-cost evidence namespace'
);

SELECT ok(
  to_regprocedure(
    'app_private.assert_paid_cost_evidence_eligible(uuid,uuid,uuid,uuid,text,uuid)'
  ) IS NOT NULL,
  'one private assertion binds submit and approval to verified paid-cost evidence'
);

CREATE TEMP TABLE paid_cost_c1_state ON COMMIT DROP AS
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid AS organization_id,
  '10000000-0000-0000-0000-000000000001'::uuid AS property_id,
  '10000000-0000-0000-0000-000000000002'::uuid AS other_property_id,
  '20000000-0000-0000-0000-000000000001'::uuid AS unit_id,
  '00000000-0000-0000-0000-000000000801'::uuid AS finance_member_id,
  '00000000-0000-0000-0000-000000000101'::uuid AS super_admin_id,
  '00000000-0000-0000-0000-000000000701'::uuid AS other_uploader_id,
  (
    SELECT source.id
    FROM public.financial_reconciliation_sources AS source
    WHERE source.organization_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      AND source.currency = 'USD'
      AND source.archived_at IS NULL
    ORDER BY source.id
    LIMIT 1
  ) AS source_id;

INSERT INTO storage.objects (bucket_id, name, version, metadata)
SELECT
  'nestory-documents',
  state.organization_id::text || '/' || candidate.path_suffix,
  pg_catalog.gen_random_uuid()::text,
  pg_catalog.jsonb_build_object(
    'mimetype', 'application/pdf',
    'size', candidate.object_size
  )
FROM paid_cost_c1_state AS state
CROSS JOIN (
  VALUES
    ('general-documents/generic.pdf', 21),
    ('paid-cost-evidence/property-null.pdf', 22),
    ('paid-cost-evidence/wrong-category.pdf', 23),
    ('general-documents/wrong-path.pdf', 24),
    ('paid-cost-evidence/wrong-property.pdf', 25),
    ('paid-cost-evidence/wrong-uploader.pdf', 26),
    ('paid-cost-evidence/null-hash.pdf', 27),
    ('paid-cost-evidence/metadata-mismatch.pdf', 999),
    ('paid-cost-evidence/registered.pdf', 29),
    ('paid-cost-evidence/forged-by-super-admin.pdf', 31)
) AS candidate(path_suffix, object_size);

SELECT set_config('app.document_content_write_context', 'checked-v1', true);

INSERT INTO public.documents (
  id,
  organization_id,
  property_id,
  category,
  file_name,
  storage_path,
  mime_type,
  size_bytes,
  content_sha256,
  uploaded_by
)
SELECT
  candidate.document_id,
  state.organization_id,
  candidate.property_id,
  candidate.category,
  candidate.file_name,
  state.organization_id::text || '/' || candidate.path_suffix,
  'application/pdf',
  candidate.document_size,
  candidate.content_sha256,
  candidate.uploaded_by
FROM paid_cost_c1_state AS state
CROSS JOIN LATERAL (
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da1'::uuid, state.property_id, 'Lease agreement', 'generic.pdf', 'general-documents/generic.pdf', 21::bigint, NULL::text, state.finance_member_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da2'::uuid, NULL::uuid, 'Paid cost evidence', 'property-null.pdf', 'paid-cost-evidence/property-null.pdf', 22::bigint, pg_catalog.repeat('2', 64), state.finance_member_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da3'::uuid, state.property_id, 'Receipt', 'wrong-category.pdf', 'paid-cost-evidence/wrong-category.pdf', 23::bigint, pg_catalog.repeat('3', 64), state.finance_member_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da4'::uuid, state.property_id, 'Paid cost evidence', 'wrong-path.pdf', 'general-documents/wrong-path.pdf', 24::bigint, pg_catalog.repeat('4', 64), state.finance_member_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da5'::uuid, state.other_property_id, 'Paid cost evidence', 'wrong-property.pdf', 'paid-cost-evidence/wrong-property.pdf', 25::bigint, pg_catalog.repeat('5', 64), state.finance_member_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da6'::uuid, state.property_id, 'Paid cost evidence', 'wrong-uploader.pdf', 'paid-cost-evidence/wrong-uploader.pdf', 26::bigint, pg_catalog.repeat('6', 64), state.other_uploader_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da7'::uuid, state.property_id, 'Paid cost evidence', 'null-hash.pdf', 'paid-cost-evidence/null-hash.pdf', 27::bigint, NULL::text, state.finance_member_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da8'::uuid, state.property_id, 'Paid cost evidence', 'missing-object.pdf', 'paid-cost-evidence/missing-object.pdf', 28::bigint, pg_catalog.repeat('8', 64), state.finance_member_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da9'::uuid, state.property_id, 'Paid cost evidence', 'metadata-mismatch.pdf', 'paid-cost-evidence/metadata-mismatch.pdf', 29::bigint, pg_catalog.repeat('9', 64), state.finance_member_id)
) AS candidate(
  document_id,
  property_id,
  category,
  file_name,
  path_suffix,
  document_size,
  content_sha256,
  uploaded_by
);

SELECT set_config('app.document_content_write_context', 'off', true);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM paid_cost_c1_state),
  true
);
GRANT SELECT ON paid_cost_c1_state TO authenticated;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 generic','paid-cost-c1-generic')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da1'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'a generic unhashed document cannot satisfy paid-cost evidence'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 null property','paid-cost-c1-null-property')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da2'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'property-null evidence cannot satisfy a property paid cost'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 category','paid-cost-c1-category')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da3'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'wrong-category evidence cannot satisfy a paid cost'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 path','paid-cost-c1-path')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da4'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'wrong-namespace evidence cannot satisfy a paid cost'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 property','paid-cost-c1-property')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da5'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'wrong-property evidence cannot satisfy a paid cost'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 uploader','paid-cost-c1-uploader')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da6'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'evidence registered for another uploader cannot satisfy a paid cost'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 hash','paid-cost-c1-hash')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da7'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'unfingerprinted evidence cannot satisfy a paid cost'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 object','paid-cost-c1-object')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da8'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'missing retained bytes cannot satisfy a paid cost'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor',CURRENT_DATE,10,0,'USD','owner',NULL,%L,%L,NULL,'C1 metadata','paid-cost-c1-metadata')$sql$,
    organization_id, property_id, unit_id, source_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da9'::uuid
  ),
  '23514', 'paid_cost_evidence_invalid',
  'Storage metadata mismatch cannot satisfy a paid cost'
) FROM paid_cost_c1_state;

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM paid_cost_c1_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_like(
  format(
    $sql$INSERT INTO storage.objects (bucket_id, name, version, metadata)
      VALUES ('nestory-documents', %L, pg_catalog.gen_random_uuid()::text,
        pg_catalog.jsonb_build_object('mimetype', 'application/pdf', 'size', 30))$sql$,
    organization_id::text || '/paid-cost-evidence/direct-upload.pdf'
  ),
  '%row-level security policy%',
  'ordinary authenticated Storage upload cannot enter the paid-cost evidence namespace'
) FROM paid_cost_c1_state;

SELECT throws_ok(
  format(
    $sql$WITH forged AS (
      SELECT public.create_document(
        %L,
        'Paid cost evidence',
        'forged-by-super-admin.pdf',
        %L,
        'application/pdf',
        31,
        %L,
        %L,
        NULL, NULL, NULL, NULL, NULL, NULL,
        'document',
        NULL,
        'paid_cost_evidence_registered',
        pg_catalog.jsonb_build_object(
          'property_id', %L::text,
          'storage_path', %L,
          'content_sha256', %L,
          'size_bytes', 31,
          'content_type', 'application/pdf'
        )
      ) AS document_id
    )
    SELECT public.submit_expense(
      %L, %L, %L, 'general', NULL, 'other', 'C1 forged vendor',
      CURRENT_DATE, 31, 0, 'USD', 'owner', NULL, %L,
      forged.document_id, NULL, 'C1 forged evidence',
      'paid-cost-c1-forged-submit'
    )
    FROM forged$sql$,
    organization_id,
    organization_id::text || '/paid-cost-evidence/forged-by-super-admin.pdf',
    pg_catalog.repeat('f', 64),
    property_id,
    property_id,
    organization_id::text || '/paid-cost-evidence/forged-by-super-admin.pdf',
    pg_catalog.repeat('f', 64),
    organization_id,
    property_id,
    unit_id,
    source_id
  ),
  '42501',
  'paid_cost_evidence_service_only',
  'Super Admin cannot forge registrar evidence through create_document and submit it'
) FROM paid_cost_c1_state;

SELECT throws_like(
  format(
    $sql$INSERT INTO public.activity_logs (
      organization_id, actor_id, entity_type, entity_id, action, new_values
    ) VALUES (%L, %L, 'document', %L, 'paid_cost_evidence_registered', '{}'::jsonb)$sql$,
    organization_id,
    super_admin_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0daf'::uuid
  ),
  '%row-level security policy%',
  'ordinary authenticated activity insertion cannot imitate registrar authority'
) FROM paid_cost_c1_state;

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.documents
        WHERE storage_path LIKE '%/paid-cost-evidence/forged-by-super-admin.pdf'),
      (SELECT count(*) FROM public.expense_submissions
        WHERE idempotency_key = 'paid-cost-c1-forged-submit'),
      (SELECT count(*) FROM app_private.financial_idempotency_requests
        WHERE idempotency_key = 'paid-cost-c1-forged-submit'),
      (SELECT count(*) FROM public.activity_logs
        WHERE action = 'paid_cost_evidence_registered'
          AND entity_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0daf'::uuid)
  $$,
  $$VALUES (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'forgery attempts leave no document, submission, idempotency, or activity residue'
);

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.expense_submissions WHERE idempotency_key LIKE 'paid-cost-c1-%'),
      (SELECT count(*) FROM app_private.financial_idempotency_requests WHERE idempotency_key LIKE 'paid-cost-c1-%')
  $$,
  $$VALUES (0::bigint, 0::bigint)$$,
  'invalid evidence attempts leave no submission or idempotency residue'
);

CREATE TEMP TABLE paid_cost_c1_registration ON COMMIT DROP AS
SELECT public.register_paid_cost_evidence_verified(
  state.organization_id,
  state.finance_member_id,
  state.property_id,
  'registered.pdf',
  state.organization_id::text || '/paid-cost-evidence/registered.pdf',
  'application/pdf',
  29,
  pg_catalog.repeat('b', 64),
  object.id,
  object.version,
  'paid-cost-c1-register'
) AS result
FROM paid_cost_c1_state AS state
JOIN storage.objects AS object
  ON object.bucket_id = 'nestory-documents'
 AND object.name =
   state.organization_id::text || '/paid-cost-evidence/registered.pdf';

SELECT ok(
  (SELECT result->>'status' FROM paid_cost_c1_registration) IN (
    'registered', 'existing'
  ),
  'the trusted registrar creates one actor-bound evidence identity'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM paid_cost_c1_state),
  true
);
GRANT SELECT ON paid_cost_c1_registration TO authenticated;
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE paid_cost_c1_result ON COMMIT DROP AS
SELECT public.submit_expense(
  state.organization_id,
  state.property_id,
  state.unit_id,
  'general',
  NULL,
  'other',
  'C1 registered vendor',
  CURRENT_DATE,
  10,
  0,
  'USD',
  'owner',
  NULL,
  state.source_id,
  (registration.result->>'document_id')::uuid,
  NULL,
  'C1 registered evidence',
  'paid-cost-c1-valid-submit'
) AS result
FROM paid_cost_c1_state AS state
CROSS JOIN paid_cost_c1_registration AS registration;

SELECT ok(
  (SELECT result->>'status' FROM paid_cost_c1_result) = 'submitted',
  'verified actor-bound evidence creates one submitted paid cost'
);

SELECT throws_ok(
  format(
    $sql$SELECT public.submit_expense(%L,%L,%L,'general',NULL,'other','C1 vendor reuse',CURRENT_DATE,11,0,'USD','owner',NULL,%L,%L,NULL,'C1 reuse','paid-cost-c1-reuse')$sql$,
    state.organization_id,
    state.property_id,
    state.unit_id,
    state.source_id,
    (registration.result->>'document_id')::uuid
  ),
  '23514', 'paid_cost_evidence_already_used',
  'verified evidence cannot be bound to an unrelated paid cost'
)
FROM paid_cost_c1_state AS state
CROSS JOIN paid_cost_c1_registration AS registration;

SELECT is(
  (
    public.submit_expense(
      state.organization_id,
      state.property_id,
      state.unit_id,
      'general',
      NULL,
      'other',
      'C1 registered vendor',
      CURRENT_DATE,
      10,
      0,
      'USD',
      'owner',
      NULL,
      state.source_id,
      (registration.result->>'document_id')::uuid,
      NULL,
      'C1 registered evidence',
      'paid-cost-c1-valid-submit'
    )->>'submission_id'
  )::uuid,
  ((SELECT result->>'submission_id' FROM paid_cost_c1_result))::uuid,
  'exact submission replay preserves the original evidence and identity'
)
FROM paid_cost_c1_state AS state
CROSS JOIN paid_cost_c1_registration AS registration;

RESET ROLE;

INSERT INTO public.expense_submissions (
  id,
  organization_id,
  property_id,
  unit_id,
  source_type,
  source_id,
  customer_category,
  vendor_label,
  expense_date,
  internal_cost_amount,
  internal_markup_amount,
  currency,
  responsibility,
  tenant_invoice_id,
  reconciliation_source_id,
  supporting_document_id,
  vendor_person_id,
  reference,
  idempotency_key,
  request_payload_hash,
  submitted_by
)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0db1'::uuid,
  state.organization_id,
  state.property_id,
  state.unit_id,
  'general',
  NULL,
  'other',
  'C1 direct malformed review',
  CURRENT_DATE,
  12,
  0,
  'USD',
  'owner',
  NULL,
  state.source_id,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0da1'::uuid,
  NULL,
  'C1 malformed review',
  'paid-cost-c1-review-source',
  pg_catalog.repeat('c', 64),
  state.finance_member_id
FROM paid_cost_c1_state AS state;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.review_expense(
      '00000000-0000-0000-0000-000000000001',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0db1',
      'approve',
      NULL,
      'paid-cost-c1-review-denied',
      NULL
    )
  $$,
  '23514',
  'paid_cost_evidence_invalid',
  'approval revalidates registrar-grade evidence before financial effects'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      (
        SELECT count(*)
        FROM public.expense_submissions
        WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0db1'
          AND status = 'submitted'
          AND approved_finance_expense_item_id IS NULL
          AND approved_payment_id IS NULL
          AND approved_ledger_entry_id IS NULL
      ),
      (SELECT count(*) FROM app_private.financial_idempotency_requests WHERE idempotency_key = 'paid-cost-c1-review-denied')
  $$,
  $$VALUES (1::bigint, 0::bigint)$$,
  'malformed-evidence approval leaves no financial or idempotency residue'
);

SELECT * FROM finish();
ROLLBACK;
