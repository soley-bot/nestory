// Fixed no-AWS worker. Durable history stays in the protected Windows journal.
// Only the reviewed sole-admin reset route is admitted; other transports stay held.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFile,lstat,realpath,mkdir,open,unlink,rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertOperatorPacket,canonicalJson,hashBytes,REQUIRED_ARTIFACTS} from './pilot-finance-reset-operator-core.mjs';
import {RESET_PROJECT,RESET_ORGANIZATION,HOSTED_BOUND_SOURCE_FILES,assertProtectedEnvironment} from './pilot-finance-reset-hosted-workflow-core.mjs';
import {hostedBinding,validateArtifacts,observationSql,mutationSql,digestJson,digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {runHostedPsql,verifyHostedPacketSources,assertHostedObservation,
 assertHostedPrecondition,hostedStageReceiptMatches,hostedPhaseState,verifyHostedResetExecutionReadback} from './pilot-finance-reset-hosted-transport.mjs';
import {verifySignedDispatchBundle,verifyHistoricalDispatchBundle,LOCAL_DISPATCH_REPOSITORY,LOCAL_DISPATCH_WORKFLOW,LOCAL_DISPATCH_TRANSFER_LIMIT} from './local-backup-dispatch-bundle.mjs';
import {assertPilotSingleAdminOperation} from './pilot-finance-reset-single-admin-policy.mjs';
import {selectPilotHostedCredential} from './local-backup-file-credential.mjs';
import {verifyLocalDispatchCompatibility,assertLocalDispatchCompatibilityCurrent,readLocalDispatchCompatibleSources,
 assertPrepareRepairCompatibility,assertPrepareRepairRecord,buildPrepareRepairGuardSql,assertPrepareRepairOriginalRun} from './local-backup-dispatch-repair.mjs';
import {assertStagedWaiting,assertStagedPayloadReference,hydrateStagedDispatchTicket,decryptStagedPayload,freshStorageReadUrl,
 writeStagedPayloadCache,readStagedPayloadCache,removeStagedPayloadCache,STAGED_TICKET_LIMIT} from './local-backup-dispatch-staging.mjs';

export const LOCAL_CUSTODY_RESET_ACTIONS=Object.freeze(['freeze','checkpoint','prepare','seal','execute']);
export function assertLocalCustodyResetAction(action){
 if(!LOCAL_CUSTODY_RESET_ACTIONS.includes(action))throw Error('local_custody_reset_scope_invalid');
 return action;
}
export function assertLocalCustodyResetScope({action,binding,artifacts,recovery}){
 assertLocalCustodyResetAction(action);
 if(recovery!==null||artifacts?.continuationPlan?.version!==4||!binding||
  !assertPilotSingleAdminOperation(artifacts?.zeroPlan,{operationId:binding.operation_id,organizationId:binding.organization_id,projectRef:binding.project_ref,
   sourceGeneration:binding.source_generation,targetGeneration:binding.target_generation,cutoff:binding.cutoff,issueDate:binding.issue_date,invoiceDatePolicy:binding.invoice_date_policy}))
  throw Error('local_custody_reset_scope_invalid');
 return true;
}
export const LOCAL_CUSTODY_BUCKET='pilot-reset-handoff';
export const LOCAL_CUSTODY_JOB='Pilot reset local custody';
export const LOCAL_CUSTODY_CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
export const LOCAL_CUSTODY_DATABASE_HOST='aws-1-ap-southeast-1.pooler.supabase.com';
const caSource='scripts/certificates/supabase-prod-ca-2021.crt';
export const LOCAL_CUSTODY_SOURCES=Object.freeze([...new Set([...HOSTED_BOUND_SOURCE_FILES,LOCAL_DISPATCH_WORKFLOW,
 'scripts/pilot-finance-reset-local-custody-runner.mjs','scripts/local-backup-dispatch-bundle.mjs',
 'scripts/local-backup-dispatch-local.mjs','scripts/local-backup-file-credential.mjs',
 'scripts/local-backup-dispatch-staging.mjs',
 'scripts/local-backup-dispatch-repair.mjs','scripts/local-backup-dispatch-repair-manifest.json',
 'scripts/local-backup-dispatch-review.mjs','scripts/local-backup-dispatch-observation.mjs',
 'scripts/local-backup-custody-evidence.mjs','scripts/local-backup-files.mjs','scripts/local-backup-capture.mjs','scripts/local-backup-restore.mjs',
 'scripts/local-backup-packet-bridge.mjs','scripts/local-backup-ram-rehearsal-plan.mjs','scripts/pilot-finance-reset-server-materializer.mjs',
 'scripts/local-backup-live-witness.mjs','scripts/local-backup-live-packet.mjs','scripts/local-backup-live-input.mjs','scripts/local-backup-saved-rehearsal.mjs',
 'scripts/local-backup-business-restore.mjs','scripts/local-backup-business-runtime.mjs','scripts/local-backup-business-schema-restore.mjs',
 'scripts/local-backup-business-rehearsal-sql.mjs',
 'scripts/local-backup-business-schema-source.mjs','scripts/local-backup-schema-capture.mjs','scripts/local-backup-schema-capture-cli.mjs',
 'scripts/local-backup-business-spill.ps1','scripts/local-backup-business-vendor-manifest.json',
 'supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json',
 'scripts/local-backup-crypto.mjs','scripts/local-backup-windows.ps1','scripts/pilot-finance-reset-manual-coordinator.mjs',
 'scripts/pilot-finance-reset-windows-journal.mjs','scripts/pilot-finance-reset-windows-journal.ps1',caSource,'package.json','package-lock.json'])].sort());
const root=path.resolve(import.meta.dirname,'..'),exec=promisify(execFile);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/,sha=/^[a-f0-9]{40}$/;
const fail=code=>{throw Error(`local_custody_${code}`);};
const publicFailureCodes=new Set(['local_custody_database_inputs_invalid','local_custody_private_path_invalid',
 'local_custody_swap_present','local_custody_binary_unavailable','local_custody_ca_changed',
 'local_custody_database_connection_unverified','local_custody_private_file_invalid',
 'local_custody_checkout_invalid','local_custody_origin_invalid','local_custody_sql_prefix_changed',
 'local_custody_tls_certificate_failed','local_custody_database_authentication_failed',
 'local_custody_database_endpoint_failed','local_custody_database_network_failed',
 'local_custody_database_identity_failed','local_custody_database_bucket_failed',
 'local_custody_provision_inputs_invalid','local_custody_provision_credential_unavailable','local_custody_provision_authority_changed',
 'local_custody_read_unavailable','local_custody_read_limit',
 'local_custody_bucket_request_unknown','local_custody_bucket_request_invalid','local_custody_bucket_response_limit',
 'local_custody_bucket_read_unavailable','local_custody_bucket_mismatch','local_custody_bucket_create_outcome_unknown',
 'local_backup_files_cli_credential_response_invalid','local_backup_files_cli_credential_ambiguous',
 'local_backup_files_cli_credential_missing','local_backup_files_cli_credential_key_invalid',
 'hosted_transport_process_failed','local_dispatch_staging_invalid','local_custody_staged_payload_changed','local_prepare_repair_unverified']);
export function localCustodyFailureCode(error){
 return publicFailureCodes.has(error?.message)?error.message:'local_custody_worker_stopped';
}
export function classifyLocalCustodyDatabaseFailure(bytes){
 // Fixed categories only; raw libpq/SQL output may contain private values.
 const value=bytes.toString('utf8');
 if(/certificate verify failed|server certificate.*does not match host|root certificate file|SSL error/i.test(value))return 'local_custody_tls_certificate_failed';
 if(/password authentication failed|SASL authentication failed|authentication failed/i.test(value))return 'local_custody_database_authentication_failed';
 if(/Tenant or user not found/i.test(value))return 'local_custody_database_endpoint_failed';
 if(/could not translate host name|could not connect to server|connection to server.*failed|timeout expired|Network is unreachable|Connection refused/i.test(value))return 'local_custody_database_network_failed';
 if(/local_custody_database_identity/.test(value))return 'local_custody_database_identity_failed';
 if(/local_custody_private_bucket_changed/.test(value))return 'local_custody_database_bucket_failed';
 return 'hosted_transport_process_failed';
}
async function localCustodyPsql(connection,sql,action='observe',version=null){
 const diagnostic=Buffer.alloc(8192);let length=0,active=true;
 const spawnPrivate=(...args)=>{const child=spawn(...args);child.stderr.on('data',bytes=>{
  if(!active)return;
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);length+=buffer.copy(diagnostic,length,0,Math.max(0,diagnostic.length-length));
 });return child;};
 try{return await runHostedPsql(connection,sql,spawnPrivate,action,version);}
 catch{throw Error(classifyLocalCustodyDatabaseFailure(diagnostic.subarray(0,length)));}
 finally{active=false;diagnostic.fill(0);}
}
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const exact=(o,keys)=>o&&Object.getPrototypeOf(o)===Object.prototype&&same(Object.keys(o).sort(),[...keys].sort());
const parse=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const limit=LOCAL_DISPATCH_TRANSFER_LIMIT;
const sessionGuard="DO $local_custody_identity$ BEGIN IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'postgres' THEN RAISE EXCEPTION 'local_custody_database_identity'; END IF; END $local_custody_identity$;";
const bucketGuard="DO $local_custody_bucket$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='pilot-reset-handoff' AND name='pilot-reset-handoff' AND public=false AND file_size_limit=33554432 AND allowed_mime_types IS NOT DISTINCT FROM ARRAY['application/octet-stream']::text[]) THEN RAISE EXCEPTION 'local_custody_private_bucket_changed'; END IF; END $local_custody_bucket$;";
function guardedSql(sql,checkBucket=true,extraGuard=''){
 const boundary=sql.indexOf('\n');
 if(boundary<0||!sql.slice(0,boundary).startsWith('BEGIN TRANSACTION ISOLATION LEVEL '))fail('sql_prefix_changed');
 return `${sql.slice(0,boundary)}\n${sessionGuard}\n${checkBucket?bucketGuard+'\n':''}${extraGuard}${sql.slice(boundary+1)}`;
}
export function localCustodyMutationSql(options){
 assertLocalCustodyResetScope(options);
 const foreign=options?.observation?.foreignSha256;
 if(!digest.test(foreign)||options?.binding?.organization_id!==RESET_ORGANIZATION)fail('foreign_baseline_invalid');
 const guard=`DO $local_custody_foreign$ BEGIN IF app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census('${RESET_ORGANIZATION}'::uuid)) IS DISTINCT FROM '${foreign}' THEN RAISE EXCEPTION 'local_custody_foreign_baseline_changed'; END IF; END $local_custody_foreign$;\n`;
 let sql=mutationSql(options);
 if(options.repair){
  const repair=assertPrepareRepairRecord(options.repair);
  if(!['prepare','seal','execute'].includes(options.action)||repair.operationId!==options.binding.operation_id||repair.bindingSha256!==digestJson(options.binding)||options.authorizationId===repair.originalAttempt.authorizationId)fail('repair_binding_invalid');
  if(options.action==='prepare'){
   const anchor='SELECT app_private.consume_financial_reset_actor_authorization(';
   if(sql.split(anchor).length!==2)fail('sql_prefix_changed');
   sql=sql.replace(anchor,buildPrepareRepairGuardSql({binding:options.binding,originalAuthorizationId:repair.originalAttempt.authorizationId})+'\n'+anchor);
  }
 }
 return guardedSql(sql,true,guard);
}

export function assertLocalCustodyLocator(v){
 if(!exact(v,['operationId','action','nonce'])||!uuid.test(v.operationId)||!uuid.test(v.nonce)||!LOCAL_CUSTODY_RESET_ACTIONS.includes(v.action))fail('locator_invalid');
 return v;
}
export function localCustodyObjectPath(locator){
 const v=assertLocalCustodyLocator(locator);return `${RESET_ORGANIZATION}/october-2026/${v.operationId}/${v.nonce}/bundle.bin`;
}
export function assertLocalCustodySignedUrl(value,locator){
 let u;try{u=new URL(value);}catch{fail('url_invalid');}
 if(u.origin!==`https://${RESET_PROJECT}.supabase.co`||u.username||u.password||u.hash||
   u.pathname!==`/storage/v1/object/sign/${LOCAL_CUSTODY_BUCKET}/${localCustodyObjectPath(locator)}`||
   [...u.searchParams.keys()].length!==1||!u.searchParams.has('token')||!/^[A-Za-z0-9_.-]{20,8192}$/.test(u.searchParams.get('token')))fail('url_invalid');
 return u.href;
}
function aad(locator){return Buffer.from(canonicalJson({format:'nestory-local-custody-transfer-v1',project:RESET_PROJECT,bucket:LOCAL_CUSTODY_BUCKET,path:localCustodyObjectPath(locator),action:locator.action}));}
export function encryptLocalCustodyTransfer(document,key,locator){
 if(!(key instanceof Uint8Array)||key.length!==32)fail('key_invalid');
 const bytes=Buffer.from(JSON.stringify(document));if(bytes.length<1||bytes.length>limit-64)fail('transfer_limit');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(locator));
 try{return Buffer.concat([Buffer.from('NLC1'),iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);}finally{bytes.fill(0);}
}
export function decryptLocalCustodyTransfer(bytes,key,locator){
 if(!(bytes instanceof Uint8Array)||bytes.length<33||bytes.length>limit||Buffer.from(bytes).subarray(0,4).toString()!=='NLC1'||!(key instanceof Uint8Array)||key.length!==32)fail('transfer_invalid');
 let plain;try{const b=Buffer.from(bytes),decipher=createDecipheriv('aes-256-gcm',key,b.subarray(4,16));decipher.setAAD(aad(locator));decipher.setAuthTag(b.subarray(-16));
  plain=Buffer.concat([decipher.update(b.subarray(16,-16)),decipher.final()]);return parse(plain);
 }catch{fail('transfer_invalid');}finally{plain?.fill(0);}
}
export function assertLocalCustodyJob({environment:e,gitHead,currentMain,run,jobs,protectedEnvironment,protectedBranchNames,deploymentPolicies}){
 assertProtectedEnvironment(protectedEnvironment,protectedBranchNames,deploymentPolicies);
 if(e.GITHUB_ACTIONS!=='true'||e.RUNNER_ENVIRONMENT!=='github-hosted'||e.RUNNER_OS!=='Linux'||e.RUNNER_ARCH!=='X64'||
  e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GITHUB_REPOSITORY!==LOCAL_DISPATCH_REPOSITORY||e.GITHUB_REF!=='refs/heads/main'||
  e.GITHUB_WORKFLOW_REF!==`${LOCAL_DISPATCH_REPOSITORY}/${LOCAL_DISPATCH_WORKFLOW}@refs/heads/main`||e.GITHUB_WORKFLOW_SHA!==e.GITHUB_SHA||
  !sha.test(gitHead)||gitHead!==e.GITHUB_SHA||currentMain!==gitHead||e.GITHUB_RUN_ATTEMPT!=='1'||
  !/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ID??'')||!Number.isSafeInteger(run?.id)||String(run.id)!==e.GITHUB_RUN_ID||run.run_attempt!==1||
  run.path!==LOCAL_DISPATCH_WORKFLOW||run.repository?.full_name!==LOCAL_DISPATCH_REPOSITORY||run.head_sha!==gitHead||run.head_branch!=='main'||
  run.event!=='workflow_dispatch'||run.status!=='in_progress'||!Array.isArray(jobs?.jobs)||jobs.total_count!==jobs.jobs.length)fail('job_invalid');
 const active=jobs.jobs.filter(j=>j.name===LOCAL_CUSTODY_JOB&&j.status==='in_progress');
 if(active.length!==1)fail('job_invalid');const j=active[0];
 if(!Number.isSafeInteger(j.id)||j.id<1||!Number.isSafeInteger(j.runner_id)||j.runner_id<1||j.run_id!==run.id||j.run_attempt!==1||j.head_sha!==gitHead||
  typeof e.RUNNER_NAME!=='string'||!e.RUNNER_NAME||j.runner_name!==e.RUNNER_NAME||!same(j.labels,['ubuntu-24.04']))fail('job_invalid');
 return {repository:LOCAL_DISPATCH_REPOSITORY,workflow:LOCAL_DISPATCH_WORKFLOW,mainSha:gitHead,runId:e.GITHUB_RUN_ID,runAttempt:1};
}

export function verifyLocalCustodyPayload({ticket,payload,compatibility}){
 const {packet,binding,artifacts,recovery,observation}=payload;
 assertLocalCustodyResetScope({action:ticket.action,binding,artifacts,recovery});
 assertOperatorPacket(packet);validateArtifacts(packet,artifacts,recovery);
 if(payload.repair)assertPrepareRepairCompatibility(payload.repair,compatibility);
 if(packet.evidenceBlockers.length||!REQUIRED_ARTIFACTS.every(r=>packet.artifacts[r])||(!payload.repair&&packet.operation.mainSha!==ticket.mainSha)||
   packet.operation.invoiceDatePolicy!=='empty-books-no-invoices'||artifacts.continuationPlan?.version!==4||
   packet.operation.projectRef!==RESET_PROJECT||packet.operation.organizationId!==RESET_ORGANIZATION||
   (!payload.repair&&!LOCAL_CUSTODY_SOURCES.every(p=>packet.sourceFiles.some(f=>f.path===p)))||
   !same(binding,hostedBinding(packet,artifacts.continuationPlan,recovery))||
   ticket.sourceObservationSha256!==digestDatabaseJson(observation))fail('payload_invalid');
 const sql=localCustodyMutationSql({binding,action:ticket.action,authorizationId:ticket.authorizationId,authoritySha256:ticket.authoritySha256,observation,artifacts,recovery,repair:payload.repair});
 if(digestJson(sql)!==ticket.sqlSha256)fail('sql_changed');return sql;
}
export function reconcileLocalCustodyObservation({ticket,payload,observation:o}){
 const {packet,binding,artifacts,recovery}=payload,{action,authorizationId}=ticket;
 const intent={authorizationId,authoritySha256:ticket.authoritySha256};
 const consumed=o.authorization?.status==='consumed'&&o.authorization.bindingMatches===true&&o.authorization.authorizationId===authorizationId;
 const complete=['execute','execute-recovery'].includes(action)?verifyHostedResetExecutionReadback({packet,binding,artifacts,recovery,observation:o,authorizationId,action}):
  consumed&&(['prepare','seal'].includes(action)?hostedStageReceiptMatches(action,packet,binding,artifacts,o,intent):
   (action!=='checkpoint'||o.recoveryCheckpoint?.authoritySha256===ticket.authoritySha256)&&hostedPhaseState(action,packet,binding,artifacts,recovery,o));
 return {format:'nestory-local-custody-result-v1',operationId:ticket.operationId,action,runId:ticket.runId,runAttempt:1,
  intentSha256:ticket.intentSha256,outcome:complete?'committed-and-verified':'not-proven-do-not-retry',mutationRetried:false,
  observationSha256:digestDatabaseJson(o),checkpointSha256:o.checkpoint?.sha256??null,
  normalWritesReopened:o.control?.status==='frozen'?false:null};
}

// The fixed worker owns these ports. This small protocol is also exercised
// offline; it grants no provider identity, credentials or dispatch permission.
export function createLocalCustodySingleAttempt({write,readback,reconcile}){
 if(![write,readback,reconcile].every(f=>typeof f==='function'))fail('ports_invalid');let attempted=false;
 return async()=>{
  if(attempted)fail('existing_attempt_reconcile_only');attempted=true;
  try{await write();}catch{/* A lost reply never permits a second write. */}
  return reconcile(await readback());
 };
}
export async function readLocalCustodyAfterRefresh({expected,refresh,read}){
 if(!same(expected,await refresh()))fail('read_authority_changed');return read();
}

async function boundedGet(url,headers,max=2*1024*1024){
 let r;try{r=await fetch(url,{method:'GET',headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{fail('read_unavailable');}
 if(!r.ok||r.redirected||r.url!==url||!r.body)fail('read_unavailable');
 const chunks=[];let size=0;const reader=r.body.getReader();
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('read_limit');}chunks.push(value);}
 return Buffer.concat(chunks);
}
async function github(resource,token){return parse(await boundedGet(`https://api.github.com/repos/${LOCAL_DISPATCH_REPOSITORY}/${resource}`,{
 Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}));}

export function assertLocalCustodyBucketMetadata(bucket){
 if(!bucket||bucket.id!==LOCAL_CUSTODY_BUCKET||bucket.name!==LOCAL_CUSTODY_BUCKET||bucket.public!==false||
  bucket.file_size_limit!==limit||!same(bucket.allowed_mime_types,['application/octet-stream']))fail('bucket_mismatch');
 return true;
}
export function localCustodyBucketReadValue({status,value}){
 if(status===404&&value?.message==='Bucket not found'&&(value.code==='NoSuchBucket'||value.error==='Bucket not found'))return null;
 if(status===400&&exact(value,['statusCode','code','error','message'])&&value.statusCode==='404'&&
  value.code==='NoSuchBucket'&&value.error==='Bucket not found'&&value.message==='Bucket not found')return null;
 if(status!==200)fail('bucket_read_unavailable');
 return value;
}
// Offline protocol port only. Production supplies fixed endpoints below and
// cannot accept injected providers, URLs, bucket settings or request bodies.
export async function exerciseLocalCustodyBucketProvision({read,create,refresh}){
 const before=await read();if(before!==null){assertLocalCustodyBucketMetadata(before);return {outcome:'existing-matching',createAttempted:false};}
 await refresh();let acknowledged=false;
 try{await create();acknowledged=true;}catch{/* Never retry an ambiguous POST. Read its outcome once. */}
 const after=await read();if(after===null)fail('bucket_create_outcome_unknown');assertLocalCustodyBucketMetadata(after);
 return {outcome:acknowledged?'created-and-verified':'matching-after-unknown-create',createAttempted:true};
}
async function provisionLocalCustodyBucket(env,invocation){
 if(env.SUPABASE_PROJECT_ID!==RESET_PROJECT||typeof env.SUPABASE_ACCESS_TOKEN!=='string'||
  !env.SUPABASE_ACCESS_TOKEN||env.SUPABASE_ACCESS_TOKEN.length>8192||/\s/.test(env.SUPABASE_ACCESS_TOKEN))fail('provision_inputs_invalid');
 delete process.env.SUPABASE_ACCESS_TOKEN;
 let credential,bytes;
 try{
  bytes=await boundedGet(`https://api.supabase.com/v1/projects/${RESET_PROJECT}/api-keys?reveal=true`,
   {Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},131072);
  const selected=selectPilotHostedCredential(bytes);if(selected.redacted)fail('provision_credential_unavailable');credential=selected.key;
 }finally{bytes?.fill(0);env.SUPABASE_ACCESS_TOKEN=undefined;}
 const origin=`https://${RESET_PROJECT}.supabase.co/storage/v1/bucket`,headers={Authorization:`Bearer ${credential}`,apikey:credential,'Content-Type':'application/json'};
 async function request(method,url,body){
  let response;try{response=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{fail('bucket_request_unknown');}
  if(response.redirected||response.url!==url||!response.body)fail('bucket_request_invalid');
  const chunks=[];let size=0;const reader=response.body.getReader();
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();fail('bucket_response_limit');}chunks.push(value);}
   return {status:response.status,value:parse(Buffer.concat(chunks))};
  }finally{chunks.forEach(b=>b.fill(0));}
 }
 try{
  const result=await exerciseLocalCustodyBucketProvision({
   read:async()=>localCustodyBucketReadValue(await request('GET',`${origin}/${LOCAL_CUSTODY_BUCKET}`)),
   create:async()=>{const r=await request('POST',origin,{id:LOCAL_CUSTODY_BUCKET,name:LOCAL_CUSTODY_BUCKET,public:false,file_size_limit:limit,allowed_mime_types:['application/octet-stream']});
    if(r.status<200||r.status>=300)fail('bucket_create_outcome_unknown');},
   refresh:async()=>{if(!same(invocation,await job(env,env.GH_TOKEN)))fail('provision_authority_changed');},
  });
  return {format:'nestory-local-custody-bucket-provision-v1',...invocation,...result,bucket:LOCAL_CUSTODY_BUCKET,
   private:true,maximumObjectBytes:limit,mimeType:'application/octet-stream',policiesChanged:false,credentialsCreated:false,customerDataRead:false};
 }finally{credential=undefined;headers.Authorization=undefined;headers.apikey=undefined;}
}
async function job(e,token){
 const [head,status,main,run,jobs,protectedEnvironment,branches]=await Promise.all([
  exec('git',['rev-parse','HEAD'],{cwd:root}),exec('git',['status','--porcelain','--untracked-files=all'],{cwd:root}),github('commits/main',token),
  github(`actions/runs/${e.GITHUB_RUN_ID}`,token),github(`actions/runs/${e.GITHUB_RUN_ID}/attempts/1/jobs?per_page=100`,token),
  github('environments/production-database',token),github('branches?protected=true&per_page=100',token)]);
 if(head.stderr||status.stderr||status.stdout||!Array.isArray(branches)||branches.length>=100)fail('checkout_invalid');
 const deploymentPolicies=protectedEnvironment.deployment_branch_policy?.custom_branch_policies?
  await github('environments/production-database/deployment-branch-policies?per_page=100',token):null;
 return assertLocalCustodyJob({environment:e,gitHead:head.stdout.trim(),currentMain:main.sha,run,jobs,protectedEnvironment,
  protectedBranchNames:branches.map(b=>b.name).sort(),deploymentPolicies});
}
async function privateConnection(environment){
 const directory='/dev/shm/nestory-reset-local-custody',psqlPath='/usr/lib/postgresql/16/bin/psql';
 const ca=await readFile(path.join(root,caSource)),password=environment.SUPABASE_DB_PASSWORD;
 if(hashBytes(ca)!==LOCAL_CUSTODY_CA_SHA256||
  !ca.toString().includes('-----BEGIN CERTIFICATE-----')||typeof password!=='string'||!password||/[\r\n\0]/.test(password)||
  !digest.test(environment.PILOT_RESET_PSQL_SHA256??'')||hashBytes(await readFile(psqlPath))!==environment.PILOT_RESET_PSQL_SHA256)fail('database_inputs_invalid');
 for(const p of ['/dev','/dev/shm',psqlPath]){const s=await lstat(p);if(s.isSymbolicLink()||await realpath(p)!==p)fail('private_path_invalid');}
 if((await readFile('/proc/swaps','utf8')).trim().split(/\r?\n/).length!==1)fail('swap_present');
 await mkdir(directory,{mode:0o700});
 const host=LOCAL_CUSTODY_DATABASE_HOST,user=`postgres.${RESET_PROJECT}`,escaped=password.replaceAll('\\','\\\\').replaceAll(':','\\:');
 const files={'database-ca.pem':ca,'database.pgpass':Buffer.from(`${host}:5432:postgres:${user}:${escaped}\n`)};
 const created=[];
 try{for(const [name,bytes]of Object.entries(files)){let f;try{f=await open(`${directory}/${name}`,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);created.push(name);
  await f.writeFile(bytes);await f.sync();const s=await f.stat();if(s.uid!==process.getuid()||(s.mode&0o777)!==0o600||s.nlink!==1)fail('private_file_invalid');
 }finally{await f?.close();bytes.fill(0);}}}catch(error){for(const name of created)await unlink(`${directory}/${name}`);await rmdir(directory);throw error;}
 return {connection:{expectedProjectRef:RESET_PROJECT,host,port:5432,database:'postgres',user,psqlPath,
  sslRootCertPath:`${directory}/database-ca.pem`,passwordFilePath:`${directory}/database.pgpass`},
  cleanup:async()=>{for(const name of Object.keys(files))await unlink(`${directory}/${name}`);await rmdir(directory);}};
}

export async function prefetchLocalCustodyPayload(){
 const env={...process.env};if(process.platform!=='linux'||Number(process.versions.node.split('.')[0])!==24||!['execute','reconcile'].includes(env.RESET_MODE))fail('runtime_invalid');
 const locator=assertLocalCustodyLocator({operationId:env.RESET_OPERATION_ID,action:env.RESET_ACTION,nonce:env.RESET_NONCE});
 await job(env,env.GH_TOKEN);
 if((await readFile('/proc/swaps','utf8')).trim().split(/\r?\n/).length!==1)fail('swap_present');
 const url=assertLocalCustodySignedUrl(env.PILOT_RESET_HANDOFF_SIGNED_URL,locator);
 if(!/^[A-Za-z0-9+/]{43}=$/.test(env.PILOT_RESET_HANDOFF_KEY??''))fail('key_invalid');
 const key=Buffer.from(env.PILOT_RESET_HANDOFF_KEY,'base64');let cipher,created=false;
 try{
  const until=Date.now()+20*60*1000;let doc;
  while(Date.now()<until){
   const waitingCipher=await boundedGet(freshStorageReadUrl(url),{},STAGED_TICKET_LIMIT);
   try{doc=decryptLocalCustodyTransfer(waitingCipher,key,locator);}finally{waitingCipher.fill(0);}
   if(exact(doc,['format','operationId','action','nonce'])&&doc.format==='nestory-local-custody-waiting-v1'&&same({...locator,format:doc.format},doc)){
    await new Promise(r=>setTimeout(r,5000));continue;
   }
   break;
  }
  const ref=doc?.format==='nestory-local-custody-staged-ticket-v1'?assertStagedPayloadReference(doc.staged,locator):assertStagedWaiting(doc,locator);
  cipher=await boundedGet(freshStorageReadUrl(ref.signedUrl),{},limit);
  decryptStagedPayload(cipher,key,locator,ref); // Verify authentication and full payload digest before reporting readiness.
  await writeStagedPayloadCache(env,cipher,ref,locator);
  created=true;
  const readback=await readStagedPayloadCache(env,ref,locator);readback.fill(0);
  return {format:'nestory-local-staged-prefetch-v1',ciphertextSha256:ref.cipherSha256,bytes:ref.bytes,verified:true};
 }catch(error){if(created)await removeStagedPayloadCache(env);throw error;}finally{key.fill(0);cipher?.fill(0);}
}
export async function runLocalCustodyWorker(){
 // Fixed reset-stage admission precedes credentials, reads, transient files or polling.
 const mode=process.env.RESET_MODE??'execute';
 if(['execute','reconcile'].includes(mode))assertLocalCustodyResetAction(process.env.RESET_ACTION);
 else if(!['capability-probe','tls-probe','provision-handoff'].includes(mode))fail('mode_invalid');
 if(process.platform!=='linux'||Number(process.versions.node.split('.')[0])!==24)fail('runtime_invalid');
 if(mode==='provision-handoff'){
  const env={...process.env};delete process.env.SUPABASE_ACCESS_TOKEN;if(!env.GH_TOKEN)fail('origin_invalid');
  const invocation=await job(env,env.GH_TOKEN);return provisionLocalCustodyBucket(env,invocation);
 }
 if(['capability-probe','tls-probe'].includes(mode)){
  const env={...process.env};if(!env.GH_TOKEN)fail('origin_invalid');
  const invocation=await job(env,env.GH_TOKEN),psqlPath='/usr/lib/postgresql/16/bin/psql';
  let psqlSha256=null;try{const s=await lstat(psqlPath);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o022)!==0||await realpath(psqlPath)!==psqlPath||s.size>16*1024*1024)fail('binary_invalid');psqlSha256=hashBytes(await readFile(psqlPath));}catch{if(mode==='tls-probe')fail('binary_unavailable');}
  if(hashBytes(await readFile(path.join(root,caSource)))!==LOCAL_CUSTODY_CA_SHA256)fail('ca_changed');
  if(mode==='capability-probe')return {format:'nestory-local-custody-capability-probe-v1',...invocation,githubProtectionReadsVerified:true,
   psqlAvailable:psqlSha256!==null,psqlSha256,caSha256:LOCAL_CUSTODY_CA_SHA256,databaseConnectionAttempted:false,customerDataRead:false,mutationAttempted:false};
  let db;try{db=await privateConnection(env);env.SUPABASE_DB_PASSWORD=undefined;delete process.env.SUPABASE_DB_PASSWORD;
   if((await localCustodyPsql(db.connection,guardedSql('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT 1;\nCOMMIT;',false))).trim()!=='1')fail('database_connection_unverified');
   return {format:'nestory-local-custody-tls-probe-v1',...invocation,psqlSha256,caSha256:LOCAL_CUSTODY_CA_SHA256,
    fixedSessionPoolerTlsVerifyFull:true,databaseIdentityVerified:true,customerDataRead:false,mutationAttempted:false};
  }finally{if(db)await db.cleanup();}
 }
 const env={...process.env},locator=assertLocalCustodyLocator({operationId:env.RESET_OPERATION_ID,action:env.RESET_ACTION,nonce:env.RESET_NONCE});
 if(env.GITHUB_RUN_ATTEMPT!=='1'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_REPOSITORY!==LOCAL_DISPATCH_REPOSITORY||!env.GH_TOKEN)fail('origin_invalid');
 const url=assertLocalCustodySignedUrl(env.PILOT_RESET_HANDOFF_SIGNED_URL,locator);
 if(!/^[A-Za-z0-9+/]{43}=$/.test(env.PILOT_RESET_HANDOFF_KEY??''))fail('key_invalid');
 const key=Buffer.from(env.PILOT_RESET_HANDOFF_KEY,'base64');if(key.toString('base64')!==env.PILOT_RESET_HANDOFF_KEY)fail('key_invalid');
 for(const name of ['PILOT_RESET_HANDOFF_KEY','PILOT_RESET_HANDOFF_SIGNED_URL','SUPABASE_DB_PASSWORD'])delete process.env[name];
 let privateDb,verified,stagedCipher,stagedReference;
 try{
  const first=await job(env,env.GH_TOKEN);
  let original=first;
  if(mode==='reconcile'){
   if(!/^[1-9][0-9]{0,19}$/.test(env.RESET_ORIGINAL_RUN_ID??'')||env.RESET_ORIGINAL_RUN_ID===first.runId)fail('original_run_invalid');
   const run=await github(`actions/runs/${env.RESET_ORIGINAL_RUN_ID}`,env.GH_TOKEN);
   if(String(run.id)!==env.RESET_ORIGINAL_RUN_ID||run.run_attempt!==1||run.path!==LOCAL_DISPATCH_WORKFLOW||run.repository?.full_name!==LOCAL_DISPATCH_REPOSITORY||
      run.head_sha!==first.mainSha||run.head_branch!=='main'||run.event!=='workflow_dispatch'||!['completed','in_progress','waiting','queued'].includes(run.status))fail('original_run_invalid');
   original={...first,runId:env.RESET_ORIGINAL_RUN_ID};
  }
  const until=Date.now()+20*60*1000;
  while(Date.now()<until){
   const cipher=await boundedGet(freshStorageReadUrl(url),{},limit);let doc;try{doc=decryptLocalCustodyTransfer(cipher,key,locator);}finally{cipher.fill(0);}
   if(doc?.format==='nestory-local-custody-waiting-v2'){
    const ref=assertStagedWaiting(doc,locator);
    if(stagedReference&&!same(stagedReference,ref))fail('staged_payload_changed');
    if(!stagedCipher){stagedCipher=await readStagedPayloadCache(env,ref,locator);decryptStagedPayload(stagedCipher,key,locator,ref);stagedReference=ref;}
    await new Promise(r=>setTimeout(r,5000));continue;
   }
   if(exact(doc,['format','operationId','action','nonce'])&&doc.format==='nestory-local-custody-waiting-v1'&&
      doc.operationId===locator.operationId&&doc.action===locator.action&&doc.nonce===locator.nonce){await new Promise(r=>setTimeout(r,5000));continue;}
   if(doc?.format==='nestory-local-custody-staged-ticket-v1'){
    if(stagedReference&&!same(stagedReference,doc.staged))fail('staged_payload_changed');
    stagedCipher??=await readStagedPayloadCache(env,assertStagedPayloadReference(doc.staged,locator),locator);
    doc=hydrateStagedDispatchTicket(doc,stagedCipher,key,locator);
   }
   verified=await(mode==='reconcile'?verifyHistoricalDispatchBundle:verifySignedDispatchBundle)({bundle:doc,publicKeyArmored:env.PILOT_RESET_SIGNING_PUBLIC_KEY,
    expectedPublicKeySha256:env.PILOT_RESET_SIGNING_PUBLIC_KEY_SHA256,invocation:{...original,...locator}});break;
  }
  if(!verified)fail('ticket_missing');
  const {ticket,payload}=verified,compatibility=payload.repair?await verifyLocalDispatchCompatibility({packet:payload.packet,executorMainSha:first.mainSha}):null;
  const sql=verifyLocalCustodyPayload({...verified,compatibility}),files=compatibility?readLocalDispatchCompatibleSources(compatibility):await verifyHostedPacketSources(payload.packet);
  privateDb=await privateConnection(env);env.SUPABASE_DB_PASSWORD=undefined;
  const connectionProbe=guardedSql('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT 1;\nCOMMIT;');
  if((await localCustodyPsql(privateDb.connection,connectionProbe)).trim()!=='1')fail('database_connection_unverified');
  async function observe(){let o;try{o=JSON.parse((await localCustodyPsql(privateDb.connection,guardedSql(observationSql(payload.packet,payload.binding,ticket.authorizationId,ticket.action)))).trim());}catch{fail('observation_failed');}
   assertHostedObservation(payload.packet,o,files);return o;}
  if(mode==='reconcile'){
   const observation=await readLocalCustodyAfterRefresh({expected:first,refresh:()=>job(env,env.GH_TOKEN),read:observe});
   return {...reconcileLocalCustodyObservation({...verified,observation}),reconciledByRunId:first.runId,historicalReadOnly:true};
  }
  const before=await observe();assertHostedPrecondition(ticket.action,payload.packet,payload.binding,payload.artifacts,payload.recovery,before);
  if(payload.repair&&ticket.action==='prepare')assertPrepareRepairOriginalRun(await github(`actions/runs/${payload.repair.originalAttempt.runId}`,env.GH_TOKEN),payload.repair);
  if(before.authorization?.status!=='pending'||before.authorization.bindingMatches!==true||before.authorization.authorizationId!==ticket.authorizationId||
   before.authorization.actorId!==payload.binding.continuation_semantic.actor_id||!Number.isFinite(Date.parse(before.authorization.expiresAt))||Date.parse(before.authorization.expiresAt)<=Date.now())fail('authorization_invalid');
  if(compatibility)await assertLocalDispatchCompatibilityCurrent(compatibility,payload.packet);else await verifyHostedPacketSources(payload.packet);
  const current=await job(env,env.GH_TOKEN);
  if(!same(first,current)||Date.now()>=Date.parse(ticket.expiresAt)||
   localCustodyMutationSql({binding:payload.binding,action:ticket.action,authorizationId:ticket.authorizationId,authoritySha256:ticket.authoritySha256,
    observation:before,artifacts:payload.artifacts,recovery:payload.recovery,repair:payload.repair})!==sql)fail('preflight_changed');
  assertLocalCustodyResetScope({action:ticket.action,binding:payload.binding,artifacts:payload.artifacts,recovery:payload.recovery});
  // Exactly one write call. A lost/failed reply goes only to read-only reconcile.
  return await createLocalCustodySingleAttempt({write:()=>localCustodyPsql(privateDb.connection,sql,ticket.action,payload.artifacts.continuationPlan.version),readback:observe,
   reconcile:observation=>reconcileLocalCustodyObservation({...verified,observation})})();
 }finally{key.fill(0);stagedCipher?.fill(0);try{if(privateDb)await privateDb.cleanup();}finally{await removeStagedPayloadCache(env);}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length>3||process.argv[2]&&!['--prefetch','--cleanup-prefetch'].includes(process.argv[2]))fail('mode_invalid');
  let result;
  if(process.argv[2]==='--cleanup-prefetch'){await removeStagedPayloadCache(process.env);result={status:'owned-staged-ciphertext-absent'};}
  else result=process.argv[2]==='--prefetch'?await prefetchLocalCustodyPayload():await runLocalCustodyWorker();
  console.log(JSON.stringify(result));
 }
 catch(error){console.error(JSON.stringify({status:'stopped',code:localCustodyFailureCode(error),automaticRetryAllowed:false}));process.exitCode=1;}
}
