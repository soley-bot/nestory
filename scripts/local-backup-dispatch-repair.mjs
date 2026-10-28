// One operation's expired, unused prepare attempt. This is not a retry policy.
// Native binding/SQL stay on the original release; only reviewed transport code
// may move to a new protected-main checkout. No credential or database client.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJson,hashBytes,hashSourceBytes,assertOperatorPacket} from './pilot-finance-reset-operator-core.mjs';
import {digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';

export const PREPARE_REPAIR_ORIGINAL_MAIN='9a08df0181d391a9bc8e6c28319c6678485f4c59';
export const PREPARE_REPAIR_OPERATION='7c70e27f-ba37-48cc-8f93-d32badcb2fb7';
export const PREPARE_REPAIR_MANIFEST='scripts/local-backup-dispatch-repair-manifest.json';
export const EXECUTE_RESUME_MANIFEST='scripts/local-backup-execute-resume-manifest.json';
const org='752a87b8-bd04-4a45-9cb8-00687af66e73',project='pfvmztxktkwyewvxfgot';
const root=path.resolve(import.meta.dirname,'..'),receipts=new WeakMap();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/,sha=/^[a-f0-9]{40}$/,run=/^[1-9][0-9]{0,19}$/;
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...keys].sort());
const fail=()=>{throw Error('local_prepare_repair_unverified');};
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const decode=bytes=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
const literal=v=>{if(typeof v!=='string'||v.includes('\0'))fail();return `'${v.replaceAll("'","''")}'`;};

// Deliberately finite. SQL producers, migrations, crypto helpers and the original
// business proof closure cannot change. The evidence reader's only delta is its
// explicitly branded packet-source bridge; substantive custody stays identical.
export const PREPARE_REPAIR_ALLOWED_FILES=Object.freeze([
 '.github/workflows/pilot-financial-reset-local-custody.yml',
 'scripts/local-backup-dispatch-repair.mjs','scripts/local-backup-dispatch-repair.node-test.mjs',
 'scripts/local-backup-dispatch-staging.mjs','scripts/local-backup-dispatch-staging.node-test.mjs',
 'scripts/local-backup-dispatch-local.mjs','scripts/local-backup-dispatch-local.node-test.mjs',
 'scripts/local-backup-dispatch-bundle.mjs','scripts/local-backup-dispatch-bundle.node-test.mjs',
 'scripts/pilot-finance-reset-local-custody-runner.mjs','scripts/pilot-finance-reset-local-custody.node-test.mjs',
 'scripts/pilot-finance-reset-manual-coordinator.mjs','scripts/pilot-finance-reset-windows-journal.node-test.mjs',
 'scripts/local-backup-custody-evidence.mjs','scripts/local-backup-custody-evidence.node-test.mjs',
].sort());
// The resumed execution has one separately measured native schema transition.
// Original migrations and financial action producers remain immutable.
export const EXECUTE_RESUME_ALLOWED_FILES=Object.freeze([...PREPARE_REPAIR_ALLOWED_FILES,
 PREPARE_REPAIR_MANIFEST,
 'scripts/local-backup-live-input.mjs','scripts/local-backup-live-witness.node-test.mjs',
 'scripts/local-backup-execute-resume.mjs','scripts/local-backup-execute-resume.node-test.mjs',
 'scripts/local-backup-prepublication-recovery.mjs','scripts/local-backup-prepublication-recovery.node-test.mjs',
 'scripts/fixtures/local-backup-prepublication-fixture.mjs',
 'scripts/local-backup-execute-transition.mjs','scripts/local-backup-execute-transition.node-test.mjs',
 'scripts/local-backup-execute-transition-manifest.json',
 'scripts/local-backup-execute-adapter.mjs','scripts/local-backup-execute-adapter.node-test.mjs',
 'scripts/pilot-finance-reset-worker-readiness.node-test.mjs',
 'scripts/run-database-tests.mjs',
 'scripts/run-database-tests.node-test.mjs',
 'supabase/migrations/20261028053520_financial_reset_execute_attempt_foreign_baseline.sql',
 'supabase/tests/financial_reset_execute_resume_test.sql',
].sort());
const resumeManifest=value=>value?.format==='nestory-local-execute-resume-manifest-v1';
const manifestPath=value=>resumeManifest(value)?EXECUTE_RESUME_MANIFEST:PREPARE_REPAIR_MANIFEST;

export function assertPrepareRepairManifest(value){
 const resumed=resumeManifest(value),allowed=resumed?EXECUTE_RESUME_ALLOWED_FILES:PREPARE_REPAIR_ALLOWED_FILES;
 if(!exact(value,['format','originalMainSha','operationId','allowedStages','changes'])||
  (!resumed&&value.format!=='nestory-local-prepare-repair-manifest-v1')||value.originalMainSha!==PREPARE_REPAIR_ORIGINAL_MAIN||
  value.operationId!==PREPARE_REPAIR_OPERATION||!same(value.allowedStages,resumed?['execute']:['prepare','seal','execute'])||
  !Array.isArray(value.changes)||value.changes.length<1||value.changes.length>allowed.length)fail();
 const names=[];
 for(const c of value.changes){
  if(!exact(c,['path','originalSha256','replacementSha256'])||!allowed.includes(c.path)||
   !(c.originalSha256===null||hash.test(c.originalSha256))||!hash.test(c.replacementSha256)||
   c.originalSha256===c.replacementSha256||names.includes(c.path))fail();
  names.push(c.path);
 }
 if(!same(names,[...names].sort())||!names.includes('scripts/local-backup-dispatch-repair.mjs'))fail();
 return value;
}

// Review-time generator only. The caller writes/reviews this JSON before the
// commit; it contains byte hashes, never its own hash or a future merge SHA.
export async function buildLocalDispatchRepairManifest({executeResume=false}={}){
 const allowed=executeResume?EXECUTE_RESUME_ALLOWED_FILES:PREPARE_REPAIR_ALLOWED_FILES;
 const old=await gitSources(PREPARE_REPAIR_ORIGINAL_MAIN,allowed),changes=[];
 for(const name of allowed){
  let current;try{current=await readFile(path.join(root,name));}catch(error){if(error.code!=='ENOENT')throw error;if(old.get(name)!==null)fail();continue;}
  const originalSha256=old.get(name)===null?null:hashSourceBytes(old.get(name)),replacementSha256=hashSourceBytes(current);
  if(originalSha256!==replacementSha256)changes.push({path:name,originalSha256,replacementSha256});
 }
 return assertPrepareRepairManifest({format:executeResume?'nestory-local-execute-resume-manifest-v1':'nestory-local-prepare-repair-manifest-v1',originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,
  operationId:PREPARE_REPAIR_OPERATION,allowedStages:executeResume?['execute']:['prepare','seal','execute'],changes});
}

function git(args,input=''){
 return new Promise((resolve,reject)=>{
  const binary=process.platform==='win32'?'C:\\Program Files\\Git\\cmd\\git.exe':'/usr/bin/git';
  const child=spawn(binary,['--no-replace-objects',...args],{cwd:root,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],
   env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:process.platform==='win32'?'C:\\Windows\\System32':'/usr/bin:/bin',
    GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0'}});
  const chunks=[];let size=0,bad=false;
  const stop=()=>{bad=true;child.kill();};const timer=setTimeout(stop,30000);
  child.stdout.on('data',b=>{size+=b.length;if(size>64*1024*1024)stop();else chunks.push(b)});
  child.stderr.on('data',stop);child.on('error',stop);child.stdin.on('error',stop);
  child.once('close',code=>{clearTimeout(timer);if(bad||code!==0)reject(Error('local_prepare_repair_git_unavailable'));else resolve(Buffer.concat(chunks));});
  child.stdin.end(input);
 });
}
async function gitSources(commit,names){
 if(!sha.test(commit)||names.some(n=>!/^[-a-zA-Z0-9_./]+$/.test(n)||n.includes('..')||n.startsWith('/')))fail();
 const bytes=await git(['cat-file','--batch'],names.map(n=>`${commit}:${n}\n`).join(''));let offset=0;const files=new Map();
 for(const name of names){
  const end=bytes.indexOf(10,offset);if(end<0)fail();
  const header=bytes.subarray(offset,end).toString('utf8');offset=end+1;
  if(header===`${commit}:${name} missing`){files.set(name,null);continue;}
  const match=/^[a-f0-9]{40} blob (0|[1-9][0-9]*)$/.exec(header);if(!match)fail();
  const size=Number(match[1]);if(!Number.isSafeInteger(size)||size>16*1024*1024||offset+size>=bytes.length||bytes[offset+size]!==10)fail();
  files.set(name,bytes.subarray(offset,offset+size));offset+=size+1;
 }
 if(offset!==bytes.length)fail();return files;
}

// Pure byte comparison is separately testable; only the fixed checkout reader
// below can mint the private receipt consumed by the operational entrypoints.
export function assertPrepareRepairSourceBytes({packet,manifest,originalFiles,currentFiles,changedPaths}){
 assertPrepareRepairManifest(manifest);
 if(packet?.operation?.mainSha!==PREPARE_REPAIR_ORIGINAL_MAIN||packet.operation.operationId!==PREPARE_REPAIR_OPERATION||
  !Array.isArray(packet.sourceFiles)||!packet.sourceFiles.length||!(originalFiles instanceof Map)||!(currentFiles instanceof Map)||
  !Array.isArray(changedPaths)||!same([...changedPaths].sort(),[...manifest.changes.map(c=>c.path),manifestPath(manifest)].sort()))fail();
 const names=new Set();
 for(const s of packet.sourceFiles){
  if(!exact(s,['path','sha256'])||names.has(s.path)||!hash.test(s.sha256))fail();names.add(s.path);
  const original=originalFiles.get(s.path),current=currentFiles.get(s.path),delta=manifest.changes.find(c=>c.path===s.path);
  if(!(original instanceof Uint8Array)||hashSourceBytes(original)!==s.sha256||!(current instanceof Uint8Array)||
   (delta?delta.originalSha256!==s.sha256:hashSourceBytes(current)!==s.sha256))fail();
 }
 for(const c of manifest.changes){
  const old=originalFiles.get(c.path),current=currentFiles.get(c.path);
  if(c.originalSha256===null?old!==null:!(old instanceof Uint8Array)||hashSourceBytes(old)!==c.originalSha256)fail();
  if(!(current instanceof Uint8Array)||hashSourceBytes(current)!==c.replacementSha256)fail();
 }
 return true;
}
export async function verifyLocalDispatchCompatibility({packet,executorMainSha}){
 packet=structuredClone(packet);assertOperatorPacket(packet);
 if(!sha.test(executorMainSha)||executorMainSha===PREPARE_REPAIR_ORIGINAL_MAIN||
  (await git(['rev-parse','HEAD'])).toString().trim()!==executorMainSha||
  (await git(['status','--porcelain','--untracked-files=no'])).length)fail();
 await git(['merge-base','--is-ancestor',PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha]);
 let selectedManifest=EXECUTE_RESUME_MANIFEST,manifestBytes;
 try{manifestBytes=await readFile(path.join(root,selectedManifest));}catch(error){if(error.code!=='ENOENT')throw error;selectedManifest=PREPARE_REPAIR_MANIFEST;manifestBytes=await readFile(path.join(root,selectedManifest));}
 const manifest=assertPrepareRepairManifest(decode(manifestBytes));if(manifestPath(manifest)!==selectedManifest)fail();
 const names=[...new Set([...packet.sourceFiles.map(s=>s.path),...manifest.changes.map(c=>c.path),selectedManifest])].sort();
 const [originalFiles,headFiles,changed]=await Promise.all([gitSources(PREPARE_REPAIR_ORIGINAL_MAIN,names),gitSources(executorMainSha,names),
  git(['diff','--name-only',PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha,'--'])]);
 const currentFiles=new Map();
 for(const name of names){const bytes=await readFile(path.join(root,name));if(!headFiles.get(name)||hashSourceBytes(bytes)!==hashSourceBytes(headFiles.get(name)))fail();currentFiles.set(name,bytes);}
 if(hashSourceBytes(manifestBytes)!==hashSourceBytes(headFiles.get(selectedManifest)))fail();
 assertPrepareRepairSourceBytes({packet,manifest,originalFiles,currentFiles,changedPaths:changed.toString().trim().split('\n').filter(Boolean)});
 const info={originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha,manifestSha256:hashSourceBytes(manifestBytes),
  executorSourceSha256:digestJson(names.map(p=>({path:p,sha256:hashSourceBytes(currentFiles.get(p))}))),
  operationId:packet.operation.operationId,packetSha256:packet.packetSha256};
 const handle=Object.freeze({format:'nestory-local-prepare-repair-compatibility-v1'});
 receipts.set(handle,{info,currentSources:names.map(p=>({path:p,sha256:hashSourceBytes(currentFiles.get(p))})),
  files:new Map(packet.sourceFiles.map(s=>[s.path,new TextDecoder('utf8',{fatal:true}).decode(originalFiles.get(s.path)).replaceAll('\r\n','\n')]))});
 return handle;
}
export function inspectLocalDispatchCompatibility(handle){const r=receipts.get(handle);if(!r)fail();return {...r.info};}
export function readLocalDispatchCompatibleSources(handle){const r=receipts.get(handle);if(!r)fail();return new Map(r.files);}
export async function assertLocalDispatchCompatibilityCurrent(handle,packet){
 const r=receipts.get(handle);if(!r||packet?.packetSha256!==r.info.packetSha256||packet?.operation?.operationId!==r.info.operationId||
  packet.operation.mainSha!==r.info.originalMainSha)fail();
 assertOperatorPacket(packet);
 if((await git(['rev-parse','HEAD'])).toString().trim()!==r.info.executorMainSha||(await git(['status','--porcelain','--untracked-files=no'])).length)fail();
 let next=0;const results=await Promise.allSettled(Array.from({length:4},async()=>{
  for(;;){const i=next++;if(i>=r.currentSources.length)return;const source=r.currentSources[i];
   if(hashSourceBytes(await readFile(path.join(root,source.path)))!==source.sha256)fail();}
 }));
 if(results.some(r=>r.status==='rejected'))fail();return true;
}

export function assertPrepareRepairRecord(r){
 if(!exact(r,['format','operationId','packetSha256','bindingSha256','originalMainSha','executorMainSha','manifestSha256','executorSourceSha256',
  'originalAttempt','replacement','eligibilitySha256','originalRunSha256','createdAt'])||r.format!=='nestory-local-prepare-repair-v1'||
  r.operationId!==PREPARE_REPAIR_OPERATION||r.originalMainSha!==PREPARE_REPAIR_ORIGINAL_MAIN||!sha.test(r.executorMainSha)||
  r.executorMainSha===r.originalMainSha||!stamp(r.createdAt)||
  !['packetSha256','bindingSha256','manifestSha256','executorSourceSha256','eligibilitySha256','originalRunSha256'].every(k=>hash.test(r[k])))fail();
 const a=r.originalAttempt,b=r.replacement;
 if(!exact(a,['authorizationId','nonce','runId','runAttempt','intentSha256','claimSha256','publicationSha256'])||
  !uuid.test(a.authorizationId)||!uuid.test(a.nonce)||!run.test(a.runId)||a.runAttempt!==1||
  !['intentSha256','claimSha256','publicationSha256'].every(k=>hash.test(a[k]))||
  !exact(b,['nonce','runId','runAttempt'])||!uuid.test(b.nonce)||!run.test(b.runId)||b.runAttempt!==1||b.runId===a.runId||b.nonce===a.nonce)fail();
 return r;
}
export function assertPrepareRepairCompatibility(record,handle){
 assertPrepareRepairRecord(record);const info=inspectLocalDispatchCompatibility(handle);
 if(!Object.keys(info).every(k=>info[k]===record[k]))fail();return true;
}
export function localPrepareRepairStagePrefix(action,record){
 assertPrepareRepairRecord(record);if(!['prepare','seal','execute'].includes(action))fail();
 return `financial-reset/${record.operationId}/manual-stage/${action}${action==='prepare'?'/repair-once/attempt':''}`;
}
export function assertPrepareRepairOriginalJournal({repair,intentBytes,claimBytes,responseBytes,publicationBytes}){
 assertPrepareRepairRecord(repair);const a=repair.originalAttempt;
 if(![intentBytes,claimBytes,responseBytes,publicationBytes].every(b=>b instanceof Uint8Array&&b.length>0&&b.length<=262144)||
  hashBytes(intentBytes)!==a.intentSha256||hashBytes(claimBytes)!==a.claimSha256)fail();
 const intent=decode(intentBytes),claim=decode(claimBytes),response=decode(responseBytes),publication=decode(publicationBytes);
 if(intent.mainSha!==repair.originalMainSha||intent.transportIntent?.operationId!==repair.operationId||intent.transportIntent.action!=='prepare'||
  intent.transportIntent.authorizationId!==a.authorizationId||intent.transportIntent.packetSha256!==repair.packetSha256||
  intent.transportIntent.bindingSha256!==repair.bindingSha256||
  !same(claim,{format:'nestory-manual-reset-dispatch-claim-v1',operationId:repair.operationId,action:'prepare',intentSha256:a.intentSha256})||
  !same(response,{format:'nestory-manual-reset-dispatch-response-v1',operationId:repair.operationId,action:'prepare',intentSha256:a.intentSha256,runId:Number(a.runId),runAttempt:1})||
  publication.format!=='nestory-local-ticket-publication-v1'||String(publication.runId)!==a.runId||publication.intentSha256!==a.intentSha256||publication.ciphertextSha256!==a.publicationSha256)fail();
 return true;
}

function repairScope({binding,originalAuthorizationId}){
 if(!binding||binding.operation_id!==PREPARE_REPAIR_OPERATION||binding.organization_id!==org||binding.project_ref!==project||
  binding.main_sha!==PREPARE_REPAIR_ORIGINAL_MAIN||binding.version!==1||binding.recovery!==undefined||
  binding.source_generation!==0||binding.target_generation!==1||binding.cutoff!=='2026-10-01'||binding.issue_date!=='2026-10-01'||
  binding.invoice_date_policy!=='empty-books-no-invoices'||binding.continuation_semantic?.version!==4||
  !uuid.test(originalAuthorizationId)||Buffer.byteLength(JSON.stringify(binding))>131072)fail();
 return {b:literal(JSON.stringify(binding))+'::jsonb',id:literal(originalAuthorizationId)+'::uuid',op:literal(binding.operation_id)+'::uuid'};
}
function eligibilityProjection(options){
 const {b,id,op}=repairScope(options);
 return `SELECT jsonb_build_object('format','nestory-local-prepare-repair-observation-v1',
 'operationId',${op},'originalAuthorizationId',${id},'observedAt',clock_timestamp(),
 'authorizationExpiresAt',(SELECT expires_at FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=${id}),
 'authorizationExpiredUnused',EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations a WHERE a.authorization_id=${id}
  AND a.operation_id=${op} AND a.organization_id='${org}'::uuid AND a.action='prepare' AND a.binding=${b}
  AND a.binding_sha256=app_private.financial_reset_hash(${b}) AND a.expires_at<=clock_timestamp() AND a.consumed_at IS NULL AND a.backend_pid IS NULL AND a.transaction_id IS NULL),
 'nativePrepareAbsent',NOT EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_archive_rows WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_stage_events WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=${op}),
 'reservationMatches',EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations r WHERE r.operation_id=${op}
  AND r.organization_id='${org}'::uuid AND r.binding=${b} AND r.binding_sha256=app_private.financial_reset_hash(${b})),
 'checkpointMatches',EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_checkpoints c WHERE c.operation_id=${op}
  AND c.organization_id='${org}'::uuid AND c.binding_sha256=app_private.financial_reset_hash(${b}) AND c.source_sha256=${b}->>'source_snapshot_sha256'),
 'controlMatches',EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id='${org}'::uuid
  AND status='frozen' AND generation=1 AND financial_start_date='2026-10-01'::date),
 'sourceMatches',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot('${org}'::uuid))=${b}->>'source_snapshot_sha256',
 'foreignMatches',EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations r WHERE r.operation_id=${op}
  AND r.foreign_sha256=app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census('${org}'::uuid))))`;
}
const eligibilityFields=['authorizationExpiredUnused','nativePrepareAbsent','reservationMatches','checkpointMatches','controlMatches','sourceMatches','foreignMatches'];
export function assertPrepareRepairObservation(value,{binding,originalAuthorizationId,now=Date.now()}){
 repairScope({binding,originalAuthorizationId});
 if(!exact(value,['format','operationId','originalAuthorizationId','observedAt','authorizationExpiresAt',...eligibilityFields])||
  value.format!=='nestory-local-prepare-repair-observation-v1'||value.operationId!==binding.operation_id||value.originalAuthorizationId!==originalAuthorizationId||
  !Number.isFinite(Date.parse(value.observedAt))||!Number.isFinite(Date.parse(value.authorizationExpiresAt))||
  Date.parse(value.authorizationExpiresAt)>Date.parse(value.observedAt)||!Number.isSafeInteger(now)||
  Date.parse(value.observedAt)>now||eligibilityFields.some(k=>value[k]!==true))fail();
 return true;
}
export function buildPrepareRepairObservationSql(options){
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL standard_conforming_strings=on; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='30s';\n${eligibilityProjection(options)};\nCOMMIT;`;
}
export function buildPrepareRepairGuardSql(options){
 const {id}=repairScope(options);
 return `DO $local_prepare_repair$ DECLARE observed jsonb; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:${org}',0));
 PERFORM 1 FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=${id} FOR UPDATE;
 ${eligibilityProjection(options)} INTO observed;
 IF ${eligibilityFields.map(k=>`observed->'${k}' IS DISTINCT FROM 'true'::jsonb`).join(' OR ')} THEN
  RAISE EXCEPTION 'local_prepare_repair_native_state_changed' USING ERRCODE='40001';
 END IF;
 END $local_prepare_repair$;`;
}

export function prepareRepairOriginalRunEvidence(runMetadata,{operationId,nonce}){
 if(operationId!==PREPARE_REPAIR_OPERATION||!uuid.test(nonce)||!runMetadata||!Number.isSafeInteger(runMetadata.id)||runMetadata.id<1||
  runMetadata.run_attempt!==1||runMetadata.status!=='completed'||
  !['failure','cancelled','timed_out'].includes(runMetadata.conclusion)||runMetadata.head_sha!==PREPARE_REPAIR_ORIGINAL_MAIN||
  runMetadata.head_branch!=='main'||runMetadata.event!=='workflow_dispatch'||runMetadata.path!=='.github/workflows/pilot-financial-reset-local-custody.yml'||
  runMetadata.repository?.full_name!=='soley-bot/nestory'||runMetadata.display_title!==`Pilot reset ${operationId} prepare ${nonce} execute`)fail();
 const observation=Object.freeze({format:'nestory-local-prepare-original-run-v1',runId:String(runMetadata.id),runAttempt:1,
  status:runMetadata.status,conclusion:runMetadata.conclusion,mainSha:runMetadata.head_sha,branch:'main',event:'workflow_dispatch',
  workflow:runMetadata.path,repository:runMetadata.repository.full_name,displayTitle:runMetadata.display_title});
 return Object.freeze({observation,sha256:digestJson(observation)});
}
export function assertPrepareRepairOriginalRun(runMetadata,repair){
 assertPrepareRepairRecord(repair);
 const evidence=prepareRepairOriginalRunEvidence(runMetadata,{operationId:repair.operationId,nonce:repair.originalAttempt.nonce});
 if(evidence.observation.runId!==repair.originalAttempt.runId||evidence.sha256!==repair.originalRunSha256)fail();
 return true;
}
