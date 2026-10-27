// Fixed local RAM restore. No hosted connection, caller SQL/path/endpoint,
// plaintext file, credential environment, or customer source mutation.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { RAM_POSTGRES_IMAGE } from './local-backup-restore.mjs';
import { backupHash,readPrivateBackupFile,writePrivateBackupFile,decryptLocalBackup,decryptLocalBackupChunks,encryptLocalBackup,loadRecoveryPublicKey } from './local-backup-crypto.mjs';
import { verifyCaptureChunk,verifyCaptureCompleteness,LOCAL_CAPTURE_POLICY } from './local-backup-capture.mjs';
import { validateBusinessSnapshot,verifyBusinessMigrationReplay,buildSelectedBusinessRestoreSql } from './local-backup-business-restore.mjs';
import { catalogExpression } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { canonicalMigrationHash,hashGitMigrationBody,reconstructLocalMigrationDescriptors } from './hosted-migration-parity-core.mjs';
import { schemaDiagnosticSql,schemaCensusSql } from './ips-readiness-recovery-core.mjs';
import {buildBusinessSchemaPermissionCorrection,buildBusinessSchemaStructuralCorrection,classifyBusinessSchemaCorrection} from './local-backup-business-schema-restore.mjs';
import {readBusinessSchemaSource,assertBusinessSchemaArchiveReference} from './local-backup-business-schema-source.mjs';
import {createPilotRamRehearsalPlanner} from './local-backup-ram-rehearsal-plan.mjs';
import {buildPilotRehearsalBinding,bindPilotRehearsalSemantics} from './local-backup-packet-bridge.mjs';
import * as rehearsalSql from './local-backup-business-rehearsal-sql.mjs';
import {sqlDoBlock} from './pilot-finance-reset-executor-local.mjs';

const root=path.resolve(import.meta.dirname,'..'),self=fileURLToPath(import.meta.url);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const memory=2147483648,tmpfs='rw,nosuid,nodev,noexec,size=1536m,uid=100,gid=101,mode=0700';
const literal=s=>`'${s.replaceAll("'","''")}'`;
const fail=code=>{throw Error(`local_business_runtime_${code}`)};
const exact=(o,k)=>o&&JSON.stringify(Object.keys(o).sort())===JSON.stringify([...k].sort());
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let diagnosticStage='request';
let diagnosticResetExecution=null,diagnosticResetVerificationComplete=false;
const childEnvironment=()=>({SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',SystemDrive:'C:',ComSpec:'C:\\Windows\\System32\\cmd.exe',PATHEXT:'.COM;.EXE;.BAT;.CMD',PATH:'C:\\Windows\\System32;C:\\Program Files\\Docker\\Docker\\resources\\bin',
 USERPROFILE:'C:\\Users\\USer',APPDATA:'C:\\Users\\USer\\AppData\\Roaming',LOCALAPPDATA:'C:\\Users\\USer\\AppData\\Local',
 TEMP:'C:\\Users\\USer\\AppData\\Local\\Temp',TMP:'C:\\Users\\USer\\AppData\\Local\\Temp'});
const sources=['local-backup-business-runtime.mjs','local-backup-business-spill.ps1','local-backup-business-vendor-manifest.json',
 'local-backup-business-restore.mjs','local-backup-capture.mjs','local-backup-crypto.mjs','local-backup-windows.ps1','local-recovery-docker.mjs',
 'local-backup-restore.mjs','hosted-migration-parity-core.mjs','pilot-finance-reset-hosted-transport-protocol.mjs','ips-readiness-recovery-core.mjs'];
const sourcePins=async()=>{
 const pins=new Map();
 const visit=async relative=>{if(pins.has(relative))return;const absolute=path.resolve(root,relative);
  if(!absolute.startsWith(root+path.sep))fail('source_path_invalid');const content=(await readFile(absolute,'utf8')).replaceAll('\r\n','\n');pins.set(relative,backupHash(content));
  if(relative.endsWith('.mjs'))for(const match of content.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)){
   const target=path.resolve(path.dirname(absolute),match[1]);await visit(path.relative(root,target).replaceAll('\\','/'));
  }
 };
 for(const name of sources)await visit(`scripts/${name}`);
 for(const name of ['package.json','package-lock.json','supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json',
  'supabase/migrations/20261027005615_financial_reset_empty_books_preserved_contracts.sql'])await visit(name);
 return Object.fromEntries([...pins].sort(([a],[b])=>a.localeCompare(b)));
};
// Read-only producer closure for independent saved-proof verification.
export const readBusinessRuntimeSourcePins=sourcePins;
export function assertBusinessRestoreRequest(r){
 if(!exact(r,['keyId','archiveId','archiveSha256','sourceSha256'])&&!exact(r,['keyId','archiveId','archiveSha256','sourceSha256','schemaArchive'])||!uuid.test(r?.keyId)||!uuid.test(r?.archiveId)||![r?.archiveSha256,r?.sourceSha256].every(x=>digest.test(x)))fail('request_invalid');
 if(Object.hasOwn(r,'schemaArchive')){try{assertBusinessSchemaArchiveReference(r.schemaArchive)}catch{fail('request_invalid')}if(r.schemaArchive.keyId!==r.keyId)fail('request_invalid')}return r;
}
export function assertBusinessChildRequest(value,parentPid=process.ppid){
 if(!exact(value,['request','binding','parentPid'])||value.parentPid!==parentPid||!Number.isSafeInteger(parentPid)||parentPid<1||
  !exact(value.binding,['runId','id'])||!uuid.test(value.binding.runId)||!digest.test(value.binding.id))fail('child_request_invalid');
 assertBusinessRestoreRequest(value.request);return value;
}
export function verifyBusinessVendorBundle(bytes,manifest){
 const reference=manifest?.recoveryBundle;
 if(!exact(reference,['keyId','archiveId','ciphertextSha256','plaintextSha256','plaintextBytes'])||!uuid.test(reference.keyId)||!uuid.test(reference.archiveId)||
  ![reference.ciphertextSha256,reference.plaintextSha256].every(v=>digest.test(v))||!Number.isSafeInteger(reference.plaintextBytes)||
  reference.plaintextBytes<1||reference.plaintextBytes>1048576||!(bytes instanceof Uint8Array)||bytes.length!==reference.plaintextBytes||backupHash(bytes)!==reference.plaintextSha256)fail('vendor_bundle_changed');
 const p=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes)),{recoveryBundle,...core}=manifest;
 if(!exact(p,['format','manifest','vendorSources'])||p.format!=='nestory-local-business-vendor-bundle-v1'||!same(p.manifest,core)||
  !Array.isArray(p.vendorSources)||p.vendorSources.length!==130||!Array.isArray(manifest.vendors)||manifest.vendors.length!==130)fail('vendor_bundle_invalid');
 const sources=new Map();
 for(const source of p.vendorSources){
  if(!exact(source,['group','name','sql'])||typeof source.sql!=='string'||sources.has(`${source.group}/${source.name}`))fail('vendor_bundle_invalid');
  const expected=manifest.vendors.find(x=>x.group===source.group&&x.name===source.name);
  if(!expected||backupHash(source.sql)!==expected.sha256)fail('vendor_source_changed');sources.set(`${source.group}/${source.name}`,source.sql);
 }
 if(new Set(manifest.vendors.map(x=>`${x.group}/${x.name}`)).size!==130)fail('vendor_roster_invalid');return sources;
}
async function readVendorSources(manifest){
 const r=manifest?.recoveryBundle;if(!r||!uuid.test(r.keyId)||!uuid.test(r.archiveId)||!digest.test(r.ciphertextSha256))fail('vendor_bundle_invalid');
 const encrypted=await readPrivateBackupFile(r.archiveId,'archive.pgp');if(backupHash(encrypted)!==r.ciphertextSha256)fail('vendor_bundle_changed');
 const bytes=await decryptLocalBackup(r.keyId,encrypted);
 try{return verifyBusinessVendorBundle(bytes,manifest)}finally{bytes.fill(0);encrypted.fill(0)}
}
export function assertBusinessRamContainer(b,c,running=true){
 const h=c?.HostConfig;
 if(!exact(b,['runId','id'])||!uuid.test(b.runId)||!digest.test(b.id)||c?.Id!==b.id||c.Image!==RAM_POSTGRES_IMAGE||
  c.Name!==`/nestory-business-restore-${b.runId}`||c.Config?.Labels?.['nestory.business-restore.run']!==b.runId||
  c.Config?.User!=='100:101'||c.State?.Running!==running||!h||h.ReadonlyRootfs!==true||h.NetworkMode!=='none'||h.Privileged!==false||
  h.LogConfig?.Type!=='none'||h.Memory!==memory||h.MemorySwap!==memory||h.PidsLimit!==128||h.IpcMode!=='private'||h.ShmSize!==67108864||
  !same(h.CapDrop,['ALL'])||(h.CapAdd?.length??0)!==0||!h.SecurityOpt?.some(v=>['no-new-privileges','no-new-privileges:true'].includes(v))||
  !h.Ulimits?.some(v=>v.Name==='core'&&v.Hard===0&&v.Soft===0)||!exact(h.Tmpfs,['/db'])||h.Tmpfs['/db']!==tmpfs||
  (h.Binds?.length??0)!==0||(h.VolumesFrom?.length??0)!==0||(h.Devices?.length??0)!==0||Object.keys(h.PortBindings??{}).length||
  !Array.isArray(c.Mounts)||c.Mounts.some(m=>m.Type!=='tmpfs'||m.Destination!=='/db')||
  Object.keys(c.NetworkSettings?.Networks??{}).some(n=>n!=='none')||Object.keys(c.Config?.Volumes??{}).length)fail('container_custody_changed');
 return true;
}
export function assertBusinessSpillObservation(o,now=Date.now()){
 if(!exact(o,['format','observedAtUtc','configSha256','restartProofSha256','wslSwapEntries','privateCrashDirectoryVerified','ancestorHandlesPinned'])||
  o.format!=='nestory-local-business-spill-observation-v1'||o.configSha256!=='d3d609da96b511d8d553315005bc47ee2be8db5c3d4b624f3790e14cafe19697'||
  o.restartProofSha256!=='edb1906efe7e67f8ce272012f820cbbb1f8ab495ef77ca809a14765482c4e0e9'||
  !Number.isFinite(Date.parse(o.observedAtUtc))||now-Date.parse(o.observedAtUtc)>30000||now<Date.parse(o.observedAtUtc)-1000||
  o.wslSwapEntries!==0||o.privateCrashDirectoryVerified!==true||o.ancestorHandlesPinned!==true)fail('spill_unverified');return o;
}
// stderr is always drained and discarded. Never include native error details,
// SQL or rows in public errors. All data enters children through stdin pipes.
const validationCodes=new Set(['migration_content_unproven','migration_inputs_invalid','migration_source_invalid','migration_ledger_invalid','migration_ledger_order_invalid',
 'reconciliation_manifest_invalid','payload_scope_invalid','payload_digest_invalid','payload_invalid','restore_metadata_invalid','table_coverage_invalid','excluded_rows_present',
 'row_count_invalid','row_digest_invalid','row_json_invalid','row_scope_invalid','duplicate_row','storage_metadata_invalid','storage_bucket_invalid',
 'storage_reference_invalid','storage_reference_source_mismatch','storage_reference_unrestorable','storage_scope_invalid']);
const safeRuntimeCode=/^local_business_runtime_(?:request|spill|decrypt|snapshot-validation|migration-proof|runtime-create|bootstrap-initial|bootstrap-image-(?:init-scripts|migrations)|bootstrap-vendor-batch-\d+|bootstrap-repository-batch-\d+|bootstrap-ledger|bootstrap-scaffold|schema|restore|restore-statistics|rehearsal-(?:migration|preview|materialize|fixture|prepare|execute|sources|inverse-plan|inverse-execute|verify|save))_failed\n$/;
const safeFailure=text=>safeRuntimeCode.test(text)||/^local_business_runtime_validation_[a-z_]+_failed\n$/.test(text)&&validationCodes.has(text.slice('local_business_runtime_validation_'.length,-'_failed\n'.length));
const preparationDatabaseCodes=new Set(['operation_id_reused','restore_binding_invalid','archive_scope_invalid','archive_not_preparable','archive_image_invalid',
 'original_row_text_required','action_scope_invalid','action_not_preparable','action_archive_required','action_before_invalid','action_after_invalid',
 'delete_not_allowed','normalization_not_allowed','restore_image_invalid','canonical_action_text_required','zero_scope_empty','zero_plan_binding_invalid',
 'zero_plan_initial_status','zero_review_scope_invalid','zero_plan_id_reused','empty_review_invalid','empty_lease_invalid',
 'primary_key_required','relation_not_allowed','full_typed_row_required','evidence_immutable','initial_binding_invalid'].map(v=>`financial_reset_${v}`));
for(const section of ['operation','archive','actions','zero_scope','continuation','zero_plan','readback'])
 preparationDatabaseCodes.add(`local_ram_rehearsal_prepare_${section}_failed`);
for(const section of ['endorsement','seal','authorize','native_start','native_arm','native_action','native_complete','known_zero','continuation','reports','readback_checks'])
 preparationDatabaseCodes.add(`local_ram_rehearsal_execute_${section}_failed`);
const inverseDiagnosticSections=['prepare_operation','prepare_sources','prepare_actions','seal','authorize','native_start','native_arm','native_action','native_complete','finalize','commit_checks'];
for(const section of inverseDiagnosticSections)
 preparationDatabaseCodes.add(`local_ram_rehearsal_inverse_${section}_failed`);
export function safeBusinessInverseCause(value){
 return exact(value,['phase','cause'])&&inverseDiagnosticSections.includes(value.phase)&&rehearsalSql.RAM_INVERSE_NATIVE_CAUSES.includes(value.cause)?
  {phase:value.phase,cause:value.cause}:null;
}
export function parseBusinessDatabaseFailure(stderr){
 if(typeof stderr!=='string')return{};
 const line=/(?:^|\n)(?:psql:<stdin>:\d+:\s*)?(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?::\s*([^\r\n]*))?(?:\r?\n|$)/.exec(stderr.slice(0,2048));
 if(!line)return{};
 return {sqlState:line[1],...(preparationDatabaseCodes.has(line[2])?{databaseCode:line[2]}:{})};
}
// Retain only fixed diagnostic names and bounded numeric timing observations.
// Native query/context lines are discarded, including oversized lines.
export function createBusinessDatabaseDiagnostics(){
 let line='',dropping=false,failure={},phaseTimings=[],inverseCause=null;
 const consume=()=>{
  if(!dropping){
   const error=parseBusinessDatabaseFailure(line+'\n');if(error.sqlState&&!failure.sqlState)failure=error;
   const match=/^(?:psql:<stdin>:\d+:\s*)?NOTICE:\s+(?:00000:\s*)?local_ram_rehearsal_phase:(known_zero|continuation|reports):(success|failure):(0|[1-9][0-9]{0,5})\r?$/.exec(line);
   if(match&&Number(match[3])<=600000&&phaseTimings.length<3&&!phaseTimings.some(p=>p.phase===match[1]))
    phaseTimings.push({phase:match[1],outcome:match[2],elapsedMilliseconds:Number(match[3])});
   const cause=/^(?:psql:<stdin>:\d+:\s*)?NOTICE:\s+(?:00000:\s*)?local_ram_rehearsal_inverse_cause:([a-z_]+):([a-z_]+)\r?$/.exec(line);
   if(cause&&!inverseCause)inverseCause=safeBusinessInverseCause({phase:cause[1],cause:cause[2]});
  }
  line='';dropping=false;
 };
 return{push(chunk){for(const character of String(chunk)){if(character==='\n')consume();else if(!dropping){if(line.length>=2048){line='';dropping=true}else line+=character}}},
  finish(){if(line||dropping)consume();return{...failure,phaseTimings:phaseTimings.map(p=>({...p})),...(inverseCause?{inverseCause:{...inverseCause}}:{})}}};
}
export function safeBusinessRehearsalFailureCode(message){
 if(typeof message!=='string')return null;
 return /^(?:pilot_ram_plan|local_ram_rehearsal)_[a-z_]+$/.test(message)||
  ['local_business_runtime_rehearsal_execution_invalid','local_business_runtime_rehearsal_verification_invalid'].includes(message)?message:null;
}
async function execute(file,args,input,options={}){
 return new Promise((resolve,reject)=>{
  const binary=file==='docker'?'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe':file;
  const c=spawn(binary,args,{shell:false,windowsHide:true,env:childEnvironment(),stdio:['pipe','pipe','pipe']});
  let size=0,bad=false,timedOut=false,safeError='';const diagnostics=createBusinessDatabaseDiagnostics(),chunks=[];const stop=()=>{bad=true;c.kill()};const timer=setTimeout(()=>{timedOut=true;stop()},options.timeoutMs??180000);
  c.stdout.on('data',b=>{size+=b.length;if(size>(options.maxBytes??64*1024*1024))stop();else chunks.push(b)});
  c.stderr.on('data',b=>{if(options.safeRuntimeErrors&&safeError.length<256)safeError+=b.toString('utf8');if(file==='docker')diagnostics.push(b.toString('utf8'))});c.stdin.on('error',stop);c.on('error',stop);
  c.on('close',code=>{clearTimeout(timer);const observed=diagnostics.finish();if(bad||code!==0){for(const b of chunks)b.fill(0);const error=Error(safeFailure(safeError)?safeError.trim():'local_business_runtime_process_failed');
   Object.assign(error,observed,{processTimedOut:timedOut});reject(error)}
   else{const out=Buffer.concat(chunks);out.businessDiagnostics=observed;for(const b of chunks)b.fill(0);resolve(options.withPid?{bytes:out,pid:c.pid}:out)}});c.stdin.end(input??'');
 });
}
async function withEncryptionEvidence(o){
 assertBusinessSpillObservation(o);
 const proofBytes=(await readFile(path.join(root,'.codex-artifacts/encryption-check/bitlocker-status.json'),'utf8')).replaceAll('\r\n','\n');
 if(backupHash(proofBytes)!=='8b7a3629aa2f1efd07a5cdaccb3e3c0fd311f6e635c9bb1e9bb81287f462fa23')fail('encryption_evidence_changed');
 const p=JSON.parse(proofBytes),drive=p.Volumes?.find(x=>x.MountPoint==='C:');
 if(p.ElevatedAdministrator!==true||p.Status!=='observed'||drive?.EncryptionPercentage!==100||drive.ProtectionStatus!=='On')fail('encryption_evidence_invalid');
 return {...o,bitLockerEvidenceSha256:backupHash(proofBytes),bitLockerObservedAtUtc:p.ObservedAtUtc,bitLockerEvidenceKind:'prior-administrator-observation-not-live-automated'};
}
async function spill(){
 if(process.platform!=='win32')fail('windows_required');
 const o=JSON.parse(await execute('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ['-NoProfile','-NonInteractive','-File',path.join(import.meta.dirname,'local-backup-business-spill.ps1')],undefined,{maxBytes:8192,timeoutMs:30000}));
 return withEncryptionEvidence(o);
}
async function holdSpillCustody(){
 if(process.platform!=='win32')fail('windows_required');
 const c=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(import.meta.dirname,'local-backup-business-spill.ps1'),'-Hold'],
  {shell:false,windowsHide:true,env:childEnvironment(),stdio:['pipe','pipe','pipe']});
 const lines=createInterface({input:c.stdout,crlfDelay:Infinity}),queue=[];let failed=false,waiter=null,closed=false;
 const breakLease=()=>{failed=true;if(waiter){waiter.reject(Error('local_business_runtime_spill_lease_lost'));waiter=null}c.kill()};
 lines.on('line',line=>{if(line.length>8192)return breakLease();if(waiter){const w=waiter;waiter=null;w.resolve(line)}else if(queue.length===0)queue.push(line);else breakLease()});
 c.stderr.on('data',()=>{});c.stdin.on('error',breakLease);c.on('error',breakLease);c.on('close',()=>{closed=true;if(waiter)breakLease()});
 const receive=async()=>{if(failed||closed)fail('spill_lease_lost');let line;if(queue.length)line=queue.shift();else line=await new Promise((resolve,reject)=>{const timer=setTimeout(breakLease,30000);waiter={resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}}});return withEncryptionEvidence(JSON.parse(line));};
 try{const initial=await receive();return {initial,check:async()=>{if(failed||closed)fail('spill_lease_lost');c.stdin.write('check\n');return receive()},close:async()=>{if(!closed){c.stdin.end('close\n');await new Promise(resolve=>{c.once('close',resolve);setTimeout(()=>{c.kill();resolve()},3000).unref()})}lines.close()}}}
 catch(e){c.kill();lines.close();throw e}
}
// The same held host-custody lease is shared by private archive consumers.
// Callers must acquire it before decryption and close it only after disposal.
export const holdBusinessSpillCustody=holdSpillCustody;
export function businessSqlTimeoutMs(action='default'){
 if(!['default','execute'].includes(action))fail('process_budget_invalid');
 return action==='execute'?600000:180000;
}
async function createRuntime(existingBinding){
 const local=await localRecoveryDocker({execute:async(...a)=>(await execute(...a)).toString('utf8')});
 const docker=(a,input,options)=>execute('docker',['--host',local.endpoint,...a],input,options);
 const image=JSON.parse(await docker(['image','inspect',RAM_POSTGRES_IMAGE]));
 if(image.length!==1||image[0].Id!==RAM_POSTGRES_IMAGE||Object.keys(image[0].Config?.Volumes??{}).length)fail('image_changed');
 const runId=existingBinding?.runId??randomUUID();
 if(existingBinding&&(!exact(existingBinding,['runId','id'])||!uuid.test(runId)||!digest.test(existingBinding.id)))fail('binding_invalid');
 const start='set -eu; initdb -D /db/pg -U supabase_admin --no-locale --encoding=UTF8 --auth-local=trust --auth-host=reject >/dev/null; exec postgres -D /db/pg -c listen_addresses= -c unix_socket_directories=/db -c logging_collector=off -c shared_buffers=64MB -c max_connections=32 -c wal_level=logical -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic -c shared_preload_libraries=pg_cron,pg_net -c cron.launch_active_jobs=off';
 const id=existingBinding?.id??(await docker(['run','-d','--name',`nestory-business-restore-${runId}`,'--label',`nestory.business-restore.run=${runId}`,
  '--network','none','--read-only','--log-driver','none','--user','100:101','--memory',String(memory),'--memory-swap',String(memory),
  '--pids-limit','128','--ipc','private','--shm-size','64m','--ulimit','core=0','--security-opt','no-new-privileges','--cap-drop','ALL',
  '--tmpfs',`/db:${tmpfs}`,'--entrypoint','/bin/sh',RAM_POSTGRES_IMAGE,'-c',start])).toString('utf8').trim();
 const binding={runId,id};
 const inspect=async()=>{const rows=JSON.parse(await docker(['inspect',id]));if(rows.length!==1)fail('runtime_unavailable');assertBusinessRamContainer(binding,rows[0]);};
 const exec=async(args,input,options)=>{await inspect();const out=await docker(['exec','-i',id,...args],input,options);try{await inspect();return out}catch(e){out.fill(0);throw e}};
 let phaseTimings=[];
 const sql=async(input,user='postgres',action='default')=>{const out=await exec(['psql','-X','-qAt','-h','/db','-U',user,'-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input,{timeoutMs:businessSqlTimeoutMs(action)});
  if(action==='execute')phaseTimings=out.businessDiagnostics.phaseTimings;
  try{return out.toString('utf8').trim()}finally{out.fill(0)}};
 const remove=async()=>{const rows=JSON.parse(await docker(['inspect',id]));if(rows.length!==1)fail('cleanup_unconfirmed');assertBusinessRamContainer(binding,rows[0],rows[0].State?.Running===true);await docker(['rm','-f',id]);if((await docker(['ps','-aq','--no-trunc','--filter',`id=${id}`])).toString('utf8').trim())fail('cleanup_unconfirmed')};
 const exists=async()=>{const ids=(await docker(['ps','-aq','--no-trunc','--filter',`id=${id}`])).toString('utf8').trim();if(ids&&ids!==id)fail('cleanup_identity_changed');return Boolean(ids)};
 const cleanup=async()=>{if(await exists())await remove()};
 try{
  let ready=false;for(let i=0;i<50;i++){try{if(await sql('SELECT 1','supabase_admin')==='1'){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready)fail('startup_failed');
  if((await exec(['/bin/sh','-c','cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max'])).toString('utf8').trim()!==`${memory}\n0`)fail('container_swap_enabled');
  return {binding,exec,sql,remove,exists,cleanup,phaseTimings:()=>phaseTimings.map(p=>({...p}))};
 }catch(e){try{await remove()}catch{fail('failure_cleanup_unconfirmed')}throw e}
}
async function bootstrap(runtime,replay){
 const manifest=JSON.parse(await readFile(path.join(import.meta.dirname,'local-backup-business-vendor-manifest.json'),'utf8'));
 if(manifest.format!=='nestory-local-business-vendor-sources-v1'||manifest.image!==RAM_POSTGRES_IMAGE||manifest.imageReference!==`public.ecr.aws/supabase/postgres@${RAM_POSTGRES_IMAGE}`)fail('vendor_manifest_invalid');
 const storedVendorSources=await readVendorSources(manifest);
 diagnosticStage='bootstrap-initial';await runtime.sql('CREATE ROLE postgres SUPERUSER LOGIN; ALTER DATABASE postgres OWNER TO postgres;','supabase_admin');
 for(const item of manifest.imageSources){
  if(!/^\/docker-entrypoint-initdb\.d\/(init-scripts|migrations)\/[a-zA-Z0-9_-]+\.sql$/.test(item.name)||!digest.test(item.sha256))fail('vendor_path_invalid');
 }
 if(manifest.imageSources.length!==58||new Set(manifest.imageSources.map(x=>x.name)).size!==58)fail('vendor_roster_invalid');
 const imageHashes=(await runtime.exec(['sha256sum',...manifest.imageSources.map(x=>x.name)])).toString('utf8').trim().split('\n');
 if(imageHashes.length!==manifest.imageSources.length||imageHashes.some((line,i)=>line!==`${manifest.imageSources[i].sha256}  ${manifest.imageSources[i].name}`))fail('vendor_source_changed');
 for(const group of ['init-scripts','migrations']){
  diagnosticStage=`bootstrap-image-${group}`;
  const sql=(await runtime.exec(['cat',...manifest.imageSources.filter(x=>x.name.includes(`/${group}/`)).map(x=>x.name)])).toString('utf8');
  await runtime.sql(sql,group==='migrations'?'supabase_admin':'postgres');
 }
 await runtime.sql("ALTER ROLE postgres SUPERUSER; CREATE TABLE IF NOT EXISTS storage.migrations(id integer primary key,name varchar(100) not null,hash varchar(40) not null,executed_at timestamp default current_timestamp);",'supabase_admin');
 const vendors=[...manifest.vendors].sort((a,b)=>a.group.localeCompare(b.group)||(a.group==='storage-migrations/tenant'?parseInt(a.name)-parseInt(b.name):a.name.localeCompare(b.name)));
 const vendorSql=[];
 for(const [index,item] of vendors.entries()){
  diagnosticStage=`bootstrap-vendor-${index}`;
  if(!['auth-migrations','storage-migrations/tenant'].includes(item.group)||!/^\d[a-zA-Z0-9_.-]*\.sql$/.test(item.name))fail('vendor_path_invalid');
  const source=storedVendorSources.get(`${item.group}/${item.name}`);
  if(typeof source!=='string')fail('vendor_source_missing');
  if(backupHash(source)!==item.sha256)fail('vendor_source_changed');
  const isAuth=item.group==='auth-migrations',sql=isAuth?source.replace(/\{\{\s*index\s+\.Options\s+"Namespace"\s*\}\}/g,'auth'):source;
  vendorSql.push(`RESET ALL; RESET ROLE; RESET SESSION AUTHORIZATION; ${isAuth?'SET search_path=auth,public,extensions;':'SET search_path=storage,public,extensions; SET storage.install_roles=false;'}\n${sql}\n;`);
 }
 for(let i=0;i<vendorSql.length;i+=20){diagnosticStage=`bootstrap-vendor-batch-${i}`;await runtime.sql(vendorSql.slice(i,i+20).join('\n'),'supabase_admin');}
 for(let i=0;i<replay.sources.length;i+=20){diagnosticStage=`bootstrap-repository-batch-${i}`;await runtime.sql(replay.sources.slice(i,i+20).map(item=>`RESET ALL; RESET ROLE; RESET SESSION AUTHORIZATION; SET search_path=public,extensions;\n${item.sql}\n;`).join('\n'));}
 diagnosticStage='bootstrap-ledger';
 await runtime.sql('CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);\n'+replay.sources.map(s=>`INSERT INTO supabase_migrations.schema_migrations VALUES(${literal(s.name.slice(0,14))},${literal(s.name.slice(15,-4))},ARRAY[${literal(s.sql)}]);`).join('\n'));
 diagnosticStage='bootstrap-scaffold';
 // Only known empty bootstrap buckets exist. Remove that synthetic scaffold so
 // original captured bucket metadata can be restored exactly; never a source DB.
 await runtime.sql("BEGIN; DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.objects) OR EXISTS(SELECT 1 FROM public.organizations) THEN RAISE EXCEPTION 'destination_not_empty'; END IF; END $$; SET LOCAL storage.allow_delete_query=true; DELETE FROM storage.buckets; COMMIT;");
}
async function readRuntimeSchema(runtime){
 const start=schemaCensusSql.indexOf('WITH objects AS ('),end=schemaCensusSql.indexOf(") SELECT jsonb_build_object('kind',kind,'name',name,'sha256'");
 if(start<0||end<start)fail('schema_failed');
 return JSON.parse(await runtime.sql(`SET search_path=pg_catalog,public;${schemaCensusSql.slice(start,end+1)} SELECT jsonb_build_object('catalog',jsonb_agg(jsonb_build_object('kind',kind,'name',name,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind COLLATE "C",name COLLATE "C"),'definitions',jsonb_agg(jsonb_build_object('kind',kind,'name',name,'definition',definition,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind COLLATE "C",name COLLATE "C")) FROM objects;`));
}
async function correctPinnedBusinessSchema(runtime,expected,reference){
 const {payload:source,evidence}=await readBusinessSchemaSource(reference);
 // A newer business snapshot may reuse this package only if its entire source
 // catalog and original ledger descriptors remain identical. No caller waiver.
 if(!same(source.catalog,expected.catalog)||!same(source.ledger,expected.ledger))fail('schema_failed');
 const plan=buildBusinessSchemaStructuralCorrection({source,actual:await readRuntimeSchema(runtime)});
 await runtime.sql(plan.enumSql);await runtime.sql(plan.structuralSql);
 const permissions=buildBusinessSchemaPermissionCorrection({source,actual:await readRuntimeSchema(runtime)});
 await runtime.sql(permissions.sql);const actual=await readRuntimeSchema(runtime);
 if(!same(actual.catalog,source.catalog))fail('schema_failed');
 const catalogSha256=await runtime.sql(`SET search_path=pg_catalog,public; SELECT encode(extensions.digest(${catalogExpression}::text,'sha256'),'hex');`);
 if(catalogSha256!==evidence.schemaSha256)fail('schema_failed');
 return{format:'nestory-exact-local-schema-reconstruction-v1',sourceArchive:evidence,objectCount:actual.catalog.length,
  catalogSha256,replayedLedgerRowsPreserved:true,capturedDefinitionBytesPreserved:true};
}
const transitionName='20261027005615_financial_reset_empty_books_preserved_contracts.sql';
const inputReferenceKeys=['keyId','archiveId','archiveSha256','plaintextSha256','plaintextBytes'];
export function assertBusinessRehearsalInputReference(reference,keyId){
 if(!exact(reference,inputReferenceKeys)||reference.keyId!==keyId||!uuid.test(keyId)||!uuid.test(reference.archiveId)||
  !digest.test(reference.archiveSha256)||!digest.test(reference.plaintextSha256)||!Number.isSafeInteger(reference.plaintextBytes)||
  reference.plaintextBytes<1||reference.plaintextBytes>32*1024*1024)fail('rehearsal_input_invalid');return reference;
}
async function saveRehearsalInputs(keyId,value){
 const bytes=Buffer.from(JSON.stringify(value));let sealed;
 try{
  if(bytes.length>32*1024*1024)fail('rehearsal_input_limit');
  sealed=await encryptLocalBackup(keyId,bytes);const archiveId=randomUUID();await writePrivateBackupFile(archiveId,'archive.pgp',sealed);
  return assertBusinessRehearsalInputReference({keyId,archiveId,archiveSha256:backupHash(sealed),plaintextSha256:backupHash(bytes),plaintextBytes:bytes.length},keyId);
 }finally{bytes.fill(0);sealed?.fill(0)}
}
// These inputs are independently opened by the parent after the writing child
// exits. The saved hashes bind whole ciphertext/plaintext bytes; no caller
// supplied success flag or unencrypted row payload enters the producer.
async function verifySavedRehearsalInputs(reference,request,format,operationId){
 assertBusinessRehearsalInputReference(reference,request.keyId);let encrypted,bytes;
 try{
  encrypted=await readPrivateBackupFile(reference.archiveId,'archive.pgp');if(backupHash(encrypted)!==reference.archiveSha256)fail('rehearsal_input_changed');
  bytes=await decryptLocalBackup(request.keyId,encrypted);
  if(bytes.length!==reference.plaintextBytes||backupHash(bytes)!==reference.plaintextSha256)fail('rehearsal_input_changed');
  const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
  if(value.format!==format||value.operationId!==operationId||!same(value.businessArchive,request))fail('rehearsal_input_changed');
 }finally{encrypted?.fill(0);bytes?.fill(0)}
}
// Shape checks and projection keep private row/report bodies out of plaintext
// proof files. They are not standalone execution or custody attestations.
export function assertBusinessRehearsalVerification(value,phase,contractsSha256){
 const keys=['format','phase','canonicalRowsVerified','foreignKeysVerified','contractsUnchanged','frozen','generation','exactLifecycleDeltaVerified',
  'contractsSha256','tableCensus','checkpointSha256','syntheticActorCount','productionPermissionProven','productionForeignDataProven','excludedCredentialTablesRestored','storageRecoveryVerified'];
 if(!['reset','recovered'].includes(phase)||!exact(value,keys)||value.format!=='nestory-local-ram-rehearsal-verification-v1'||value.phase!==phase||
  value.generation!==(phase==='reset'?1:2)||value.frozen!==true||value.canonicalRowsVerified!==true||value.foreignKeysVerified!==true||
  value.contractsUnchanged!==true||value.exactLifecycleDeltaVerified!==true||!digest.test(contractsSha256)||value.contractsSha256!==contractsSha256||
  !digest.test(value.checkpointSha256)||value.syntheticActorCount!==2||value.productionPermissionProven!==false||value.productionForeignDataProven!==false||
  value.excludedCredentialTablesRestored!==false||value.storageRecoveryVerified!==false||!Array.isArray(value.tableCensus)||value.tableCensus.length!==LOCAL_CAPTURE_POLICY.length)fail('rehearsal_verification_invalid');
 const roster=new Set(LOCAL_CAPTURE_POLICY.map(r=>r.table));
 for(const row of value.tableCensus){
  if(!exact(row,['table_name','row_count','rows_sha256'])||!roster.delete(row.table_name)||!Number.isSafeInteger(row.row_count)||row.row_count<0||!digest.test(row.rows_sha256))fail('rehearsal_verification_invalid');
  if(LOCAL_CAPTURE_POLICY.find(r=>r.table===row.table_name).capture!=='full-row-image'&&row.row_count!==0)fail('rehearsal_verification_invalid');
 }
 if(roster.size)fail('rehearsal_verification_invalid');return value;
}
export function summarizeBusinessRehearsalExecution(value,phase,operationId){
 const generation=phase==='reset'?1:phase==='recovered'?2:0,kind=generation===1?'checked-reports':'phase-recovery';
 const operation=value?.operation,checkpoint=value?.checkpoint,timing=value?.authorityTiming;
 if(!generation||value?.format!==`nestory-local-ram-${generation===1?'reset':'inverse'}-execution-v1`||
  value.authorityKind!=='local-sql-session-fixture'||value.productionPermissionProven!==false||value.productionForeignDataProven!==false||value.controlReopened!==false||
  operation?.operation_id!==operationId||!uuid.test(operationId)||operation.status!=='actions_complete'||operation.source_generation!==generation-1||operation.target_generation!==generation||
  operation.checkpoint_kind!==kind||operation.checkpoint_generation_current!==true||!Number.isSafeInteger(operation.action_count)||operation.action_count<1||operation.applied_count!==operation.action_count||
  (generation===1?operation.known_zero_verified!==true:operation.recovery_verified!==true)||
  !exact(checkpoint,['kind','sha256','generation','resultSha256'])||checkpoint.kind!==kind||checkpoint.generation!==generation||!digest.test(checkpoint.sha256)||checkpoint.sha256!==checkpoint.resultSha256||
  operation.checkpoint_sha256!==checkpoint.sha256||
  (generation===1&&(!exact(timing,['consumedAgeSeconds','remainingSeconds'])||
   !Number.isFinite(timing.consumedAgeSeconds)||!Number.isFinite(timing.remainingSeconds)||timing.consumedAgeSeconds<0||timing.remainingSeconds<=0||
   timing.consumedAgeSeconds+timing.remainingSeconds>300.000001)))fail('rehearsal_execution_invalid');
 return {format:value.format,operationId,status:operation.status,generation,actionCount:operation.action_count,appliedCount:operation.applied_count,
  knownZeroVerified:operation.known_zero_verified===true,recoveryVerified:operation.recovery_verified===true,checkpoint,
  authorityKind:'local-sql-session-fixture',productionPermissionProven:false,productionForeignDataProven:false,controlReopened:false,
  ...(generation===1?{authorityTiming:{consumedAgeSeconds:timing.consumedAgeSeconds,remainingSeconds:timing.remainingSeconds}}:{})};
}
async function verifyRehearsalStorage(runtime,snapshot){
 const tables=[['storage.buckets',snapshot.storageBucketMetadata??[]],['storage.objects',snapshot.storageMetadata]];
 const checks=tables.map(([table,rows])=>sqlDoBlock(`DECLARE r record; actual text; BEGIN
 IF (SELECT count(*) FROM ${table})<>${rows.length} THEN RAISE EXCEPTION 'local_business_runtime_storage_roster_changed'; END IF;
 FOR r IN SELECT * FROM jsonb_to_recordset(${literal(JSON.stringify(rows))}::jsonb) x("rowText" text,"rowSha256" text) LOOP
 SELECT to_jsonb(t)::text INTO STRICT actual FROM ${table} t WHERE to_jsonb(t)->'id'=r."rowText"::jsonb->'id';
 IF actual IS DISTINCT FROM r."rowText" OR encode(extensions.digest(actual,'sha256'),'hex')<>r."rowSha256" THEN RAISE EXCEPTION 'local_business_runtime_storage_metadata_changed'; END IF;
 END LOOP; END`,'ram_storage')).join('\n');
 await runtime.sql(`BEGIN READ ONLY; SET LOCAL standard_conforming_strings=on;SET LOCAL search_path=pg_catalog,public;SET LOCAL timezone='UTC';${checks}\nCOMMIT;`);
 return{metadataRows:snapshot.storageMetadata.length,bucketRows:(snapshot.storageBucketMetadata??[]).length,exactMetadataVerified:true,physicalFileBytesVerified:false};
}
// A restored database needs planner statistics just like a normal PostgreSQL
// restore. Analyze only the fixed imported roster inside the owned RAM server.
// Statistics are not authority evidence; exact schema and row checks still run.
export function buildBusinessRestoreAnalyzeSql(){
 const tables=[...LOCAL_CAPTURE_POLICY.filter(p=>p.capture==='full-row-image').map(p=>p.table),'storage.buckets','storage.objects','auth.users'];
 const relation=s=>s.split('.').map(p=>`"${p}"`).join('.');
 return `BEGIN;SET LOCAL statement_timeout='120s';SET LOCAL search_path=pg_catalog,public;
 ${sqlDoBlock(`BEGIN IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'postgres' OR inet_server_addr() IS NOT NULL
 OR current_setting('data_directory')<>'/db/pg' OR current_setting('listen_addresses')<>'' THEN RAISE EXCEPTION 'local_business_runtime_analyze_target_invalid'; END IF; END`,'ram_analyze_guard')}
 CREATE TEMP TABLE ram_analyze_catalog ON COMMIT DROP AS SELECT encode(extensions.digest(${catalogExpression}::text,'sha256'),'hex') sha256,
 (SELECT count(*) FROM pg_class WHERE oid IN (${tables.map(t=>`${literal(t)}::regclass`).join(',')}) AND reltuples<0) uninitialized_relations;
 ${tables.map(t=>`ANALYZE ${relation(t)};`).join('\n')}
 ${sqlDoBlock(`BEGIN IF (SELECT sha256 FROM ram_analyze_catalog) IS DISTINCT FROM encode(extensions.digest(${catalogExpression}::text,'sha256'),'hex')
 OR (SELECT count(*) FROM pg_class WHERE oid IN (${tables.map(t=>`${literal(t)}::regclass`).join(',')}) AND reltuples>=0)<>${tables.length}
 THEN RAISE EXCEPTION 'local_business_runtime_analyze_verification_failed'; END IF; END`,'ram_analyze_verified')}
 SELECT jsonb_build_object('format','nestory-local-restore-planner-statistics-v1','relationCount',${tables.length},'previouslyUninitializedRelations',(SELECT uninitialized_relations FROM ram_analyze_catalog),'catalogUnchanged',true,'statisticsInitialized',true);
 COMMIT;`;
}
async function rehearseRestoredBusiness({runtime,payload,snapshot,request,custody,replay}){
 const json=async(sql,action='default')=>JSON.parse(await runtime.sql(sql,'postgres',action));
 diagnosticStage='rehearsal-migration';
 if(replay.sources.some(s=>s.name===transitionName)||replay.sources.length!==259)fail('rehearsal_baseline_invalid');
 const transition=(await readFile(path.join(root,'supabase/migrations',transitionName),'utf8')).replaceAll('\r\n','\n'),transitionSha256=backupHash(transition);
 await runtime.sql(`BEGIN; DO $$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version>='20261027005615') THEN RAISE EXCEPTION 'local_rehearsal_transition_already_installed'; END IF; END $$;\n${transition}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261027005615','financial_reset_empty_books_preserved_contracts',ARRAY[${literal(transition)}]); COMMIT;`);
 const operationId=randomUUID(),recoveryId=randomUUID(),planner=createPilotRamRehearsalPlanner({manifestBytes:payload,expectedSourceSha256:request.sourceSha256,operationId});
 diagnosticStage='rehearsal-preview';const preview=await json(planner.previewSql());
 diagnosticStage='rehearsal-materialize';const materialization=await json(planner.materializeSql(preview)),plan=planner.acceptMaterialization(preview,materialization),planBinding=buildPilotRehearsalBinding(plan);
 const beforeContractsSha256=await runtime.sql(`BEGIN READ ONLY;SELECT app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(${literal(planBinding.organizationId)}::uuid));COMMIT;`);
 if(!digest.test(beforeContractsSha256))fail('rehearsal_contracts_changed');
 const fixture={maker:randomUUID(),reviewer:randomUUID(),makerSession:randomUUID(),reviewerSession:randomUUID()};
 diagnosticStage='rehearsal-fixture';const fixtureResult=await json(rehearsalSql.buildRamActorFixtureSql(fixture));
 if(!exact(fixtureResult,['format','actorCount','sessionCount','authorityKind','productionPermissionProven','customerAuthImpersonated','fixtureTransactionId'])||
  fixtureResult.format!=='nestory-local-synthetic-actor-fixture-v1'||fixtureResult.actorCount!==2||fixtureResult.sessionCount!==2||
  fixtureResult.authorityKind!=='local-sql-session-fixture'||fixtureResult.productionPermissionProven!==false||fixtureResult.customerAuthImpersonated!==false||
  typeof fixtureResult.fixtureTransactionId!=='string'||!/^[1-9][0-9]*$/.test(fixtureResult.fixtureTransactionId))fail('rehearsal_fixture_invalid');
 diagnosticStage='rehearsal-prepare';const phases=await json(rehearsalSql.buildRamResetPrepareSql({plan,planBinding,fixture,fixtureTransactionId:fixtureResult.fixtureTransactionId}));
 if(phases.fixtureTransactionId!==fixtureResult.fixtureTransactionId)fail('rehearsal_fixture_invalid');
 if(phases.continuationPlan.contracts_sha256!==beforeContractsSha256)fail('rehearsal_contracts_changed');
 const rehearsal=bindPilotRehearsalSemantics(plan,{zeroPlan:phases.zeroPlan,zeroPlanText:phases.zeroPlanText,continuationPlan:phases.continuationPlan,reportPlan:phases.reportPlan});
 await custody.check();diagnosticStage='rehearsal-execute';
 const reset=summarizeBusinessRehearsalExecution(await json(rehearsalSql.buildRamResetExecuteSql({plan,planBinding,fixture,phases}),'execute'),'reset',operationId);
 diagnosticResetExecution=reset;
 const resetVerification=assertBusinessRehearsalVerification(await json(rehearsalSql.buildRamRehearsalVerificationSql({plan,planBinding,fixture,phases,phase:'reset'})),'reset',phases.continuationPlan.contracts_sha256);
 const resetStorage=await verifyRehearsalStorage(runtime,snapshot);
 diagnosticResetVerificationComplete=true;
 diagnosticStage='rehearsal-sources';const inverseInputs=await json(rehearsalSql.buildRamInverseReadbackSql({plan,planBinding}));
 diagnosticStage='rehearsal-inverse-plan';const canonicalInverse=await json(rehearsalSql.buildRamInverseCanonicalSql({plan,planBinding,inverseInputs,recoveryId}));
 await custody.check();diagnosticStage='rehearsal-inverse-execute';
 const inverse=summarizeBusinessRehearsalExecution(await json(rehearsalSql.buildRamInverseExecuteSql({plan,planBinding,fixture,phases,inverseInputs,recoveryId,canonicalInverse})),'recovered',recoveryId);
 diagnosticStage='rehearsal-verify';const recovered=await json(rehearsalSql.buildRamRehearsalVerificationSql({plan,planBinding,fixture,phases,inverseInputs,recoveryId,canonicalInverse,phase:'recovered'}));
 const recoveredStorage=await verifyRehearsalStorage(runtime,snapshot);
 for(const [value,phase]of [[resetVerification,'reset'],[recovered,'recovered']])assertBusinessRehearsalVerification(value,phase,phases.continuationPlan.contracts_sha256);
 if(resetVerification.contractsSha256!==recovered.contractsSha256||recovered.contractsSha256!==phases.continuationPlan.contracts_sha256)fail('rehearsal_contracts_changed');
 if(backupHash((await readFile(path.join(root,'supabase/migrations',transitionName),'utf8')).replaceAll('\r\n','\n'))!==transitionSha256)fail('source_changed');
 diagnosticStage='rehearsal-save';
 const rehearsalInputs=await saveRehearsalInputs(request.keyId,{format:'nestory-local-business-rehearsal-inputs-v1',businessArchive:request,operationId,
  preview,materialization,fixture,phases,rehearsal});
 const inverseInputsArchive=await saveRehearsalInputs(request.keyId,{format:'nestory-local-business-inverse-inputs-v1',businessArchive:request,operationId,recoveryId,inverseInputs,canonicalInverse});
 return {rehearsal,rehearsalInputs,inverseInputs:inverseInputsArchive,
  resetInverseResult:{format:'nestory-local-business-reset-inverse-result-v1',operationId,recoveryId,authorityKind:'local-sql-session-fixture',productionPermissionProven:false,
   productionForeignDataProven:false,fixture:fixtureResult,
   before:{contractsSha256:beforeContractsSha256,censusAlgorithm:'sha256-of-concatenated-row-sha256-ordered-by-postgresql-primary-key-text',
    tableCensus:snapshot.tables.filter(t=>t.capture==='full-row-image').map(t=>({table_name:t.table_name,row_count:t.row_count,rows_sha256:t.rows_sha256}))},
   reset,resetVerification,resetStorage,inverse,recovered,recoveredStorage,transition:{name:transitionName,sha256:transitionSha256},
   recoveryBaseline:rehearsal.binding.recoveryBaseline,executionBaseline:rehearsal.binding.executionBaseline},financialResetInverseProven:true};
}
async function restoreChild(internal,rehearse=false){
 const {request,binding}=assertBusinessChildRequest(internal);
 assertBusinessRestoreRequest(request);diagnosticStage='spill';diagnosticResetExecution=null;diagnosticResetVerificationComplete=false;const initialPins=await sourcePins();
 await localRecoveryDocker({execute:async(...a)=>(await execute(...a)).toString('utf8')});
 const custody=await holdSpillCustody(),before=custody.initial;let encrypted,envelopeBytes,payload,runtime,removed=false;
 try{
  runtime=await createRuntime(binding);
  encrypted=await readPrivateBackupFile(request.archiveId,'archive.pgp');if(backupHash(encrypted)!==request.archiveSha256)fail('archive_changed');
  diagnosticStage='decrypt';envelopeBytes=await decryptLocalBackup(request.keyId,encrypted);const p=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(envelopeBytes));envelopeBytes.fill(0);envelopeBytes=null;
  if(!exact(p,['format','keyId','before','after','observations'])||p.format!=='nestory-encrypted-pilot-capture-package-v1'||p.keyId!==request.keyId||p.before.sourceSha256!==request.sourceSha256||!Array.isArray(p.observations)||p.observations.length>4096)fail('archive_package_invalid');
  const {metadata:keyMetadata}=await loadRecoveryPublicKey(request.keyId);if(p.before.publicKeySha256!==keyMetadata.publicKeySha256)fail('archive_package_invalid');
  const chunks=await decryptLocalBackupChunks(request.keyId,p.observations.map((o,i)=>verifyCaptureChunk(o,{...p.before,chunkIndex:i})));
  try{payload=verifyCaptureCompleteness({before:p.before,after:p.after,observations:p.observations,plaintextChunks:chunks})}finally{for(const b of chunks)b.fill(0)}
  diagnosticStage='snapshot-validation';const checked=validateBusinessSnapshot(payload,request.sourceSha256);
  const local=await Promise.all((await readdir(path.join(root,'supabase/migrations'))).filter(n=>n.endsWith('.sql')).sort().map(async name=>({name,sql:await readFile(path.join(root,'supabase/migrations',name),'utf8')})));
  diagnosticStage='migration-proof';const manifestBytes=await readFile(path.join(root,'supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json'));let replay;
  try{replay=verifyBusinessMigrationReplay(checked.snapshot.ledger,local,manifestBytes)}catch(error){
   if(error?.message==='local_business_restore_migration_content_unproven'){
    const baseline=JSON.parse(manifestBytes).hostedMigrationHashes,failures=[];
    for(const entry of checked.snapshot.ledger){
     try{verifyBusinessMigrationReplay([entry],local,manifestBytes)}catch{
      if(!/^\d{14}$/.test(entry.version)||!/^[a-z0-9_]{1,160}$/.test(entry.name))continue;
      const source=local.find(x=>x.name===`${entry.version}_${entry.name}.sql`),known=baseline.find(x=>x.version===entry.version);let capturedCanonical=null,reconstruction=null;
      try{capturedCanonical=canonicalMigrationHash(entry);reconstruction=source?reconstructLocalMigrationDescriptors(source.sql,entry.statements).issue??null:'missing-source'}catch{reconstruction='descriptor-check-failed'}
      failures.push({version:entry.version,name:entry.name,statementCount:entry.statements?.length??null,capturedCanonicalSha256:capturedCanonical,
       reviewedCanonicalSha256:known?.canonicalSha256??null,reviewedLegacyException:known?.legacyException===true,
       gitSourceMatchesReviewed:source&&known?hashGitMigrationBody(source.sql)===known.gitSqlSha256:false,reconstruction});
     }
    }
    await writePrivateBackupFile(randomUUID(),'proof.json',Buffer.from(JSON.stringify({format:'nestory-local-business-migration-failure-v1',restoreProven:false,sourceSha256:request.sourceSha256,failures})));
   }throw error;
  }
  await bootstrap(runtime,replay);await custody.check();diagnosticStage='schema';
  let catalog=JSON.parse(await runtime.sql(`SET search_path=pg_catalog,public; SELECT ${catalogExpression};`)),schemaReconstruction=null;
  if(!same(catalog,checked.snapshot.catalog)){
   schemaReconstruction=await correctPinnedBusinessSchema(runtime,checked.snapshot,request.schemaArchive);await custody.check();
   catalog=JSON.parse(await runtime.sql(`SET search_path=pg_catalog,public; SELECT ${catalogExpression};`));
  }
  const expectedObjects=new Map(checked.snapshot.catalog.map(v=>[`${v.kind}:${v.name}`,v.sha256])),actualObjects=new Map(catalog.map(v=>[`${v.kind}:${v.name}`,v.sha256]));
  const mismatches=[...new Set([...expectedObjects.keys(),...actualObjects.keys()])].filter(k=>expectedObjects.get(k)!==actualObjects.get(k)).map(name=>({name,expected:expectedObjects.get(name)??null,actual:actualObjects.get(name)??null}));
  if(mismatches.length){
   const names=new Set(mismatches.map(x=>x.name));
   const diagnostics=(await runtime.sql(schemaDiagnosticSql)).split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(x=>names.has(`${x.kind}:${x.name}`));
   const start=schemaCensusSql.indexOf('WITH objects AS ('),end=schemaCensusSql.indexOf(") SELECT jsonb_build_object('kind',kind,'name',name,'sha256'");
   if(start<0||end<start)fail('schema_failed');
   const definitions=JSON.parse(await runtime.sql(`SET search_path=pg_catalog,public; ${schemaCensusSql.slice(start,end+1)} SELECT jsonb_agg(jsonb_build_object('kind',kind,'name',name,'definition',definition,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind COLLATE "C",name COLLATE "C") FROM objects;`));
   const definitionBytes=Buffer.from(JSON.stringify({format:'nestory-local-bootstrap-schema-definitions-v1',businessSourceSha256:request.sourceSha256,catalog,definitions}));
   let sealed;const definitionArchiveId=randomUUID();
   try{sealed=await encryptLocalBackup(request.keyId,definitionBytes);await writePrivateBackupFile(definitionArchiveId,'archive.pgp',sealed);
    await writePrivateBackupFile(randomUUID(),'proof.json',Buffer.from(JSON.stringify({format:'nestory-local-business-schema-failure-v1',restoreProven:false,sourceSha256:request.sourceSha256,mismatches,diagnostics,
     definitionArchive:{keyId:request.keyId,archiveId:definitionArchiveId,archiveSha256:backupHash(sealed),plaintextSha256:backupHash(definitionBytes)}})));
   }finally{definitionBytes.fill(0);sealed?.fill(0)}fail('schema_failed');
  }
  diagnosticStage='restore';
  const result=JSON.parse(await runtime.sql(buildSelectedBusinessRestoreSql({bytes:payload,expectedSourceSha256:request.sourceSha256,migrationReplay:replay.contract})));
  diagnosticStage='restore-statistics';const plannerStatistics=JSON.parse(await runtime.sql(buildBusinessRestoreAnalyzeSql()));
  if(!exact(plannerStatistics,['format','relationCount','previouslyUninitializedRelations','catalogUnchanged','statisticsInitialized'])||plannerStatistics.format!=='nestory-local-restore-planner-statistics-v1'||
   plannerStatistics.relationCount!==LOCAL_CAPTURE_POLICY.filter(p=>p.capture==='full-row-image').length+3||plannerStatistics.catalogUnchanged!==true||plannerStatistics.statisticsInitialized!==true||
   !Number.isSafeInteger(plannerStatistics.previouslyUninitializedRelations)||plannerStatistics.previouslyUninitializedRelations<0||plannerStatistics.previouslyUninitializedRelations>plannerStatistics.relationCount)fail('statistics_unproven');
  const rehearsalResult=rehearse?await rehearseRestoredBusiness({runtime,payload,snapshot:checked.snapshot,request,custody,replay}):{financialResetInverseProven:false};
  const after=await custody.check();await runtime.remove();removed=true;
  if(!same(initialPins,await sourcePins()))fail('source_changed');
  for(const source of replay.sources)if(backupHash((await readFile(path.join(root,'supabase/migrations',source.name),'utf8')).replaceAll('\r\n','\n'))!==source.sha256)fail('source_changed');
  const proofId=randomUUID(),proof={...request,...result,format:'nestory-local-business-ram-restore-proof-v1',proofId,
   childPid:process.pid,freshProcessDecryption:true,ownedContainerRemoved:true,containerId:runtime.binding.id,image:RAM_POSTGRES_IMAGE,
   spillBefore:before,spillAfter:after,migrationReplay:replay.contract,schemaReconstruction,sourcePins:initialPins,plannerStatistics,
   ...(rehearse?{rehearsalPhaseTimings:runtime.phaseTimings()}:{}),physicalFileBytesVerified:false,...rehearsalResult};
  await writePrivateBackupFile(proofId,'proof.json',Buffer.from(JSON.stringify(proof)));return proof;
 }catch(error){
  if(rehearse&&/^rehearsal-[a-z-]+$/.test(diagnosticStage))await writePrivateBackupFile(randomUUID(),'proof.json',Buffer.from(JSON.stringify({
   format:'nestory-local-business-rehearsal-failure-v1',sourceSha256:request.sourceSha256,stage:diagnosticStage,financialResetInverseProven:false,
   sqlState:/^[0-9A-Z]{5}$/.test(error?.sqlState)?error.sqlState:null,processTimedOut:error?.processTimedOut===true,
   databaseCode:preparationDatabaseCodes.has(error?.databaseCode)?error.databaseCode:null,
   inverseCause:safeBusinessInverseCause(error?.inverseCause),
   phaseTimings:Array.isArray(error?.phaseTimings)&&error.phaseTimings.length?error.phaseTimings:runtime?.phaseTimings()??[],
   successfulResetExecution:diagnosticResetExecution,resetVerificationCompleted:diagnosticResetVerificationComplete,
   knownFailure:safeBusinessRehearsalFailureCode(error?.message)})));
  throw error;
 }finally{encrypted?.fill(0);envelopeBytes?.fill(0);payload?.fill(0);try{if(runtime&&!removed)await runtime.remove()}finally{await custody.close()}}
}
async function runBusinessArchive(request,rehearse){
 assertBusinessRestoreRequest(request);
 await localRecoveryDocker({execute:async(...a)=>(await execute(...a)).toString('utf8')});
 diagnosticStage='runtime-create';const runtime=await createRuntime();let output;
 try{
  output=await execute(process.execPath,[self,rehearse?'rehearse-child':'restore-child'],Buffer.from(JSON.stringify({request,binding:runtime.binding,parentPid:process.pid})),{timeoutMs:1200000,maxBytes:512*1024,safeRuntimeErrors:true,withPid:true});
  const proof=JSON.parse(output.bytes);
  if(proof.childPid!==output.pid||proof.childPid===process.pid||proof.containerId!==runtime.binding.id||proof.freshProcessDecryption!==true||proof.ownedContainerRemoved!==true||proof.sourceSha256!==request.sourceSha256||proof.archiveSha256!==request.archiveSha256)fail('child_proof_invalid');
  if(await runtime.exists())fail('child_cleanup_unconfirmed');
  const childSaved=await readPrivateBackupFile(proof.proofId,'proof.json');
  if(backupHash(childSaved)!==backupHash(JSON.stringify(proof)))fail('child_proof_changed');
  if(proof.financialResetInverseProven!==rehearse)fail('child_proof_invalid');
  if(rehearse){
   const custody=await holdSpillCustody();
   try{
    await verifySavedRehearsalInputs(proof.rehearsalInputs,request,'nestory-local-business-rehearsal-inputs-v1',proof.rehearsal.binding.operationId);
    await verifySavedRehearsalInputs(proof.inverseInputs,request,'nestory-local-business-inverse-inputs-v1',proof.rehearsal.binding.operationId);
    await custody.check();
   }finally{await custody.close()}
  }
  if(!same(proof.sourcePins,await sourcePins()))fail('source_changed');
  const verifiedProof={...proof,proofId:randomUUID(),childProofId:proof.proofId,childProofSha256:backupHash(childSaved),parentPid:process.pid,parentCleanupVerified:true};
  if(rehearse)verifiedProof.rehearsalInputsFreshProcessVerified=true;
  await writePrivateBackupFile(verifiedProof.proofId,'proof.json',Buffer.from(JSON.stringify(verifiedProof)));return verifiedProof;
 }finally{output?.bytes.fill(0);await runtime.cleanup()}
}
export async function restoreLocalBusinessArchive(request){return runBusinessArchive(request,false)}
export async function rehearseLocalBusinessArchive(request){return runBusinessArchive(request,true)}
// Fixed synthetic behavior probe; no caller SQL or archive/customer input.
export async function exerciseSyntheticSchemaPermissionCorrection(){
 const custody=await holdSpillCustody();let runtime;
 try{
  runtime=await createRuntime();await runtime.sql('CREATE ROLE postgres SUPERUSER LOGIN;','supabase_admin');
  await runtime.sql(`CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA storage;
   CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
   CREATE TABLE public.organizations(id uuid);CREATE TABLE auth.users(id uuid);CREATE TABLE storage.objects(id uuid);
   CREATE TABLE public.leases(id uuid);ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
   GRANT SELECT ON public.leases TO service_role;
   CREATE FUNCTION public.permission_fixture(p_value integer) RETURNS integer LANGUAGE sql AS $$SELECT p_value$$;`);
  const start=schemaCensusSql.indexOf('WITH objects AS ('),end=schemaCensusSql.indexOf(") SELECT jsonb_build_object('kind',kind,'name',name,'sha256'");
  if(start<0||end<start)fail('schema_failed');
  const q=`SET search_path=pg_catalog,public;${schemaCensusSql.slice(start,end+1)} SELECT jsonb_build_object('catalog',jsonb_agg(jsonb_build_object('kind',kind,'name',name,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind,name),'definitions',jsonb_agg(jsonb_build_object('kind',kind,'name',name,'definition',definition,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind,name)) FROM objects WHERE (kind='relation' AND name='public.leases') OR (kind='function' AND name='public.permission_fixture(p_value integer)');`;
  const source=JSON.parse(await runtime.sql(q));
  await runtime.sql('GRANT SELECT ON public.leases TO anon;GRANT DELETE ON public.leases TO service_role;GRANT EXECUTE ON FUNCTION public.permission_fixture(integer) TO anon;');
  const actual=JSON.parse(await runtime.sql(q)),proposal=buildBusinessSchemaPermissionCorrection({source,actual});
  if(proposal.changed.length!==2||proposal.remaining.length)fail('synthetic_permission_fixture_failed');
  await runtime.sql(proposal.sql);const restored=JSON.parse(await runtime.sql(q));
  if(!same(source,restored))fail('synthetic_permission_catalog_changed');
  await custody.check();await runtime.remove();
  return{format:'nestory-synthetic-schema-permission-proof-v1',syntheticOnly:true,customerRestoreProven:false,changedObjects:2,exactCatalogRestored:true,ownedContainerRemoved:true};
 }finally{try{if(runtime)await runtime.cleanup()}finally{await custody.close()}}
}
// Compile the reviewed finite correction in an empty owned RAM clone. This
// entry never reads the business archive or imports customer/auth/storage rows.
export async function exercisePinnedBusinessSchemaCorrection(reference){
 assertBusinessSchemaArchiveReference(reference);
 const custody=await holdSpillCustody();let runtime;let stage='source';
 try{
  const {payload:source,evidence}=await readBusinessSchemaSource(reference);
  const local=await Promise.all((await readdir(path.join(root,'supabase/migrations'))).filter(n=>n.endsWith('.sql')).sort().map(async name=>({name,sql:await readFile(path.join(root,'supabase/migrations',name),'utf8')})));
  const replay=verifyBusinessMigrationReplay(source.ledger,local,await readFile(path.join(root,'supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json')));
  stage='bootstrap';runtime=await createRuntime();await bootstrap(runtime,replay);
  const start=schemaCensusSql.indexOf('WITH objects AS ('),end=schemaCensusSql.indexOf(") SELECT jsonb_build_object('kind',kind,'name',name,'sha256'");
  if(start<0||end<start)fail('schema_failed');
  const q=`SET search_path=pg_catalog,public;${schemaCensusSql.slice(start,end+1)} SELECT jsonb_build_object('catalog',jsonb_agg(jsonb_build_object('kind',kind,'name',name,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind COLLATE "C",name COLLATE "C"),'definitions',jsonb_agg(jsonb_build_object('kind',kind,'name',name,'definition',definition,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind COLLATE "C",name COLLATE "C")) FROM objects;`;
  const actual=JSON.parse(await runtime.sql(q));stage='plan';const plan=buildBusinessSchemaStructuralCorrection({source,actual});
  stage='enum';await runtime.sql(plan.enumSql);stage='structure';await runtime.sql(plan.structuralSql);
  const structuralReadback=JSON.parse(await runtime.sql(q));stage='permissions-plan';const permissions=buildBusinessSchemaPermissionCorrection({source,actual:structuralReadback});
  stage='permissions';await runtime.sql(permissions.sql);stage='catalog';const final=JSON.parse(await runtime.sql(q)),classification=classifyBusinessSchemaCorrection({source,actual:final});
  await writePrivateBackupFile(randomUUID(),'proof.json',Buffer.from(JSON.stringify({...classification,format:'nestory-local-empty-schema-correction-result-v1',correctionExecuted:true,
   sourceArchive:evidence,customerRowsImported:false,stage:'catalog'})));
  if(classification.changes.length)throw Error('local_business_schema_final_catalog_mismatch');
  await custody.check();await runtime.remove();return{format:'nestory-local-empty-schema-correction-proof-v1',sourceArchive:evidence,
   exactCatalogMatched:true,objects:final.catalog.length,replayedVersions:replay.sources.length,customerRowsImported:false,ownedContainerRemoved:true};
 }catch(error){
  await writePrivateBackupFile(randomUUID(),'proof.json',Buffer.from(JSON.stringify({format:'nestory-local-empty-schema-correction-failure-v1',stage,customerRowsImported:false,
   sqlState:/^[0-9A-Z]{5}$/.test(error?.sqlState)?error.sqlState:null,knownFailure:['local_business_schema_finite_roster_changed','local_business_schema_definition_invalid','local_business_schema_application_change_unreviewed','local_business_schema_final_catalog_mismatch'].includes(error?.message)?error.message:null})));
  throw Error(`local_business_schema_empty_${stage}_failed`);
 }finally{try{if(runtime)await runtime.cleanup()}finally{await custody.close()}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){
 try{
  if(process.argv.length!==3||!['restore','restore-child','rehearse','rehearse-child','spill-check'].includes(process.argv[2]))fail('command_invalid');
  if(process.argv[2]==='spill-check'){process.stdout.write(JSON.stringify(await spill())+'\n');}
  else{const parts=[];let n=0;for await(const b of process.stdin){n+=b.length;if(n>2048)fail('request_limit');parts.push(b)}const request=JSON.parse(Buffer.concat(parts));
   process.stdout.write(JSON.stringify(await(process.argv[2]==='restore'?restoreLocalBusinessArchive(request):process.argv[2]==='rehearse'?rehearseLocalBusinessArchive(request):restoreChild(request,process.argv[2]==='rehearse-child')))+'\n');}
 }catch(error){const code=typeof error?.message==='string'&&error.message.startsWith('local_business_restore_')?error.message.slice('local_business_restore_'.length):null;
  const reported=validationCodes.has(code)?`local_business_runtime_validation_${code}_failed\n`:`${error?.message}\n`;
  process.stderr.write(safeFailure(reported)?reported:`local_business_runtime_${diagnosticStage}_failed\n`);process.exitCode=1;}
}
