// Actor identities enter only after the archive/readback/live projection bridge.
// This prepares an inert packet; saved custody and real session approval remain
// independent gates. No network, SQL dispatch or caller-provided row rewriting.
import {prepareOperatorPacket,REQUIRED_ARTIFACTS,hashBytes,hashSourceBytes,assertOperatorPacket} from './pilot-finance-reset-operator-core.mjs';
import {digestDatabaseJson,validateArtifacts} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {patchRowText} from './pilot-finance-reset-executor-plan.mjs';
import {inspectPilotRamRehearsalPlan} from './local-backup-ram-rehearsal-plan.mjs';
import {bindPilotRehearsalSemantics} from './local-backup-packet-bridge.mjs';
import {assertPilotLiveEconomicSemantics} from './local-backup-live-witness.mjs';
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const same=(a,b)=>digestDatabaseJson(a)===digestDatabaseJson(b);
const fail=()=>{throw Error('local_live_packet_unverified')};
const phaseProjection=p=>({zeroPlan:p.zeroPlan,zeroPlanText:p.zeroPlanText,continuationPlan:p.continuationPlan,reportPlan:p.reportPlan});
const coreRoles=['manifest','actions','archive','zeroPlan','continuationPlan','reportPlan'];

export function assertPilotLivePacketBinding({plan,liveBinding,rehearsal,packet,artifacts}){
 const local=inspectPilotRamRehearsalPlan(plan),b=liveBinding,m=b.materialization;
 assertPilotLiveEconomicSemantics({liveBinding:b,rehearsal,phases:phaseProjection(artifacts)});
 assertOperatorPacket(packet);validateArtifacts(packet,artifacts);
 for(const role of coreRoles){const bytes=role==='zeroPlan'?artifacts.zeroPlanText:role==='continuationPlan'?artifacts.continuationPlanText:JSON.stringify(artifacts[role]);
  if(packet.artifacts[role]?.sha256!==hashBytes(bytes)||packet.artifacts[role]?.bytes!==Buffer.byteLength(bytes))fail();}
 const o=packet.operation,d=packet.databaseBinding;
 if(o.operationId!==local.operationId||o.operationId!==b.operationId||o.organizationId!==b.organizationId||o.projectRef!=='pfvmztxktkwyewvxfgot'||
  o.sourceGeneration!==b.sourceGeneration||o.targetGeneration!==b.targetGeneration||o.invoiceDatePolicy!=='empty-books-no-invoices'||
  packet.sourceSnapshotSha256!==m.sourceSnapshotSha256||packet.schemaSha256!==b.executionBaseline.schemaSha256||packet.ledgerSha256!==b.executionBaseline.ledgerSha256||
  packet.archiveRows!==m.archiveRows||packet.actionCount!==m.actionCount||d.manifestSha256!==m.manifestSha256||d.planSha256!==b.planSha256||
  d.archiveSha256!==m.archiveSha256||d.actionSha256!==m.actionSha256||!same(artifacts.archive,plan.archiveRows)||!same(artifacts.actions.actions,plan.actions)||
  typeof artifacts.continuationPlanText!=='string'||!same(JSON.parse(artifacts.continuationPlanText),artifacts.continuationPlan)||
  d.continuationSemanticSha256!==hashBytes(artifacts.continuationPlanText))fail();
 return true;
}

// The caller supplies actual actor IDs and public release metadata, never a
// replacement manifest, plan, archive, action or economic semantic digest.
// Missing external evidence remains explicit in the ordinary packet blockers.
export function preparePilotLivePacket({plan,liveBinding,rehearsal,savedPhases,actors,release,sourceFiles,evidenceBytes={}}){
 if(!exact(actors,['maker','reviewer'])||!exact(release,['mainSha','auditTimestamp','timezone'])||!(sourceFiles instanceof Map)||
  !same(bindPilotRehearsalSemantics(plan,phaseProjection(savedPhases)),rehearsal)||
  typeof savedPhases.continuationPlanText!=='string'||!same(JSON.parse(savedPhases.continuationPlanText),savedPhases.continuationPlan)||
  typeof evidenceBytes!=='object'||evidenceBytes===null||Object.keys(evidenceBytes).some(k=>!REQUIRED_ARTIFACTS.includes(k)||coreRoles.includes(k)))fail();
 const b=liveBinding,m=b.materialization;
 const zeroPlanText=patchRowText(savedPhases.zeroPlanText,{maker_actor_id:actors.maker,reviewer_actor_id:actors.reviewer,
  manifest_sha256:m.manifestSha256,reset_plan_sha256:b.planSha256});
 const continuationPlanText=patchRowText(savedPhases.continuationPlanText,{actor_id:actors.maker});
 const operation={operationId:b.operationId,organizationId:b.organizationId,projectRef:'pfvmztxktkwyewvxfgot',mainSha:release.mainSha,
  sourceGeneration:0,targetGeneration:1,cutoff:'2026-10-01',issueDate:'2026-10-01',timezone:release.timezone,
  executionBusinessDate:savedPhases.continuationPlan.execution_business_date,invoiceDatePolicy:'empty-books-no-invoices'};
 const artifacts={zeroPlanText,zeroPlan:JSON.parse(zeroPlanText),continuationPlanText,continuationPlan:JSON.parse(continuationPlanText),
  reportPlan:structuredClone(savedPhases.reportPlan),archive:structuredClone(plan.archiveRows),
  manifest:{manifest_sha256:m.manifestSha256,source_snapshot_sha256:m.sourceSnapshotSha256,schema_sha256:b.executionBaseline.schemaSha256,ledger_sha256:b.executionBaseline.ledgerSha256},
  actions:{operation:{operation_id:b.operationId,organization_id:b.organizationId,operation_kind:'reset',restore_of:null,source_generation:0,target_generation:1,
   manifest_sha256:m.manifestSha256,plan_sha256:b.planSha256,schema_sha256:b.executionBaseline.schemaSha256,archive_sha256:m.archiveSha256,action_sha256:m.actionSha256,
   archive_count:m.archiveRows,action_count:m.actionCount,audit_timestamp:release.auditTimestamp,audit_actor:null},actions:structuredClone(plan.actions)}};
 const bytes={...evidenceBytes,...Object.fromEntries(coreRoles.map(k=>[k,k==='zeroPlan'?zeroPlanText:k==='continuationPlan'?continuationPlanText:JSON.stringify(artifacts[k])]))};
 const review={format:'nestory-protected-reset-review-v1',operation,schemaSha256:b.executionBaseline.schemaSha256,ledgerSha256:b.executionBaseline.ledgerSha256,
  sourceSnapshotSha256:m.sourceSnapshotSha256,archiveRows:m.archiveRows,actionCount:m.actionCount,
  databaseBinding:{manifestSha256:m.manifestSha256,planSha256:b.planSha256,archiveSha256:m.archiveSha256,actionSha256:m.actionSha256,
   zeroReviewSha256:hashBytes(zeroPlanText),continuationSemanticSha256:hashBytes(continuationPlanText),reportReviewSha256:artifacts.reportPlan.report_review_sha256},
  artifacts:Object.fromEntries(REQUIRED_ARTIFACTS.map(k=>[k,bytes[k]===undefined?null:hashBytes(bytes[k])]))};
 const packet=prepareOperatorPacket({review,sources:[...sourceFiles].map(([path,body])=>({path,sha256:hashSourceBytes(Buffer.from(body))})),artifacts:bytes,candidateHead:release.mainSha});
 assertPilotLivePacketBinding({plan,liveBinding,rehearsal,packet,artifacts});
 return{packet,artifacts,artifactBytes:bytes,review};
}
