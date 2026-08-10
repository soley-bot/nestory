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
SELECT id, component::text, request_kind, proposed_amount, status,
       correction_of_entry_id, resubmission_of_request_id,
       property_owner_id, ownership_percent_snapshot,
       ownership_roster_hash, source_reference, supporting_document_id,
       evidence_sha256, payload_hash
FROM public.owner_opening_balance_requests
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND property_id = '10000000-0000-0000-0000-000000000001';

CREATE TEMP TABLE fixture_contract_entries AS
SELECT id, request_id, component::text, entry_kind, signed_amount,
       reversal_of_entry_id, property_owner_id, ownership_percent_snapshot,
       ownership_roster_hash
FROM public.owner_opening_balance_entries
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND property_id = '10000000-0000-0000-0000-000000000001';

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
      WHERE property_owner_id IS NULL OR ownership_percent_snapshot <> 100.000
         OR ownership_roster_hash !~ '^[0-9a-f]{64}$'
    ) THEN 'ownership_snapshot' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_temp.fixture_contract_requests
      WHERE evidence_sha256 !~ '^[0-9a-f]{64}$'
         OR payload_hash !~ '^[0-9a-f]{64}$'
         OR source_reference IS NULL OR supporting_document_id IS NOT NULL
    ) THEN 'evidence_integrity' END,
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
        AND (target.id IS NULL OR target.component <> correction.component)
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

SAVEPOINT mutate_owner_snapshot;
UPDATE fixture_contract_requests SET ownership_percent_snapshot = 99.000
WHERE source_reference = 'FIXTURE-OPENING-CASH-001';
SELECT ok(
  'ownership_snapshot' = ANY(pg_temp.owner_opening_fixture_violations()),
  'changing an ownership snapshot fails the fixture contract'
);
ROLLBACK TO SAVEPOINT mutate_owner_snapshot;

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
