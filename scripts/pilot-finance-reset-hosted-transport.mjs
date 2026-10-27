// Concrete fixed hosted psql transport. Construction never dispatches a write.
// Protected runtime/session/persistence providers are required dependencies;
// synthetic process tests do not certify a production connection or consent.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertOperatorPacket, canonicalJson, hashSourceBytes, REQUIRED_ARTIFACTS } from './pilot-finance-reset-operator-core.mjs';
import { exactKeys, same } from './pilot-finance-reset-hosted-protocol.mjs';
import {verifyResetMigrationLedgerDescriptors} from './pilot-finance-reset-migration-parity.mjs';
import { HOSTED_ACTIONS, TRANSPORT_SOURCE_FILES, digestPattern, fail, digestJson, hostedBinding,
 validateArtifacts, sortDescriptors, observationSql, mutationSql, timestampMicros, sameDatabaseJson, digestDatabaseJson } from './pilot-finance-reset-hosted-transport-protocol.mjs';

const root=path.resolve(import.meta.dirname,'..');
const connectionFields=['expectedProjectRef','host','port','database','user','psqlPath','sslRootCertPath','passwordFilePath'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const allowedOptions=['packet','connection','artifacts','journal','runtime','actor'];
// Local implementation and synthetic receipts are not production authority.
// Release of this hold requires the complete path's separate integration review.
export const HOSTED_TRANSPORT_IMPLEMENTATION_GAPS=Object.freeze([
 'complete_hosted_path_review_and_database_proof_pending',
]);
export function assertHostedTransportDispatchImplemented() {
 fail('integration_incomplete');
}
const absolute=value=>typeof value==='string'&&value.length<=4096&&!/[\0\r\n]/.test(value)&&! /^(?:\\\\|\/\/)/.test(value)&&
 !value.split(/[\\/]/).some(p=>p==='.'||p==='..')&&(path.posix.isAbsolute(value)||/^[A-Za-z]:[\\/]/.test(value));
function validateConnection(packet,c) {
 if(!exactKeys(c,connectionFields)||c.expectedProjectRef!==packet.operation.projectRef||c.host!==`db.${c.expectedProjectRef}.supabase.co`||
  c.port!==5432||c.database!=='postgres'||typeof c.user!=='string'||!/^[a-z_][a-z0-9_]{0,62}$/.test(c.user)||
  !['psqlPath','sslRootCertPath','passwordFilePath'].every(k=>absolute(c[k]))||!/^psql(?:\.exe)?$/i.test(c.psqlPath.split(/[\\/]/).at(-1))) fail('connection_invalid');
}
function uncertain() {const error=new Error('hosted_transport_outcome_uncertain_reconcile_original');error.requiresReconciliation=true;throw error;}

export function hostedPsqlTimeoutMs(action='observe',continuationVersion=null) {
 if((action!=='observe'&&!HOSTED_ACTIONS.includes(action))||![null,1,2,3,4].includes(continuationVersion))fail('process_budget_invalid');
 return action==='execute'&&continuationVersion===4?600000:180000;
}
function runPsql(connection,input,spawnProcess,action='observe',continuationVersion=null) {
 const timeoutMs=hostedPsqlTimeoutMs(action,continuationVersion);
 return new Promise((resolve,reject)=>{
  let child,done=false,timer,total=0,stderr=0;const chunks=[];
  const stop=()=>{if(done)return;done=true;clearTimeout(timer);try{child?.kill('SIGKILL');}catch{}reject(new Error('hosted_transport_process_failed'));};
  try {
   child=spawnProcess(connection.psqlPath,['-X','-qAtw','--set=ON_ERROR_STOP=on','--set=VERBOSITY=terse','--pset=pager=off'],{
    shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{PGHOST:connection.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:connection.user,
     PGSSLMODE:'verify-full',PGGSSENCMODE:'disable',PGSSLROOTCERT:connection.sslRootCertPath,PGPASSFILE:connection.passwordFilePath,
     PGCONNECT_TIMEOUT:'10',PGAPPNAME:'nestory_financial_reset_fixed_transport'}});
   if(!child||typeof child.once!=='function'||typeof child.kill!=='function'||typeof child.stdin?.end!=='function'||
    typeof child.stdin?.on!=='function'||typeof child.stdout?.on!=='function'||typeof child.stderr?.on!=='function') {stop();return;}
   timer=setTimeout(stop,timeoutMs);
   child.once('error',stop);child.stdin.on('error',stop);child.stdout.on('error',stop);child.stderr.on('error',stop);
   child.stdout.on('data',bytes=>{if(done)return;total+=Buffer.byteLength(bytes);if(total>16*1024*1024){stop();return;}chunks.push(Buffer.from(bytes));});
   child.stderr.on('data',bytes=>{stderr+=Buffer.byteLength(bytes);if(stderr>8192)stop();});
   child.once('close',(code,signal)=>{if(done)return;done=true;clearTimeout(timer);if(code!==0||signal||stderr){reject(new Error('hosted_transport_process_failed'));return;}
    resolve(Buffer.concat(chunks).toString('utf8'));});
   child.stdin.end(input,'utf8');
  } catch {stop();}
 });
}

async function sources(packet) {
 const names=new Set(packet.sourceFiles.map(s=>s.path));
 if(TRANSPORT_SOURCE_FILES.some(name=>!names.has(name))) fail('source_coverage_missing');
 const files=new Map();
 for(const source of packet.sourceFiles) {
  let bytes;try{bytes=await readFile(path.join(root,source.path));}catch{fail('source_unavailable');}
  if(hashSourceBytes(bytes)!==source.sha256) fail('source_changed');
  files.set(source.path,new TextDecoder('utf8',{fatal:true}).decode(bytes).replace(/\r\n/g,'\n'));
 }
 return files;
}
function assertObserved(packet,observation,files) {
 if(!observation||!Array.isArray(observation.catalog)||!Array.isArray(observation.ledger)||
  digestJson(sortDescriptors(observation.catalog))!==packet.schemaSha256||digestJson(observation.ledger)!==packet.ledgerSha256) fail('installed_schema_or_ledger_changed');
 const migrations=[...files.keys()].filter(n=>/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort();
 if(migrations.length!==observation.ledger.length) fail('migration_roster_changed');
 for(const [i,name] of migrations.entries()) {
  const m=observation.ledger[i],base=name.split('/').at(-1);
  if(m.version!==base.slice(0,14)||m.name!==base.slice(15,-4)) fail('installed_migration_content_changed');
 }
 try{verifyResetMigrationLedgerDescriptors(observation.ledger,migrations.map(name=>({name:name.split('/').at(-1),sql:files.get(name)})),
  Buffer.from(files.get('supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json')??''));}
 catch{fail('installed_migration_content_changed')}
 if(observation.timezone!==packet.operation.timezone||observation.capabilityCount!==0||!digestPattern.test(observation.sourceSha256)||
  !digestPattern.test(observation.foreignSha256)) fail('observation_invalid');
}
function operationMatches(operation,expected) {
 if(!operation)return false;
 return Object.entries(expected).filter(([k])=>k!=='audit_actor').every(([k,v])=>k==='audit_timestamp'?
  timestampMicros(v)!==null&&timestampMicros(operation[k])===timestampMicros(v):same(operation[k],v));
}
function sameTransaction(a,b) {return Boolean(a&&b&&Number.isSafeInteger(a.backendPid)&&a.backendPid===b.backendPid&&
 typeof a.transactionId==='string'&&/^[1-9][0-9]*$/.test(a.transactionId)&&a.transactionId===b.transactionId);}
function stageReceiptMatches(action,packet,binding,artifacts,o,intent) {
 const r=o.actionReceipt,s=r?.result;
 if(!r||r.operationId!==binding.operation_id||r.organizationId!==binding.organization_id||r.action!==action||
  !same(r.binding,binding)||!same(o.reservation?.binding,binding)||o.reservation.foreignSha256!==o.foreignSha256||
  r.bindingSha256!==o.reservation?.bindingSha256||!digestPattern.test(r.bindingSha256)||
  r.authorizationId!==intent.authorizationId||r.authoritySha256!==intent.authoritySha256||
  !uuid.test(r.actorId)||r.actorId!==binding.continuation_semantic.actor_id||r.actorId!==o.authorization?.actorId||!sameTransaction(r,o.authorization)||
  r.hashValid!==true||!digestPattern.test(r.sha256)||s?.version!==1||s.action!==action||
  !operationMatches(s.operation,artifacts.actions.operation)||s.operation.status!==(action==='prepare'?'prepared':'sealed')||
  s.appliedCount!==0||s.archiveCount!==packet.archiveRows||s.actionCount!==packet.actionCount||
  s.archiveSha256!==binding.archive_sha256||s.actionSha256!==binding.action_sha256)return false;
 return action==='prepare'?s.zero===null:s.zero?.status==='prepared'&&s.zero.reviewSha256===binding.zero_review_sha256&&
  s.zero.planSha256===binding.zero_review_sha256&&sameDatabaseJson(s.zero.plan,artifacts.zeroPlan);
}
function emptyBooksCheckpointMatches(binding,o) {
 const semantic=binding.continuation_semantic,continuation=o.continuation?.result,report=o.checkpoint?.result;
 if(o.continuation?.unchanged!==true||o.emptyBooks?.tenantInvoices!==0||o.emptyBooks?.ownerInvoices!==0||
   o.emptyBooks?.contractsSha256!==semantic.contracts_sha256||!digestPattern.test(continuation?.before_sha256)||
   continuation.before_sha256!==continuation.after_sha256)return false;
 if([continuation,report].some(result=>result?.empty_books!==true||result.billing_paused!==true||result.contracts_unchanged!==true||
   result.contracts_sha256!==semantic.contracts_sha256||result.billing_complete!==false||result.close_ready!==false||
   result.deferred_lease_count!==0||result.preserved_unbilled_lease_count!==semantic.leases.length))return false;
 const expected=semantic.leases.map(lease=>({...lease,invoice_id:null,generated_rent_amount:0,generated_fee_amount:0,contract_changed:false}));
 return Array.isArray(continuation.leases)&&sameDatabaseJson(
  [...continuation.leases].sort((a,b)=>String(a?.lease_id).localeCompare(String(b?.lease_id))),
  expected.sort((a,b)=>a.lease_id.localeCompare(b.lease_id)));
}
function phaseState(action,packet,binding,a,r,o) {
 const base={...binding};delete base.recovery;
 const isRecovery=action.endsWith('recovery'),expected=isRecovery?r?.review.operation:a.actions.operation;
 const generation=isRecovery?binding.recovery.target_generation:binding.target_generation;
 const frozen=o.control?.status==='frozen'&&o.control.generation===generation&&o.control.cutoff===binding.cutoff;
 const reservation=o.reservation&&same(o.reservation.binding,base)&&o.reservation.foreignSha256===o.foreignSha256;
 const retained=o.recoveryCheckpoint&&o.recoveryCheckpoint.bindingSha256===o.reservation?.bindingSha256&&
  o.recoveryCheckpoint.sourceSha256===packet.sourceSnapshotSha256&&o.recoveryCheckpoint.foreignSha256===o.foreignSha256;
 const opMatches=operationMatches(o.operation,expected);
 if(action==='freeze')return Boolean(reservation&&frozen&&o.sourceSha256===packet.sourceSnapshotSha256&&sameTransaction(o.reservation,o.authorization));
 if(action==='checkpoint')return Boolean(reservation&&retained&&frozen&&sameTransaction(o.recoveryCheckpoint,o.authorization));
 if(action==='prepare-recovery')return Boolean(reservation&&retained&&frozen&&opMatches&&o.operation.status==='sealed'&&o.appliedCount===0&&
   o.recoveryReservation&&same(o.recoveryReservation.binding,binding)&&sameTransaction(o.recoveryReservation,o.authorization)&&o.actionCount===expected.action_count);
 const c=o.checkpoint,execution={backendPid:o.operation?.execution_backend,transactionId:o.operation?.execution_xid};
 if(!reservation||!retained||!frozen||!opMatches||o.operation.status!=='actions_complete'||o.appliedCount!==expected.action_count||
   !c||c.kind!==(isRecovery?'phase-recovery':'checked-reports')||c.generation!==generation||c.hashValid!==true||
   c.currentImagesMatch!==true||!digestPattern.test(c.sha256)||!sameTransaction(c,execution)||!sameTransaction(c,o.authorization))return false;
 if(isRecovery)return c.result?.control_reopened===false;
 if(binding.continuation_semantic.version===4&&!emptyBooksCheckpointMatches(binding,o))return false;
 return o.zero?.status==='complete'&&o.zero.reviewSha256===binding.zero_review_sha256&&sameDatabaseJson(o.zero.plan,a.zeroPlan)&&
   o.continuation?.status==='complete'&&same(o.continuation.semantic,a.continuationPlan)&&sameTransaction(o.zero,c)&&
   Array.isArray(o.phaseFences)&&same(o.phaseFences.map(f=>f.phase).sort(),['continuation','known-zero','reports'])&&o.phaseFences.every(f=>sameTransaction(f,c))&&
   c.result?.reports_persisted===true&&c.result?.control_reopened===false&&c.result?.close_published===false;
}
// Pure classification of supplied readback, not a database reader or permission
// to execute. The transport obtains the observation independently; disposable
// integration tests may pass actual database readback through this same check.
export function verifyHostedResetExecutionReadback(request) {
 if(!exactKeys(request,['packet','binding','artifacts','recovery','observation','authorizationId','action'])||
   !['execute','execute-recovery'].includes(request.action)||!uuid.test(request.authorizationId))fail('execution_readback_invalid');
 const {packet,binding,artifacts,recovery,observation:o,authorizationId,action}=request;
 assertOperatorPacket(packet);validateArtifacts(packet,artifacts,recovery);
 if(!same(binding,hostedBinding(packet,artifacts.continuationPlan,recovery))||
   (action==='execute-recovery')!==(recovery!==null)||!o||
   o.authorization?.status!=='consumed'||o.authorization.bindingMatches!==true||
   o.authorization.authorizationId!==authorizationId||o.authorization.actorId!==binding.continuation_semantic.actor_id)return false;
 return phaseState(action,packet,binding,artifacts,recovery,o);
}
function precondition(action,packet,binding,a,r,o) {
 const base={...binding};delete base.recovery;
 const recovery=action.endsWith('recovery');
 if(o.businessDate!==(recovery?binding.recovery?.execution_business_date:binding.execution_business_date)) fail('business_date_changed');
 if(action==='freeze') {
  if(o.reservation||o.operation||o.control?.generation!==undefined&&o.control.generation!==binding.source_generation||
   (!o.control&&binding.source_generation!==0)||o.sourceSha256!==packet.sourceSnapshotSha256) fail('freeze_precondition_failed');
  return;
 }
 if(!o.reservation||!same(o.reservation.binding,base)||o.reservation.foreignSha256!==o.foreignSha256||o.control?.status!=='frozen'||
  o.control.cutoff!==binding.cutoff||o.control.generation!==(action==='execute-recovery'?binding.recovery.target_generation:binding.target_generation)) fail('reservation_precondition_failed');
 if(!recovery&&o.sourceSha256!==packet.sourceSnapshotSha256) fail('source_changed');
 if(action==='checkpoint') {if(o.recoveryCheckpoint||o.operation)fail('checkpoint_precondition_failed');return;}
 if(!o.recoveryCheckpoint||o.recoveryCheckpoint.bindingSha256!==o.reservation.bindingSha256||o.recoveryCheckpoint.sourceSha256!==packet.sourceSnapshotSha256) fail('recovery_checkpoint_required');
 if(action==='prepare') {if(o.operation)fail('prepare_precondition_failed');return;}
 if(action==='prepare-recovery') {if(o.operation||o.recoveryReservation||!r)fail('recovery_precondition_failed');return;}
 const expected=recovery?r.review.operation:a.actions.operation;
 if(!operationMatches(o.operation,expected)||o.appliedCount!==0||o.operation.status!==(action==='seal'?'prepared':'sealed')) fail('phase_precondition_failed');
 if(action==='execute'&&(o.approvalCount!==2||o.zero?.reviewSha256!==binding.zero_review_sha256||!sameDatabaseJson(o.zero.plan,a.zeroPlan))) fail('independent_approvals_required');
 if(action==='execute-recovery'&&(!o.recoveryReservation||!same(o.recoveryReservation.binding,binding))) fail('recovery_reservation_required');
}

// Shared process, validation and receipt helpers for the fixed local-custody
// worker. These provide no authorization and do not remove the dispatch hold.
export { runPsql as runHostedPsql, sources as verifyHostedPacketSources,
 assertObserved as assertHostedObservation, precondition as assertHostedPrecondition,
 stageReceiptMatches as hostedStageReceiptMatches, phaseState as hostedPhaseState };

export function createHostedResetTransport(options) {
 if(!exactKeys(options,allowedOptions)&&!exactKeys(options,[...allowedOptions,'spawnProcess'])) fail('options_invalid');
 const packet=structuredClone(options.packet),connection=structuredClone(options.connection);
 assertOperatorPacket(packet);validateConnection(packet,connection);
 if(packet.evidenceBlockers.length||!REQUIRED_ARTIFACTS.every(role=>packet.artifacts[role])||
  typeof options.artifacts?.read!=='function'||typeof options.artifacts?.inspectRecoveryCheckpoint!=='function'||
  typeof options.journal?.read!=='function'||typeof options.journal?.putIfAbsent!=='function'||typeof options.runtime?.assertCurrent!=='function'||
  typeof options.actor?.consume!=='function'||options.spawnProcess!==undefined&&typeof options.spawnProcess!=='function') fail('required_runtime_provider_missing');
 const {artifacts:reader,journal,runtime,actor}=options,spawnProcess=options.spawnProcess??spawn,attempted=new Set();
 const slot=action=>`financial-reset/${packet.operation.operationId}/hosted-action/${action}`;
 async function readJournal(key){try{const v=await journal.read(key);if(v!==null&&typeof v!=='string')throw Error();return v;}catch{uncertain();}}
 async function save(key,value){const bytes=canonicalJson(value);let result;try{result=await journal.putIfAbsent(key,bytes);}catch{uncertain();}
  if(result!=='created'||await readJournal(key)!==bytes)uncertain();}
 async function inputs(action) {
  const files=await sources(packet),a={};
  for(const role of ['manifest','actions','archive','zeroPlan','continuationPlan','reportPlan']) {
   let bytes;try{bytes=await reader.read(role);if(!(bytes instanceof Uint8Array))throw Error();
    const text=new TextDecoder('utf8',{fatal:true}).decode(bytes);a[role]=JSON.parse(text);if(role==='zeroPlan')a.zeroPlanText=text;}
   catch{fail('authenticated_artifact_unavailable');}
   finally{if(bytes instanceof Uint8Array)bytes.fill(0);}
  }
  let recovery=null;
  if(action?.endsWith('recovery')) {
   if(typeof reader.readRecoveryReview!=='function')fail('separate_recovery_review_required');
   recovery=structuredClone(await reader.readRecoveryReview());
  }
  validateArtifacts(packet,a,recovery);const binding=hostedBinding(packet,a.continuationPlan,recovery);
  return {files,artifacts:a,recovery,binding};
 }
 async function observe(input,authorizationId=null,action=null){
  let value;try{value=JSON.parse((await runPsql(connection,observationSql(packet,input.binding,authorizationId,action),spawnProcess)).trim());}
  catch{fail('observation_failed');}
  assertObserved(packet,value,input.files);return value;
 }
 async function reconcileAction(action,input,intent){
  if(!exactKeys(intent,['format','operationId','packetSha256','action','bindingSha256','authorizationId','authoritySha256','sourceObservationSha256','sqlSha256'])||
   intent.format!=='nestory-hosted-reset-action-intent-v1'||intent.operationId!==packet.operation.operationId||
   intent.packetSha256!==packet.packetSha256||intent.action!==action||intent.bindingSha256!==digestJson(input.binding)||!uuid.test(intent.authorizationId)||
   !['packetSha256','bindingSha256','authoritySha256','sourceObservationSha256','sqlSha256'].every(k=>digestPattern.test(intent[k]))) fail('original_intent_mismatch');
  const o=await observe(input,intent.authorizationId,action);
  const consumed=o.authorization?.status==='consumed'&&o.authorization.bindingMatches===true&&o.authorization.authorizationId===intent.authorizationId;
  const complete=['execute','execute-recovery'].includes(action)?verifyHostedResetExecutionReadback({packet,binding:input.binding,
   artifacts:input.artifacts,recovery:input.recovery,observation:o,authorizationId:intent.authorizationId,action}):consumed&&(['prepare','seal'].includes(action)?
   stageReceiptMatches(action,packet,input.binding,input.artifacts,o,intent):
   (action!=='checkpoint'||o.recoveryCheckpoint?.authoritySha256===intent.authoritySha256)&&phaseState(action,packet,input.binding,input.artifacts,input.recovery,o));
  return {format:'nestory-hosted-reset-action-reconciliation-v1',operationId:packet.operation.operationId,packetSha256:packet.packetSha256,action,
   outcome:complete?'committed-and-verified':'not-proven-do-not-retry',mutationRetried:false,normalWritesReopened:false,
   checkpointSha256:o.checkpoint?.sha256??null,billingComplete:o.checkpoint?.result?.billing_complete??null,
   deferredUnbilledLeaseCount:o.checkpoint?.result?.deferred_lease_count??null,
   ...(action==='execute'&&input.binding.continuation_semantic.version===4?{emptyBooksVerified:complete,
    billingPaused:complete?true:null,closeReady:complete?false:null,contractsUnchanged:complete?true:null}:{}),
   actionReceiptSha256:complete&&['prepare','seal'].includes(action)?o.actionReceipt.sha256:null,
   authoritySha256:intent.authoritySha256,observationSha256:digestDatabaseJson(o)};
 }
 return Object.freeze({
  async inspect(){const input=await inputs();return observe(input);},
  async reconcile(request){if(!exactKeys(request,['action'])||!HOSTED_ACTIONS.includes(request.action))fail('action_invalid');
   const input=await inputs(request.action),bytes=await readJournal(`${slot(request.action)}/intent`);if(bytes===null)fail('intent_missing');
   let intent;try{intent=JSON.parse(bytes);}catch{fail('intent_invalid');}return reconcileAction(request.action,input,intent);},
  async dispatch(request){
   if(!exactKeys(request,['action','authorization'])||!HOSTED_ACTIONS.includes(request.action))fail('action_invalid');
   assertHostedTransportDispatchImplemented();
   const {action}=request,key=slot(action);
   if(attempted.has(action)||await readJournal(`${key}/intent`)!==null)fail('existing_attempt_reconcile_required');
   const input=await inputs(action),checkpoint=await reader.inspectRecoveryCheckpoint();
   const authority=await runtime.assertCurrent({packet:structuredClone(packet),action,checkpoint,binding:structuredClone(input.binding)});
   if(!exactKeys(authority,['authoritySha256'])||!digestPattern.test(authority.authoritySha256))fail('runtime_authority_required');
   const authorization=await actor.consume(request.authorization,{packet:structuredClone(packet),action,binding:structuredClone(input.binding)});
   if(!exactKeys(authorization,['authorizationId','binding','action'])||!uuid.test(authorization.authorizationId)||authorization.action!==action||!same(authorization.binding,input.binding))fail('actor_authorization_invalid');
   const observation=await observe(input);precondition(action,packet,input.binding,input.artifacts,input.recovery,observation);
   const sql=mutationSql({packet,...input,action,authorizationId:authorization.authorizationId,authoritySha256:authority.authoritySha256,observation});
   // Recheck all local source bytes and protected authority immediately before
   // the exclusive intent. No mutation is dispatched without exact readback.
   await sources(packet);
   const current=await runtime.assertCurrent({packet:structuredClone(packet),action,checkpoint,binding:structuredClone(input.binding)});
   if(!same(current,authority))fail('runtime_authority_changed');
   attempted.add(action);
   const intent={format:'nestory-hosted-reset-action-intent-v1',operationId:packet.operation.operationId,packetSha256:packet.packetSha256,
    action,bindingSha256:digestJson(input.binding),authorizationId:authorization.authorizationId,authoritySha256:authority.authoritySha256,
    sourceObservationSha256:digestDatabaseJson(observation),sqlSha256:digestJson(sql)};
   await save(`${key}/intent`,intent);
   try{await runPsql(connection,sql,spawnProcess,action,input.artifacts.continuationPlan.version);}catch{/* Lost reply never authorizes a retry; inspect durable original state. */}
   let result;try{result=await reconcileAction(action,input,intent);}catch{uncertain();}
   if(result.outcome!=='committed-and-verified')uncertain();
   await save(`${key}/receipt`,result);return result;
  },
 });
}
