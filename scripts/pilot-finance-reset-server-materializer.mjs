// SQL generation only. No connection, credentials, dispatch, or row export.
// The public preview returns aggregate counts/digests. Exact source images stay
// in PostgreSQL and the prepare block consumes the very same CTE definition.
import { createHash } from 'node:crypto';
import { RESET_REGISTRY, POLYMORPHIC_REFERENCES, STATIC_REFERENCES } from './pilot-finance-reset-registry.mjs';
import { catalogExpression, ledgerExpression, timestampMicros } from './pilot-finance-reset-hosted-transport-protocol.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const jsonSql = value => `${literal(JSON.stringify(value))}::jsonb`;
const identifier = value => value.split('.').map(part => `"${part.replaceAll('"', '""')}"`).join('.');
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = expression => `app_private.financial_reset_hash(${expression})`;
const tables = Object.entries(RESET_REGISTRY).sort(([a], [b]) => a.localeCompare(b));
const operationFields = ['operation_id','organization_id','operation_kind','restore_of','source_generation','target_generation',
  'manifest_sha256','plan_sha256','schema_sha256','archive_sha256','action_sha256','archive_count','action_count','audit_timestamp','audit_actor'].sort();
const cyclePatches = {
  'public.expense_transactions': { replaces_transaction_id: null },
  'public.finance_expense_items': { ledger_entry_id: null },
  'public.finance_payment_allocations': { ledger_entry_id: null },
  'public.finance_receipt_allocations': { ledger_entry_id: null },
  'public.lease_deposit_events': { ledger_entry_id: null },
  'public.owner_payments': { ledger_entry_id: null },
  'public.petty_cash_entries': { ledger_entry_id: null },
  'public.property_withdrawals': { ledger_entry_id: null },
  'public.owner_close_series': { state: 'open', active_revision_id: null, current_closed_revision_id: null },
};
const normalizationPatches = {
  'public.tasks': { actual_cost_amount: null, actual_cost_currency: null, actual_cost_date: null, actual_cost_document_id: null, actual_cost_reference: null },
  'public.timeline_events': { ledger_entry_id: null, cost_amount: null, cost_currency: null },
};
const policy = { registry: RESET_REGISTRY, static: STATIC_REFERENCES, polymorphic: POLYMORPHIC_REFERENCES,
  cyclePatches, normalizationPatches, version: 'nestory-server-reset-materialization-v1' };
export const SERVER_MATERIALIZER_POLICY_SHA256 = hash(JSON.stringify(policy));

function assertScope(scope) {
  if (!scope || Object.keys(scope).sort().join(',') !== 'operationId,organizationId,sourceGeneration,sourceSha256' ||
      !uuid.test(scope.operationId ?? '') || !uuid.test(scope.organizationId ?? '') ||
      scope.sourceGeneration !== 0 || !digest.test(scope.sourceSha256 ?? '')) throw Error('server_materializer_scope_invalid');
}

// Kept private deliberately: returning archive/actions would expose full rows.
function materializationCtes(scope) {
  assertScope(scope);
  const scopedTables = tables.filter(([, rule]) => rule.scope);
  const rowsSql = scopedTables.map(([name, rule]) => `SELECT ${literal(name)}::text relation_name,
    ${literal(rule.disposition)}::text disposition, ${literal(name)}::regclass::oid relation_oid,
    t.${identifier(rule.scope)}::text organization_id, to_jsonb(t) row_json,
    app_private.financial_reset_primary_key(${literal(name)}::regclass,to_jsonb(t)) primary_key
    FROM ${identifier(name)} t`).join('\nUNION ALL\n');
  const staticRefs = STATIC_REFERENCES.map(ref => ({ table: ref.table, column: ref.column, target: ref.target,
    historical: Boolean(ref.historicalSnapshot), seed: Boolean(ref.allowOrganizationSeedActor) }));
  const polyRefs = POLYMORPHIC_REFERENCES.flatMap(ref => Object.entries(ref.targets).map(([kind, target]) => ({
    table: ref.table, column: ref.idColumn, type_column: ref.typeColumn, kind,
    targets: Array.isArray(target) ? target : [target], historical: (ref.historicalKinds ?? []).includes(kind),
  })));
  const patchCase = Object.entries(cyclePatches).map(([table, patch]) => `WHEN ${literal(table)} THEN ${jsonSql(patch)}`).join('\n');
  const normalizationCase = Object.entries(normalizationPatches).map(([table, patch]) => `WHEN ${literal(table)} THEN ${jsonSql(patch)}`).join('\n');
  return `WITH RECURSIVE
params AS (SELECT ${literal(scope.operationId)}::uuid operation_id, ${literal(scope.organizationId)}::uuid organization_id),
all_rows AS MATERIALIZED (${rowsSql}),
rows AS MATERIALIZED (SELECT r.*, relation_name||'/'||primary_key::text row_key,
  ${jsonHash('row_json')} row_sha256 FROM all_rows r),
selected AS MATERIALIZED (SELECT r.* FROM rows r,params p WHERE r.organization_id=p.organization_id::text),
patches AS (SELECT r.*, CASE WHEN disposition='archive-remove' THEN CASE relation_name ${patchCase} ELSE '{}'::jsonb END
  WHEN relation_name='public.lease_deposits' AND row_json->>'status' IN ('held','received','partially_returned')
    THEN '{"status":"pending","received_on":null,"returned_on":null}'::jsonb
  ELSE CASE relation_name ${normalizationCase} ELSE '{}'::jsonb END END patch FROM selected r),
images AS MATERIALIZED (SELECT r.*,
  CASE WHEN patch='{}'::jsonb THEN row_json ELSE app_private.financial_reset_typed_row(relation_oid,row_json||patch) END after_json,
  ARRAY(SELECT k FROM jsonb_object_keys(patch) k WHERE row_json->k IS DISTINCT FROM patch->k ORDER BY k) changed_columns
  FROM patches r),
fk_descriptors AS (SELECT c.oid constraint_oid,c.conname,c.confmatchtype,c.conrelid,c.confrelid,
  ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.i) columns,
  ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.i) target_columns
  FROM pg_constraint c WHERE c.contype='f'),
fk_source_keys AS MATERIALIZED (SELECT f.constraint_oid,s.row_key,
 ARRAY(SELECT s.row_json->k FROM unnest(f.columns) WITH ORDINALITY u(k,n) ORDER BY n) key_values
 FROM fk_descriptors f JOIN rows s ON s.relation_oid=f.conrelid),
fk_target_keys AS MATERIALIZED (SELECT f.constraint_oid,t.row_key,
 ARRAY(SELECT t.row_json->k FROM unnest(f.target_columns) WITH ORDINALITY u(k,n) ORDER BY n) key_values
 FROM fk_descriptors f JOIN rows t ON t.relation_oid=f.confrelid),
staged_fk_sources AS MATERIALIZED (SELECT f.constraint_oid,i.row_key FROM images i JOIN fk_descriptors f ON f.conrelid=i.relation_oid WHERE i.disposition='archive-remove' AND cardinality(i.changed_columns)>0 AND
 EXISTS(SELECT 1 FROM unnest(f.columns) k WHERE i.row_json->>k IS NOT NULL AND i.after_json->>k IS NULL)
 AND (f.confmatchtype='s' OR f.confmatchtype='f' AND NOT EXISTS(SELECT 1 FROM unnest(f.columns) k WHERE i.after_json->>k IS NOT NULL))),
physical_edges AS (SELECT s.row_key source_key,t.row_key target_key,'foreign-key'::text kind,f.conname::text column_name,
  s.organization_id source_org,t.organization_id target_org,
  EXISTS(SELECT 1 FROM staged_fk_sources z WHERE z.constraint_oid=f.constraint_oid AND z.row_key=s.row_key) staged
  FROM fk_source_keys sk JOIN fk_target_keys tk ON tk.constraint_oid=sk.constraint_oid AND tk.key_values=sk.key_values
  JOIN fk_descriptors f ON f.constraint_oid=sk.constraint_oid
  JOIN rows s ON s.row_key=sk.row_key JOIN rows t ON t.row_key=tk.row_key
  WHERE NOT EXISTS(SELECT 1 FROM generate_subscripts(f.columns,1) n WHERE s.row_json->>f.columns[n] IS NULL
    OR s.row_json->f.columns[n] IS DISTINCT FROM t.row_json->f.target_columns[n])),
static_rules AS (SELECT * FROM jsonb_to_recordset(${jsonSql(staticRefs)}) x("table" text,"column" text,target text,historical boolean,seed boolean)),
poly_rules AS (SELECT * FROM jsonb_to_recordset(${jsonSql(polyRefs)}) x("table" text,"column" text,type_column text,kind text,targets jsonb,historical boolean)),
logical_refs AS MATERIALIZED (SELECT s.row_key,s.organization_id,s.relation_name,s.row_json,r."column" column_name,r.target,
  r.historical,r.seed,false polymorphic FROM rows s JOIN static_rules r ON r."table"=s.relation_name WHERE s.row_json->>r."column" IS NOT NULL
  UNION ALL SELECT s.row_key,s.organization_id,s.relation_name,s.row_json,r."column",t.value,r.historical,false,true
  FROM rows s JOIN poly_rules r ON r."table"=s.relation_name AND s.row_json->>r.type_column=r.kind
  CROSS JOIN LATERAL jsonb_array_elements_text(r.targets) t WHERE s.row_json->>r."column" IS NOT NULL),
logical_row_counts AS MATERIALIZED (SELECT rr.row_key,rr.column_name,count(DISTINCT t.row_key) n FROM logical_refs rr JOIN rows t ON t.relation_name=rr.target AND t.row_json->>'id'=rr.row_json->>rr.column_name GROUP BY rr.row_key,rr.column_name),
logical_auth_counts AS MATERIALIZED (SELECT rr.row_key,rr.column_name,count(*) n FROM logical_refs rr JOIN auth.users u ON rr.target='auth.users' AND u.id::text=rr.row_json->>rr.column_name GROUP BY rr.row_key,rr.column_name),
logical_edges AS MATERIALIZED (SELECT r.row_key source_key,t.row_key target_key,'logical-reference'::text kind,r.column_name,
  r.organization_id source_org,t.organization_id target_org,false staged
  FROM logical_refs r JOIN rows t ON t.relation_name=r.target AND t.row_json->>'id'=r.row_json->>r.column_name
  WHERE NOT r.historical),
retired AS (SELECT r.row_key FROM selected r WHERE
  r.relation_name='app_private.financial_idempotency_requests' AND r.row_json->>'status'='completed' AND r.row_json->>'financial_generation'='0'
  OR r.relation_name='app_private.paid_cost_evidence_registrations' AND r.row_json->>'financial_generation'='0'
  OR r.relation_name='app_private.finance_category_idempotency_result_seals' AND EXISTS(SELECT 1 FROM selected p
    WHERE p.relation_name='app_private.financial_idempotency_requests' AND p.row_json->>'status'='completed' AND p.row_json->>'financial_generation'='0'
    AND p.row_json->'organization_id'=r.row_json->'organization_id' AND p.row_json->'operation'=r.row_json->'operation'
    AND p.row_json->'idempotency_key'=r.row_json->'idempotency_key')
 OR r.relation_name='app_private.tenant_commercial_document_upload_attestations'
 AND r.row_json->'financial_generation'='0'::jsonb
 AND r.row_json->>'consumed_at' IS NOT NULL AND r.row_json->>'consumed_by' IS NOT NULL
 AND r.row_json->'consumed_by'=r.row_json->'attested_by'
 AND (r.row_json->>'attested_at')::timestamptz <= (r.row_json->>'consumed_at')::timestamptz
 AND EXISTS(SELECT 1 FROM selected a WHERE a.relation_name='public.tenant_commercial_document_artifacts' AND a.disposition='archive-remove'
 AND a.row_json->'organization_id'=r.row_json->'organization_id' AND a.row_json->'source_kind'=r.row_json->'source_kind'
 AND a.row_json->'source_id'=r.row_json->'source_id' AND a.row_json->'financial_generation'='0'::jsonb
 AND a.row_json->>'publication_status'='published' AND a.row_json->>'content_type'='application/pdf'
 AND a.row_json->'published_by'=r.row_json->'consumed_by' AND a.row_json->'published_at'=r.row_json->'consumed_at'
 AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['storage_path','storage_object_id','storage_object_version','size_bytes','sha256','renderer_version']) k
 WHERE r.row_json->>k IS NULL OR r.row_json->k IS DISTINCT FROM a.row_json->k)
 AND r.row_json->>'presentation_snapshot_sha256'=app_private.tenant_commercial_document_snapshot_sha256(a.row_json->'presentation_snapshot'))
 AND EXISTS(SELECT 1 FROM selected src WHERE src.disposition='archive-remove'
 AND src.relation_name=CASE r.row_json->>'source_kind' WHEN 'invoice' THEN 'public.tenant_invoices' WHEN 'receipt' THEN 'public.tenant_invoice_payments' END
 AND src.row_json->'organization_id'=r.row_json->'organization_id' AND src.row_json->'id'=r.row_json->'source_id'
 AND src.row_json->'financial_generation'='0'::jsonb)),
temporary_logical AS MATERIALIZED (SELECT e.source_key,e.target_key FROM logical_edges e JOIN selected s ON s.row_key=e.source_key JOIN selected t ON t.row_key=e.target_key
  WHERE e.column_name='source_id' AND s.disposition='archive-remove' AND t.disposition='archive-remove'
  AND ((s.relation_name='public.ledger_entries' AND s.row_json->>'source_type'='owner_collection_allocation'
    AND t.relation_name='public.owner_collection_confirmation_allocations' AND t.row_json->'ledger_entry_id'=s.row_json->'id')
   OR (s.relation_name='public.owner_invoice_lines' AND s.row_json->>'source_type'='owner_expense'
    AND t.relation_name='public.ips_expense_responsibilities' AND t.row_json->'owner_invoice_line_id'=s.row_json->'id'))
  AND (t.row_key,s.row_key) IN (SELECT f.source_key,f.target_key FROM physical_edges f)
  AND NOT (s.row_key IN (SELECT i.row_key FROM images i WHERE cardinality(i.changed_columns)>0) OR t.row_key IN (SELECT i.row_key FROM images i WHERE cardinality(i.changed_columns)>0))),
historical_edges AS MATERIALIZED (SELECT a.row_key source_key,b.row_key target_key FROM selected a JOIN selected b ON a.relation_name=b.relation_name
  AND a.relation_name='public.owner_opening_balance_entries' AND a.row_json->>'entry_kind'='correction_replacement'
  AND b.row_json->>'entry_kind'='correction_reversal' AND a.row_json->'request_id'=b.row_json->'request_id'
  UNION SELECT a.row_key,c.row_key FROM selected c JOIN selected l ON l.relation_name='public.owner_invoice_lines'
  AND l.row_json->'id'=c.row_json->'owner_invoice_line_id' AND l.row_json->>'source_type'='owner_expense'
  JOIN selected a ON a.relation_name='public.expense_customer_adjustments' AND a.row_json->'responsibility_id'=l.row_json->'source_id'
  AND a.row_json->>'responsibility'='owner' WHERE c.relation_name='public.owner_charge_cash_allocations' AND c.row_json->>'reversal_of_id' IS NULL),
all_edges AS MATERIALIZED (SELECT * FROM physical_edges UNION ALL SELECT * FROM logical_edges),
removal_edges AS MATERIALIZED (SELECT DISTINCT e.source_key,e.target_key FROM all_edges e JOIN selected s ON s.row_key=e.source_key
  JOIN selected t ON t.row_key=e.target_key WHERE s.disposition='archive-remove' AND t.disposition='archive-remove' AND NOT e.staged
  AND NOT EXISTS(SELECT 1 FROM temporary_logical x WHERE x.source_key=e.source_key AND x.target_key=e.target_key AND e.kind='logical-reference')
  UNION SELECT source_key,target_key FROM historical_edges),
reach(source_key,target_key) AS (SELECT source_key,target_key FROM removal_edges UNION
  SELECT r.source_key,e.target_key FROM reach r JOIN removal_edges e ON e.source_key=r.target_key),
blockers AS (
  SELECT 'unclassified_relation'::text code,count(*)::bigint n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','app_private') AND c.relkind IN ('r','p') AND n.nspname||'.'||c.relname NOT IN (${tables.map(([name]) => literal(name)).join(',')}) HAVING count(*)>0
  UNION ALL SELECT 'active_transaction_capability',count(*) FROM selected WHERE disposition='must-be-empty' HAVING count(*)>0
  UNION ALL SELECT 'inbound_fk_source_not_covered',count(*) FROM fk_descriptors f
    WHERE f.confrelid IN (${tables.filter(([, rule]) => rule.disposition === 'archive-remove').map(([name]) => `${literal(name)}::regclass`).join(',')})
      AND f.conrelid NOT IN (${scopedTables.map(([name]) => `${literal(name)}::regclass`).join(',')}) HAVING count(*)>0
  UNION ALL SELECT 'unreviewed_retained_intent',count(*) FROM selected s WHERE disposition='retire-intent'
    AND NOT EXISTS(SELECT 1 FROM retired r WHERE r.row_key=s.row_key) HAVING count(*)>0
  UNION ALL SELECT 'deposit_header_not_eligible',count(*) FROM selected WHERE relation_name='public.lease_deposits' AND
    (row_json->>'lease_id' IS NULL OR row_json->>'status' NOT IN ('held','received','partially_returned','pending','returned','forfeited','waived')
    OR row_json->>'status' IN ('held','received','partially_returned') AND (row_json->>'archived_at' IS NOT NULL OR row_json->>'currency'<>'USD')) HAVING count(*)>0
  UNION ALL SELECT 'cycle_stage_pointer_not_nullable_fk',count(*) FROM images r
    CROSS JOIN LATERAL jsonb_object_keys(r.patch) k WHERE r.disposition='archive-remove' AND k<>'state'
    AND (NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=r.relation_oid AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped AND NOT a.attnotnull)
      OR NOT EXISTS(SELECT 1 FROM fk_descriptors f WHERE f.conrelid=r.relation_oid AND k=ANY(f.columns))) HAVING count(*)>0
  UNION ALL SELECT 'historical_correction_reversal_ambiguous',count(*) FROM selected a
    WHERE a.relation_name='public.owner_opening_balance_entries' AND a.row_json->>'entry_kind'='correction_replacement'
    AND (a.row_json->>'request_id' IS NULL OR (SELECT count(*) FROM selected b WHERE b.relation_name=a.relation_name
      AND b.row_json->>'entry_kind'='correction_reversal' AND b.row_json->'request_id'=a.row_json->'request_id')<>1
      OR EXISTS(SELECT 1 FROM selected b WHERE b.relation_name=a.relation_name AND b.row_json->>'entry_kind'='correction_reversal'
        AND b.row_json->'request_id'=a.row_json->'request_id' AND (b.row_json->>'reversal_of_entry_id' IS NULL
          OR EXISTS(SELECT 1 FROM unnest(ARRAY['organization_id','property_id','owner_person_id','currency','effective_date','component']) k
            WHERE nullif(a.row_json->>k,'') IS NULL OR jsonb_typeof(a.row_json->k)<>'string' OR a.row_json->k IS DISTINCT FROM b.row_json->k)))) HAVING count(*)>0
  UNION ALL SELECT 'historical_held_cash_source_unresolved',count(*) FROM selected a
    WHERE a.relation_name='public.owner_charge_cash_allocations' AND a.row_json->>'reversal_of_id' IS NULL
      AND NOT EXISTS(SELECT 1 FROM selected l WHERE l.relation_name='public.owner_invoice_lines'
        AND l.row_json->'id'=a.row_json->'owner_invoice_line_id' AND jsonb_typeof(l.row_json->'source_type')='string') HAVING count(*)>0
  UNION ALL SELECT 'historical_owner_expense_adjustment_ambiguous',count(*) FROM selected a JOIN selected l
    ON l.relation_name='public.owner_invoice_lines' AND l.row_json->'id'=a.row_json->'owner_invoice_line_id' AND l.row_json->>'source_type'='owner_expense'
    WHERE a.relation_name='public.owner_charge_cash_allocations' AND a.row_json->>'reversal_of_id' IS NULL
      AND (l.row_json->>'source_id' IS NULL OR EXISTS(SELECT 1 FROM selected x WHERE x.relation_name='public.expense_customer_adjustments'
        AND x.row_json->'responsibility_id'=l.row_json->'source_id' AND x.row_json->>'responsibility' IS DISTINCT FROM 'owner' AND x.row_json->>'responsibility' IS DISTINCT FROM 'tenant')
      OR (SELECT count(*) FROM selected x WHERE x.relation_name='public.expense_customer_adjustments' AND x.row_json->'responsibility_id'=l.row_json->'source_id'
        AND x.row_json->>'responsibility'='owner')>1) HAVING count(*)>0
  UNION ALL SELECT 'cross_organization_reference',count(*) FROM all_edges e,params p WHERE
    (e.source_org=p.organization_id::text OR e.target_org=p.organization_id::text) AND e.source_org IS DISTINCT FROM e.target_org HAVING count(*)>0
  UNION ALL SELECT 'unresolved_logical_reference',count(*) FROM
 (SELECT r.row_key,r.column_name FROM logical_refs r,params p WHERE r.organization_id=p.organization_id::text AND NOT r.historical
 AND NOT (r.seed AND r.row_json->>r.column_name=r.organization_id) GROUP BY r.row_key,r.column_name) eligible
 LEFT JOIN logical_row_counts rc USING(row_key,column_name) LEFT JOIN logical_auth_counts ac USING(row_key,column_name)
 WHERE coalesce(rc.n,0)+coalesce(ac.n,0)<>1 HAVING count(*)>0
  UNION ALL SELECT 'unknown_polymorphic_kind',count(*) FROM selected s JOIN
    (SELECT DISTINCT "table",type_column,"column" FROM poly_rules) r ON r."table"=s.relation_name WHERE s.row_json->>r."column" IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM poly_rules p WHERE p."table"=r."table" AND p.type_column=r.type_column AND p."column"=r."column" AND p.kind=s.row_json->>r.type_column) HAVING count(*)>0
  UNION ALL SELECT 'retained_reference_to_removed_parent',count(*) FROM all_edges e JOIN selected s ON s.row_key=e.source_key
    JOIN selected t ON t.row_key=e.target_key WHERE s.disposition<>'archive-remove' AND t.disposition='archive-remove' AND NOT e.staged
    AND NOT (EXISTS(SELECT 1 FROM retired r WHERE r.row_key=s.row_key) AND e.kind='logical-reference' AND (
 (s.relation_name='app_private.finance_category_idempotency_result_seals' AND e.column_name='result_id')
 OR (s.relation_name='app_private.tenant_commercial_document_upload_attestations' AND e.column_name='source_id'
 AND s.row_json->'organization_id'=t.row_json->'organization_id' AND s.row_json->'source_id'=t.row_json->'id'
 AND t.relation_name=CASE s.row_json->>'source_kind' WHEN 'invoice' THEN 'public.tenant_invoices' WHEN 'receipt' THEN 'public.tenant_invoice_payments' END))) HAVING count(*)>0
  UNION ALL SELECT 'unsupported_dependency_cycle',count(*) FROM reach WHERE source_key=target_key HAVING count(*)>0
  UNION ALL SELECT 'reset_rule_missing',count(*) FROM selected s WHERE s.disposition IN ('archive-remove','normalize-reviewed','retire-intent')
    AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_relation_rules r WHERE r.relation_name=s.relation_name) HAVING count(*)>0
),
archive AS (SELECT coalesce(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',primary_key,
  'row_text',row_json::text,'row_sha256',row_sha256) ORDER BY relation_name,primary_key::text),'[]'::jsonb) payload FROM selected
  WHERE disposition IN ('archive-remove','normalize-reviewed','retire-intent')),
candidates AS (SELECT r.*,0 phase,'normalization'::text kind,row_json before_json,after_json action_after,
  0::bigint depth FROM images r WHERE disposition='archive-remove' AND cardinality(changed_columns)>0
  UNION ALL SELECT r.*,1,'archive-delete',after_json,NULL::jsonb,(SELECT count(*) FROM reach q WHERE q.target_key=r.row_key)
  FROM images r WHERE disposition='archive-remove'
  UNION ALL SELECT r.*,2,'normalization',row_json,after_json,0::bigint FROM images r
  WHERE disposition='normalize-reviewed' AND cardinality(changed_columns)>0),
ordered AS (SELECT c.*,row_number() OVER(ORDER BY phase,depth,relation_name,primary_key::text)::integer ordinal,
  md5((SELECT operation_id::text FROM params)||'/'||phase::text||'/'||row_key)::uuid action_id FROM candidates c),
actions AS (SELECT coalesce(jsonb_agg(jsonb_build_object('action_id',action_id,'ordinal',ordinal,'relation_name',relation_name,'primary_key',primary_key,
  'kind',kind,'before_row_text',before_json::text,'after_row_text',action_after::text,'before_sha256',${jsonHash('before_json')},
  'after_sha256',CASE WHEN action_after IS NULL THEN NULL ELSE ${jsonHash('action_after')} END,
  'changed_columns',CASE WHEN kind='archive-delete' THEN '[]'::jsonb ELSE to_jsonb(changed_columns) END) ORDER BY ordinal),'[]'::jsonb) payload FROM ordered),
digests AS (SELECT ${jsonHash(`coalesce((SELECT jsonb_agg(jsonb_build_object('relation_name',x->'relation_name','primary_key',x->'primary_key','row_sha256',x->'row_sha256') ORDER BY x->>'relation_name',(x->'primary_key')::text) FROM jsonb_array_elements(archive.payload) x),'[]'::jsonb)`)} archive_sha256,
 ${jsonHash(`coalesce((SELECT jsonb_agg(jsonb_build_object('action_id',x->'action_id','ordinal',x->'ordinal','relation_name',x->'relation_name','primary_key',x->'primary_key','kind',x->'kind','before_sha256',x->'before_sha256','after_sha256',x->'after_sha256') ORDER BY (x->>'ordinal')::integer) FROM jsonb_array_elements(actions.payload) x),'[]'::jsonb)`)} action_sha256,
 ${jsonHash('app_private.financial_reset_continuation_snapshot((SELECT organization_id FROM params))')} source_snapshot_sha256,
 ${jsonHash('app_private.financial_reset_hosted_foreign_census((SELECT organization_id FROM params))')} foreign_snapshot_sha256,
 ${jsonHash(catalogExpression)} catalog_snapshot_sha256, ${jsonHash(ledgerExpression)} ledger_snapshot_sha256
 FROM archive CROSS JOIN actions),
summary AS (SELECT jsonb_build_object('format','nestory-server-reset-materialization-v1','operation_id',p.operation_id,'organization_id',p.organization_id,
  'source_generation',${scope.sourceGeneration},'source_sha256',${literal(scope.sourceSha256)},'policy_sha256',${literal(SERVER_MATERIALIZER_POLICY_SHA256)},
  'archive_count',jsonb_array_length(a.payload),'action_count',jsonb_array_length(c.payload),
  'archive_sha256',d.archive_sha256,'action_sha256',d.action_sha256,'source_snapshot_sha256',d.source_snapshot_sha256,'foreign_snapshot_sha256',d.foreign_snapshot_sha256,
  'catalog_snapshot_sha256',d.catalog_snapshot_sha256,'ledger_snapshot_sha256',d.ledger_snapshot_sha256,
  'counts',coalesce((SELECT jsonb_agg(jsonb_build_object('relation_name',relation_name,'disposition',disposition,'count',n) ORDER BY relation_name)
    FROM (SELECT relation_name,disposition,count(*) n FROM selected
      WHERE NOT (relation_name LIKE 'app_private.financial_reset_%' OR relation_name IN ('app_private.financial_write_controls','app_private.financial_report_source_revisions'))
      GROUP BY relation_name,disposition) q),'[]'::jsonb),
  'deleted_rows',(SELECT count(*) FROM ordered WHERE kind='archive-delete'),'normalized_rows',(SELECT count(*) FROM ordered WHERE phase=2),
  'cycle_stage_rows',(SELECT count(*) FROM ordered WHERE phase=0),'accepted',NOT EXISTS(SELECT 1 FROM blockers),
  'blockers',coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'count',n) ORDER BY code) FROM blockers),'[]'::jsonb)) payload
 FROM params p CROSS JOIN archive a CROSS JOIN actions c CROSS JOIN digests d)`;
}

export function buildServerResetPreviewSql(scope) {
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL search_path=pg_catalog,public;\nSET LOCAL timezone='UTC'; SET LOCAL enable_nestloop=off;\nSET LOCAL statement_timeout='120s';\n${materializationCtes(scope)}\nSELECT payload||jsonb_build_object('manifest_sha256',app_private.financial_reset_hash(payload)) AS summary FROM summary;\nCOMMIT;`;
}

// Direct-maintenance composition consumes these images only in PostgreSQL.
// This captures a plan; it grants no row exception and executes no row action.
export function buildServerResetMaintenanceCaptureSql({ scope, expectedManifestSha256 }) {
  assertScope(scope);
  if (!digest.test(expectedManifestSha256 ?? '')) throw Error('server_materializer_manifest_invalid');
  return `SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL enable_nestloop=off;
CREATE TEMP TABLE nestory_maintenance_materialized(summary jsonb NOT NULL,archive jsonb NOT NULL,actions jsonb NOT NULL) ON COMMIT DROP;
DO $server_reset_capture$ DECLARE v_summary jsonb; v_archive jsonb; v_actions jsonb; BEGIN
 ${materializationCtes(scope)}
 SELECT summary.payload,archive.payload,actions.payload INTO STRICT v_summary,v_archive,v_actions FROM summary CROSS JOIN archive CROSS JOIN actions;
 IF v_summary->'accepted' IS DISTINCT FROM 'true'::jsonb OR app_private.financial_reset_hash(v_summary)<>${literal(expectedManifestSha256)} THEN
   RAISE EXCEPTION 'server_reset_materialization_changed' USING ERRCODE='40001';
 END IF;
 INSERT INTO pg_temp.nestory_maintenance_materialized VALUES(v_summary,v_archive,v_actions);
END $server_reset_capture$;
CREATE TEMP TABLE nestory_maintenance_actions(action_id uuid PRIMARY KEY,ordinal integer UNIQUE NOT NULL,
 relation_oid oid NOT NULL,relation_name text NOT NULL,primary_key jsonb NOT NULL,kind text NOT NULL,
 before_row jsonb NOT NULL,after_row jsonb,before_sha256 text NOT NULL,after_sha256 text,applied boolean NOT NULL DEFAULT false) ON COMMIT DROP;
INSERT INTO pg_temp.nestory_maintenance_actions(action_id,ordinal,relation_oid,relation_name,primary_key,kind,before_row,after_row,before_sha256,after_sha256)
 SELECT (x->>'action_id')::uuid,(x->>'ordinal')::integer,(x->>'relation_name')::regclass,x->>'relation_name',x->'primary_key',
 CASE x->>'kind' WHEN 'archive-delete' THEN 'DELETE' WHEN 'normalization' THEN 'UPDATE' END,
 (x->>'before_row_text')::jsonb,(x->>'after_row_text')::jsonb,x->>'before_sha256',x->>'after_sha256'
 FROM pg_temp.nestory_maintenance_materialized m CROSS JOIN LATERAL jsonb_array_elements(m.actions) x;`;
}

// This is a block for the existing guarded PREPARE transaction, not a complete
// mutation transport. It does not manufacture actor/session/reservation context.
// Foundation guards remain active. No target row actions run in this block.
export function buildServerResetPrepareBlock({ scope, expectedManifestSha256, operationBinding }) {
  assertScope(scope);
  if (!digest.test(expectedManifestSha256 ?? '') || !operationBinding ||
      Object.keys(operationBinding).sort().join(',') !== operationFields.join(',') ||
      operationBinding.operation_id !== scope.operationId || operationBinding.organization_id !== scope.organizationId ||
      operationBinding.operation_kind !== 'reset' || operationBinding.source_generation !== scope.sourceGeneration ||
      operationBinding.target_generation !== scope.sourceGeneration + 1 || operationBinding.restore_of !== null || operationBinding.audit_actor !== null ||
      !['manifest_sha256','plan_sha256','schema_sha256','archive_sha256','action_sha256'].every(k => digest.test(operationBinding[k] ?? '')) ||
      operationBinding.manifest_sha256 !== expectedManifestSha256 || !Number.isSafeInteger(operationBinding.archive_count) || operationBinding.archive_count < 0 ||
      !Number.isSafeInteger(operationBinding.action_count) || operationBinding.action_count < 0 || timestampMicros(operationBinding.audit_timestamp) === null) {
    throw Error('server_materializer_prepare_binding_invalid');
  }
  return `SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL enable_nestloop=off;
DO $server_reset_prepare$ DECLARE v_summary jsonb; v_archive jsonb; v_actions jsonb; v_binding jsonb:=${jsonSql(operationBinding)};
BEGIN
 ${materializationCtes(scope)}
 SELECT s.payload,a.payload,c.payload INTO STRICT v_summary,v_archive,v_actions FROM summary s CROSS JOIN archive a CROSS JOIN actions c;
 IF v_summary->'accepted' IS DISTINCT FROM 'true'::jsonb OR app_private.financial_reset_hash(v_summary)<>${literal(expectedManifestSha256)}
  OR v_summary->'archive_count' IS DISTINCT FROM v_binding->'archive_count' OR v_summary->'action_count' IS DISTINCT FROM v_binding->'action_count'
  OR v_summary->'archive_sha256' IS DISTINCT FROM v_binding->'archive_sha256' OR v_summary->'action_sha256' IS DISTINCT FROM v_binding->'action_sha256'
 THEN RAISE EXCEPTION 'server_reset_materialization_changed' USING ERRCODE='40001'; END IF;
 PERFORM app_private.prepare_financial_reset_operation(v_binding);
 PERFORM app_private.archive_financial_reset_rows(${literal(scope.operationId)}::uuid,v_archive);
 PERFORM app_private.prepare_financial_reset_actions(${literal(scope.operationId)}::uuid,v_actions);
END $server_reset_prepare$;`;
}
