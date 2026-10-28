// One unpublished local signing failure. This record cannot grant native
// authority, replace its parent, or admit an uncertain publication.
import {canonicalJson,hashBytes} from './pilot-finance-reset-operator-core.mjs';
import {digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {assertExecuteResumeRecord,buildExecuteResumeObservationSql,EXECUTE_RESUME_ORIGINAL} from './local-backup-execute-resume.mjs';
import {inspectLocalDispatchCompatibility} from './local-backup-dispatch-repair.mjs';
export const PREPUBLICATION_STOPPED=Object.freeze({
 operationId:EXECUTE_RESUME_ORIGINAL.operationId,mainSha:'c5d67e2b4b09503cf0b55d9f08cdda8a7ad67c0e',
 parentResumeSha256:'95654bcbe98e7018fa8b2bf087fedbe519e0e1f24838c220efd85e9676efcfb0',
 authorizationId:'ef204335-3625-49fb-9dfe-6144a9d22eb0',nonce:'01110efc-92d8-453c-8df2-339d26d055d4',runId:'40651483860',runAttempt:1,
 inputArchiveId:'b5dc2eb8-28fb-4e48-8eb4-b3697ab6c2f6',inputArchiveSha256:'1e8621aef612aa71455da679b5e616a6121cbbe3c33d1067046a6b060896045b',
 intentSha256:'5df1dd60b5b6c2394ef43e3ee0df280925981a3a86ff16fc64ff6b739d0cb5a4',
 claimSha256:'8fb19822a20c00570fb2d6f9acc053594af4804423752f7b7d8224935faed9b2',
 responseSha256:'e33c8840ea9398ebde015d55db66621a5f83420c548c55278ec7a0b85b8d0db6',
 bootstrapSha256:'d86a03e5207a345a4ab175f197c7aaf7b56331fac4fab95034291a74b3ad1658',
 stagedSha256:'7d0837d650c386fc5adaaeb948396d0dc5a01f4eb7f4f761d62e04e8b2f5057a',
});
const hash=/^[a-f0-9]{64}$/,sha=/^[a-f0-9]{40}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...k].sort());
const fail=()=>{throw Error('local_prepublication_recovery_unverified')};
const decode=b=>{if(!(b instanceof Uint8Array)||!b.length||b.length>262144)fail();return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));};
export function assertPrepublicationRecoveryRecord(r){
 if(!exact(r,['format','operationId','packetSha256','bindingSha256','originalMainSha','executorMainSha','manifestSha256','executorSourceSha256',
  'parentResumeSha256','stopped','replacement','eligibilitySha256','originalRunSha256','freshForeignSha256','createdAt'])||
  r.format!=='nestory-local-prepublication-recovery-v1'||r.operationId!==PREPUBLICATION_STOPPED.operationId||
  r.originalMainSha!=='9a08df0181d391a9bc8e6c28319c6678485f4c59'||!sha.test(r.executorMainSha)||
  [r.originalMainSha,PREPUBLICATION_STOPPED.mainSha,EXECUTE_RESUME_ORIGINAL.mainSha].includes(r.executorMainSha)||
  r.parentResumeSha256!==PREPUBLICATION_STOPPED.parentResumeSha256||
  !['packetSha256','bindingSha256','manifestSha256','executorSourceSha256','eligibilitySha256','originalRunSha256','freshForeignSha256'].every(k=>hash.test(r[k]))||
  typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||new Date(r.createdAt).toISOString()!==r.createdAt)fail();
 const s=r.stopped,n=r.replacement;
 if(!exact(s,['authorizationId','nonce','runId','runAttempt','mainSha','intentSha256','claimSha256','responseSha256','bootstrapSha256','stagedSha256'])||
  !['authorizationId','nonce','runId','runAttempt','mainSha','intentSha256','claimSha256','responseSha256','bootstrapSha256','stagedSha256'].every(k=>s[k]===PREPUBLICATION_STOPPED[k])||
  !hash.test(s.bootstrapSha256)||!hash.test(s.stagedSha256)||!exact(n,['nonce','runId','runAttempt'])||!uuid.test(n.nonce)||
  !/^[1-9][0-9]{0,19}$/.test(n.runId)||n.runAttempt!==1||[s.nonce,EXECUTE_RESUME_ORIGINAL.nonce].includes(n.nonce)||
  [s.runId,EXECUTE_RESUME_ORIGINAL.runId].includes(n.runId))fail();
 return r;
}
export function prepublicationRecoveryParentPrefix(){return `financial-reset/${PREPUBLICATION_STOPPED.operationId}/manual-stage/execute/resume-once/attempt`;}
export function prepublicationRecoveryRecordSlot(){return `${prepublicationRecoveryParentPrefix()}/prepublication-recovery-once`;}
export function localPrepublicationRecoveryStagePrefix(action,record){assertPrepublicationRecoveryRecord(record);if(action!=='execute')fail();return `${prepublicationRecoveryRecordSlot()}/attempt`;}
export function assertPrepublicationRecoveryParent(resume){
 assertExecuteResumeRecord(resume);
 if(digestJson(resume)!==PREPUBLICATION_STOPPED.parentResumeSha256||resume.executorMainSha!==PREPUBLICATION_STOPPED.mainSha||
  !same(resume.replacement,{nonce:PREPUBLICATION_STOPPED.nonce,runId:PREPUBLICATION_STOPPED.runId,runAttempt:1}))fail();return resume;
}
export function assertPrepublicationRecoveryCompatibility(record,handle){
 const r=assertPrepublicationRecoveryRecord(record),info=inspectLocalDispatchCompatibility(handle);
 if(!Object.keys(info).every(k=>info[k]===r[k]))fail();return true;
}
export function assertPrepublicationRecoveryPayload({payload,compatibility}){
 if(!exact(payload,['packet','binding','artifacts','recovery','observation','repair','resume','prepublicationRecovery'])||
  !exact(payload.resume,['record','observation'])||payload.recovery!==null)fail();
 const r=assertPrepublicationRecoveryRecord(payload.prepublicationRecovery),parent=assertPrepublicationRecoveryParent(payload.resume.record);
 assertPrepublicationRecoveryCompatibility(r,compatibility);
 if(parent.operationId!==r.operationId||parent.packetSha256!==r.packetSha256||parent.bindingSha256!==r.bindingSha256||
  payload.packet?.packetSha256!==r.packetSha256||digestJson(payload.binding)!==r.bindingSha256||!same(payload.repair,parent.prepareRepair)||
  payload.resume.observation?.foreignSha256!==r.freshForeignSha256)fail();return r;
}
export function prepublicationRecoveryOriginalRunEvidence(m){
 const s=PREPUBLICATION_STOPPED,title=`Pilot reset ${s.operationId} execute ${s.nonce} execute`;
 if(!m||String(m.id)!==s.runId||m.run_attempt!==1||m.status!=='completed'||!['cancelled','failure','timed_out'].includes(m.conclusion)||
  m.head_sha!==s.mainSha||m.head_branch!=='main'||m.event!=='workflow_dispatch'||m.path!=='.github/workflows/pilot-financial-reset-local-custody.yml'||
  m.repository?.full_name!=='soley-bot/nestory'||m.display_title!==title)fail();
 const observation={runId:s.runId,runAttempt:1,status:'completed',conclusion:m.conclusion,mainSha:s.mainSha,displayTitle:title};
 return {observation,sha256:digestJson(observation)};
}
export function assertPrepublicationRecoveryOriginalRun(metadata,record){if(prepublicationRecoveryOriginalRunEvidence(metadata).sha256!==assertPrepublicationRecoveryRecord(record).originalRunSha256)fail();return true;}
export function assertPrepublicationRecoveryOriginalJournal({record,resumeBytes,intentBytes,claimBytes,responseBytes,bootstrapBytes,stagedBytes,publicationBytes}){
 const r=assertPrepublicationRecoveryRecord(record),s=r.stopped;
 if(publicationBytes!==null)fail();
 for(const [b,h]of [[resumeBytes,r.parentResumeSha256],[intentBytes,s.intentSha256],[claimBytes,s.claimSha256],[responseBytes,s.responseSha256],
  [bootstrapBytes,s.bootstrapSha256],[stagedBytes,s.stagedSha256]]){decode(b);if(hashBytes(b)!==h)fail();}
 const parent=assertPrepublicationRecoveryParent(decode(resumeBytes)),intent=decode(intentBytes),claim=decode(claimBytes),response=decode(responseBytes),bootstrap=decode(bootstrapBytes),staged=decode(stagedBytes);
 if(parent.packetSha256!==r.packetSha256||parent.bindingSha256!==r.bindingSha256||intent.mainSha!==s.mainSha||intent.transportIntent?.authorizationId!==s.authorizationId||
  intent.transportIntent.operationId!==r.operationId||intent.transportIntent.action!=='execute'||intent.transportIntent.packetSha256!==r.packetSha256||intent.transportIntent.bindingSha256!==r.bindingSha256||
  !same(claim,{format:'nestory-manual-reset-dispatch-claim-v1',operationId:r.operationId,action:'execute',intentSha256:s.intentSha256})||
  !same(response,{format:'nestory-manual-reset-dispatch-response-v1',operationId:r.operationId,action:'execute',intentSha256:s.intentSha256,runId:Number(s.runId),runAttempt:1})||
  bootstrap.format!=='nestory-manual-reset-bootstrap-claim-v1'||bootstrap.operationId!==r.operationId||bootstrap.action!=='execute'||bootstrap.nonce!==s.nonce||bootstrap.mainSha!==s.mainSha||bootstrap.packetSha256!==r.packetSha256||
  staged.format!=='nestory-local-staged-payload-reference-v1'||staged.payloadSha256!==intent.inputBundleSha256)fail();
 return true;
}
const flags=['authorizationExpiredUnused','sealedOperationMatches','preparedRowsMatch','zeroPlanMatches','executionAbsent','reservationMatches','checkpointMatches','controlMatches','sourceMatches'];
export function assertPrepublicationRecoveryObservation(v,{binding,now=Date.now()}){
 // Reuse the original fixed scope validation without relaxing its accepted auth.
 buildExecuteResumeObservationSql({binding,originalAuthorizationId:EXECUTE_RESUME_ORIGINAL.authorizationId});
 if(!exact(v,['format','operationId','originalAuthorizationId','observedAt','authorizationExpiresAt','freshForeignSha256','foreignOrganizationCount',...flags])||
  v.format!=='nestory-local-prepublication-recovery-observation-v1'||v.operationId!==PREPUBLICATION_STOPPED.operationId||
  v.originalAuthorizationId!==PREPUBLICATION_STOPPED.authorizationId||!Number.isFinite(Date.parse(v.observedAt))||!Number.isFinite(Date.parse(v.authorizationExpiresAt))||
  !Number.isSafeInteger(now)||Date.parse(v.observedAt)>now||Date.parse(v.authorizationExpiresAt)>Date.parse(v.observedAt)||
  !hash.test(v.freshForeignSha256)||v.foreignOrganizationCount!==4||flags.some(k=>v[k]!==true))fail();return true;
}
export function buildPrepublicationRecoveryObservationSql({binding}){
 const original=buildExecuteResumeObservationSql({binding,originalAuthorizationId:EXECUTE_RESUME_ORIGINAL.authorizationId});
 return original.replaceAll(`'${EXECUTE_RESUME_ORIGINAL.authorizationId}'::uuid`,`'${PREPUBLICATION_STOPPED.authorizationId}'::uuid`)
  .replace("'nestory-local-execute-resume-observation-v1'","'nestory-local-prepublication-recovery-observation-v1'");
}
export function buildPrepublicationRecoveryGuardSql({record,binding}){
 const r=assertPrepublicationRecoveryRecord(record);
 buildPrepublicationRecoveryObservationSql({binding});
 if(digestJson(binding)!==r.bindingSha256)fail();
 const b=`'${JSON.stringify(binding).replaceAll("'","''")}'::jsonb`;
 return `DO $local_prepublication_guard$ BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:752a87b8-bd04-4a45-9cb8-00687af66e73',0));
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations
 WHERE authorization_id='${PREPUBLICATION_STOPPED.authorizationId}'::uuid AND operation_id='${r.operationId}'::uuid
 AND organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid AND action='execute'
 AND binding=${b} AND binding_sha256=app_private.financial_reset_hash(${b})
 AND expires_at<=clock_timestamp() AND consumed_at IS NULL AND backend_pid IS NULL AND transaction_id IS NULL FOR UPDATE)
 THEN RAISE EXCEPTION 'local_prepublication_authorization_changed' USING ERRCODE='40001'; END IF;
 END $local_prepublication_guard$;`;
}
