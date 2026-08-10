BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is(
  (SELECT count(*)::integer FROM public.owner_opening_balance_requests
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
     AND property_id = '10000000-0000-0000-0000-000000000001'),
  8,
  'fixture has the exact eight-request opening lineage'
);

SELECT is(
  (SELECT count(*)::integer FROM public.owner_opening_balance_entries
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
     AND property_id = '10000000-0000-0000-0000-000000000001'),
  6,
  'fixture has four openings plus the zero reversal and zero replacement'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.property_owners
   WHERE id IN (
     '90000000-0000-0000-0000-000000000001',
     '90000000-0000-0000-0000-000000000002',
     '90000000-0000-0000-0000-000000000003'
   )
     AND started_on = DATE '2024-01-01'),
  3,
  'all authored fixture ownership assignments use the pinned stable start date'
);

SELECT is(
  (SELECT jsonb_object_agg(status, count ORDER BY status)
   FROM (
     SELECT status, count(*)::integer AS count
     FROM public.owner_opening_balance_requests
     WHERE organization_id = '00000000-0000-0000-0000-000000000001'
       AND property_id = '10000000-0000-0000-0000-000000000001'
     GROUP BY status
   ) AS statuses),
  '{"approved":5,"rejected":2,"submitted":1}'::jsonb,
  'fixture preserves approved, rejected, and pending review states'
);

SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(component, to_char(current_amount, 'FM9999999999990.00')) ORDER BY component)
   FROM public.owner_opening_balance_known_authority_v1
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
     AND property_id = '10000000-0000-0000-0000-000000000001'),
  '[["ips_held_owner_cash","1250.00"],["owner_due_to_ips","0.00"],["ips_due_to_owner","240.50"],["security_deposit_custody","800.00"]]'::jsonb,
  'fixture exposes exactly four authoritative components and preserves known zero'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.owner_opening_balance_entries
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
     AND property_id = '10000000-0000-0000-0000-000000000001'
     AND component = 'owner_due_to_ips'
     AND entry_kind IN ('correction_reversal', 'correction_replacement')
     AND signed_amount = 0.00),
  2,
  'known zero correction has an explicit zero reversal and zero replacement'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.owner_opening_balance_requests AS successor
   JOIN public.owner_opening_balance_requests AS predecessor
     ON predecessor.id = successor.resubmission_of_request_id
   WHERE successor.organization_id = '00000000-0000-0000-0000-000000000001'
     AND successor.property_id = '10000000-0000-0000-0000-000000000001'
     AND predecessor.status = 'rejected'),
  2,
  'both rejected fixture leaves have exactly linked successors'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.owner_opening_balance_requests
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
     AND property_id = '10000000-0000-0000-0000-000000000001'
     AND (property_owner_id IS NULL
       OR ownership_percent_snapshot <> 100.000
       OR ownership_roster_hash !~ '^[0-9a-f]{64}$'
       OR evidence_sha256 !~ '^[0-9a-f]{64}$'
       OR source_reference IS NULL
       OR supporting_document_id IS NOT NULL)),
  0,
  'every request has immutable ownership/evidence snapshots and reference-only evidence'
);

SELECT is(
  (SELECT count(*)::integer
   FROM app_private.financial_idempotency_requests
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
     AND operation IN (
       'submit_owner_opening_balance',
       'review_owner_opening_balance',
       'submit_owner_opening_balance_correction'
     )),
  15,
  'every fixture submit and review has a completed idempotency record'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.activity_logs
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
     AND entity_type = 'owner_opening_balance_request'
     AND new_values->>'source' = 'checked_rpc'),
  15,
  'every fixture transition has checked-RPC activity provenance'
);

SELECT is(
  (SELECT count(*)::integer
   FROM storage.objects
   WHERE bucket_id = 'nestory-documents'
     AND name LIKE '00000000-0000-0000-0000-000000000001/%owner-opening%'),
  0,
  'reference-only fixture creates no physical owner-opening object'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.owner_opening_balance_requests
   WHERE organization_id <> '00000000-0000-0000-0000-000000000001'
      OR property_id <> '10000000-0000-0000-0000-000000000001'),
  0,
  'owner-opening fixture rows never leak into another tenant or property'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.owner_opening_balance_requests
   WHERE status <> 'submitted'
     AND (reviewed_by IS NULL OR reviewed_by = submitted_by)),
  0,
  'every completed fixture decision is independently reviewed'
);

SELECT is(
  (SELECT count(*)::integer
   FROM app_private.financial_idempotency_requests AS idem
   LEFT JOIN public.activity_logs AS activity
     ON activity.new_values->>'financial_idempotency_request_id' = idem.id::text
   WHERE idem.organization_id = '00000000-0000-0000-0000-000000000001'
     AND idem.operation IN (
       'submit_owner_opening_balance',
       'review_owner_opening_balance',
       'submit_owner_opening_balance_correction'
     )
     AND (idem.status <> 'completed'
       OR activity.id IS NULL
       OR activity.new_values->>'payload_hash' <> idem.payload_hash)),
  0,
  'idempotency completion and activity payload provenance reconcile exactly'
);

CREATE TEMP TABLE fixture_contract_requests AS
WITH linked AS (
  SELECT request.*,
         predecessor.source_reference AS predecessor_source,
         target_request.source_reference || ':' || target.entry_kind::text AS target_entry_key
  FROM public.owner_opening_balance_requests AS request
  LEFT JOIN public.owner_opening_balance_requests AS predecessor
    ON predecessor.id = request.resubmission_of_request_id
  LEFT JOIN public.owner_opening_balance_entries AS target
    ON target.id = request.correction_of_entry_id
  LEFT JOIN public.owner_opening_balance_requests AS target_request
    ON target_request.id = target.request_id
  WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
    AND request.property_id = '10000000-0000-0000-0000-000000000001'
)
SELECT request.*,
       app_private.canonical_financial_payload_hash(
         CASE WHEN request.request_kind = 'initial' THEN jsonb_build_object(
           'organization_id', request.organization_id::text,
           'property_id', request.property_id::text,
           'owner_person_id', request.owner_person_id::text,
           'currency', request.currency::text,
           'effective_date', request.effective_date::text,
           'component', request.component::text,
           'amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
           'reason', request.reason,
           'source_reference', request.source_reference,
           'supporting_document_id', request.supporting_document_id::text,
           'evidence_sha256', request.evidence_sha256,
           'resubmission_of_request_id', request.resubmission_of_request_id::text
         ) ELSE jsonb_build_object(
           'organization_id', request.organization_id::text,
           'entry_id', request.correction_of_entry_id::text,
           'replacement_amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
           'reason', request.reason,
           'source_reference', request.source_reference,
           'supporting_document_id', request.supporting_document_id::text,
           'evidence_sha256', request.evidence_sha256,
           'resubmission_of_request_id', request.resubmission_of_request_id::text
         ) END
       ) AS expected_payload_hash,
       app_private.canonical_financial_payload_hash(
         CASE WHEN request.request_kind = 'initial' THEN jsonb_build_object(
           'organization_id', request.organization_id::text,
           'property_id', request.property_id::text,
           'owner_person_id', request.owner_person_id::text,
           'currency', request.currency::text,
           'effective_date', 'CURRENT_MONTH',
           'component', request.component::text,
           'amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
           'reason', request.reason,
           'source_reference', request.source_reference,
           'supporting_document_id', NULL,
           'evidence_sha256', request.evidence_sha256,
           'resubmission_of_request_id', request.predecessor_source
         ) ELSE jsonb_build_object(
           'organization_id', request.organization_id::text,
           'entry_id', request.target_entry_key,
           'replacement_amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
           'reason', request.reason,
           'source_reference', request.source_reference,
           'supporting_document_id', NULL,
           'evidence_sha256', request.evidence_sha256,
           'resubmission_of_request_id', request.predecessor_source
         ) END
       ) AS canonical_payload_sha256
FROM linked AS request;

CREATE TEMP TABLE fixture_contract_entries AS
SELECT entry.id, entry.request_id, entry.component::text, entry.entry_kind, entry.signed_amount,
       entry.reversal_of_entry_id, entry.property_owner_id, entry.ownership_percent_snapshot,
       entry.ownership_roster_hash, entry.effective_date,
       request.source_reference || ':' || entry.entry_kind::text AS entry_key,
       CASE WHEN reversed.id IS NULL THEN NULL
         ELSE reversed_request.source_reference || ':' || reversed.entry_kind::text END AS reversal_target_entry_key
FROM public.owner_opening_balance_entries AS entry
JOIN public.owner_opening_balance_requests AS request ON request.id = entry.request_id
LEFT JOIN public.owner_opening_balance_entries AS reversed ON reversed.id = entry.reversal_of_entry_id
LEFT JOIN public.owner_opening_balance_requests AS reversed_request ON reversed_request.id = reversed.request_id
WHERE entry.organization_id = '00000000-0000-0000-0000-000000000001'
  AND entry.property_id = '10000000-0000-0000-0000-000000000001';

CREATE TEMP TABLE fixture_expected_request_identity (
  source_reference text PRIMARY KEY,
  component text NOT NULL,
  request_kind text NOT NULL,
  proposed_amount numeric(14,2) NOT NULL,
  status text NOT NULL,
  property_owner_id uuid NOT NULL,
  ownership_percent_snapshot numeric(6,3) NOT NULL,
  ownership_roster_hash text NOT NULL,
  evidence_sha256 text NOT NULL,
  canonical_payload_sha256 text NOT NULL
);
INSERT INTO fixture_expected_request_identity VALUES
  ('FIXTURE-DEPOSIT-CORRECTION-001', 'security_deposit_custody', 'correction', 825.00, 'submitted', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('7', 64), 'b93adb48c935b2d649007162ec1c13618b6ea84cece9f8a98537634f396150ec'),
  ('FIXTURE-OPENING-CASH-001', 'ips_held_owner_cash', 'initial', 1250.00, 'approved', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('1', 64), '6951ee58c0bab000cd45007eca6a690dfbb4ce0d8719fc4d4378b2d2212d8d17'),
  ('FIXTURE-OPENING-DEPOSIT-001', 'security_deposit_custody', 'initial', 800.00, 'approved', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('4', 64), '1fcf3dd32557f5a2210c3205c8d3103b9ec3aacc96211b923c25363b62bc92ec'),
  ('FIXTURE-OPENING-DUE-001', 'ips_due_to_owner', 'initial', 240.50, 'rejected', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('3', 64), 'c4ce77c6ce48ff88dd362cea807b36feb9658260c5e35bf915aa29e314e70dcc'),
  ('FIXTURE-OPENING-DUE-RESUBMIT-001', 'ips_due_to_owner', 'initial', 240.50, 'approved', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('5', 64), 'ae59ba1d64b8ee242daa1fca450b2f05ecfb4ff3d880d09155d7a6b7a4e1e3f9'),
  ('FIXTURE-OPENING-ZERO-001', 'owner_due_to_ips', 'initial', 0.00, 'approved', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('2', 64), 'b4e69449499178e82ee7cddc043d211c78ddf835c3cde2140379293576a72796'),
  ('FIXTURE-ZERO-CORRECTION-001', 'owner_due_to_ips', 'correction', 0.00, 'rejected', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('6', 64), 'f4c9e579ce2054c3071cd1454632b996e7ff2b5500e479d9350f31a4fc99e5d3'),
  ('FIXTURE-ZERO-CORRECTION-RESUBMIT-001', 'owner_due_to_ips', 'correction', 0.00, 'approved', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262', repeat('8', 64), 'd6057ebe7358b5eabb72ce7cd0f89aee6bb20530e5e74d27f8b01e76bd39e026');

CREATE TEMP TABLE fixture_expected_entry_identity (
  entry_key text PRIMARY KEY,
  component text NOT NULL,
  entry_kind text NOT NULL,
  signed_amount numeric(14,2) NOT NULL,
  reversal_target_entry_key text,
  property_owner_id uuid NOT NULL,
  ownership_percent_snapshot numeric(6,3) NOT NULL,
  ownership_roster_hash text NOT NULL
);
INSERT INTO fixture_expected_entry_identity VALUES
  ('FIXTURE-OPENING-CASH-001:opening', 'ips_held_owner_cash', 'opening', 1250.00, NULL, '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262'),
  ('FIXTURE-OPENING-DEPOSIT-001:opening', 'security_deposit_custody', 'opening', 800.00, NULL, '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262'),
  ('FIXTURE-OPENING-DUE-RESUBMIT-001:opening', 'ips_due_to_owner', 'opening', 240.50, NULL, '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262'),
  ('FIXTURE-OPENING-ZERO-001:opening', 'owner_due_to_ips', 'opening', 0.00, NULL, '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262'),
  ('FIXTURE-ZERO-CORRECTION-RESUBMIT-001:correction_replacement', 'owner_due_to_ips', 'correction_replacement', 0.00, NULL, '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262'),
  ('FIXTURE-ZERO-CORRECTION-RESUBMIT-001:correction_reversal', 'owner_due_to_ips', 'correction_reversal', 0.00, 'FIXTURE-OPENING-ZERO-001:opening', '90000000-0000-0000-0000-000000000001', 100.000, '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262');

CREATE TEMP TABLE fixture_contract_transitions AS
SELECT idem.id, idem.idempotency_key, idem.operation, idem.actor_id,
       request.source_reference AS request_source, activity.action,
       idem.payload_hash, activity.new_values->>'payload_hash' AS activity_payload_hash,
       activity.new_values->>'financial_idempotency_request_id' AS activity_idempotency_id,
       CASE WHEN idem.operation = 'review_owner_opening_balance' THEN
         app_private.canonical_financial_payload_hash(jsonb_build_object(
           'organization_id', idem.organization_id::text,
           'request_id', request.id::text,
           'decision', CASE activity.action WHEN 'approved' THEN 'approve' ELSE 'reject' END,
           'review_reason', request.review_reason
         ))
       ELSE request.expected_payload_hash END AS expected_payload_hash,
       CASE WHEN idem.operation = 'review_owner_opening_balance' THEN
         app_private.canonical_financial_payload_hash(jsonb_build_object(
           'organization_id', idem.organization_id::text,
           'request_id', request.source_reference,
           'decision', CASE activity.action WHEN 'approved' THEN 'approve' ELSE 'reject' END,
           'review_reason', request.review_reason
         ))
       ELSE request.canonical_payload_sha256 END AS canonical_payload_sha256
FROM app_private.financial_idempotency_requests AS idem
LEFT JOIN public.activity_logs AS activity
  ON activity.new_values->>'financial_idempotency_request_id' = idem.id::text
 AND activity.entity_type = 'owner_opening_balance_request'
LEFT JOIN pg_temp.fixture_contract_requests AS request ON request.id = activity.entity_id
WHERE idem.organization_id = '00000000-0000-0000-0000-000000000001'
  AND idem.operation IN ('submit_owner_opening_balance', 'review_owner_opening_balance', 'submit_owner_opening_balance_correction');

CREATE TEMP TABLE fixture_expected_transitions (
  idempotency_key text PRIMARY KEY,
  operation text NOT NULL,
  request_source text NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL,
  canonical_payload_sha256 text NOT NULL
);
INSERT INTO fixture_expected_transitions VALUES
  ('fixture-deposit-correction-submit-v1', 'submit_owner_opening_balance_correction', 'FIXTURE-DEPOSIT-CORRECTION-001', 'submitted', '00000000-0000-0000-0000-000000000701', 'b93adb48c935b2d649007162ec1c13618b6ea84cece9f8a98537634f396150ec'),
  ('fixture-opening-deposit-approve-v1', 'review_owner_opening_balance', 'FIXTURE-OPENING-DEPOSIT-001', 'approved', '00000000-0000-0000-0000-000000000101', 'bcd9027432d77ffc248994492ba477a4862f6028cbeb28dc9ce40d3c85e1e8f4'),
  ('fixture-opening-deposit-submit-v1', 'submit_owner_opening_balance', 'FIXTURE-OPENING-DEPOSIT-001', 'submitted', '00000000-0000-0000-0000-000000000801', '1fcf3dd32557f5a2210c3205c8d3103b9ec3aacc96211b923c25363b62bc92ec'),
  ('fixture-opening-due-reject-v1', 'review_owner_opening_balance', 'FIXTURE-OPENING-DUE-001', 'rejected', '00000000-0000-0000-0000-000000000101', 'c10e845bcc235c1360076dfad40bc8dabdcb18632bbb09dc5e13910106ce3321'),
  ('fixture-opening-due-resubmit-approve-v1', 'review_owner_opening_balance', 'FIXTURE-OPENING-DUE-RESUBMIT-001', 'approved', '00000000-0000-0000-0000-000000000101', '7d51410d30bda6390b7b6bd84a19d0aa6b142752d4f838ea773c69590d9af68b'),
  ('fixture-opening-due-resubmit-v1', 'submit_owner_opening_balance', 'FIXTURE-OPENING-DUE-RESUBMIT-001', 'resubmitted', '00000000-0000-0000-0000-000000000801', 'ae59ba1d64b8ee242daa1fca450b2f05ecfb4ff3d880d09155d7a6b7a4e1e3f9'),
  ('fixture-opening-due-submit-v1', 'submit_owner_opening_balance', 'FIXTURE-OPENING-DUE-001', 'submitted', '00000000-0000-0000-0000-000000000801', 'c4ce77c6ce48ff88dd362cea807b36feb9658260c5e35bf915aa29e314e70dcc'),
  ('fixture-opening-held-approve-v1', 'review_owner_opening_balance', 'FIXTURE-OPENING-CASH-001', 'approved', '00000000-0000-0000-0000-000000000101', '508fd55be2857a1e7cfc16c1d4815c72995e7c56b04180881a6b075bfd25cea2'),
  ('fixture-opening-held-submit-v1', 'submit_owner_opening_balance', 'FIXTURE-OPENING-CASH-001', 'submitted', '00000000-0000-0000-0000-000000000801', '6951ee58c0bab000cd45007eca6a690dfbb4ce0d8719fc4d4378b2d2212d8d17'),
  ('fixture-opening-zero-approve-v1', 'review_owner_opening_balance', 'FIXTURE-OPENING-ZERO-001', 'approved', '00000000-0000-0000-0000-000000000101', '0f5fd3de01b9fb14410babf057d50f8a2314c70a4ff8f0d55669c2ad07fe50fc'),
  ('fixture-opening-zero-submit-v1', 'submit_owner_opening_balance', 'FIXTURE-OPENING-ZERO-001', 'submitted', '00000000-0000-0000-0000-000000000801', 'b4e69449499178e82ee7cddc043d211c78ddf835c3cde2140379293576a72796'),
  ('fixture-zero-correction-reject-v1', 'review_owner_opening_balance', 'FIXTURE-ZERO-CORRECTION-001', 'rejected', '00000000-0000-0000-0000-000000000101', '55ecba210390000d37165956ddd1e9e9de181497cf7a8f166febf03310dc8ab4'),
  ('fixture-zero-correction-resubmit-approve-v1', 'review_owner_opening_balance', 'FIXTURE-ZERO-CORRECTION-RESUBMIT-001', 'approved', '00000000-0000-0000-0000-000000000101', '3c36e0778f5916fd8b47303df4992bf247031ad23e8a060a2bff40189570691f'),
  ('fixture-zero-correction-resubmit-v1', 'submit_owner_opening_balance_correction', 'FIXTURE-ZERO-CORRECTION-RESUBMIT-001', 'resubmitted', '00000000-0000-0000-0000-000000000701', 'd6057ebe7358b5eabb72ce7cd0f89aee6bb20530e5e74d27f8b01e76bd39e026'),
  ('fixture-zero-correction-submit-v1', 'submit_owner_opening_balance_correction', 'FIXTURE-ZERO-CORRECTION-001', 'submitted', '00000000-0000-0000-0000-000000000701', 'f4c9e579ce2054c3071cd1454632b996e7ff2b5500e479d9350f31a4fc99e5d3');

CREATE OR REPLACE FUNCTION pg_temp.owner_opening_fixture_violations()
RETURNS text[]
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN (SELECT count(*) FROM pg_temp.fixture_contract_requests) <> 8
      THEN 'request_count' END,
    CASE WHEN (SELECT count(*) FROM pg_temp.fixture_contract_entries) <> 6
      THEN 'entry_count' END,
    CASE WHEN (SELECT count(DISTINCT component) FROM pg_temp.fixture_contract_entries
               WHERE entry_kind IN ('opening', 'correction_replacement')) <> 4
      THEN 'component_completeness' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_temp.fixture_contract_requests
      WHERE property_owner_id <> '90000000-0000-0000-0000-000000000001'
         OR ownership_percent_snapshot <> 100.000
         OR ownership_roster_hash <> '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262'
    ) OR EXISTS (
      SELECT 1 FROM pg_temp.fixture_contract_entries
      WHERE property_owner_id <> '90000000-0000-0000-0000-000000000001'
         OR ownership_percent_snapshot <> 100.000
         OR ownership_roster_hash <> '79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262'
    ) THEN 'ownership_snapshot' END,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_temp.fixture_contract_requests AS request
      FULL JOIN pg_temp.fixture_expected_request_identity AS expected USING (source_reference)
      WHERE request.source_reference IS NULL OR expected.source_reference IS NULL
         OR request.component::text <> expected.component
         OR request.request_kind::text <> expected.request_kind
         OR request.proposed_amount <> expected.proposed_amount
         OR request.status::text <> expected.status
         OR request.property_owner_id <> expected.property_owner_id
         OR request.ownership_percent_snapshot <> expected.ownership_percent_snapshot
         OR request.ownership_roster_hash <> expected.ownership_roster_hash
    ) OR EXISTS (
      SELECT 1
      FROM pg_temp.fixture_contract_entries AS entry
      FULL JOIN pg_temp.fixture_expected_entry_identity AS expected USING (entry_key)
      WHERE entry.entry_key IS NULL OR expected.entry_key IS NULL
         OR entry.component <> expected.component
         OR entry.entry_kind::text <> expected.entry_kind
         OR entry.signed_amount <> expected.signed_amount
         OR entry.reversal_target_entry_key IS DISTINCT FROM expected.reversal_target_entry_key
         OR entry.property_owner_id <> expected.property_owner_id
         OR entry.ownership_percent_snapshot <> expected.ownership_percent_snapshot
         OR entry.ownership_roster_hash <> expected.ownership_roster_hash
    ) THEN 'row_identity' END,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_temp.fixture_contract_requests AS request
      LEFT JOIN pg_temp.fixture_expected_request_identity AS expected
        USING (source_reference)
      WHERE expected.source_reference IS NULL
         OR request.evidence_sha256 <> expected.evidence_sha256
         OR request.payload_hash <> request.expected_payload_hash
         OR request.canonical_payload_sha256 <> expected.canonical_payload_sha256
         OR request.supporting_document_id IS NOT NULL
    ) THEN 'evidence_integrity' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_temp.fixture_contract_requests
      WHERE effective_date <> date_trunc('month', current_date)::date
    ) OR EXISTS (
      SELECT 1 FROM pg_temp.fixture_contract_entries
      WHERE effective_date <> date_trunc('month', current_date)::date
    ) THEN 'effective_month' END,
    CASE WHEN (SELECT count(*) FROM pg_temp.fixture_contract_transitions) <> 15
      OR EXISTS (
        SELECT 1
        FROM pg_temp.fixture_contract_transitions AS transition
        LEFT JOIN pg_temp.fixture_expected_transitions AS expected USING (idempotency_key)
        WHERE expected.idempotency_key IS NULL
           OR transition.operation::text <> expected.operation
           OR transition.request_source <> expected.request_source
           OR transition.action <> expected.action
           OR transition.actor_id <> expected.actor_id
           OR transition.payload_hash <> transition.expected_payload_hash
           OR transition.activity_payload_hash <> transition.payload_hash
           OR transition.activity_idempotency_id <> transition.id::text
           OR transition.canonical_payload_sha256 <> expected.canonical_payload_sha256
      ) THEN 'transition_provenance' END,
    CASE WHEN (SELECT count(*) FROM pg_temp.fixture_contract_requests
               WHERE resubmission_of_request_id IS NOT NULL) <> 2
      OR EXISTS (
        SELECT 1
        FROM pg_temp.fixture_contract_requests AS successor
        LEFT JOIN pg_temp.fixture_contract_requests AS predecessor
          ON predecessor.id = successor.resubmission_of_request_id
        WHERE successor.resubmission_of_request_id IS NOT NULL
          AND (predecessor.id IS NULL OR predecessor.status <> 'rejected'
            OR predecessor.request_kind <> successor.request_kind)
      ) THEN 'predecessor_lineage' END,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_temp.fixture_contract_requests AS correction
      LEFT JOIN pg_temp.fixture_contract_entries AS target
        ON target.id = correction.correction_of_entry_id
      WHERE correction.request_kind = 'correction'
        AND (target.id IS NULL OR target.component <> correction.component::text)
    ) THEN 'correction_target' END,
    CASE WHEN (SELECT count(*) FROM pg_temp.fixture_contract_entries
               WHERE component = 'owner_due_to_ips'
                 AND entry_kind IN ('correction_reversal', 'correction_replacement')
                 AND signed_amount = 0.00) <> 2
      THEN 'authoritative_zero_chain' END,
    CASE WHEN EXISTS (
      SELECT source_reference FROM pg_temp.fixture_contract_requests
      GROUP BY source_reference HAVING count(*) <> 1
    ) THEN 'duplicate_semantic_key' END
  ], NULL);
$$;

SELECT is(
  pg_temp.owner_opening_fixture_violations(),
  ARRAY[]::text[],
  'fixture contract baseline has no reconciliation violations'
);

SAVEPOINT mutate_missing_request;
DELETE FROM fixture_contract_requests
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'request_count' = ANY(pg_temp.owner_opening_fixture_violations()),
  'deleting a request fails the fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_missing_request;

SAVEPOINT mutate_missing_entry;
DELETE FROM fixture_contract_entries
WHERE component = 'security_deposit_custody';
SELECT ok(
  'entry_count' = ANY(pg_temp.owner_opening_fixture_violations())
  AND 'component_completeness' = ANY(pg_temp.owner_opening_fixture_violations()),
  'deleting an authority entry fails count and component completeness'
);
ROLLBACK TO SAVEPOINT mutate_missing_entry;

SAVEPOINT mutate_entry_identity;
UPDATE fixture_contract_entries SET component = 'ips_due_to_owner'
WHERE entry_key = 'FIXTURE-OPENING-CASH-001:opening';
SELECT ok(
  'row_identity' = ANY(pg_temp.owner_opening_fixture_violations()),
  'moving an entry to another valid component fails the exact natural-key oracle'
);
ROLLBACK TO SAVEPOINT mutate_entry_identity;

SAVEPOINT mutate_owner_snapshot;
UPDATE fixture_contract_requests SET ownership_percent_snapshot = 99.000
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'ownership_snapshot' = ANY(pg_temp.owner_opening_fixture_violations()),
  'changing an ownership snapshot fails the fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_owner_snapshot;

SAVEPOINT mutate_owner_identity;
UPDATE fixture_contract_requests
SET property_owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'ownership_snapshot' = ANY(pg_temp.owner_opening_fixture_violations()),
  'a valid but wrong property-owner identity fails the exact fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_owner_identity;

SAVEPOINT mutate_roster_hash;
UPDATE fixture_contract_requests SET ownership_roster_hash = repeat('a', 64)
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'ownership_snapshot' = ANY(pg_temp.owner_opening_fixture_violations()),
  'a valid but wrong roster hash fails the exact fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_roster_hash;

SAVEPOINT mutate_payload_hash;
UPDATE fixture_contract_requests SET payload_hash = repeat('a', 64)
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'evidence_integrity' = ANY(pg_temp.owner_opening_fixture_violations()),
  'a valid but wrong canonical request payload hash fails the exact fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_payload_hash;

SAVEPOINT mutate_effective_month;
UPDATE fixture_contract_requests SET effective_date = effective_date + 1
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'effective_month' = ANY(pg_temp.owner_opening_fixture_violations()),
  'a request date outside the current business month fails the contract'
);
ROLLBACK TO SAVEPOINT mutate_effective_month;

SAVEPOINT mutate_transition_hash;
UPDATE fixture_contract_transitions SET payload_hash = repeat('a', 64)
WHERE idempotency_key = 'fixture-opening-held-approve-v1';
SELECT ok(
  'transition_provenance' = ANY(pg_temp.owner_opening_fixture_violations()),
  'a valid but wrong review idempotency hash fails canonical provenance'
);
ROLLBACK TO SAVEPOINT mutate_transition_hash;

SAVEPOINT mutate_activity_hash;
UPDATE fixture_contract_transitions SET activity_payload_hash = repeat('a', 64)
WHERE idempotency_key = 'fixture-opening-held-submit-v1';
SELECT ok(
  'transition_provenance' = ANY(pg_temp.owner_opening_fixture_violations()),
  'a valid but wrong activity hash fails exact idempotency linkage'
);
ROLLBACK TO SAVEPOINT mutate_activity_hash;

SAVEPOINT mutate_evidence;
UPDATE fixture_contract_requests SET evidence_sha256 = repeat('A', 64)
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'evidence_integrity' = ANY(pg_temp.owner_opening_fixture_violations()),
  'changing an evidence hash away from exact lowercase fails the contract'
);
ROLLBACK TO SAVEPOINT mutate_evidence;

SAVEPOINT mutate_reference;
UPDATE fixture_contract_requests SET supporting_document_id = gen_random_uuid()
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'evidence_integrity' = ANY(pg_temp.owner_opening_fixture_violations()),
  'inventing a fixture document reference fails the reference-only contract'
);
ROLLBACK TO SAVEPOINT mutate_reference;

SAVEPOINT mutate_predecessor;
UPDATE fixture_contract_requests SET resubmission_of_request_id = NULL
WHERE source_reference = 'FIXTURE-OPENING-DUE-RESUBMIT-001';
SELECT ok(
  'predecessor_lineage' = ANY(pg_temp.owner_opening_fixture_violations()),
  'removing a rejected predecessor edge fails the fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_predecessor;

SAVEPOINT mutate_target;
UPDATE fixture_contract_requests SET correction_of_entry_id = gen_random_uuid()
WHERE source_reference = 'FIXTURE-DEPOSIT-CORRECTION-001';
SELECT ok(
  'correction_target' = ANY(pg_temp.owner_opening_fixture_violations()),
  'changing a correction target fails the fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_target;

SAVEPOINT mutate_zero;
UPDATE fixture_contract_entries SET signed_amount = 0.01
WHERE component = 'owner_due_to_ips' AND entry_kind = 'correction_replacement';
SELECT ok(
  'authoritative_zero_chain' = ANY(pg_temp.owner_opening_fixture_violations()),
  'changing either literal zero correction leg fails the fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_zero;

SAVEPOINT mutate_duplicate;
UPDATE fixture_contract_requests SET source_reference = 'FIXTURE-OPENING-CASH-001'
WHERE source_reference = 'FIXTURE-OPENING-ZERO-001';
SELECT ok(
  'duplicate_semantic_key' = ANY(pg_temp.owner_opening_fixture_violations()),
  'duplicating a semantic fixture key fails the contract'
);
ROLLBACK TO SAVEPOINT mutate_duplicate;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SELECT is(
  (SELECT count(*)::integer FROM public.owner_opening_balance_requests),
  0,
  'operations manager cannot read owner-opening authority rows through RLS'
);
SELECT throws_ok(
  $$SELECT public.submit_owner_opening_balance(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000005',
    'USD', date_trunc('month', current_date)::date,
    'ips_held_owner_cash', 1.00, 'Denied operations fixture probe',
    'DENIED-OPS-PROBE', NULL, repeat('a', 64), NULL,
    'fixture-denied-ops-submit-v1'
  )$$,
  '42501',
  'Not authorized to submit owner opening balances',
  'operations manager cannot submit owner opening authority'
);
RESET ROLE;

CREATE TEMP TABLE self_review_probe (request_id uuid);
GRANT SELECT, INSERT ON self_review_probe TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
INSERT INTO self_review_probe
SELECT (public.submit_owner_opening_balance(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000005',
  'USD', date_trunc('month', current_date)::date,
  'ips_held_owner_cash', 1.00, 'Self review fixture probe',
  'SELF-REVIEW-PROBE', NULL, repeat('a', 64), NULL,
  'fixture-self-review-submit-v1'
)->>'request_id')::uuid;
SELECT throws_ok(
  format(
    'SELECT public.review_owner_opening_balance(%L, %L, %L, %L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT request_id FROM self_review_probe),
    'approve', 'Self review must fail', 'fixture-self-review-denied-v1'
  ),
  '22023',
  'Owner opening submitter cannot review the same request',
  'a submit-capable reviewer cannot self-review its own pending request'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT is(
  (public.submit_owner_opening_balance(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD', date_trunc('month', current_date)::date,
    'ips_held_owner_cash', 1250.00,
    'Audited owner cash held at opening', 'FIXTURE-OPENING-CASH-001',
    NULL, repeat('1', 64), NULL, 'fixture-opening-held-submit-v1'
  )->>'request_id')::uuid,
  (SELECT id FROM public.owner_opening_balance_requests
   WHERE source_reference = 'FIXTURE-OPENING-CASH-001'),
  'exact initial replay returns the original fixture request before mutable checks'
);
SELECT throws_ok(
  $$SELECT public.submit_owner_opening_balance(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD', date_trunc('month', current_date)::date,
    'ips_held_owner_cash', 1250.01,
    'Audited owner cash held at opening', 'FIXTURE-OPENING-CASH-001',
    NULL, repeat('1', 64), NULL, 'fixture-opening-held-submit-v1'
  )$$,
  '22023',
  'Conflicting financial idempotency request',
  'changed payload with the same fixture key is rejected'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
