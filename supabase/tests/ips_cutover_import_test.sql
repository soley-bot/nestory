BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(55);

CREATE FUNCTION pg_temp.cutover_current_period_start()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('month', current_date)::date
$$;

CREATE FUNCTION pg_temp.cutover_previous_period_start()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (date_trunc('month', current_date) - interval '1 month')::date
$$;

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'ips_cutover_batches',
        'ips_cutover_items',
        'ips_cutover_reconciliations',
        'ips_cutover_transitions'
      )
      AND relation.relkind = 'r'
  ),
  4,
  'all four IPS cutover authority tables exist'
);

SELECT has_function(
  'public',
  'stage_ips_cutover_batch',
  ARRAY['uuid', 'date', 'text', 'jsonb', 'text'],
  'checked cutover staging RPC exists'
);

SELECT has_function(
  'public',
  'commit_ips_cutover_batch',
  ARRAY['uuid', 'uuid', 'text', 'text'],
  'checked cutover commit RPC exists'
);

SELECT has_function(
  'public',
  'abandon_ips_cutover_batch',
  ARRAY['uuid', 'uuid', 'text', 'text'],
  'checked pre-activation abandon RPC exists'
);

SELECT has_function(
  'public',
  'get_ips_cutover_batch',
  ARRAY['uuid', 'uuid'],
  'checked cutover detail RPC exists'
);

SELECT has_function(
  'public',
  'get_ips_cutover_readiness',
  ARRAY['uuid', 'uuid'],
  'checked cutover readiness RPC exists'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid IN (
      'public.ips_cutover_batches'::regclass,
      'public.ips_cutover_items'::regclass,
      'public.ips_cutover_reconciliations'::regclass,
      'public.ips_cutover_transitions'::regclass
    )
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ),
  4,
  'all cutover authority tables use RLS plus FORCE RLS'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM (
      VALUES
        ('ips_cutover_batches'::text),
        ('ips_cutover_items'),
        ('ips_cutover_reconciliations'),
        ('ips_cutover_transitions')
    ) AS expected(table_name)
    WHERE has_table_privilege('authenticated', 'public.' || expected.table_name, 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.' || expected.table_name, 'INSERT,UPDATE,DELETE')
  ),
  4,
  'authenticated roles have policy-scoped read and no direct cutover DML'
);

CREATE OR REPLACE FUNCTION pg_temp.cutover_manifest(p_valid_imports boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'authorityStartDate', (current_date + 1)::text,
    'dataOwner', 'REDACTED-IPS-DATA-OWNER',
    'scope', jsonb_build_object('organizationReference', 'REDACTED-IPS-ORG', 'propertyCode', 'CTR-RES'),
    'importRuns', jsonb_build_array(
      jsonb_build_object('importType','properties','sourceKey','cutover-central-property-v1','sourceClaimHash',CASE WHEN p_valid_imports THEN repeat('1',64) ELSE repeat('9',64) END,'expectedCommittedRows',1),
      jsonb_build_object('importType','units','sourceKey','cutover-central-units-v1','sourceClaimHash',repeat('2',64),'expectedCommittedRows',1),
      jsonb_build_object('importType','people','sourceKey','cutover-central-people-v1','sourceClaimHash',repeat('3',64),'expectedCommittedRows',2),
      jsonb_build_object('importType','leases','sourceKey','cutover-central-lease-v1','sourceClaimHash',repeat('4',64),'expectedCommittedRows',1)
    ),
    'tenantOpeningBalances', jsonb_build_array(
      jsonb_build_object('sourceKey','cutover-central-a01-tenant-balance-v1','propertyCode','CTR-RES','unitNumber','A-01','currency','USD','selectedRentMonths',jsonb_build_array(pg_temp.cutover_previous_period_start(),pg_temp.cutover_current_period_start()),'expectedBalance','875.00')
    ),
    'ownerOpeningComponents', jsonb_build_array(
      jsonb_build_object('sourceKey','cutover-central-held-v1','sourceReference','FIXTURE-OPENING-CASH-001','propertyCode','CTR-RES','component','ips_held_owner_cash','currency','USD','amount','1250.00'),
      jsonb_build_object('sourceKey','cutover-central-owner-due-v1','sourceReference','FIXTURE-OPENING-ZERO-001','propertyCode','CTR-RES','component','owner_due_to_ips','currency','USD','amount','0.00'),
      jsonb_build_object('sourceKey','cutover-central-ips-due-v1','sourceReference','FIXTURE-OPENING-DUE-RESUBMIT-001','propertyCode','CTR-RES','component','ips_due_to_owner','currency','USD','amount','240.50'),
      jsonb_build_object('sourceKey','cutover-central-deposit-v1','sourceReference','FIXTURE-OPENING-DEPOSIT-001','propertyCode','CTR-RES','component','security_deposit_custody','currency','USD','amount','800.00')
    ),
    'signedExceptions', '[]'::jsonb
  )
$function$;

ALTER TABLE public.import_runs DISABLE TRIGGER USER;
INSERT INTO public.import_runs (
  id, organization_id, import_type, status, source_file_name, source_file_size,
  source_mime_type, headers, mapping, total_rows, ready_rows, warning_rows,
  error_rows, created_count, updated_count, failed_count, skipped_count,
  committed_at, source_claim_hash, snapshot_hash
)
VALUES
  ('91000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001','properties','committed','redacted-properties.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('1',64),repeat('a',64)),
  ('91000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000001','units','committed','redacted-units.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('2',64),repeat('b',64)),
  ('91000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000001','people','committed','redacted-people.csv',1,'text/csv','[]','{}',2,2,0,0,2,0,0,0,now(),repeat('3',64),repeat('c',64)),
  ('91000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000001','leases','committed','redacted-leases.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('4',64),repeat('d',64));
ALTER TABLE public.import_runs ENABLE TRIGGER USER;

CREATE TEMP TABLE cutover_test_state (
  ready_stage jsonb,
  blocked_stage jsonb,
  mismatch_stage jsonb,
  mismatch_commit jsonb,
  commit_result jsonb,
  replay_result jsonb
) ON COMMIT DROP;
INSERT INTO cutover_test_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON cutover_test_state TO authenticated;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000701',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.stage_ips_cutover_batch('00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',pg_temp.cutover_manifest(),'cutover-finance-denied-v1')$$,
  '42501',
  'cutover_not_authorized',
  'Finance Manager cannot stage cutover authority'
);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
UPDATE cutover_test_state SET ready_stage = public.stage_ips_cutover_batch(
  '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
  pg_temp.cutover_manifest(),'cutover-ready-stage-v1'
);

SELECT is((SELECT ready_stage->>'status' FROM cutover_test_state),'staged','valid manifest stages ready');
SELECT is((SELECT ready_stage->>'blocker_count' FROM cutover_test_state),'0','valid manifest has zero blockers');
SELECT is(
  (SELECT count(*)::integer FROM public.ips_cutover_items WHERE batch_id = (SELECT (ready_stage->>'batch_id')::uuid FROM cutover_test_state)),
  9,
  'cutover freezes four imports, one tenant opening, and four owner components'
);
SELECT is(
  (SELECT manifest_sha256 FROM public.ips_cutover_batches WHERE id = (SELECT (ready_stage->>'batch_id')::uuid FROM cutover_test_state)),
  encode(extensions.digest(convert_to(pg_temp.cutover_manifest()::text, 'UTF8'), 'sha256'), 'hex'),
  'stored manifest hash independently reproduces'
);
SELECT is(
  (public.get_ips_cutover_readiness('00000000-0000-0000-0000-000000000001',(SELECT (ready_stage->>'batch_id')::uuid FROM cutover_test_state))->>'is_ready')::boolean,
  true,
  'ready manifest reports typed ready state'
);

SELECT has_function(
  'app_private',
  'lock_ips_cutover_selected_months',
  ARRAY['uuid', 'uuid'],
  'cutover has one private globally ordered selected-month lock helper'
);

SELECT is(
  public.stage_ips_cutover_batch(
    '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
    jsonb_set(pg_temp.cutover_manifest(),'{tenantOpeningBalances,0,currency}','"KHR"'::jsonb),
    'cutover-unsupported-currency-v1'
  )->>'status',
  'blocked',
  'unsupported tenant currency stages as a typed blocker'
);
SELECT is(
  public.get_ips_cutover_readiness(
    '00000000-0000-0000-0000-000000000001',
    (public.stage_ips_cutover_batch(
      '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
      jsonb_set(pg_temp.cutover_manifest(),'{tenantOpeningBalances,0,currency}','"KHR"'::jsonb),
      'cutover-unsupported-currency-v1'
    )->>'batch_id')::uuid
  )#>>'{blockers,0,issue_code}',
  'cutover_currency_unsupported',
  'unsupported currency blocker is exact and operator-visible'
);

SELECT is(
  public.stage_ips_cutover_batch(
    '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
    jsonb_set(
      pg_temp.cutover_manifest(),
      '{signedExceptions}',
      jsonb_build_array(jsonb_build_object(
        'sourceKey','cutover-valid-exception-v1',
        'reason','Redacted source exception independently approved',
        'approvedBy','REDACTED-DATA-OWNER',
        'approvedAt','2026-08-10T01:02:03Z'
      ))
    ),
    'cutover-valid-exception-v1'
  )->>'status',
  'staged',
  'canonical signed-exception approval timestamp remains ready'
);
SELECT is(
  public.stage_ips_cutover_batch(
    '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
    jsonb_set(
      pg_temp.cutover_manifest(),
      '{signedExceptions}',
      jsonb_build_array(jsonb_build_object(
        'sourceKey','cutover-invalid-exception-v1',
        'reason','Redacted source exception independently approved',
        'approvedBy','REDACTED-DATA-OWNER',
        'approvedAt','2026-99-99Tnot-a-timestamp'
      ))
    ),
    'cutover-invalid-exception-v1'
  )->>'status',
  'blocked',
  'impossible signed-exception approval timestamp cannot freeze ready evidence'
);
SELECT is(
  public.get_ips_cutover_readiness(
    '00000000-0000-0000-0000-000000000001',
    (public.stage_ips_cutover_batch(
      '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
      jsonb_set(
        pg_temp.cutover_manifest(),
        '{signedExceptions}',
        jsonb_build_array(jsonb_build_object(
          'sourceKey','cutover-invalid-exception-v1',
          'reason','Redacted source exception independently approved',
          'approvedBy','REDACTED-DATA-OWNER',
          'approvedAt','2026-99-99Tnot-a-timestamp'
        ))
      ),
      'cutover-invalid-exception-v1'
    )->>'batch_id')::uuid
  )#>>'{blockers,0,issue_code}',
  'cutover_exception_unsigned',
  'invalid signed-exception timestamp has the exact typed blocker'
);

SELECT throws_ok(
  $$SELECT public.stage_ips_cutover_batch('00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',pg_temp.cutover_manifest() #- '{importRuns,3}','cutover-missing-import-kind-v1')$$,
  '22023','cutover_manifest_import_types_invalid','manifest requires exactly one reconciled run for each import type'
);
SELECT throws_ok(
  $$SELECT public.stage_ips_cutover_batch('00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',pg_temp.cutover_manifest() #- '{ownerOpeningComponents,3}','cutover-missing-owner-component-v1')$$,
  '22023','cutover_manifest_owner_components_invalid','every property and currency requires all four owner opening components'
);
SELECT throws_ok(
  $$SELECT public.stage_ips_cutover_batch(
    '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
    jsonb_set(pg_temp.cutover_manifest(),'{ownerOpeningComponents,3,sourceKey}','"cutover-central-held-v1"'::jsonb),
    'cutover-duplicate-source-v1'
  )$$,
  '22023','cutover_source_key_duplicate','duplicate cutover source keys fail with a typed boundary error'
);

UPDATE cutover_test_state SET blocked_stage = public.stage_ips_cutover_batch(
  '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
  pg_temp.cutover_manifest(false),'cutover-blocked-stage-v1'
);
SELECT is((SELECT blocked_stage->>'status' FROM cutover_test_state),'blocked','missing import authority remains visibly blocked');
SELECT is(
  public.get_ips_cutover_readiness('00000000-0000-0000-0000-000000000001',(SELECT (blocked_stage->>'batch_id')::uuid FROM cutover_test_state))#>>'{blockers,0,issue_code}',
  'cutover_import_run_not_reconciled',
  'readiness returns the exact import blocker'
);

UPDATE cutover_test_state SET mismatch_stage = public.stage_ips_cutover_batch(
  '00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',
  jsonb_set(pg_temp.cutover_manifest(),'{tenantOpeningBalances,0,expectedBalance}','"876.00"'::jsonb),
  'cutover-mismatch-stage-v1'
);
UPDATE cutover_test_state SET mismatch_commit = public.commit_ips_cutover_batch(
  '00000000-0000-0000-0000-000000000001',
  (SELECT (mismatch_stage->>'batch_id')::uuid FROM cutover_test_state),
  'Deliberately mismatched redacted tenant total',
  'cutover-mismatch-commit-v1'
);
SELECT is((SELECT mismatch_commit->>'status' FROM cutover_test_state),'blocked','reconciliation mismatch remains visibly blocked');
SELECT is(
  public.get_ips_cutover_readiness('00000000-0000-0000-0000-000000000001',(SELECT (mismatch_stage->>'batch_id')::uuid FROM cutover_test_state))#>>'{blockers,0,issue_code}',
  'cutover_reconciliation_mismatch',
  'readiness returns the exact persisted reconciliation blocker'
);
SELECT is(
  (SELECT count(*)::integer FROM public.tenant_invoices AS invoice JOIN public.leases AS lease ON lease.id=invoice.lease_id JOIN public.units AS unit ON unit.id=lease.unit_id JOIN public.properties AS property ON property.id=lease.property_id WHERE property.code='CTR-RES' AND unit.unit_number='A-01' AND invoice.billing_period_start=pg_temp.cutover_previous_period_start()),
  0,
  'failed reconciliation rolls back its newly generated tenant invoice atomically'
);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true);
SELECT throws_ok(
  format('SELECT public.get_ips_cutover_batch(%L,%L)','00000000-0000-0000-0000-000000000001',(SELECT ready_stage->>'batch_id' FROM cutover_test_state)),
  '42501','cutover_not_authorized','Operations Manager cannot inspect cutover authority'
);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
SELECT throws_ok(
  format('SELECT public.get_ips_cutover_batch(%L,%L)','00000000-0000-0000-0000-000000000002',(SELECT ready_stage->>'batch_id' FROM cutover_test_state)),
  '42501','cutover_not_authorized','cross-tenant cutover read is denied'
);

UPDATE cutover_test_state SET commit_result = public.commit_ips_cutover_batch(
  '00000000-0000-0000-0000-000000000001',
  (SELECT (ready_stage->>'batch_id')::uuid FROM cutover_test_state),
  'Redacted source totals independently checked',
  'cutover-ready-commit-v1'
);
SELECT is((SELECT commit_result->>'status' FROM cutover_test_state),'reconciled','ready cutover reconciles');
SELECT is(
  (SELECT count(*)::integer FROM public.tenant_invoices AS invoice JOIN public.leases AS lease ON lease.id=invoice.lease_id JOIN public.units AS unit ON unit.id=lease.unit_id JOIN public.properties AS property ON property.id=lease.property_id WHERE property.code='CTR-RES' AND unit.unit_number='A-01' AND invoice.billing_period_start IN (pg_temp.cutover_previous_period_start(),pg_temp.cutover_current_period_start())),
  2,
  'only both explicitly selected tenant months exist'
);
SELECT is(
  (SELECT count(*)::integer FROM public.tenant_invoices AS invoice JOIN public.leases AS lease ON lease.id=invoice.lease_id JOIN public.units AS unit ON unit.id=lease.unit_id JOIN public.properties AS property ON property.id=lease.property_id WHERE property.code='CTR-RES' AND unit.unit_number='A-01' AND invoice.billing_period_start=(pg_temp.cutover_previous_period_start() - interval '1 month')::date),
  0,
  'adjacent unselected June is not silently generated'
);
SELECT is(
  (SELECT to_char(sum(balance.balance_due),'FM999999999990.00') FROM public.tenant_invoice_balances AS balance JOIN public.tenant_invoices AS invoice ON invoice.id=balance.id JOIN public.leases AS lease ON lease.id=invoice.lease_id JOIN public.units AS unit ON unit.id=lease.unit_id JOIN public.properties AS property ON property.id=lease.property_id WHERE property.code='CTR-RES' AND unit.unit_number='A-01' AND invoice.billing_period_start IN (pg_temp.cutover_previous_period_start(),pg_temp.cutover_current_period_start())),
  '875.00',
  'selected tenant opening balance reconciles exactly'
);
SELECT is(
  (SELECT differences FROM public.ips_cutover_reconciliations WHERE id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)),
  '[]'::jsonb,
  'reconciled cutover has zero unexplained difference'
);
SELECT is(
  (SELECT expected_totals = actual_totals FROM public.ips_cutover_reconciliations WHERE id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)),
  true,
  'tenant and all four owner totals match exact source totals'
);
SELECT is(
  (SELECT expected_totals->'cutover-central-a01-tenant-balance-v1' FROM public.ips_cutover_reconciliations WHERE id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)),
  jsonb_build_object('amount','875.00','currency','USD'),
  'tenant reconciliation freezes exact amount plus currency identity'
);
SELECT is(
  (SELECT actual_totals->'cutover-central-held-v1' FROM public.ips_cutover_reconciliations WHERE id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)),
  jsonb_build_object('amount','1250.00','currency','USD'),
  'owner reconciliation freezes exact amount plus currency identity'
);
SELECT is(
  (SELECT count(DISTINCT invoice.currency)::integer FROM public.tenant_invoices AS invoice JOIN public.leases AS lease ON lease.id=invoice.lease_id JOIN public.units AS unit ON unit.id=lease.unit_id JOIN public.properties AS property ON property.id=lease.property_id WHERE property.code='CTR-RES' AND unit.unit_number='A-01' AND invoice.billing_period_start IN (pg_temp.cutover_previous_period_start(),pg_temp.cutover_current_period_start()) AND invoice.currency='USD'),
  1,
  'selected invoice reconciliation is constrained to the frozen USD authority'
);
SELECT is(
  (SELECT to_jsonb(reconciliation)->'expected_counts' FROM public.ips_cutover_reconciliations AS reconciliation WHERE id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)),
  jsonb_build_object('cutover-central-property-v1',1,'cutover-central-units-v1',1,'cutover-central-people-v1',2,'cutover-central-lease-v1',1),
  'reconciliation freezes every expected import entity count'
);
SELECT is(
  (SELECT to_jsonb(reconciliation)->'actual_counts' FROM public.ips_cutover_reconciliations AS reconciliation WHERE id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)),
  jsonb_build_object('cutover-central-property-v1',1,'cutover-central-units-v1',1,'cutover-central-people-v1',2,'cutover-central-lease-v1',1),
  'reconciliation independently freezes every actual import entity count'
);
SELECT is(
  (SELECT reconciliation_sha256 FROM public.ips_cutover_reconciliations WHERE id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)),
  (
    SELECT encode(extensions.digest(convert_to(jsonb_build_object(
      'manifest_sha256', batch.manifest_sha256,
      'expected_counts', to_jsonb(reconciliation)->'expected_counts',
      'actual_counts', to_jsonb(reconciliation)->'actual_counts',
      'expected_totals', reconciliation.expected_totals,
      'actual_totals', reconciliation.actual_totals,
      'differences', reconciliation.differences
    )::text,'UTF8'),'sha256'),'hex')
    FROM public.ips_cutover_reconciliations AS reconciliation
    JOIN public.ips_cutover_batches AS batch ON batch.id=reconciliation.batch_id
    WHERE reconciliation.id=(SELECT (commit_result->>'reconciliation_id')::uuid FROM cutover_test_state)
  ),
  'reconciliation hash independently reproduces counts, money, and differences'
);

UPDATE cutover_test_state SET replay_result = public.commit_ips_cutover_batch(
  '00000000-0000-0000-0000-000000000001',
  (SELECT (ready_stage->>'batch_id')::uuid FROM cutover_test_state),
  'Redacted source totals independently checked',
  'cutover-ready-commit-v1'
);
SELECT is((SELECT replay_result FROM cutover_test_state),(SELECT commit_result FROM cutover_test_state),'exact cutover commit replay returns identical authority IDs');
SELECT throws_ok(
  format('SELECT public.commit_ips_cutover_batch(%L,%L,%L,%L)','00000000-0000-0000-0000-000000000001',(SELECT ready_stage->>'batch_id' FROM cutover_test_state),'Different signoff reason is a conflict','cutover-ready-commit-v1'),
  '22023','Conflicting financial idempotency request','conflicting cutover replay is rejected atomically'
);
SELECT throws_ok(
  format('UPDATE public.ips_cutover_batches SET data_owner=%L WHERE id=%L','forged',(SELECT ready_stage->>'batch_id' FROM cutover_test_state)),
  '42501','permission denied for table ips_cutover_batches','direct cutover mutation is denied'
);
SELECT throws_ok(
  format('DELETE FROM public.ips_cutover_items WHERE batch_id=%L',(SELECT ready_stage->>'batch_id' FROM cutover_test_state)),
  '42501','permission denied for table ips_cutover_items','cutover evidence deletion is denied'
);
SELECT throws_ok(
  format('SELECT public.abandon_ips_cutover_batch(%L,%L,%L,%L)','00000000-0000-0000-0000-000000000001',(SELECT ready_stage->>'batch_id' FROM cutover_test_state),'A reconciled batch is immutable','cutover-abandon-reconciled-v1'),
  '55000','cutover_batch_irreversible','a reconciled cutover cannot be abandoned'
);

SELECT is(
  public.abandon_ips_cutover_batch(
    '00000000-0000-0000-0000-000000000001',
    (SELECT (blocked_stage->>'batch_id')::uuid FROM cutover_test_state),
    'Replace with a corrected manifest',
    'cutover-abandon-blocked-v1'
  )->>'status',
  'abandoned',
  'pre-activation blocked manifest can be abandoned with reason'
);
SELECT throws_ok(
  format('SELECT public.commit_ips_cutover_batch(%L,%L,%L,%L)','00000000-0000-0000-0000-000000000001',(SELECT blocked_stage->>'batch_id' FROM cutover_test_state),'Cannot commit abandoned cutover','cutover-abandoned-commit-v1'),
  '23514','cutover_batch_not_ready','abandoned cutover cannot commit'
);
SELECT is(
  (SELECT count(*)::integer FROM public.ips_cutover_transitions WHERE batch_id IN (SELECT (ready_stage->>'batch_id')::uuid FROM cutover_test_state UNION ALL SELECT (blocked_stage->>'batch_id')::uuid FROM cutover_test_state)),
  4,
  'stage, reconcile, block, and abandon transitions remain append-only'
);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.stage_ips_cutover_batch('00000000-0000-0000-0000-000000000001',current_date + 1,'REDACTED-IPS-DATA-OWNER',pg_temp.cutover_manifest(),'cutover-anon-denied-v1')$$,
  '42501','permission denied for function stage_ips_cutover_batch','anonymous callers cannot invoke cutover authority'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::integer FROM (
      VALUES
        ('stage_ips_cutover_batch(uuid,date,text,jsonb,text)'::regprocedure),
        ('commit_ips_cutover_batch(uuid,uuid,text,text)'::regprocedure),
        ('abandon_ips_cutover_batch(uuid,uuid,text,text)'::regprocedure),
        ('get_ips_cutover_batch(uuid,uuid)'::regprocedure),
        ('get_ips_cutover_readiness(uuid,uuid)'::regprocedure)
    ) AS expected(procedure_oid)
    WHERE has_function_privilege('authenticated', expected.procedure_oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', expected.procedure_oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', expected.procedure_oid, 'EXECUTE')
  ),
  5,
  'only authenticated sessions can enter all five checked public cutover RPCs'
);
SELECT is(
  (
    SELECT count(*)::integer FROM (
      VALUES
        ('app_private.guard_ips_cutover_authority()'::regprocedure),
        ('app_private.assert_ips_cutover_manifest_shape()'::regprocedure),
        ('app_private.ips_cutover_sha256(jsonb)'::regprocedure),
        ('app_private.lock_ips_cutover_scope(uuid)'::regprocedure),
        ('app_private.validate_ips_cutover_item(uuid,date,text,jsonb)'::regprocedure)
    ) AS helper(procedure_oid)
    WHERE NOT has_function_privilege('anon', helper.procedure_oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', helper.procedure_oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', helper.procedure_oid, 'EXECUTE')
  ),
  5,
  'cutover implementation helpers remain private to database authority'
);
SELECT is(
  (
    SELECT count(*)::integer FROM (
      VALUES
        ('app_private.is_canonical_ips_cutover_approval_timestamp(text)'::regprocedure),
        ('app_private.lock_ips_cutover_selected_months(uuid,uuid)'::regprocedure)
    ) AS helper(procedure_oid)
    WHERE NOT has_function_privilege('anon', helper.procedure_oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', helper.procedure_oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', helper.procedure_oid, 'EXECUTE')
  ),
  2,
  'correction helpers remain private to database authority'
);
SELECT is(
  (SELECT count(*)::integer FROM app_private.financial_idempotency_requests WHERE operation LIKE '%ips_cutover_batch' AND status='pending'),
  0,
  'cutover leaves no pending idempotency requests'
);

SELECT * FROM finish();

ROLLBACK;
