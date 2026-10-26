// Pure transaction construction; no connections, credentials, role/JWT
// fabrication, runner, or dispatch. Commit requires exact approval binding.
import { buildServerResetMaintenanceCaptureSql } from './pilot-finance-reset-server-materializer.mjs';
import { buildMaintenanceGuardSql, MAINTENANCE_ORGANIZATION } from './pilot-finance-reset-maintenance-guards.mjs';
import { RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const org = `${lit(MAINTENANCE_ORGANIZATION)}::uuid`;
const preserved = Object.entries(RESET_REGISTRY).filter(([, rule]) => ['preserve','retire-intent'].includes(rule.disposition) && rule.scope)
  .map(([table]) => table).filter(table => !table.startsWith('app_private.financial_reset_') &&
    !['public.activity_logs','app_private.financial_write_controls','app_private.financial_report_source_revisions'].includes(table));
const removal = Object.entries(RESET_REGISTRY).filter(([, rule]) => rule.disposition === 'archive-remove').map(([table]) => table);
const normalized = Object.entries(RESET_REGISTRY).filter(([, rule]) => rule.disposition === 'normalize-reviewed').map(([table]) => table);

// The existing invoice is an exact original-date expectation, not a template
// copied into a new invoice. The unchanged billing generator computes the new
// amount/fee and the composer compares its result to this reviewed expectation.
const billingCte = `WITH active AS (SELECT * FROM public.leases WHERE organization_id=${org}
  AND archived_at IS NULL AND status IN ('active','notice_given')),
roster AS (SELECT l.id lease_id,
 CASE WHEN EXISTS(SELECT 1 FROM public.lease_terms t WHERE t.organization_id=l.organization_id AND t.lease_id=l.id
   AND t.archived_at IS NULL AND t.authority_kind='authoritative' AND t.status IN ('active','upcoming')
   AND t.start_date<=DATE '2026-10-31' AND t.end_date>=DATE '2026-10-01') THEN 'bill' ELSE 'defer-expired-unbilled' END disposition,
 (SELECT count(*) FROM public.tenant_invoices i WHERE i.organization_id=l.organization_id AND i.lease_id=l.id
   AND i.billing_period_start=DATE '2026-10-01' AND i.billing_period_end=DATE '2026-10-31' AND i.lifecycle='issued' AND i.voided_at IS NULL) invoice_count,
 (SELECT to_jsonb(i) FROM public.tenant_invoices i WHERE i.organization_id=l.organization_id AND i.lease_id=l.id
   AND i.billing_period_start=DATE '2026-10-01' AND i.billing_period_end=DATE '2026-10-31' AND i.lifecycle='issued' AND i.voided_at IS NULL ORDER BY i.id LIMIT 1) original_invoice
 FROM active l),
review AS (SELECT coalesce(jsonb_agg(jsonb_build_object('lease_id',lease_id,'disposition',disposition,'invoice_count',invoice_count,
 'original_invoice',original_invoice,'deferred_source',CASE WHEN disposition='defer-expired-unbilled'
 THEN app_private.financial_reset_deferred_lease_source(${org},lease_id,DATE '2026-10-01') ELSE NULL END) ORDER BY lease_id),'[]'::jsonb) payload FROM roster)`;

export function buildAdminMaintenanceBillingPreviewSql() {
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL timezone='UTC';
${billingCte}
SELECT jsonb_build_object('billing_review_sha256',app_private.financial_reset_hash(payload),
 'bill_count',(SELECT count(*) FROM jsonb_array_elements(payload) x WHERE x->>'disposition'='bill'),
 'deferred_count',(SELECT count(*) FROM jsonb_array_elements(payload) x WHERE x->>'disposition'='defer-expired-unbilled'),
 'original_rent_total',(SELECT coalesce(sum((x->'original_invoice'->>'total_amount')::numeric),0) FROM jsonb_array_elements(payload) x WHERE x->>'disposition'='bill'),
 'original_fee_total',(SELECT coalesce(sum((x->'original_invoice'->>'management_fee_amount')::numeric),0) FROM jsonb_array_elements(payload) x WHERE x->>'disposition'='bill')) summary FROM review;
COMMIT;`;
}

export function adminMaintenanceApprovalBinding(request) {
  return { scopeSha256: hashBytes(canonicalJson(request)),
    confirmation: `COMMIT PILOT OCTOBER RESET ${request?.scope?.operationId} ${request?.expectedManifestSha256} WITHOUT BACKUP` };
}

export function buildAdminMaintenanceRehearsalSql(request) { return buildTransaction(request, 'ROLLBACK'); }

export function buildAdminMaintenanceCommitSql(request, approval) {
  const expected = adminMaintenanceApprovalBinding(request);
  if (!approval || Object.keys(approval).sort().join(',') !== 'confirmation,scopeSha256' ||
      approval.scopeSha256 !== expected.scopeSha256 || approval.confirmation !== expected.confirmation) throw Error('admin_maintenance_exact_approval_required');
  return buildTransaction(request, 'COMMIT');
}

function buildTransaction(request, terminator) {
  if (!request || Object.keys(request).sort().join(',') !== 'billingReviewSha256,expectedDeferredCount,expectedGuards,expectedManifestSha256,requestedBy,scope' ||
      request.scope?.organizationId !== MAINTENANCE_ORGANIZATION || request.scope.sourceGeneration !== 0 ||
      !uuid.test(request.requestedBy ?? '') || !digest.test(request.expectedManifestSha256 ?? '') || !digest.test(request.billingReviewSha256 ?? '') ||
      !Number.isSafeInteger(request.expectedDeferredCount) || request.expectedDeferredCount < 0) throw Error('admin_maintenance_request_invalid');
  const guard = buildMaintenanceGuardSql({ operationId: request.scope.operationId, manifestSha256: request.expectedManifestSha256,
    expectedGuards: request.expectedGuards });
  const capture = buildServerResetMaintenanceCaptureSql({ scope: request.scope, expectedManifestSha256: request.expectedManifestSha256 });
  const lockTables = Object.entries(RESET_REGISTRY).filter(([, rule]) => rule.scope).map(([name]) => name).sort().join(',');
  return `BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL standard_conforming_strings=on; SET LOCAL timezone='UTC'; SET LOCAL search_path=pg_catalog,public;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; SET LOCAL idle_in_transaction_session_timeout='150s';
DO $maintenance_admission$ BEGIN
 IF session_user NOT IN ('postgres','supabase_admin') OR current_user<>session_user OR auth.uid() IS NOT NULL
  OR coalesce(current_setting('request.jwt.claims',true),'') NOT IN ('','{}') OR coalesce(current_setting('request.method',true),'')<>''
  OR coalesce(current_setting('role',true),'none') NOT IN ('none','postgres','supabase_admin')
  OR current_setting('session_replication_role')<>'origin' OR current_setting('row_security')<>'on' THEN
  RAISE EXCEPTION 'maintenance_fresh_administrator_session_required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['app.financial_projection_context','app.finance_settlement_context','app.tenant_invoice_settlement_context']) k
   WHERE coalesce(current_setting(k,true),'') NOT IN ('','off')) THEN RAISE EXCEPTION 'maintenance_ambient_capability_forbidden'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=${org})
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE organization_id=${org})
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations WHERE organization_id=${org}) THEN
  RAISE EXCEPTION 'maintenance_prior_enrollment_reconcile_required'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.deposit_rent_journal_intents WHERE organization_id=${org})
   OR EXISTS(SELECT 1 FROM app_private.deposit_rent_journal_slots WHERE organization_id=${org}) THEN
  RAISE EXCEPTION 'maintenance_deposit_journal_must_be_empty'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=${org} AND user_id=${lit(request.requestedBy)}::uuid
    AND role='super_admin' AND branch_id IS NULL AND person_id IS NULL) THEN
  RAISE EXCEPTION 'maintenance_existing_requested_by_superadmin_required' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('app_private.assert_financial_request_current(uuid,text,text)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='app_private.financial_idempotency_requests'::regclass AND attname='financial_generation' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'maintenance_persistent_generation_retirement_release_required'; END IF;
END $maintenance_admission$;
SELECT pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||${org}::text,0));
LOCK TABLE ${lockTables} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE nestory_maintenance_context(operation_id uuid PRIMARY KEY,organization_id uuid NOT NULL,manifest_sha256 text NOT NULL,
 backend_pid integer NOT NULL,transaction_id text NOT NULL,current_action_id uuid,requested_by uuid NOT NULL,started_at timestamptz NOT NULL) ON COMMIT DROP;
INSERT INTO pg_temp.nestory_maintenance_context VALUES(${lit(request.scope.operationId)}::uuid,${org},${lit(request.expectedManifestSha256)},
 pg_backend_pid(),txid_current()::text,NULL,${lit(request.requestedBy)}::uuid,statement_timestamp());
${capture}
CREATE TEMP TABLE nestory_maintenance_billing(payload jsonb NOT NULL) ON COMMIT DROP;
${billingCte} INSERT INTO pg_temp.nestory_maintenance_billing SELECT payload FROM review;
DO $maintenance_billing_review$ DECLARE r jsonb;i jsonb; BEGIN
 SELECT payload INTO STRICT r FROM pg_temp.nestory_maintenance_billing;
 IF app_private.financial_reset_hash(r)<>${lit(request.billingReviewSha256)} OR
   (SELECT count(*) FROM jsonb_array_elements(r) x WHERE x->>'disposition'='defer-expired-unbilled')<>${request.expectedDeferredCount} THEN
  RAISE EXCEPTION 'maintenance_billing_review_changed'; END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(r) WHERE value->>'disposition'='bill' LOOP
  IF i->>'invoice_count'<>'1' OR i->'original_invoice'->>'issue_date'<>'2026-10-01' OR (i->'original_invoice'->>'due_date')::date<DATE '2026-10-01'
    OR i->'original_invoice'->>'currency'<>'USD' OR (i->'original_invoice'->>'total_amount')::numeric<=0 THEN
   RAISE EXCEPTION 'maintenance_original_october_invoice_required'; END IF;
 END LOOP;
END $maintenance_billing_review$;
CREATE TEMP TABLE nestory_maintenance_preserved(relation_name text PRIMARY KEY,image_sha256 text NOT NULL) ON COMMIT DROP;
DO $maintenance_preserve$ DECLARE n text;h text;BEGIN
 FOREACH n IN ARRAY ARRAY[${preserved.map(lit).join(',')}] LOOP
  EXECUTE format('SELECT app_private.financial_reset_hash(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)) FROM %s t WHERE %I=$1',
    n::regclass,CASE WHEN n='public.organizations' THEN 'id' ELSE 'organization_id' END) INTO h USING ${org};
  INSERT INTO pg_temp.nestory_maintenance_preserved VALUES(n,h);
 END LOOP;
END $maintenance_preserve$;
DO $maintenance_actions$ DECLARE a record;actual jsonb;changed integer;assignments text;stamped jsonb;actors jsonb;BEGIN
 -- Calculate only the two existing native timestamp/audit triggers' effects.
 -- Their definitions are included in the approved catalog digest. One outer
 -- statement keeps statement_timestamp stable through installation and DML.
 FOR a IN SELECT * FROM pg_temp.nestory_maintenance_actions WHERE kind='UPDATE' ORDER BY ordinal LOOP
  stamped:=a.after_row;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=a.relation_oid AND tgfoid='public.set_updated_at()'::regprocedure AND tgenabled<>'D') AND stamped ? 'updated_at' THEN
   stamped:=stamped||jsonb_build_object('updated_at',transaction_timestamp());
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=a.relation_oid AND tgfoid='app_private.stamp_financial_record()'::regprocedure AND tgenabled<>'D') THEN
   actors:=coalesce(nullif(a.before_row->'audit_actors','null'::jsonb),jsonb_build_object('createdBy',a.before_row->'created_by','updatedBy',a.before_row->'updated_by'));
   actors:=actors||jsonb_build_object('updatedBy',coalesce(stamped->'updated_by',actors->'createdBy'));
   stamped:=stamped||jsonb_build_object('audit_actors',actors);
   IF stamped ? 'updated_at' THEN stamped:=stamped||jsonb_build_object('updated_at',statement_timestamp()); END IF;
  END IF;
  stamped:=app_private.financial_reset_typed_row(a.relation_oid,stamped);
  IF stamped-ARRAY['updated_at','audit_actors'] IS DISTINCT FROM a.after_row-ARRAY['updated_at','audit_actors'] THEN
   RAISE EXCEPTION 'maintenance_native_audit_patch_changed_business_fields'; END IF;
  UPDATE pg_temp.nestory_maintenance_actions SET before_row=stamped,before_sha256=app_private.financial_reset_hash(stamped)
   WHERE relation_oid=a.relation_oid AND primary_key=a.primary_key AND kind='DELETE' AND ordinal>a.ordinal AND before_row=a.after_row;
  UPDATE pg_temp.nestory_maintenance_actions SET after_row=stamped,after_sha256=app_private.financial_reset_hash(stamped) WHERE action_id=a.action_id;
 END LOOP;
 EXECUTE ${lit(guard.installSql)};
 FOR a IN SELECT * FROM pg_temp.nestory_maintenance_actions ORDER BY ordinal LOOP
  UPDATE pg_temp.nestory_maintenance_context SET current_action_id=a.action_id;
  IF a.kind='DELETE' THEN
   EXECUTE format('DELETE FROM %s t WHERE to_jsonb(t) @> $1 AND app_private.financial_reset_hash(to_jsonb(t))=$2',a.relation_oid::regclass)
    USING a.primary_key,a.before_sha256;
  ELSE
   SELECT string_agg(format('%I=(jsonb_populate_record(NULL::%s,$1)).%I',k,a.relation_oid::regclass,k),',' ORDER BY k)
    INTO assignments FROM jsonb_object_keys(a.after_row) k WHERE a.before_row->k IS DISTINCT FROM a.after_row->k;
   IF assignments IS NULL THEN RAISE EXCEPTION 'maintenance_empty_update_not_allowed'; END IF;
   EXECUTE format('UPDATE %s t SET %s WHERE to_jsonb(t) @> $2 AND app_private.financial_reset_hash(to_jsonb(t))=$3',a.relation_oid::regclass,assignments)
    USING a.after_row,a.primary_key,a.before_sha256;
  END IF;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'maintenance_exact_action_source_changed'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE to_jsonb(t) @> $1',a.relation_oid::regclass) INTO actual USING a.primary_key;
  IF (a.kind='DELETE' AND actual IS NOT NULL) OR (a.kind='UPDATE' AND (actual IS DISTINCT FROM a.after_row OR app_private.financial_reset_hash(actual) IS DISTINCT FROM a.after_sha256)) THEN
   RAISE EXCEPTION 'maintenance_exact_action_result_changed'; END IF;
  UPDATE pg_temp.nestory_maintenance_actions SET applied=true WHERE action_id=a.action_id;
 END LOOP;
 UPDATE pg_temp.nestory_maintenance_context SET current_action_id=NULL;
 EXECUTE ${lit(guard.restoreSql)};
 EXECUTE ${lit(guard.assertRestoredSql)};
END $maintenance_actions$;
${guard.assertRestoredSql}
DO $maintenance_zero$ DECLARE n text;present boolean;BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_actions WHERE NOT applied) THEN RAISE EXCEPTION 'maintenance_actions_incomplete'; END IF;
 FOREACH n IN ARRAY ARRAY[${removal.map(lit).join(',')}] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE organization_id=$1)',n::regclass) INTO present USING ${org};
  IF present THEN RAISE EXCEPTION 'maintenance_financial_source_not_empty: %',n; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.lease_deposits WHERE organization_id=${org} AND status IN ('held','received','partially_returned')) THEN
  RAISE EXCEPTION 'maintenance_recorded_deposit_not_cleared'; END IF;
END $maintenance_zero$;
-- Enroll after old-row actions: retained completed requests stay byte-identical,
-- and existing persistent generation guards reject their keys after commit.
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date) VALUES(${org},1,'frozen','2026-10-01');
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=${org};
DO $maintenance_billing$ DECLARE r jsonb;i jsonb;v public.tenant_invoices%ROWTYPE;new_id uuid;BEGIN
 IF app_private.begin_financial_scheduled_scope(${org}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'maintenance_generation_not_open'; END IF;
 SELECT payload INTO STRICT r FROM pg_temp.nestory_maintenance_billing;
 FOR i IN SELECT value FROM jsonb_array_elements(r) ORDER BY value->>'lease_id' LOOP
  IF i->>'disposition'='defer-expired-unbilled' THEN
   IF EXISTS(SELECT 1 FROM public.tenant_invoices WHERE organization_id=${org} AND lease_id=(i->>'lease_id')::uuid) THEN RAISE EXCEPTION 'maintenance_deferred_lease_billed'; END IF;
   CONTINUE;
  END IF;
  new_id:=app_private.generate_simple_lease_rent_invoice(${org},(i->>'lease_id')::uuid,'2026-10-01','2026-10-01','activation_catch_up',
    ${lit(request.requestedBy)}::uuid,(i->'original_invoice'->>'billing_term_id')::uuid);
  SELECT * INTO STRICT v FROM public.tenant_invoices WHERE organization_id=${org} AND id=new_id;
  IF v.id=(i->'original_invoice'->>'id')::uuid OR v.lease_term_id IS DISTINCT FROM (i->'original_invoice'->>'lease_term_id')::uuid
   OR v.billing_term_id IS DISTINCT FROM (i->'original_invoice'->>'billing_term_id')::uuid OR v.issue_date<>DATE '2026-10-01'
   OR v.due_date IS DISTINCT FROM (i->'original_invoice'->>'due_date')::date
   OR v.billing_period_start<>DATE '2026-10-01' OR v.billing_period_end<>DATE '2026-10-31' OR v.lifecycle<>'issued'
   OR v.total_amount IS DISTINCT FROM (i->'original_invoice'->>'total_amount')::numeric OR v.management_fee_amount IS DISTINCT FROM (i->'original_invoice'->>'management_fee_amount')::numeric
   OR v.currency::text IS DISTINCT FROM i->'original_invoice'->>'currency' OR v.recipient_person_id IS DISTINCT FROM (i->'original_invoice'->>'recipient_person_id')::uuid
   OR v.collection_route IS DISTINCT FROM i->'original_invoice'->>'collection_route' OR v.created_at<(SELECT started_at FROM pg_temp.nestory_maintenance_context)
   OR v.generated_at<(SELECT started_at FROM pg_temp.nestory_maintenance_context) THEN RAISE EXCEPTION 'maintenance_october_billing_mismatch'; END IF;
  IF (SELECT coalesce(sum(amount),0) FROM public.tenant_invoice_lines WHERE organization_id=${org} AND invoice_id=v.id AND line_type='rent')<>v.total_amount
   OR (SELECT coalesce(sum(amount),0) FROM public.tenant_invoice_rent_segments WHERE organization_id=${org} AND invoice_id=v.id)<>v.total_amount
   OR (SELECT coalesce(sum(amount),0) FROM public.management_fee_occurrences WHERE organization_id=${org} AND tenant_invoice_id=v.id)<>v.management_fee_amount THEN
   RAISE EXCEPTION 'maintenance_billing_lineage_mismatch'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.tenant_invoices WHERE organization_id=${org})<>(SELECT count(*) FROM jsonb_array_elements(r) x WHERE x->>'disposition'='bill') THEN
  RAISE EXCEPTION 'maintenance_billing_roster_mismatch'; END IF;
END $maintenance_billing$;
DO $maintenance_reconcile$ DECLARE p record;h text;r record;reviewed jsonb;expected jsonb;actual jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=${org} AND generation=1 AND status='open'
   AND financial_start_date=DATE '2026-10-01') THEN RAISE EXCEPTION 'maintenance_control_postcondition_failed'; END IF;
 FOR p IN SELECT * FROM pg_temp.nestory_maintenance_preserved LOOP
  EXECUTE format('SELECT app_private.financial_reset_hash(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)) FROM %s t WHERE %I=$1',
   p.relation_name::regclass,CASE WHEN p.relation_name='public.organizations' THEN 'id' ELSE 'organization_id' END) INTO h USING ${org};
  IF h<>p.image_sha256 THEN RAISE EXCEPTION 'maintenance_preserved_relation_changed: %',p.relation_name; END IF;
 END LOOP;
 FOR reviewed IN SELECT x FROM pg_temp.nestory_maintenance_materialized m CROSS JOIN LATERAL jsonb_array_elements(m.archive) x
   WHERE x->>'relation_name'=ANY(ARRAY[${normalized.map(lit).join(',')}]) LOOP
  SELECT a.after_row INTO expected FROM pg_temp.nestory_maintenance_actions a
   WHERE a.relation_name=reviewed->>'relation_name' AND a.primary_key=reviewed->'primary_key' AND a.applied ORDER BY a.ordinal DESC LIMIT 1;
  IF NOT FOUND THEN expected:=(reviewed->>'row_text')::jsonb; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE to_jsonb(t) @> $1',(reviewed->>'relation_name')::regclass)
   INTO actual USING reviewed->'primary_key';
  IF actual IS DISTINCT FROM expected OR app_private.financial_reset_hash(actual) IS DISTINCT FROM app_private.financial_reset_hash(expected) THEN
   RAISE EXCEPTION 'maintenance_reviewed_projection_changed: %',reviewed->>'relation_name'; END IF;
 END LOOP;
 IF app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(${org})) IS DISTINCT FROM
  (SELECT summary->>'foreign_snapshot_sha256' FROM pg_temp.nestory_maintenance_materialized) THEN RAISE EXCEPTION 'maintenance_foreign_scope_changed'; END IF;
 FOR r IN SELECT * FROM app_private.financial_idempotency_requests WHERE organization_id=${org} AND financial_generation=0 LOOP
  BEGIN
   PERFORM app_private.assert_financial_request_current(${org},r.operation,r.idempotency_key);
   RAISE EXCEPTION 'maintenance_old_request_not_retired';
  EXCEPTION WHEN SQLSTATE '55000' THEN IF SQLERRM<>'financial_intent_retired' THEN RAISE; END IF; END;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.finance_receipts WHERE organization_id=${org}) OR EXISTS(SELECT 1 FROM public.finance_payments WHERE organization_id=${org})
  OR EXISTS(SELECT 1 FROM public.tenant_invoice_payments WHERE organization_id=${org}) OR EXISTS(SELECT 1 FROM public.owner_payments WHERE organization_id=${org})
  OR EXISTS(SELECT 1 FROM public.lease_deposit_events WHERE organization_id=${org}) THEN RAISE EXCEPTION 'maintenance_unplanned_cash_created'; END IF;
END $maintenance_reconcile$;
INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,previous_values,new_values)
SELECT organization_id,NULL,'financial_month',operation_id,'administrator_reset',NULL,
 jsonb_build_object('database_principal',session_user,'effective_database_principal',current_user,'requested_by_user_id',requested_by,
 'authenticated_application_actor',NULL,'operation_id',operation_id,'manifest_sha256',manifest_sha256,'billing_review_sha256',${lit(request.billingReviewSha256)},
 'cutoff','2026-10-01','original_invoice_dates_retained',true,'deferred_lease_count',${request.expectedDeferredCount},'financial_generation',1,
 'scope','administrator maintenance; cash entries require staff re-entry') FROM pg_temp.nestory_maintenance_context;
${guard.assertRestoredSql}
SET CONSTRAINTS ALL IMMEDIATE;
SELECT jsonb_build_object('status','maintenance_postconditions_verified','operation_id',operation_id,'manifest_sha256',manifest_sha256,
 'applied_actions',(SELECT count(*) FROM pg_temp.nestory_maintenance_actions WHERE applied),
 'new_invoices',(SELECT count(*) FROM public.tenant_invoices WHERE organization_id=${org}),'deferred_leases',${request.expectedDeferredCount},
 'generation',1,'control_open',true,'guards_restored',true,'owner_opening_authority','staff_approval_required') summary FROM pg_temp.nestory_maintenance_context;
${terminator};`;
}
