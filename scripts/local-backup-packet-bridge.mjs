// Acyclic, actor-neutral economic semantics for the saved rehearsal→packet
// bridge. No actor authorization or runtime custody can be obtained here.
import {digestDatabaseJson,digestJson,sortDescriptors,validateArtifacts,validateReviewedZeroPlanShape} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {assertEmptyBooksContinuation,patchRowText} from './pilot-finance-reset-executor-plan.mjs';
import {inspectPilotRamRehearsalPlan} from './local-backup-ram-rehearsal-plan.mjs';
import {assertOperatorPacket,hashBytes} from './pilot-finance-reset-operator-core.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const fail=()=>{throw Error('local_rehearsal_packet_bridge_invalid')};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
function descriptors(baseline){
 if(!baseline||!Array.isArray(baseline.catalog)||!baseline.catalog.length||!Array.isArray(baseline.ledger)||!baseline.ledger.length)fail();
 const seen=new Set();for(const d of baseline.catalog){
  if(!exact(d,['kind','name','sha256'])||typeof d.kind!=='string'||typeof d.name!=='string'||!d.kind||!d.name||!hash.test(d.sha256)||seen.has(d.kind+'\0'+d.name))fail();
  seen.add(d.kind+'\0'+d.name);
 }
 let version='';for(const d of baseline.ledger){
  if(!exact(d,['version','name','statements'])||!/^\d{14}$/.test(d.version)||d.version<=version||!/^[a-z0-9_]+$/.test(d.name)||!Array.isArray(d.statements)||!d.statements.length||
   d.statements.some(s=>!exact(s,['byteLength','sha256'])||!Number.isSafeInteger(s.byteLength)||s.byteLength<1||!hash.test(s.sha256)))fail();version=d.version;
 }
 return{schemaSha256:digestJson(sortDescriptors(baseline.catalog)),ledgerSha256:digestJson(baseline.ledger),migrationCount:baseline.ledger.length};
}
// Derive the stable plan identity BEFORE actor reviews, recovery proof and the
// final packet exist. The planner brand binds actual accepted archive/readback;
// no supplied digest or success boolean can substitute for that provenance.
export function buildPilotRehearsalBinding(plan){
 const inspected=inspectPilotRamRehearsalPlan(plan),{summary,manifestSha256}=inspected.materializationReadback;
 const recoveryBaseline=descriptors(inspected.recoveryBaseline),execution=descriptors(inspected.executionBaseline);
 if(!inspected.executionBaseline.ledger.some(d=>d.version==='20261027005615'&&d.name==='financial_reset_empty_books_preserved_contracts')||
  summary.operation_id!==inspected.operationId||summary.organization_id!==inspected.organizationId||summary.source_sha256!==inspected.sourceSha256||
  summary.archive_count<1||summary.action_count<1)fail();
 const body={format:'nestory-local-pilot-rehearsal-binding-v1',operationId:inspected.operationId,organizationId:inspected.organizationId,
  sourceSha256:inspected.sourceSha256,sourceGeneration:summary.source_generation,targetGeneration:summary.source_generation+1,
  materialization:{manifestSha256,policySha256:summary.policy_sha256,sourceSnapshotSha256:summary.source_snapshot_sha256,
   foreignSnapshotSha256:summary.foreign_snapshot_sha256,archiveSha256:summary.archive_sha256,actionSha256:summary.action_sha256,
   archiveRows:summary.archive_count,actionCount:summary.action_count},recoveryBaseline,
  executionBaseline:{...execution,databaseCatalogSha256:summary.catalog_snapshot_sha256,databaseLedgerSha256:summary.ledger_snapshot_sha256}};
 return freeze({...body,planSha256:digestJson(body)});
}
export function bindPilotRehearsalSemantics(plan,phases){
 const binding=buildPilotRehearsalBinding(plan),semantics=pilotActorNeutralSemantics(phases);
 if(phases.zeroPlan.operation_id!==binding.operationId||phases.zeroPlan.organization_id!==binding.organizationId||
  phases.zeroPlan.manifest_sha256!==binding.materialization.manifestSha256||phases.zeroPlan.reset_plan_sha256!==binding.planSha256)fail();
 return freeze({binding,semantics});
}
// Called only after the saved proof's source/bytes/provenance were verified.
// This comparison supplies no standalone proof or authorization of its own.
export function assertPilotPacketRehearsalBinding({packet,artifacts,rehearsal}){
 if(!exact(rehearsal,['binding','semantics']))fail();
 const b=rehearsal.binding;
 if(!exact(b,['format','operationId','organizationId','sourceSha256','sourceGeneration','targetGeneration','materialization','recoveryBaseline','executionBaseline','planSha256'])||
  b.format!=='nestory-local-pilot-rehearsal-binding-v1')fail();
 const{planSha256,...core}=b;
 if(!hash.test(planSha256)||digestJson(core)!==planSha256||!uuid.test(b.operationId)||b.organizationId!=='752a87b8-bd04-4a45-9cb8-00687af66e73'||
  !hash.test(b.sourceSha256)||b.sourceGeneration!==0||b.targetGeneration!==1)fail();
 const m=b.materialization;
 if(!exact(m,['manifestSha256','policySha256','sourceSnapshotSha256','foreignSnapshotSha256','archiveSha256','actionSha256','archiveRows','actionCount'])||
  ['manifestSha256','policySha256','sourceSnapshotSha256','foreignSnapshotSha256','archiveSha256','actionSha256'].some(k=>!hash.test(m[k]))||
  !Number.isSafeInteger(m.archiveRows)||m.archiveRows<1||!Number.isSafeInteger(m.actionCount)||m.actionCount<1)fail();
 for(const[name,value]of Object.entries({recoveryBaseline:b.recoveryBaseline,executionBaseline:b.executionBaseline})){
  const keys=['schemaSha256','ledgerSha256','migrationCount',...(name==='executionBaseline'?['databaseCatalogSha256','databaseLedgerSha256']:[])];
  if(!exact(value,keys)||!Number.isSafeInteger(value.migrationCount)||value.migrationCount<1||keys.filter(k=>k!=='migrationCount').some(k=>!hash.test(value[k])))fail();
 }
 assertOperatorPacket(packet);validateArtifacts(packet,artifacts);
 const o=packet.operation,d=packet.databaseBinding;
 if(o.operationId!==b.operationId||o.organizationId!==b.organizationId||o.projectRef!=='pfvmztxktkwyewvxfgot'||o.sourceGeneration!==b.sourceGeneration||o.targetGeneration!==b.targetGeneration||
  o.invoiceDatePolicy!=='empty-books-no-invoices'||packet.sourceSnapshotSha256!==m.sourceSnapshotSha256||packet.schemaSha256!==b.executionBaseline.schemaSha256||
  packet.ledgerSha256!==b.executionBaseline.ledgerSha256||packet.archiveRows!==m.archiveRows||packet.actionCount!==m.actionCount||
  d.manifestSha256!==m.manifestSha256||d.planSha256!==planSha256||d.archiveSha256!==m.archiveSha256||d.actionSha256!==m.actionSha256||
  digestJson(pilotActorNeutralSemantics({zeroPlan:artifacts.zeroPlan,zeroPlanText:artifacts.zeroPlanText,continuationPlan:artifacts.continuationPlan,reportPlan:artifacts.reportPlan}))!==digestJson(rehearsal.semantics))fail();
 return true;
}
export function pilotActorNeutralSemantics(input){
 if(!exact(input,['zeroPlan','zeroPlanText','continuationPlan','reportPlan']))fail();
 const {zeroPlan,zeroPlanText,continuationPlan,reportPlan}=input;
 if(typeof zeroPlanText!=='string'||Buffer.byteLength(zeroPlanText)>4*1024*1024)fail();
 let parsed;try{parsed=JSON.parse(zeroPlanText)}catch{fail()}
 if(digestDatabaseJson(parsed)!==digestDatabaseJson(zeroPlan))fail();
 validateReviewedZeroPlanShape(zeroPlan,continuationPlan);
 if(![zeroPlan.operation_id,zeroPlan.organization_id,zeroPlan.maker_actor_id,zeroPlan.reviewer_actor_id].every(v=>uuid.test(v))||
  zeroPlan.organization_id!=='752a87b8-bd04-4a45-9cb8-00687af66e73'||zeroPlan.maker_actor_id===zeroPlan.reviewer_actor_id||
  !hash.test(zeroPlan.manifest_sha256)||!hash.test(zeroPlan.reset_plan_sha256)||zeroPlan.effective_date!=='2026-10-01'||
  JSON.stringify(zeroPlan.currencies)!=='["USD"]'||!Array.isArray(zeroPlan.scopes)||!zeroPlan.scopes.length||zeroPlan.scopes.length>100000)fail();
 const seen=new Set();for(const scope of zeroPlan.scopes){
  if(![scope.property_id,scope.property_owner_id,scope.owner_person_id].every(v=>uuid.test(v))||scope.currency!=='USD'||
   !hash.test(scope.ownership_roster_hash)||!hash.test(scope.property_row_sha256)||
   !/^(?:\d{1,3})(?:\.\d+)?$/.test(String(scope.ownership_percent))||Number(scope.ownership_percent)<=0||Number(scope.ownership_percent)>100||
   scope.property_archived_at!==null&&(typeof scope.property_archived_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(scope.property_archived_at)||!Number.isFinite(Date.parse(scope.property_archived_at)))||seen.has(scope.property_owner_id))fail();
  seen.add(scope.property_owner_id);
 }
 assertEmptyBooksContinuation(continuationPlan);
 if(continuationPlan.actor_id!==zeroPlan.maker_actor_id||!exact(reportPlan,['report_review_sha256'])||!hash.test(reportPlan.report_review_sha256))fail();
 const {actor_id,...continuation}=continuationPlan;void actor_id;
 // Do not reserialize financial percentages. Preserve every non-actor byte of
 // the authoritative PostgreSQL plan, including scale and numeric precision.
 const zero=patchRowText(zeroPlanText,{maker_actor_id:null,reviewer_actor_id:null});
 const economicZero=patchRowText(zeroPlanText,{maker_actor_id:null,reviewer_actor_id:null,manifest_sha256:null,reset_plan_sha256:null});
 return Object.freeze({format:'nestory-local-reset-actor-neutral-semantics-v1',zeroSha256:hashBytes(zero),
  economicZeroSha256:hashBytes(economicZero),
  continuationSha256:digestDatabaseJson(continuation),reportReviewSha256:reportPlan.report_review_sha256});
}
