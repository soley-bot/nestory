// Fixed reviewed graph and SQL construction. No connections or runtime authority.
import { isDeepStrictEqual } from 'node:util';
import {isPilotSingleAdminZeroPlan,assertPilotSingleAdminOperation} from './pilot-finance-reset-single-admin-policy.mjs';
import { assertOperatorPacket, canonicalJson, hashBytes, operationBusinessDate, operationInvoiceDatePolicy } from './pilot-finance-reset-operator-core.mjs';
import { exactKeys, same } from './pilot-finance-reset-hosted-protocol.mjs';
import { RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';
import { buildActionTransactionSql, buildEmptyBooksActionTransactionSql, sqlDoBlock } from './pilot-finance-reset-executor-local.mjs';
import { assertEmptyBooksContinuation, EMPTY_BOOKS_MIGRATION } from './pilot-finance-reset-executor-plan.mjs';
import { schemaCensusSql } from './ips-readiness-recovery-core.mjs';

export const HOSTED_ACTIONS = Object.freeze(['freeze','checkpoint','prepare','seal','execute','prepare-recovery','execute-recovery']);
export const TRANSPORT_SOURCE_FILES = Object.freeze([
 'scripts/pilot-finance-reset-single-admin-policy.mjs',
 'scripts/pilot-finance-reset-hosted-transport.mjs','scripts/pilot-finance-reset-hosted-transport-protocol.mjs',
 'scripts/pilot-finance-reset-operator-core.mjs','scripts/pilot-finance-reset-hosted-protocol.mjs',
 'scripts/pilot-finance-reset-no-backup-core.mjs',
 'scripts/pilot-finance-reset-executor-local.mjs','scripts/pilot-finance-reset-executor-plan.mjs',
 'scripts/pilot-finance-reset-retired-journal-core.mjs',
 'scripts/pilot-finance-reset-registry.mjs','scripts/ips-readiness-recovery-core.mjs','scripts/hosted-migration-parity-core.mjs',
 'scripts/pilot-finance-reset-migration-parity.mjs','supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json',
 'supabase/migrations/20261024013624_financial_reset_hosted_operation_reservation.sql',
 `supabase/migrations/${EMPTY_BOOKS_MIGRATION}`,
]);
export const digestPattern = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
// Server action IDs are MD5 digests cast to uuid, with no RFC-v4 bit rewrite.
const actionUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const fail = code => { throw new Error(`hosted_transport_${code}`); };
export const literal = value => value === null ? 'NULL' : `'${String(value).replace(/'/g,"''")}'`;
export const jsonSql = value => `${literal(canonicalJson(value))}::jsonb`;
export const digestJson = value => hashBytes(canonicalJson(value));
// Parsed database numbers may have fractional values. Their reviewed raw text
// and stored database digest remain authoritative; the integer-only packet
// canonicalizer must not serialize these financial values.
export const sameDatabaseJson = (a,b) => isDeepStrictEqual(a,b);
// This digest identifies a parsed read-only observation in the local action
// journal. It is not a PostgreSQL financial-plan/row digest and cannot replace
// any reviewed raw-text hash or database-provided immutable receipt hash.
export function digestDatabaseJson(value) {
 function ordered(v) {
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v)) {
   if(Object.keys(v).length!==v.length)fail('database_observation_json_invalid');
   return v.map(ordered);
  }
  if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)
   return Object.fromEntries(Object.keys(v).sort().map(key=>[key,ordered(v[key])]));
  fail('database_observation_json_invalid');
 }
 return hashBytes(JSON.stringify(ordered(value)));
}
export function validateZeroPlanText(artifacts,expectedDigest) {
 const raw=artifacts.zeroPlanText;
 if(typeof raw!=='string'||!digestPattern.test(expectedDigest)||hashBytes(raw)!==expectedDigest) fail('zero_plan_text_digest_invalid');
 let parsed;try{parsed=JSON.parse(raw);}catch{fail('zero_plan_text_invalid');}
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||!sameDatabaseJson(parsed,artifacts.zeroPlan)) fail('zero_plan_text_mismatch');
 return raw;
}
// The historical schema remains exact and unversioned. The new discriminator
// opts into an independently reviewed empty-books roster, never ordinary billing.
export function validateReviewedZeroPlanShape(z,continuation){
 const versioned=z&&Object.hasOwn(z,'version'),base=['operation_id','organization_id','manifest_sha256','reset_plan_sha256',
  'maker_actor_id','reviewer_actor_id','effective_date','currencies','scopes'];
 if(!exactKeys(z,[...base,...(versioned?['version']:[]),...(z&&Object.hasOwn(z,'approval_policy')?['approval_policy']:[])])||!Array.isArray(z.scopes))fail('zero_plan_shape_invalid');
 if(versioned&&(z.version!==4||continuation?.version!==4||continuation.invoice_date_policy!=='empty-books-no-invoices'))fail('zero_plan_version_invalid');
 isPilotSingleAdminZeroPlan(z);
 const scope=['property_id','property_owner_id','owner_person_id','ownership_percent','ownership_roster_hash','currency','property_row_sha256','property_archived_at'];
 for(const row of z.scopes)if(!exactKeys(row,[...scope,...(versioned?['owner_person_row_sha256']:[])])||
  versioned&&!digestPattern.test(row.owner_person_row_sha256))fail('zero_scope_shape_invalid');
 return z;
}
export const sortDescriptors = rows => [...rows].sort((a,b) => canonicalJson(a)<canonicalJson(b)?-1:canonicalJson(a)>canonicalJson(b)?1:0);
// PostgreSQL timestamps carry up to six fractional digits. Parse only whole
// seconds through Date, then add the untouched fraction as integer microseconds.
// The round trip rejects calendar normalization (for example February 30).
export function timestampMicros(value) {
 if(typeof value!=='string')return null;
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!match||match[1].startsWith('0000-'))return null;
 const utc=Date.parse(`${match[1]}Z`),instant=Date.parse(`${match[1]}${match[3]}`);
 if(!Number.isFinite(utc)||!Number.isFinite(instant)||new Date(utc).toISOString().slice(0,19)!==match[1])return null;
 return BigInt(instant)*1000n+BigInt((match[2]??'').padEnd(6,'0'));
}

// Reuse the actual native catalog definition, including ACLs/function bodies,
// rather than trusting caller-supplied financial_reset_operations metadata.
const catalogStart = schemaCensusSql.indexOf('WITH objects AS (');
const catalogEnd = schemaCensusSql.indexOf(") SELECT jsonb_build_object('kind',kind,'name',name,'sha256'");
if (catalogStart<0 || catalogEnd<catalogStart) fail('catalog_source_shape_changed');
const catalogCte = schemaCensusSql.slice(catalogStart,catalogEnd+1);
export const catalogExpression = `(${catalogCte} SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name,
 'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind COLLATE "C",name COLLATE "C"),'[]'::jsonb) FROM objects)`;
export const ledgerExpression = `(SELECT coalesce(jsonb_agg(jsonb_build_object('version',m.version,'name',m.name,'statements',
 coalesce((SELECT jsonb_agg(jsonb_build_object('byteLength',octet_length(replace(s.statement,E'\\r\\n',E'\\n')),
 'sha256',encode(extensions.digest(replace(s.statement,E'\\r\\n',E'\\n'),'sha256'),'hex')) ORDER BY s.ordinality)
 FROM unnest(m.statements) WITH ORDINALITY s(statement,ordinality)),'[]'::jsonb)) ORDER BY m.version),'[]'::jsonb)
 FROM supabase_migrations.schema_migrations m)`;

export function hostedBinding(packet,continuation,recovery=null) {
 assertOperatorPacket(packet);
 const o=packet.operation,b=packet.databaseBinding;
 validateEmptyBooksBinding(o,continuation);
 const result={version:1,operation_id:o.operationId,project_ref:o.projectRef,organization_id:o.organizationId,
  packet_sha256:packet.packetSha256,main_sha:o.mainSha,sources_sha256:packet.sourcesSha256,schema_sha256:packet.schemaSha256,
  ledger_sha256:packet.ledgerSha256,source_snapshot_sha256:packet.sourceSnapshotSha256,source_generation:o.sourceGeneration,
  target_generation:o.targetGeneration,cutoff:o.cutoff,issue_date:o.issueDate,timezone:o.timezone,
  execution_business_date:operationBusinessDate(o),invoice_date_policy:operationInvoiceDatePolicy(o),
  manifest_sha256:b.manifestSha256,plan_sha256:b.planSha256,archive_sha256:b.archiveSha256,action_sha256:b.actionSha256,
  archive_artifact_sha256:packet.artifacts.archive.sha256,archive_count:packet.archiveRows,action_count:packet.actionCount,
  zero_review_sha256:b.zeroReviewSha256,continuation_semantic_sha256:b.continuationSemanticSha256,
  report_review_sha256:b.reportReviewSha256,continuation_semantic:structuredClone(continuation)};
 if(recovery) result.recovery={operation_id:recovery.review.operation.operation_id,
  source_generation:recovery.review.operation.source_generation,target_generation:recovery.review.operation.target_generation,
  plan_sha256:recovery.review.operation.plan_sha256,action_sha256:recovery.review.operation.action_sha256,
  action_count:recovery.review.operation.action_count,report_checkpoint_sha256:recovery.review.phaseBinding.report_checkpoint_sha256,
  phase_binding_sha256:recovery.review.phaseBindingSha256,review_artifact_sha256:recovery.artifactSha256,
  execution_business_date:recovery.review.executionBusinessDate};
 return result;
}

function validateEmptyBooksBinding(operation,continuation) {
 if(continuation?.version!==4&&operationInvoiceDatePolicy(operation)!=='empty-books-no-invoices')return;
 try { assertEmptyBooksContinuation(continuation); } catch { fail('empty_books_semantic_invalid'); }
 if(operationInvoiceDatePolicy(operation)!=='empty-books-no-invoices'||
  continuation.execution_business_date!==operationBusinessDate(operation)||continuation.issue_date!==operation.issueDate||
  continuation.billing_period_start!==operation.cutoff) fail('empty_books_binding_invalid');
}

const operationFields=['operation_id','organization_id','operation_kind','restore_of','source_generation','target_generation',
 'manifest_sha256','plan_sha256','schema_sha256','archive_sha256','action_sha256','archive_count','action_count','audit_timestamp','audit_actor'];
const rowFields=['action_id','ordinal','relation_name','primary_key','kind','before_row_text','after_row_text','before_sha256','after_sha256','changed_columns'];
// Native phase-recovery sources alone permit these exact generated-row removals.
// Preserved lease contracts never become eligible for a reset deletion.
const recoveryPruneRelations=new Set([
 'public.owner_opening_balance_requests','public.owner_opening_balance_entries','public.lease_terms','public.lease_billing_terms',
 'public.finance_income_items','public.tenant_invoices','public.tenant_invoice_lines','public.tenant_invoice_rent_segments',
 'public.management_fee_occurrences','public.owner_invoices','public.owner_invoice_lines','public.rent_generation_exceptions',
 'public.owner_event_allocation_sets','public.owner_event_owner_allocations','public.owner_component_movements',
 'public.owner_balance_periods','public.owner_balance_period_components',
]);
// Compare database JSON numeric tokens without coercing financial decimals or
// bigint-sized values through the operator packet's integer-only canonicalizer.
const rowNumberSource=Symbol('database-json-number-source');
function comparisonRow(text) {
 return JSON.parse(text,(key,value,context)=>{
  if(typeof value!=='number')return value;
  if(typeof context?.source!=='string')fail('lossless_row_comparison_required');
  return {[rowNumberSource]:context.source};
 });
}
function sameRowValue(a,b) {
 if(a===b)return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(a[rowNumberSource]!==undefined||b[rowNumberSource]!==undefined)return a[rowNumberSource]===b[rowNumberSource];
 if(Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);
 return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameRowValue(a[k],b[k]));
}
function changedRowColumns(a) {
 const before=comparisonRow(a.before_row_text),after=comparisonRow(a.after_row_text);
 return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>!sameRowValue(before[k],after[k])).sort();
}
function validateRows(actions,organization,recovery) {
 if(!Array.isArray(actions)||!actions.length) fail('actions_missing');
 for(const [index,a] of actions.entries()) {
  if(!exactKeys(a,rowFields)&&!exactKeys(a,[...rowFields,'insert_columns'])) fail('action_fields_invalid');
  const rule=RESET_REGISTRY[a.relation_name];
  const ordinary=rule&&['archive-remove','normalize-reviewed','retire-intent'].includes(rule.disposition);
  const allowed=recovery?(a.kind==='restore'?ordinary:a.kind==='recovery-prune'?recoveryPruneRelations.has(a.relation_name):
   a.kind==='recovery-repair'&&a.relation_name==='public.lease_terms'):ordinary;
  if(!allowed||!actionUuid.test(a.action_id)||a.ordinal!==index+1||
   (!recovery&&!['archive-delete','normalization'].includes(a.kind))||
   (recovery&&!['restore','recovery-prune','recovery-repair'].includes(a.kind))||
   (a.kind==='archive-delete'&&rule.disposition!=='archive-remove')) fail('action_outside_closed_registry');
  const images={};
  for(const [field,hash] of [['before_row_text','before_sha256'],['after_row_text','after_sha256']]) {
   if(a[field]===null) {if(a[hash]!==null) fail('row_digest_invalid');continue;}
   if(typeof a[field]!=='string'||!digestPattern.test(a[hash])||hashBytes(a[field])!==a[hash]) fail('row_digest_invalid');
   let row;try{row=JSON.parse(a[field]);}catch{fail('row_json_invalid');}
   if(!row||Array.isArray(row)||row.organization_id!==organization||
    Object.entries(a.primary_key).some(([key,value])=>!same(row[key],value))) fail('row_scope_invalid');
   images[field]=row;
  }
  if(recovery&&a.kind==='recovery-prune'&&(!images.before_row_text||a.after_row_text!==null||!same(a.changed_columns,[]))) fail('recovery_prune_invalid');
  if(recovery&&a.kind==='recovery-repair') {
   const before=images.before_row_text,after=images.after_row_text;
   if(!before||!after||!Array.isArray(a.changed_columns)||before.status!=='expired'||after.status!=='active')fail('recovery_repair_invalid');
   const changed=changedRowColumns(a);
   if(!same(changed,[...a.changed_columns].sort())||changed.some(k=>!['status','updated_at','updated_by'].includes(k)))fail('recovery_repair_invalid');
  }
  if(recovery&&a.kind==='restore'&&images.before_row_text) {
   const after=images.after_row_text;
   if(!after||!Array.isArray(a.changed_columns))fail('recovery_restore_invalid');
   const changed=changedRowColumns(a);
   if(!same(changed,[...a.changed_columns].sort()))fail('recovery_restore_invalid');
  }
 }
 // This is the existing exact row engine, with its synthetic actor/phase branch
 // deliberately never selected. Private DB validators remain authoritative.
 buildActionTransactionSql('10000000-0000-4000-8000-000000000001',actions,null,null,recovery);
}
export function validateArtifacts(packet,artifacts,recovery=null) {
 const o=packet.operation,b=packet.databaseBinding;
 validateZeroPlanText(artifacts,b.zeroReviewSha256);
 validateReviewedZeroPlanShape(artifacts.zeroPlan,artifacts.continuationPlan);
 assertPilotSingleAdminOperation(artifacts.zeroPlan,o);
 if(!same(artifacts.manifest,{manifest_sha256:b.manifestSha256,source_snapshot_sha256:packet.sourceSnapshotSha256,
  schema_sha256:packet.schemaSha256,ledger_sha256:packet.ledgerSha256})||
  !exactKeys(artifacts.actions,['operation','actions'])||!same(artifacts.reportPlan,{report_review_sha256:b.reportReviewSha256})) fail('artifact_binding_invalid');
 const expected={operation_id:o.operationId,organization_id:o.organizationId,operation_kind:'reset',restore_of:null,
  source_generation:o.sourceGeneration,target_generation:o.targetGeneration,manifest_sha256:b.manifestSha256,
  plan_sha256:b.planSha256,schema_sha256:packet.schemaSha256,archive_sha256:b.archiveSha256,action_sha256:b.actionSha256,
  archive_count:packet.archiveRows,action_count:packet.actionCount,audit_timestamp:artifacts.actions.operation.audit_timestamp,audit_actor:null};
 if(!exactKeys(artifacts.actions.operation,operationFields)||!same(artifacts.actions.operation,expected)||
  timestampMicros(expected.audit_timestamp)===null||
  artifacts.actions.actions.length!==packet.actionCount) fail('operation_artifact_invalid');
 validateRows(artifacts.actions.actions,o.organizationId,false);
 if(!Array.isArray(artifacts.archive)||artifacts.archive.length!==packet.archiveRows) fail('archive_count_invalid');
 const seen=new Set();
 for(const r of artifacts.archive) {
  if(!exactKeys(r,['relation_name','primary_key','row_text','row_sha256'])||!RESET_REGISTRY[r.relation_name]||
    !['archive-remove','normalize-reviewed','retire-intent'].includes(RESET_REGISTRY[r.relation_name].disposition)||
    typeof r.row_text!=='string'||hashBytes(r.row_text)!==r.row_sha256) fail('archive_row_invalid');
  let row;try{row=JSON.parse(r.row_text);}catch{fail('archive_row_invalid');}
  const key=canonicalJson([r.relation_name,r.primary_key]);
  if(row.organization_id!==o.organizationId||seen.has(key)||Object.entries(r.primary_key).some(([k,v])=>!same(row[k],v))) fail('archive_scope_invalid');
  seen.add(key);
 }
 const c=artifacts.continuationPlan,z=artifacts.zeroPlan;
 validateEmptyBooksBinding(o,c);
 if(!c||Object.hasOwn(c,'source_sha256')||c.billing_period_start!==o.cutoff||c.issue_date!==o.issueDate||!uuid.test(c.actor_id)||
   !z||z.operation_id!==o.operationId||z.organization_id!==o.organizationId||z.manifest_sha256!==b.manifestSha256||
   z.reset_plan_sha256!==b.planSha256||z.effective_date!==o.cutoff) fail('phase_review_invalid');
 if(recovery) {
  if(!exactKeys(recovery,['review','artifactSha256'])||!digestPattern.test(recovery.artifactSha256)||
    !exactKeys(recovery.review,['operation','actions','phaseBinding','phaseBindingSha256','executionBusinessDate'])) fail('recovery_review_invalid');
  const r=recovery.review,ro=r.operation;
  if(!exactKeys(ro,operationFields)||!uuid.test(ro.operation_id)||ro.operation_id===o.operationId||ro.organization_id!==o.organizationId||
   ro.operation_kind!=='restore'||ro.restore_of!==o.operationId||ro.source_generation!==o.targetGeneration||
   ro.target_generation!==o.targetGeneration+1||ro.manifest_sha256!==b.manifestSha256||ro.schema_sha256!==packet.schemaSha256||
   ro.archive_sha256!==b.archiveSha256||ro.archive_count!==packet.archiveRows||ro.action_count!==r.actions.length||ro.audit_actor!==null||
   timestampMicros(ro.audit_timestamp)===null||
   ![ro.plan_sha256,ro.action_sha256,r.phaseBindingSha256,r.phaseBinding?.report_checkpoint_sha256].every(v=>digestPattern.test(v))||
   !/^\d{4}-\d{2}-\d{2}$/.test(r.executionBusinessDate)) fail('recovery_review_binding_invalid');
  validateRows(r.actions,o.organizationId,true);
 }
 return artifacts;
}

export function observationSql(packet,binding,authorizationId=null,action=null) {
 const id=binding.recovery?.operation_id??binding.operation_id,org=literal(binding.organization_id),op=literal(id),base=literal(binding.operation_id);
 const emptyBooks=binding.continuation_semantic?.version===4;
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='30s'; SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC';
SELECT jsonb_build_object('catalog',${catalogExpression},'ledger',${ledgerExpression},
 'businessDate',app_private.rent_business_date(${org}::uuid,statement_timestamp()),
 'timezone',(SELECT operational_timezone FROM public.organizations WHERE id=${org}::uuid),
 'sourceSha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(${org}::uuid)),
 'foreignSha256',app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(${org}::uuid)),
 'control',(SELECT jsonb_build_object('generation',generation,'status',status,'cutoff',financial_start_date) FROM app_private.financial_write_controls WHERE organization_id=${org}::uuid),
 'reservation',(SELECT jsonb_build_object('binding',binding,'bindingSha256',binding_sha256,'foreignSha256',foreign_sha256,'backendPid',backend_pid,'transactionId',transaction_id::text) FROM app_private.financial_reset_hosted_reservations WHERE operation_id=${base}::uuid),
 'recoveryReservation',(SELECT jsonb_build_object('binding',binding,'bindingSha256',binding_sha256,'backendPid',backend_pid,'transactionId',transaction_id::text) FROM app_private.financial_reset_hosted_recovery_reservations WHERE operation_id=${op}::uuid),
 'recoveryCheckpoint',(SELECT jsonb_build_object('bindingSha256',binding_sha256,'authoritySha256',authority_sha256,'sourceSha256',source_sha256,'foreignSha256',foreign_sha256,'backendPid',backend_pid,'transactionId',transaction_id::text) FROM app_private.financial_reset_hosted_checkpoints WHERE operation_id=${base}::uuid),
 'actionReceipt',${authorizationId&&['prepare','seal'].includes(action)?`(SELECT jsonb_build_object('operationId',operation_id,'organizationId',organization_id,'action',action,
  'binding',binding,'bindingSha256',binding_sha256,'authorizationId',authorization_id,'authoritySha256',authority_sha256,'actorId',actor_id,
  'backendPid',backend_pid,'transactionId',transaction_id::text,'result',result_json,'sha256',result_sha256,
  'hashValid',binding_sha256=app_private.financial_reset_hash(binding) AND result_sha256=app_private.financial_reset_hash(result_json))
  FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=${op}::uuid AND action=${literal(action)})`:'NULL::jsonb'},
 'operation',(SELECT to_jsonb(o)-ARRAY['database_oid','database_name','audit_actor'] FROM app_private.financial_reset_operations o WHERE operation_id=${op}::uuid),
 'appliedCount',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=${op}::uuid AND applied_at IS NOT NULL),
 'archiveCount',(SELECT count(*) FROM app_private.financial_reset_archive_rows WHERE operation_id=${base}::uuid),
 'actionCount',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=${op}::uuid),
 'capabilityCount',(SELECT count(*) FROM app_private.financial_reset_transaction_capabilities WHERE organization_id=${org}::uuid),
 'zero',(SELECT jsonb_build_object('status',status,'reviewSha256',review_sha256,'planSha256',app_private.financial_reset_hash(plan_json),'plan',plan_json,'backendPid',execution_backend,'transactionId',execution_xid::text) FROM app_private.financial_reset_zero_plans WHERE operation_id=${base}::uuid),
 'continuation',(SELECT jsonb_build_object('status',status,'semantic',plan_json-'source_sha256','reviewSha256',review_sha256${emptyBooks?",'result',result_json,'unchanged',before_images=after_images":''}) FROM app_private.financial_reset_continuation_plans WHERE operation_id=${base}::uuid),
 ${emptyBooks?`'emptyBooks',(SELECT jsonb_build_object('contractsSha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(${org}::uuid)),
  'tenantInvoices',(SELECT count(*) FROM public.tenant_invoices WHERE organization_id=${org}::uuid),
  'ownerInvoices',(SELECT count(*) FROM public.owner_invoices WHERE organization_id=${org}::uuid))
  FROM app_private.financial_reset_continuation_plans WHERE operation_id=${base}::uuid AND plan_json->'version'='4'::jsonb),`:''}
 'phaseFences',(SELECT coalesce(jsonb_agg(jsonb_build_object('phase',phase,'backendPid',backend_pid,'transactionId',transaction_id::text) ORDER BY phase),'[]'::jsonb) FROM app_private.financial_reset_phase_fences WHERE operation_id=${op}::uuid),
 'approvalCount',(SELECT count(*) FROM app_private.financial_reset_zero_approvals WHERE operation_id=${base}::uuid AND review_sha256=${literal(binding.zero_review_sha256)}),
 'checkpoint',(SELECT jsonb_build_object('kind',checkpoint_kind,'generation',generation,'sha256',checkpoint_sha256,
  'hashValid',checkpoint_sha256=app_private.financial_reset_hash(result_json),'currentImagesMatch',after_images=app_private.financial_reset_continuation_snapshot(${org}::uuid),
  'result',result_json,'backendPid',execution_backend,'transactionId',execution_xid::text) FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${op}::uuid),
 'authorization',${authorizationId?`app_private.financial_reset_hosted_actor_authorization_status(${literal(authorizationId)}::uuid,${jsonSql(binding)},${literal(action)})`:'NULL::jsonb'});
COMMIT;`;
}

export function mutationSql({binding,action,authorizationId,authoritySha256,observation,artifacts,recovery}) {
 if(!HOSTED_ACTIONS.includes(action)||!uuid.test(authorizationId)||!digestPattern.test(authoritySha256)) fail('dispatch_descriptor_invalid');
 const id=binding.recovery?.operation_id??binding.operation_id,op=literal(id),review=artifacts.continuationPlan;
 const statements=[`BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;`,
  `SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='150s'; SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC';`,
  `SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||${literal(binding.organization_id)},0));`,
  sqlDoBlock(`BEGIN IF ${catalogExpression} IS DISTINCT FROM ${jsonSql(observation.catalog)} OR ${ledgerExpression} IS DISTINCT FROM ${jsonSql(observation.ledger)} THEN RAISE EXCEPTION 'hosted_transport_catalog_changed' USING ERRCODE='40001'; END IF; END`, 'catalog'),
  `SELECT app_private.consume_financial_reset_actor_authorization(${literal(authorizationId)}::uuid,${jsonSql(binding)},${literal(action)});`];
 if(action==='freeze') statements.push(`SELECT app_private.reserve_financial_reset_hosted_operation(${jsonSql(binding)});`);
 else {
  statements.push(`SELECT app_private.assert_financial_reset_hosted_reservation(${jsonSql(binding)},${literal(action)});`);
  if(action==='checkpoint') statements.push(`SELECT app_private.checkpoint_financial_reset_hosted_operation(${jsonSql(binding)},${literal(authoritySha256)});`);
  if(action==='prepare') statements.push(`SELECT app_private.prepare_financial_reset_operation(${jsonSql(artifacts.actions.operation)});`,
   `SELECT app_private.archive_financial_reset_rows(${op}::uuid,${jsonSql(artifacts.archive)});`,
   `SELECT app_private.prepare_financial_reset_actions(${op}::uuid,${jsonSql(artifacts.actions.actions)});`);
  if(action==='seal') statements.push(`SELECT app_private.seal_financial_reset_operation(${op}::uuid);`,
   `SELECT app_private.prepare_financial_reset_zero_plan(${op}::uuid,${literal(validateZeroPlanText(artifacts,binding.zero_review_sha256))}::jsonb,${literal(binding.zero_review_sha256)});`);
  if(action==='prepare-recovery') {
   if(!recovery) fail('recovery_review_required');
   statements.push(`SELECT app_private.reserve_financial_reset_hosted_recovery(${jsonSql(binding)});`,
    `SELECT app_private.prepare_financial_reset_operation(${jsonSql(recovery.review.operation)});`,
    sqlDoBlock(`BEGIN IF app_private.financial_reset_hash(${jsonSql(recovery.review.phaseBinding)})<>${literal(binding.recovery.phase_binding_sha256)} THEN RAISE EXCEPTION 'hosted_transport_recovery_review_changed'; END IF; END`, 'phase'),
    `SELECT app_private.prepare_financial_reset_recovery(${op}::uuid,${jsonSql(recovery.review.phaseBinding)});`,
    `SELECT app_private.prepare_financial_reset_actions(${op}::uuid,${jsonSql(recovery.review.actions)});`,
    `SELECT app_private.seal_financial_reset_operation(${op}::uuid);`);
  }
  if(action==='execute'||action==='execute-recovery') {
   const isRecovery=action==='execute-recovery';
   if(isRecovery&&!recovery) fail('recovery_review_required');
   const nativeActions=isRecovery?recovery.review.actions:artifacts.actions.actions;
   const inner=artifacts.continuationPlan.version===4?buildEmptyBooksActionTransactionSql(id,nativeActions,null,isRecovery):
     buildActionTransactionSql(id,nativeActions,null,null,isRecovery);
   if(!inner.startsWith('BEGIN;\n')||!inner.endsWith('\nCOMMIT;')) fail('action_builder_changed');
   statements.push(inner.slice(7,-8));
   if(!isRecovery) statements.push(`SET LOCAL statement_timeout='${review.version===4?'300':'60'}s';`,
    `SELECT app_private.apply_financial_reset_known_zero(${op}::uuid);`,
    `SET LOCAL statement_timeout='60s';`,
    sqlDoBlock(`DECLARE reviewed jsonb; BEGIN
     IF app_private.financial_reset_hash(${jsonSql(review)})<>${literal(binding.continuation_semantic_sha256)} THEN RAISE EXCEPTION 'hosted_transport_semantic_changed'; END IF;
     reviewed:=${jsonSql(review)}||jsonb_build_object('source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(${literal(binding.organization_id)}::uuid)));
     PERFORM app_private.prepare_financial_reset_continuation(${op}::uuid,reviewed,app_private.financial_reset_hash(reviewed));
     PERFORM app_private.apply_financial_reset_continuation(${op}::uuid); END`, 'continuation'),
    `SELECT app_private.apply_financial_reset_reports(${op}::uuid);`);
   statements.push(sqlDoBlock(`BEGIN IF (SELECT foreign_sha256 FROM app_private.financial_reset_hosted_reservations WHERE operation_id=${literal(binding.operation_id)}::uuid) IS DISTINCT FROM app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(${literal(binding.organization_id)}::uuid)) THEN RAISE EXCEPTION 'hosted_transport_foreign_rows_changed'; END IF; END`, 'foreign'));
  }
 }
 if(['prepare','seal'].includes(action))statements.push(`SELECT app_private.record_financial_reset_hosted_action_receipt(${jsonSql(binding)},${literal(action)},${literal(authorizationId)}::uuid,${literal(authoritySha256)});`);
 statements.push('COMMIT;');return statements.join('\n');
}
