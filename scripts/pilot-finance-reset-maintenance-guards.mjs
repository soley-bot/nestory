// Generates one transaction's exact-row guard exception. It performs no I/O.
// Customer rows stay in server-side temporary tables made by the reviewed
// operation composer; this module accepts only operation and definition pins.
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';

export const MAINTENANCE_ORGANIZATION = '752a87b8-bd04-4a45-9cb8-00687af66e73';
export const MAINTENANCE_GUARDS = Object.freeze([
  'app_private.enforce_canonical_income_settlement()',
  'app_private.enforce_reserved_ledger_projection()',
  'app_private.derive_lease_deposit_status_from_events()',
  'app_private.guard_owner_balance_append_only()',
  'app_private.guard_tenant_invoice_rent_segments()',
  'app_private.guard_owner_balance_period_write()',
  'app_private.guard_tenant_commercial_document_artifact_write()',
  'app_private.guard_tenant_invoice_correction_occurrence()',
  'app_private.guard_lease_derived_rent_receipt_allocation()',
]);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const sha = /^[a-f0-9]{64}$/;
const exact = (v, fields) => v && Object.getPrototypeOf(v) === Object.prototype &&
  canonicalJson(Object.keys(v).sort()) === canonicalJson([...fields].sort());
const fail = () => { throw new Error('maintenance_guard_request_invalid'); };
const literal = v => `'${v.replaceAll("'", "''")}'`;

// pg_proc includes the original OID, owner, ACL, proconfig, language, security
// mode and body. Triggers and row-security policies are independently pinned.
const guardMetadata = `jsonb_build_object('proc',to_jsonb(p),'comment',obj_description(p.oid,'pg_proc'))`;
const tableMetadata = `jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,
 'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('catalog',to_jsonb(t),'definition',pg_get_triggerdef(t.oid)) ORDER BY t.oid)
   FROM pg_trigger t WHERE t.tgrelid=c.oid),'[]'::jsonb),
 'policies',coalesce((SELECT jsonb_agg(to_jsonb(pol) ORDER BY pol.oid) FROM pg_policy pol WHERE pol.polrelid=c.oid),'[]'::jsonb))`;

const restorationPredicate = `
  IF EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_guard_originals s LEFT JOIN pg_proc p ON p.oid=s.function_oid
    WHERE p.oid IS NULL OR pg_get_functiondef(p.oid) IS DISTINCT FROM s.definition
      OR encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') IS DISTINCT FROM s.definition_sha256
      OR ${guardMetadata} IS DISTINCT FROM s.metadata) THEN
    RAISE EXCEPTION 'maintenance_guard_original_definition_not_restored';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_guard_tables s LEFT JOIN pg_class c ON c.oid=s.relation_oid
    WHERE c.oid IS NULL OR ${tableMetadata} IS DISTINCT FROM s.metadata) THEN
    RAISE EXCEPTION 'maintenance_guard_trigger_or_rls_changed';
  END IF;
  IF current_setting('session_replication_role') <> 'origin' OR current_setting('row_security') <> 'on' THEN
    RAISE EXCEPTION 'maintenance_guard_execution_settings_changed';
  END IF;`;

export function buildMaintenanceGuardSql(request) {
  if (!exact(request, ['operationId', 'manifestSha256', 'expectedGuards']) || !uuid.test(request.operationId) ||
    !sha.test(request.manifestSha256) || !Array.isArray(request.expectedGuards) || request.expectedGuards.length !== MAINTENANCE_GUARDS.length ||
    request.expectedGuards.some(g => !exact(g, ['signature', 'definitionSha256']) || !MAINTENANCE_GUARDS.includes(g.signature) || !sha.test(g.definitionSha256)) ||
    new Set(request.expectedGuards.map(g => g.signature)).size !== MAINTENANCE_GUARDS.length) fail();
  const op = literal(request.operationId), manifest = literal(request.manifestSha256), organization = literal(MAINTENANCE_ORGANIZATION);
  const pins = request.expectedGuards.map(g => `(${literal(g.signature)},${literal(g.definitionSha256)})`).join(',');
  const prefix = `
  -- Exact maintenance exception; every other invocation continues below.
  IF pg_catalog.pg_trigger_depth()=1 AND TG_WHEN='BEFORE' AND TG_LEVEL='ROW' AND TG_OP IN ('DELETE','UPDATE') THEN
    IF pg_catalog.to_regclass('pg_temp.nestory_maintenance_guard_scope') IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM pg_temp.nestory_maintenance_guard_scope s
        JOIN pg_temp.nestory_maintenance_context c ON c.operation_id=s.operation_id
        JOIN pg_temp.nestory_maintenance_actions a ON a.action_id=c.current_action_id
        JOIN pg_temp.nestory_maintenance_guard_actions g ON g.action_id=a.action_id
        WHERE s.operation_id=${op}::uuid AND s.organization_id=${organization}::uuid AND s.manifest_sha256=${manifest}
          AND NOT s.restored AND s.backend_pid=pg_catalog.pg_backend_pid() AND s.transaction_id=pg_catalog.txid_current()::text
          AND s.database_principal=SESSION_USER AND c.backend_pid=s.backend_pid AND c.transaction_id=s.transaction_id
          AND c.organization_id=s.organization_id AND c.manifest_sha256=s.manifest_sha256
          AND a.applied IS FALSE AND a.relation_oid=TG_RELID AND a.kind=TG_OP
          AND g.relation_oid=a.relation_oid AND g.kind=a.kind AND g.primary_key=a.primary_key
          AND g.before_sha256=a.before_sha256 AND g.after_sha256 IS NOT DISTINCT FROM a.after_sha256
          AND jsonb_typeof(a.primary_key)='object' AND a.primary_key<>'{}'::jsonb
          AND to_jsonb(OLD) @> a.primary_key AND to_jsonb(OLD)=a.before_row
          AND to_jsonb(OLD)->>'organization_id'=${organization}
          AND encode(extensions.digest(to_jsonb(OLD)::text,'sha256'),'hex')=a.before_sha256
          AND ((TG_OP='DELETE' AND a.after_row IS NULL AND a.after_sha256 IS NULL)
            OR (TG_OP='UPDATE' AND to_jsonb(NEW)=a.after_row AND to_jsonb(NEW) @> a.primary_key
              AND to_jsonb(NEW)->>'organization_id'=${organization}
              AND encode(extensions.digest(to_jsonb(NEW)::text,'sha256'),'hex')=a.after_sha256))
      ) THEN
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END IF;
    END IF;
  END IF;
`;
  const ownerHistoryPrefix = prefix.replace("TG_OP IN ('DELETE','UPDATE')", `TG_OP='DELETE'
    AND TG_RELID IN ('public.owner_event_allocation_sets'::regclass,'public.owner_event_owner_allocations'::regclass,
      'public.owner_component_movements'::regclass,'public.owner_cash_source_consumptions'::regclass,
      'public.owner_cash_events'::regclass,'public.owner_component_transfer_instructions'::regclass,
      'public.owner_component_transfer_lines'::regclass,'public.fee_payment_date_corrections'::regclass)`);
  const rentSegmentPrefix = prefix.replace("TG_OP IN ('DELETE','UPDATE')",
    "TG_OP='DELETE' AND TG_RELID='public.tenant_invoice_rent_segments'::regclass");
  const ownerPeriodPrefix = prefix.replace("TG_OP IN ('DELETE','UPDATE')",
    "TG_OP='DELETE' AND TG_RELID='public.owner_balance_periods'::regclass");
  const tenantArtifactPrefix = prefix.replace("TG_OP IN ('DELETE','UPDATE')",
    "TG_OP='DELETE' AND TG_RELID='public.tenant_commercial_document_artifacts'::regclass");
  const tenantCorrectionPrefix = prefix.replace("TG_OP IN ('DELETE','UPDATE')",
    "TG_OP='DELETE' AND TG_RELID='public.tenant_invoice_corrections'::regclass");
  const rentAllocationPrefix = prefix.replace("TG_OP IN ('DELETE','UPDATE')",
    `((TG_RELID='public.finance_receipt_allocations'::regclass AND TG_OP IN ('DELETE','UPDATE'))
      OR (TG_RELID='public.owner_collection_confirmation_allocations'::regclass AND TG_OP='DELETE'))`);
  const depositPrefix = `
  -- Only the selected event deletion may defer its header projection to the
  -- separately reviewed header action. Ordinary event writes run the body below.
  IF pg_catalog.pg_trigger_depth()=1 AND TG_WHEN='AFTER' AND TG_LEVEL='ROW' AND TG_OP='DELETE'
    AND TG_RELID='public.lease_deposit_events'::regclass THEN
    IF pg_catalog.to_regclass('pg_temp.nestory_maintenance_guard_scope') IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM pg_temp.nestory_maintenance_guard_scope s
        JOIN pg_temp.nestory_maintenance_context c ON c.operation_id=s.operation_id
        JOIN pg_temp.nestory_maintenance_actions a ON a.action_id=c.current_action_id
        JOIN pg_temp.nestory_maintenance_guard_actions g ON g.action_id=a.action_id
        JOIN pg_temp.nestory_maintenance_guard_deposit_headers h ON h.deposit_id=OLD.lease_deposit_id
        JOIN public.lease_deposits d ON d.id=h.deposit_id AND d.organization_id=s.organization_id
        WHERE s.operation_id=${op}::uuid AND s.organization_id=${organization}::uuid AND s.manifest_sha256=${manifest}
          AND NOT s.restored AND s.backend_pid=pg_catalog.pg_backend_pid() AND s.transaction_id=pg_catalog.txid_current()::text
          AND s.database_principal=SESSION_USER AND c.backend_pid=s.backend_pid AND c.transaction_id=s.transaction_id
          AND c.organization_id=s.organization_id AND c.manifest_sha256=s.manifest_sha256
          AND a.applied IS FALSE AND a.relation_oid=TG_RELID AND a.kind='DELETE'
          AND g.relation_oid=a.relation_oid AND g.kind=a.kind AND g.primary_key=a.primary_key
          AND g.before_sha256=a.before_sha256 AND g.after_sha256 IS NULL
          AND a.after_row IS NULL AND a.after_sha256 IS NULL
          AND to_jsonb(OLD) @> a.primary_key AND to_jsonb(OLD)=a.before_row
          AND OLD.organization_id=${organization}::uuid
          AND encode(extensions.digest(to_jsonb(OLD)::text,'sha256'),'hex')=a.before_sha256
          AND to_jsonb(d) @> h.primary_key
          AND (encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex')=h.before_sha256
            OR EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_actions ha
              JOIN pg_temp.nestory_maintenance_guard_actions hg ON hg.action_id=ha.action_id
              WHERE ha.action_id=h.normalization_action_id AND ha.applied IS TRUE AND ha.kind='UPDATE'
                AND ha.relation_oid='public.lease_deposits'::regclass AND hg.relation_oid=ha.relation_oid AND hg.kind=ha.kind
                AND ha.primary_key=h.primary_key AND hg.primary_key=ha.primary_key
                AND ha.before_sha256=h.before_sha256 AND hg.before_sha256=ha.before_sha256
                AND ha.after_sha256=h.after_sha256 AND hg.after_sha256=ha.after_sha256
                AND to_jsonb(d)=ha.after_row AND encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex')=h.after_sha256))
      ) THEN RETURN NULL; END IF;
    END IF;
  END IF;
`;
  const installSql = `
DO $maintenance_install$
DECLARE v_pin record; v_oid oid; v_definition text; v_body_position integer;
BEGIN
  IF current_setting('session_replication_role')<>'origin' OR current_setting('row_security')<>'on'
    OR auth.uid() IS NOT NULL OR current_user<>session_user THEN
    RAISE EXCEPTION 'maintenance_guard_direct_database_principal_required';
  END IF;
  IF (SELECT count(*) FROM pg_temp.nestory_maintenance_context)<>1 OR NOT EXISTS(
    SELECT 1 FROM pg_temp.nestory_maintenance_context WHERE operation_id=${op}::uuid
      AND organization_id=${organization}::uuid AND manifest_sha256=${manifest}
      AND backend_pid=pg_backend_pid() AND transaction_id=txid_current()::text AND current_action_id IS NULL
  ) THEN RAISE EXCEPTION 'maintenance_guard_exact_context_required'; END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_actions a WHERE a.applied OR a.kind NOT IN ('DELETE','UPDATE')
    OR a.before_sha256 !~ '^[a-f0-9]{64}$' OR a.before_sha256 IS DISTINCT FROM encode(extensions.digest(a.before_row::text,'sha256'),'hex')
    OR a.before_row->>'organization_id' IS DISTINCT FROM ${organization}
    OR jsonb_typeof(a.primary_key) IS DISTINCT FROM 'object' OR a.primary_key='{}'::jsonb OR NOT a.before_row @> a.primary_key
    OR (a.kind='DELETE' AND (a.after_row IS NOT NULL OR a.after_sha256 IS NOT NULL))
    OR (a.kind='UPDATE' AND (a.after_row IS NULL OR a.after_sha256 !~ '^[a-f0-9]{64}$'
      OR a.after_sha256 IS DISTINCT FROM encode(extensions.digest(a.after_row::text,'sha256'),'hex')
      OR a.after_row->>'organization_id' IS DISTINCT FROM ${organization} OR NOT a.after_row @> a.primary_key))) THEN
    RAISE EXCEPTION 'maintenance_guard_exact_actions_required';
  END IF;
  CREATE TEMP TABLE nestory_maintenance_guard_scope ON COMMIT DROP AS
    SELECT operation_id,organization_id,manifest_sha256,backend_pid,transaction_id,session_user::text AS database_principal,false AS restored
    FROM pg_temp.nestory_maintenance_context;
  CREATE TEMP TABLE nestory_maintenance_guard_actions ON COMMIT DROP AS
    SELECT action_id,relation_oid,kind,primary_key,before_sha256,after_sha256 FROM pg_temp.nestory_maintenance_actions;
  CREATE UNIQUE INDEX ON nestory_maintenance_guard_actions(action_id);
  CREATE TEMP TABLE nestory_maintenance_guard_deposit_headers(
    deposit_id uuid PRIMARY KEY,primary_key jsonb NOT NULL,before_sha256 text NOT NULL,
    normalization_action_id uuid,after_sha256 text) ON COMMIT DROP;
  INSERT INTO pg_temp.nestory_maintenance_guard_deposit_headers
    SELECT (x->'primary_key'->>'id')::uuid,x->'primary_key',x->>'row_sha256',a.action_id,a.after_sha256
    FROM pg_temp.nestory_maintenance_materialized m CROSS JOIN LATERAL jsonb_array_elements(m.archive) x
    LEFT JOIN pg_temp.nestory_maintenance_actions a ON a.relation_oid='public.lease_deposits'::regclass
      AND a.kind='UPDATE' AND a.primary_key=x->'primary_key'
    WHERE x->>'relation_name'='public.lease_deposits'
      AND EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_actions e
        WHERE e.relation_oid='public.lease_deposit_events'::regclass AND e.kind='DELETE'
          AND e.before_row->>'lease_deposit_id'=x->'primary_key'->>'id')
      AND (x->>'row_text')::jsonb @> (x->'primary_key')
      AND (x->>'row_text')::jsonb->>'organization_id'=${organization}
      AND encode(extensions.digest(((x->>'row_text')::jsonb)::text,'sha256'),'hex')=x->>'row_sha256'
      AND (a.action_id IS NULL OR (a.before_row=(x->>'row_text')::jsonb AND a.before_sha256=x->>'row_sha256'));
  IF EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_actions e
    WHERE e.relation_oid='public.lease_deposit_events'::regclass AND e.kind='DELETE'
      AND NOT EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_guard_deposit_headers h
        JOIN public.lease_deposits d ON d.id=h.deposit_id AND d.organization_id=${organization}::uuid
        WHERE h.deposit_id=(e.before_row->>'lease_deposit_id')::uuid AND to_jsonb(d) @> h.primary_key
          AND encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex')=h.before_sha256)) THEN
    RAISE EXCEPTION 'maintenance_guard_deposit_header_archive_required';
  END IF;
  CREATE TEMP TABLE nestory_maintenance_guard_originals(signature text PRIMARY KEY,function_oid oid NOT NULL,
    definition text NOT NULL,definition_sha256 text NOT NULL,metadata jsonb NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE nestory_maintenance_guard_tables(relation_oid oid PRIMARY KEY,metadata jsonb NOT NULL) ON COMMIT DROP;
  FOR v_pin IN SELECT * FROM (VALUES ${pins}) AS pins(signature,sha256) LOOP
    v_oid:=v_pin.signature::regprocedure;
    v_definition:=pg_get_functiondef(v_oid);
    IF encode(extensions.digest(v_definition,'sha256'),'hex')<>v_pin.sha256 OR NOT EXISTS(
      SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_oid AND l.lanname='plpgsql'
        AND p.prorettype='trigger'::regtype AND p.pronargs=0
    ) THEN RAISE EXCEPTION 'maintenance_guard_definition_pin_changed'; END IF;
    INSERT INTO pg_temp.nestory_maintenance_guard_originals SELECT v_pin.signature,p.oid,v_definition,v_pin.sha256,${guardMetadata}
      FROM pg_proc p WHERE p.oid=v_oid;
  END LOOP;
  INSERT INTO pg_temp.nestory_maintenance_guard_tables SELECT c.oid,${tableMetadata} FROM pg_class c
    WHERE c.oid IN (SELECT t.tgrelid FROM pg_trigger t JOIN pg_temp.nestory_maintenance_guard_originals g ON g.function_oid=t.tgfoid);
  IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_temp.nestory_maintenance_guard_tables g ON g.relation_oid=t.tgrelid WHERE t.tgenabled NOT IN ('O','A')) THEN
    RAISE EXCEPTION 'maintenance_guard_disabled_trigger_refused';
  END IF;
  FOR v_pin IN SELECT * FROM pg_temp.nestory_maintenance_guard_originals ORDER BY signature LOOP
    v_body_position:=strpos(v_pin.definition,E'\\nBEGIN');
    IF v_body_position=0 THEN RAISE EXCEPTION 'maintenance_guard_unrecognized_body'; END IF;
    v_definition:=overlay(v_pin.definition placing E'\\nBEGIN'||CASE
      WHEN v_pin.signature='app_private.derive_lease_deposit_status_from_events()' THEN ${literal(depositPrefix)}
      WHEN v_pin.signature='app_private.guard_owner_balance_append_only()' THEN ${literal(ownerHistoryPrefix)}
      WHEN v_pin.signature='app_private.guard_tenant_invoice_rent_segments()' THEN ${literal(rentSegmentPrefix)}
      WHEN v_pin.signature='app_private.guard_owner_balance_period_write()' THEN ${literal(ownerPeriodPrefix)}
      WHEN v_pin.signature='app_private.guard_tenant_commercial_document_artifact_write()' THEN ${literal(tenantArtifactPrefix)}
      WHEN v_pin.signature='app_private.guard_tenant_invoice_correction_occurrence()' THEN ${literal(tenantCorrectionPrefix)}
      WHEN v_pin.signature='app_private.guard_lease_derived_rent_receipt_allocation()' THEN ${literal(rentAllocationPrefix)}
      ELSE ${literal(prefix)} END from v_body_position for length(E'\\nBEGIN'));
    EXECUTE v_definition;
  END LOOP;
  -- Installation and the commit obligation are one atomic statement. Even a
  -- caller accidentally using autocommit cannot commit the wrappers alone.
  CREATE TEMP TABLE nestory_maintenance_restore_obligation(id integer PRIMARY KEY CHECK(id=1)) ON COMMIT DROP;
  EXECUTE $restore_definition$CREATE FUNCTION pg_temp.nestory_maintenance_require_restoration() RETURNS trigger LANGUAGE plpgsql AS $restore_obligation$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_guard_scope s WHERE s.operation_id=${op}::uuid
    AND s.organization_id=${organization}::uuid AND s.manifest_sha256=${manifest} AND s.backend_pid=pg_backend_pid()
    AND s.transaction_id=txid_current()::text AND s.database_principal=session_user AND s.restored) THEN
    RAISE EXCEPTION 'maintenance_guard_restoration_required_before_commit';
  END IF;
  ${restorationPredicate}
  RETURN NULL;
END;
$restore_obligation$;$restore_definition$;
  CREATE CONSTRAINT TRIGGER nestory_maintenance_restore_before_commit AFTER INSERT ON nestory_maintenance_restore_obligation
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.nestory_maintenance_require_restoration();
  INSERT INTO pg_temp.nestory_maintenance_restore_obligation VALUES(1);
END;
$maintenance_install$;
`;
  const restoreSql = `
DO $maintenance_restore$
DECLARE v_original record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_guard_scope WHERE operation_id=${op}::uuid
    AND organization_id=${organization}::uuid AND manifest_sha256=${manifest} AND backend_pid=pg_backend_pid()
    AND transaction_id=txid_current()::text AND database_principal=session_user AND NOT restored) THEN
    RAISE EXCEPTION 'maintenance_guard_restore_scope_changed';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_context WHERE current_action_id IS NOT NULL) THEN
    RAISE EXCEPTION 'maintenance_guard_action_still_armed';
  END IF;
  FOR v_original IN SELECT * FROM pg_temp.nestory_maintenance_guard_originals ORDER BY signature LOOP
    IF to_regprocedure(v_original.signature) IS DISTINCT FROM v_original.function_oid THEN RAISE EXCEPTION 'maintenance_guard_oid_changed'; END IF;
    EXECUTE v_original.definition;
  END LOOP;
  ${restorationPredicate}
  UPDATE pg_temp.nestory_maintenance_guard_scope SET restored=true;
END;
$maintenance_restore$;
`;
  const assertRestoredSql = `
DO $maintenance_assert$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_temp.nestory_maintenance_guard_scope WHERE operation_id=${op}::uuid
    AND manifest_sha256=${manifest} AND restored AND backend_pid=pg_backend_pid() AND transaction_id=txid_current()::text) THEN
    RAISE EXCEPTION 'maintenance_guard_restoration_required_before_commit';
  END IF;
  ${restorationPredicate}
END;
$maintenance_assert$;
`;
  return Object.freeze({ format: 'nestory-scoped-maintenance-guards-v1', operationId: request.operationId,
    manifestSha256: request.manifestSha256, installSql, restoreSql, assertRestoredSql,
    sourceSha256: hashBytes(installSql + restoreSql + assertRestoredSql) });
}
