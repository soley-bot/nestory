// Typed review evidence, not an alternative authorization mechanism. Native
// genuine-session ingress, approvals, containment and consumed authority remain
// mandatory in the existing worker and database transaction.
import {canonicalJson,hashBytes,assertOperatorPacket} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,digestDatabaseJson,hostedBinding,validateArtifacts,sortDescriptors} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {assertHostedPrecondition} from './pilot-finance-reset-hosted-transport.mjs';
import {validateApprovalObservation,approvalReadinessMatches} from './pilot-finance-reset-hosted-protocol.mjs';
const org='752a87b8-bd04-4a45-9cb8-00687af66e73',project='pfvmztxktkwyewvxfgot';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const roles=['actorApprovals','containmentProof','liveConsent'],actions=['freeze','checkpoint','prepare','seal','execute'];
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const fail=()=>{throw Error('local_dispatch_review_unverified')};
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString()===v;
const encode=v=>canonicalJson(v);
function scope(packet,artifacts){
 assertOperatorPacket(packet);validateArtifacts(packet,artifacts);
 if(packet.operation.organizationId!==org||packet.operation.projectRef!==project||packet.operation.invoiceDatePolicy!=='empty-books-no-invoices'||
  packet.operation.sourceGeneration!==0||packet.operation.targetGeneration!==1||artifacts.continuationPlan.version!==4||
  !uuid.test(artifacts.zeroPlan.maker_actor_id)||!uuid.test(artifacts.zeroPlan.reviewer_actor_id)||
  artifacts.zeroPlan.maker_actor_id===artifacts.zeroPlan.reviewer_actor_id||artifacts.zeroPlan.maker_actor_id!==artifacts.continuationPlan.actor_id)fail();
 return {operation:packet.operation,sourcesSha256:packet.sourcesSha256,schemaSha256:packet.schemaSha256,ledgerSha256:packet.ledgerSha256,
  sourceSnapshotSha256:packet.sourceSnapshotSha256,databaseBinding:packet.databaseBinding,archiveRows:packet.archiveRows,actionCount:packet.actionCount};
}
function actors(packet,artifacts,observation){
 if(!exact(observation,['format','organizationId','observedAt','actors'])||observation.format!=='nestory-local-actor-readiness-v1'||
  observation.organizationId!==org||!timestamp(observation.observedAt)||!Array.isArray(observation.actors)||observation.actors.length!==2)fail();
 for(const [index,kind]of ['maker','reviewer'].entries()){
  const row=observation.actors[index];if(!exact(row,['kind','actorId','currentSessionCount','sessionCensusSha256'])||row.kind!==kind||
   row.actorId!==artifacts.zeroPlan[`${kind}_actor_id`]||!Number.isSafeInteger(row.currentSessionCount)||row.currentSessionCount<1||
   !hash.test(row.sessionCensusSha256))fail();
 }
}
// Aggregate-only read of the two already selected identities. It does not
// extract cookies, JWTs, session IDs, credential rows or create any authority.
export function localDispatchActorReadinessSql({maker,reviewer}){
 if(!uuid.test(maker)||!uuid.test(reviewer)||maker===reviewer)fail();
 return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='30s';
WITH selected(kind,actor_id,ordinal) AS (VALUES ('maker','${maker}'::uuid,1),('reviewer','${reviewer}'::uuid,2)),
current_sessions AS (SELECT a.kind,a.actor_id,a.ordinal,s.id FROM selected a JOIN auth.sessions s ON s.user_id=a.actor_id
 WHERE app_private.financial_reset_actor_is_current('${org}'::uuid,a.actor_id,s.id)),
rows AS (SELECT a.kind,a.actor_id,a.ordinal,count(s.id)::integer n,
 encode(extensions.digest(coalesce(string_agg(s.id::text,',' ORDER BY s.id::text),''),'sha256'),'hex') digest
 FROM selected a LEFT JOIN current_sessions s ON s.actor_id=a.actor_id GROUP BY a.kind,a.actor_id,a.ordinal)
SELECT jsonb_build_object('format','nestory-local-actor-readiness-v1','organizationId','${org}',
 'observedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'actors',(SELECT jsonb_agg(jsonb_build_object('kind',kind,'actorId',actor_id,'currentSessionCount',n,'sessionCensusSha256',digest) ORDER BY ordinal) FROM rows));
COMMIT;`;
}
export function prepareLocalDispatchReviewArtifacts({packet,artifacts,actorObservation,sourceObservation,retainedInstruction}){
 const binding=scope(packet,artifacts),reviewBindingSha256=digestJson(binding);
 actors(packet,artifacts,actorObservation);
 assertHostedPrecondition('freeze',packet,hostedBinding(packet,artifacts.continuationPlan),artifacts,null,sourceObservation);
 if(!hash.test(sourceObservation.foreignSha256)||!exact(retainedInstruction,['reference','text','recordedAt'])||
  typeof retainedInstruction.reference!=='string'||retainedInstruction.reference.length<1||retainedInstruction.reference.length>512||
  typeof retainedInstruction.text!=='string'||retainedInstruction.text.trim().length<1||Buffer.byteLength(retainedInstruction.text)>32768||
  !timestamp(retainedInstruction.recordedAt))fail();
 const common={reviewBindingSha256};
 const output={
  actorApprovals:encode({format:'nestory-local-preexecution-actor-review-v1',...common,readiness:actorObservation,
   sessionPossessionProven:false,nativeZeroApprovals:'pending-prepared-plan',nativeStageAuthorization:'required-separately'}),
  containmentProof:encode({format:'nestory-local-preexecution-containment-review-v1',...common,
   sourceObservationSha256:digestDatabaseJson(sourceObservation),foreignSha256:sourceObservation.foreignSha256,
   restoreProofSha256:packet.artifacts.restoreProof?.sha256,storageProofSha256:packet.artifacts.storageProof?.sha256,
   productionFreeze:'pending-native-freeze',protectedWriter:'required-at-dispatch',normalWritesReopening:'not-authorized'}),
  liveConsent:encode({format:'nestory-local-retained-instruction-review-v1',...common,scope:'pilot-october-empty-books-preserved-contracts',
   instruction:retainedInstruction,instructionSha256:hashBytes(retainedInstruction.text),
   liveRecovery:'requires-separate-consent',offHostKeyRecoveryProven:false,nativeStageAuthorization:'required-separately'}),
 };
 assertLocalDispatchReviewArtifacts({packet,artifacts,reviews:output,requirePacketHashes:false});return Object.freeze(output);
}
export function assertLocalDispatchReviewArtifacts({packet,artifacts,reviews,requirePacketHashes=true}){
 const binding=scope(packet,artifacts),bindingHash=digestJson(binding);
 if(!exact(reviews,roles))fail();const parsed={};
 for(const role of roles){const raw=reviews[role];if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)fail();
  try{parsed[role]=JSON.parse(raw)}catch{fail()}
  if(encode(parsed[role])!==raw||parsed[role].reviewBindingSha256!==bindingHash||
   requirePacketHashes&&(packet.artifacts[role]?.sha256!==hashBytes(raw)||packet.artifacts[role]?.bytes!==Buffer.byteLength(raw)))fail();
 }
 const a=parsed.actorApprovals,c=parsed.containmentProof,l=parsed.liveConsent;
 if(!exact(a,['format','reviewBindingSha256','readiness','sessionPossessionProven','nativeZeroApprovals','nativeStageAuthorization'])||
  a.format!=='nestory-local-preexecution-actor-review-v1'||a.sessionPossessionProven!==false||a.nativeZeroApprovals!=='pending-prepared-plan'||a.nativeStageAuthorization!=='required-separately')fail();
 actors(packet,artifacts,a.readiness);
 if(!exact(c,['format','reviewBindingSha256','sourceObservationSha256','foreignSha256','restoreProofSha256','storageProofSha256','productionFreeze','protectedWriter','normalWritesReopening'])||
  c.format!=='nestory-local-preexecution-containment-review-v1'||![c.sourceObservationSha256,c.foreignSha256,c.restoreProofSha256,c.storageProofSha256].every(v=>hash.test(v))||
  c.restoreProofSha256!==packet.artifacts.restoreProof?.sha256||c.storageProofSha256!==packet.artifacts.storageProof?.sha256||
  c.productionFreeze!=='pending-native-freeze'||c.protectedWriter!=='required-at-dispatch'||c.normalWritesReopening!=='not-authorized')fail();
 if(!exact(l,['format','reviewBindingSha256','scope','instruction','instructionSha256','liveRecovery','offHostKeyRecoveryProven','nativeStageAuthorization'])||
  l.format!=='nestory-local-retained-instruction-review-v1'||l.scope!=='pilot-october-empty-books-preserved-contracts'||
  l.liveRecovery!=='requires-separate-consent'||l.offHostKeyRecoveryProven!==false||l.nativeStageAuthorization!=='required-separately'||
  !exact(l.instruction,['reference','text','recordedAt'])||typeof l.instruction.reference!=='string'||l.instruction.reference.length<1||l.instruction.reference.length>512||
  typeof l.instruction.text!=='string'||!l.instruction.text.trim()||Buffer.byteLength(l.instruction.text)>32768||
  !timestamp(l.instruction.recordedAt)||l.instructionSha256!==hashBytes(l.instruction.text))fail();
 return parsed;
}
function stageChecks({packet,artifacts,reviews,action,observation,nativeApprovals,now,historical}){
 const parsed=assertLocalDispatchReviewArtifacts({packet,artifacts,reviews});
 if(!actions.includes(action)||observation?.foreignSha256!==parsed.containmentProof.foreignSha256||observation.capabilityCount!==0||
  observation.timezone!==packet.operation.timezone||!Array.isArray(observation.catalog)||!Array.isArray(observation.ledger)||
  digestJson(sortDescriptors(observation.catalog))!==packet.schemaSha256||digestJson(observation.ledger)!==packet.ledgerSha256)fail();
 assertHostedPrecondition(action,packet,hostedBinding(packet,artifacts.continuationPlan),artifacts,null,observation);
 if(action==='freeze'&&digestDatabaseJson(observation)!==parsed.containmentProof.sourceObservationSha256)fail();
 if(action==='execute'){
  const value=validateApprovalObservation(packet,nativeApprovals);
  if(!approvalReadinessMatches(packet,value)||value.approvals.length!==2||value.endorsements.length!==2||
   value.zeroPlan.makerActorId!==artifacts.zeroPlan.maker_actor_id||value.zeroPlan.reviewerActorId!==artifacts.zeroPlan.reviewer_actor_id||
   value.endorsements.some(e=>e.availability.status!=='current'||Date.parse(e.availability.observedAt)>now||!historical&&Date.parse(e.credentialExpiresAt)<=now))fail();
 }else if(nativeApprovals!==null)fail();
}
export function prepareLocalDispatchStageAuthority({packet,artifacts,reviews,action,observation,nativeApprovals=null,issuedAt,expiresAt}){
 const authority={format:'nestory-local-stage-evidence-v1',packetSha256:packet.packetSha256,mainSha:packet.operation.mainSha,
  operationId:packet.operation.operationId,action,reviewHashes:Object.fromEntries(roles.map(r=>[r,hashBytes(reviews[r])])),
  observationSha256:digestDatabaseJson(observation),nativeApprovals,issuedAt,expiresAt,nativeAuthorization:'required-separately'};
 assertLocalDispatchStageAuthority({packet,artifacts,reviews,action,observation,authority});return Object.freeze(structuredClone(authority));
}
export function assertLocalDispatchStageAuthority({packet,artifacts,reviews,action,observation,authority,now=Date.now(),historical=false}){
 if(!exact(authority,['format','packetSha256','mainSha','operationId','action','reviewHashes','observationSha256','nativeApprovals','issuedAt','expiresAt','nativeAuthorization'])||
  authority.format!=='nestory-local-stage-evidence-v1'||authority.packetSha256!==packet.packetSha256||authority.mainSha!==packet.operation.mainSha||
  authority.operationId!==packet.operation.operationId||authority.action!==action||authority.nativeAuthorization!=='required-separately'||
  !exact(authority.reviewHashes,roles)||roles.some(r=>authority.reviewHashes[r]!==hashBytes(reviews[r]))||
  authority.observationSha256!==digestDatabaseJson(observation)||!timestamp(authority.issuedAt)||!timestamp(authority.expiresAt)||!Number.isSafeInteger(now)||
  Date.parse(authority.issuedAt)>now||Date.parse(authority.expiresAt)<=Date.parse(authority.issuedAt)||
  Date.parse(authority.expiresAt)-Date.parse(authority.issuedAt)>86400000||!historical&&Date.parse(authority.expiresAt)<=now)fail();
 stageChecks({packet,artifacts,reviews,action,observation,nativeApprovals:authority.nativeApprovals,now,historical});
 return hashBytes(encode(authority));
}
export function assertLocalDispatchStageEvidenceRecord({recordBytes,ticket,payload}){
 if(!(recordBytes instanceof Uint8Array)||recordBytes.length<1||recordBytes.length>262144)fail();
 const text=new TextDecoder('utf8',{fatal:true}).decode(recordBytes);let r;try{r=JSON.parse(text)}catch{fail()}
 if(encode(r)!==text||!exact(r,['format','operationId','packetSha256','stageAuthority','reviewArtifacts'])||
  r.format!=='nestory-local-stage-evidence-record-v1'||r.operationId!==ticket.operationId||r.packetSha256!==ticket.packetSha256||
  assertLocalDispatchStageAuthority({packet:payload.packet,artifacts:payload.artifacts,reviews:r.reviewArtifacts,action:ticket.action,
   observation:payload.observation,authority:r.stageAuthority})!==ticket.authoritySha256)fail();
 return true;
}
