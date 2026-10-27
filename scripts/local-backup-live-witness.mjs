// Fixed read-only live projection. No network, credentials, customer row output,
// actor issuance or permission to replace a rehearsal digest with a supplied one.
import {createHash} from 'node:crypto';
import {validateBusinessSnapshot} from './local-backup-business-restore.mjs';
import {buildPilotCaptureSourceCtes,PILOT_BACKUP_ORGANIZATION} from './local-backup-capture.mjs';
import {buildServerResetPreviewSql,SERVER_MATERIALIZER_POLICY_SHA256} from './pilot-finance-reset-server-materializer.mjs';
import {inspectPilotRamRehearsalPlan} from './local-backup-ram-rehearsal-plan.mjs';
import {digestDatabaseJson,digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {buildPilotRehearsalBinding,pilotActorNeutralSemantics} from './local-backup-packet-bridge.mjs';
import {verifyResetMigrationLedgerDescriptors} from './pilot-finance-reset-migration-parity.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),digest=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const fail=()=>{throw Error('local_live_witness_unverified')};
const same=(a,b)=>digestDatabaseJson(a)===digestDatabaseJson(b);
const literal=v=>"'"+v.replaceAll("'","''")+"'";
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
const witnesses=new WeakMap();
const liveBindings=new WeakMap();
const census=tables=>tables.map(t=>({table_name:t.table_name,row_count:t.row_count,rows_sha256:t.rows_sha256})).sort((a,b)=>a.table_name<b.table_name?-1:a.table_name>b.table_name?1:0);
const fields=['format','status','operationId','archiveSourceSha256','observedCaptureSha256','businessCensus','securityCensus',
 'storageObjectCount','storageBucketCount','storageClosureSha256','foreignOrganizationCount','foreignCensusSha256','preview'];
export function createPilotLiveWitnessBuilder(options){
 if(!exact(options,['manifestBytes','expectedSourceSha256','operationId'])||!uuid.test(options.operationId))fail();
 const{snapshot}=validateBusinessSnapshot(options.manifestBytes,options.expectedSourceSha256);
 const business=census(snapshot.tables.filter(t=>t.capture==='full-row-image'));
 const securityNames=snapshot.tables.filter(t=>t.capture!=='full-row-image').map(t=>t.table_name).sort();
 const storageHash=hash(snapshot.storageMetadata.map(r=>r.rowSha256).sort().join('')+':'+snapshot.storageBucketMetadata.map(r=>r.rowSha256).sort().join(''));
 const scope={operationId:options.operationId,organizationId:PILOT_BACKUP_ORGANIZATION,sourceGeneration:0,sourceSha256:options.expectedSourceSha256};
 return Object.freeze({
  sql(){
   const base=buildServerResetPreviewSql(scope),start=base.indexOf('WITH RECURSIVE'),tail="SELECT payload||jsonb_build_object('manifest_sha256',app_private.financial_reset_hash(payload)) AS summary FROM summary;\nCOMMIT;";
   if(start<0||base.split(tail).length!==2||!base.endsWith(tail))fail();
   const preview=base.slice(start,-tail.length)+"SELECT payload||jsonb_build_object('manifest_sha256',app_private.financial_reset_hash(payload),'summary_text',payload::text) value FROM summary";
   return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog,public;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='120s';SET LOCAL enable_nestloop=off;
${buildPilotCaptureSourceCtes(snapshot.operationId)},live_plan AS MATERIALIZED (${preview})
SELECT jsonb_build_object('format','nestory-local-pilot-live-witness-v1','status',CASE
 WHEN (SELECT unclassified_tables FROM classified_schema)<>0 THEN 'unclassified_schema'
 WHEN nonempty_capability_tables<>0 THEN 'capabilities_present' WHEN missing_storage_references<>0 THEN 'storage_references_missing' ELSE 'ready' END,
 'operationId',${literal(options.operationId)},'archiveSourceSha256',${literal(options.expectedSourceSha256)},'observedCaptureSha256',source_sha256,
 'businessCensus',(SELECT jsonb_agg(jsonb_build_object('table_name',table_name,'row_count',row_count,'rows_sha256',rows_sha256) ORDER BY table_name COLLATE "C") FROM table_payload WHERE capture='full-row-image'),
 'securityCensus',(SELECT jsonb_agg(jsonb_build_object('table_name',table_name,'row_count',row_count,'rows_sha256',rows_sha256) ORDER BY table_name COLLATE "C") FROM table_payload WHERE capture<>'full-row-image'),
 'storageObjectCount',(SELECT count(*) FROM storage_images),'storageBucketCount',(SELECT count(*) FROM storage_buckets),
 'storageClosureSha256',encode(extensions.digest(
  coalesce((SELECT string_agg(encode(extensions.digest(row_text,'sha256'),'hex'),'' ORDER BY encode(extensions.digest(row_text,'sha256'),'hex')) FROM storage_images),'')||':'||
  coalesce((SELECT string_agg(encode(extensions.digest(row_text,'sha256'),'hex'),'' ORDER BY encode(extensions.digest(row_text,'sha256'),'hex')) FROM storage_buckets),''),'sha256'),'hex'),
 'foreignOrganizationCount',(SELECT count(*) FROM public.organizations WHERE id<>${literal(PILOT_BACKUP_ORGANIZATION)}::uuid),
 'foreignCensusSha256',app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(${literal(PILOT_BACKUP_ORGANIZATION)}::uuid)),
 'preview',(SELECT value FROM live_plan)) FROM encoded;
COMMIT;`;
  },
  accept(value,plan){
   const local=inspectPilotRamRehearsalPlan(plan),s=local.materializationReadback.summary;
   if(!exact(value,fields)||value.format!=='nestory-local-pilot-live-witness-v1'||value.status!=='ready'||value.operationId!==scope.operationId||
    value.archiveSourceSha256!==scope.sourceSha256||local.operationId!==scope.operationId||local.sourceSha256!==scope.sourceSha256||
    !digest.test(value.observedCaptureSha256)||!same(value.businessCensus,business)||
    value.storageObjectCount!==snapshot.storageMetadata.length||value.storageBucketCount!==snapshot.storageBucketMetadata.length||value.storageClosureSha256!==storageHash||
    !Number.isSafeInteger(value.foreignOrganizationCount)||value.foreignOrganizationCount<1||!digest.test(value.foreignCensusSha256)||
    !Array.isArray(value.securityCensus)||!same(value.securityCensus.map(r=>r.table_name),securityNames))fail();
   for(const r of value.securityCensus)if(!exact(r,['table_name','row_count','rows_sha256'])||!Number.isSafeInteger(r.row_count)||r.row_count<0||!digest.test(r.rows_sha256)||
    snapshot.tables.find(t=>t.table_name===r.table_name)?.mustBeEmpty&&r.row_count!==0)fail();
   const{manifest_sha256,summary_text,...live}=value.preview??{};
   if(!digest.test(manifest_sha256)||typeof summary_text!=='string'||hash(summary_text)!==manifest_sha256)fail();
   let parsed;try{parsed=JSON.parse(summary_text)}catch{fail()}
   if(!same(parsed,live)||!exact(live,Object.keys(s))||live.policy_sha256!==SERVER_MATERIALIZER_POLICY_SHA256||live.accepted!==true||!same(live.blockers,[]))fail();
   // Only explicitly named live contexts may differ. All economic planning
   // counts, policy and exact archive/action digests must match the rehearsal.
   // Step-up credential rows are deliberately absent from the recovery clone.
   // Their live materializer counts must match this transaction's security
   // census; every other planning count remains identical to the rehearsal.
   if(!Array.isArray(live.counts)||!Array.isArray(s.counts))fail();
   const economicCounts=rows=>rows.filter(r=>!securityNames.includes(r.relation_name));
   const securityCounts=live.counts.filter(r=>securityNames.includes(r.relation_name));
   const expectedSecurityCounts=value.securityCensus.filter(r=>r.row_count>0).map(r=>({relation_name:r.table_name,disposition:'preserve',count:r.row_count}));
   if(!same(economicCounts(live.counts),economicCounts(s.counts))||!same(securityCounts,expectedSecurityCounts))fail();
   const context=['source_snapshot_sha256','foreign_snapshot_sha256','catalog_snapshot_sha256','ledger_snapshot_sha256','counts'];
   for(const k of Object.keys(s))if(!context.includes(k)&&!same(live[k],s[k]))fail();
   if(context.filter(k=>k!=='counts').some(k=>!digest.test(live[k]))||live.foreign_snapshot_sha256!==value.foreignCensusSha256)fail();
   const result=freeze(structuredClone(value));witnesses.set(result,{local,live});return result;
  },
 });
}
export function inspectPilotLiveWitness(witness){const v=witnesses.get(witness);if(!v)fail();return freeze({
 operationId:witness.operationId,archiveSourceSha256:witness.archiveSourceSha256,observedCaptureSha256:witness.observedCaptureSha256,
 witnessSha256:digestDatabaseJson(witness),liveManifestSha256:witness.preview.manifest_sha256,
 localManifestSha256:v.local.materializationReadback.manifestSha256,liveSummary:structuredClone(v.live),
 executionDescriptorAdmissionRequired:true,productionAdmission:false});}

export function bindPilotLiveRehearsal({plan,witness,hostedLedgerText,sourceFiles}){
 const live=witnesses.get(witness),local=inspectPilotRamRehearsalPlan(plan),rehearsal=buildPilotRehearsalBinding(plan);
 if(!live||live.local!==local||!(sourceFiles instanceof Map)||typeof hostedLedgerText!=='string'||
  hash(hostedLedgerText)!==live.live.ledger_snapshot_sha256||live.live.catalog_snapshot_sha256!==local.materializationReadback.summary.catalog_snapshot_sha256)fail();
 let ledger;try{ledger=JSON.parse(hostedLedgerText)}catch{fail()}
 if(!Array.isArray(ledger)||ledger.length!==local.executionBaseline.ledger.length||
  !same(ledger.slice(0,local.recoveryBaseline.ledger.length),local.recoveryBaseline.ledger))fail();
 const names=[...sourceFiles.keys()].filter(k=>/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(k)).sort();
 if(names.length!==ledger.length||names.some((n,i)=>n.split('/').at(-1)!==`${ledger[i]?.version}_${ledger[i]?.name}.sql`))fail();
 const sources=names.map(n=>({name:n.split('/').at(-1),sql:sourceFiles.get(n)})),manifestBytes=Buffer.from(sourceFiles.get('supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json')??'');
 verifyResetMigrationLedgerDescriptors(ledger,sources,manifestBytes);
 // Independently prove that the rehearsed execution descriptors used these
 // same SQL bytes. A coherent replacement hosted ledger/source pair cannot
 // substitute a different forward migration for the one actually rehearsed.
 verifyResetMigrationLedgerDescriptors(local.executionBaseline.ledger,sources,manifestBytes);
 const s=live.live,body={format:'nestory-local-pilot-live-binding-v1',rehearsalPlanSha256:rehearsal.planSha256,
  operationId:rehearsal.operationId,organizationId:rehearsal.organizationId,archiveSourceSha256:rehearsal.sourceSha256,
  observedCaptureSha256:witness.observedCaptureSha256,witnessSha256:digestDatabaseJson(witness),sourceGeneration:0,targetGeneration:1,
  materialization:{manifestSha256:witness.preview.manifest_sha256,policySha256:s.policy_sha256,sourceSnapshotSha256:s.source_snapshot_sha256,
   foreignSnapshotSha256:s.foreign_snapshot_sha256,archiveSha256:s.archive_sha256,actionSha256:s.action_sha256,archiveRows:s.archive_count,actionCount:s.action_count},
  recoveryBaseline:rehearsal.recoveryBaseline,executionBaseline:{schemaSha256:rehearsal.executionBaseline.schemaSha256,ledgerSha256:digestJson(ledger),migrationCount:ledger.length,
   databaseCatalogSha256:s.catalog_snapshot_sha256,databaseLedgerSha256:s.ledger_snapshot_sha256}};
 const result=freeze({...body,planSha256:digestJson(body)});liveBindings.set(result,{rehearsal,witness});return result;
}
export function assertPilotLiveEconomicSemantics({liveBinding,rehearsal,phases}){
 const bound=liveBindings.get(liveBinding);if(!bound||!same(rehearsal.binding,bound.rehearsal))fail();
 const observed=pilotActorNeutralSemantics(phases),expected=rehearsal.semantics;
 if(phases.zeroPlan.operation_id!==liveBinding.operationId||phases.zeroPlan.manifest_sha256!==liveBinding.materialization.manifestSha256||
  phases.zeroPlan.reset_plan_sha256!==liveBinding.planSha256||['economicZeroSha256','continuationSha256','reportReviewSha256'].some(k=>observed[k]!==expected[k]))fail();
 return true;
}
