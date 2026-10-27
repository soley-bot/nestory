import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertBusinessRestoreRequest,assertBusinessChildRequest,assertBusinessRamContainer,assertBusinessSpillObservation,verifyBusinessVendorBundle,assertBusinessRehearsalInputReference,assertBusinessRehearsalVerification,summarizeBusinessRehearsalExecution,parseBusinessDatabaseFailure,safeBusinessRehearsalFailureCode,businessSqlTimeoutMs,createBusinessDatabaseDiagnostics,buildBusinessRestoreAnalyzeSql } from './local-backup-business-runtime.mjs';
import {LOCAL_CAPTURE_POLICY} from './local-backup-capture.mjs';
import { RAM_POSTGRES_IMAGE } from './local-backup-restore.mjs';
import { verifyBusinessMigrationReplay,buildSelectedBusinessRestoreSql } from './local-backup-business-restore.mjs';
import { describeMigrationStatement } from './hosted-migration-parity-core.mjs';
const id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
const request={keyId:id,archiveId:id,archiveSha256:hash,sourceSha256:hash};
function fixture(){const binding={runId:id,id:hash};return {binding,c:{Id:hash,Image:RAM_POSTGRES_IMAGE,Name:`/nestory-business-restore-${id}`,
 Config:{Labels:{'nestory.business-restore.run':id},User:'100:101'},State:{Running:true},Mounts:[],NetworkSettings:{Networks:{none:{}}},
 HostConfig:{ReadonlyRootfs:true,NetworkMode:'none',Privileged:false,LogConfig:{Type:'none'},Memory:2147483648,MemorySwap:2147483648,PidsLimit:128,IpcMode:'private',ShmSize:67108864,
 CapDrop:['ALL'],CapAdd:[],SecurityOpt:['no-new-privileges'],Ulimits:[{Name:'core',Hard:0,Soft:0}],Tmpfs:{'/db':'rw,nosuid,nodev,noexec,size=1536m,uid=100,gid=101,mode=0700'},Binds:[],VolumesFrom:[],Devices:[],PortBindings:{}}}}}
test('runtime accepts only exact private archive identities and binds schema reference to the same recovery key',()=>{
 assert.equal(assertBusinessRestoreRequest(request),request);
 for(const patch of [{keyId:'invalid'},{archiveId:'../../private'},{sourceSha256:'x'},{sql:'SELECT 1'},{endpoint:'https://example.com'},{mode:'customer'},{schemaArchive:null}])assert.throws(()=>assertBusinessRestoreRequest({...request,...patch}),/request_invalid/);
 const schemaArchive={keyId:id,archiveId:id,archiveSha256:hash,payloadSha256:hash};assert.equal(assertBusinessRestoreRequest({...request,schemaArchive}).schemaArchive,schemaArchive);
 for(const patch of [{keyId:'22222222-2222-4222-8222-222222222222'},{verified:true},{archiveId:'../../private'},{payloadSha256:'x'},{sql:'SELECT 1'}])
  assert.throws(()=>assertBusinessRestoreRequest({...request,schemaArchive:{...schemaArchive,...patch}}),/request_invalid/);
});
test('internal child command binds the exact owned runtime and actual parent process',()=>{
 const input={request,binding:{runId:id,id:hash},parentPid:1234};assert.equal(assertBusinessChildRequest(input,1234),input);
 for(const v of [{...input,parentPid:1235},{...input,binding:{runId:id,id:'x'}},{...input,sql:'SELECT 1'},{request}])assert.throws(()=>assertBusinessChildRequest(v,1234),/child_request_invalid/);
});
test('saved rehearsal references are private byte-bound archives, never supplied payloads or authority',()=>{
 const reference={keyId:id,archiveId:id,archiveSha256:hash,plaintextSha256:hash,plaintextBytes:1024};
 assert.equal(assertBusinessRehearsalInputReference(reference,id),reference);
 for(const patch of [{archiveId:'../../secret'},{keyId:'22222222-2222-4222-8222-222222222222'},{archiveSha256:''},{plaintextBytes:0},{plaintextBytes:33554433},{plaintextBytes:1.5},{payload:{}},{verified:true}])
  assert.throws(()=>assertBusinessRehearsalInputReference({...reference,...patch},id),/rehearsal_input_invalid/);
});
test('rehearsal verification rejects partial coverage, row images and false authority claims',()=>{
 const value={format:'nestory-local-ram-rehearsal-verification-v1',phase:'reset',canonicalRowsVerified:true,foreignKeysVerified:true,contractsUnchanged:true,frozen:true,generation:1,
  exactLifecycleDeltaVerified:true,contractsSha256:hash,tableCensus:LOCAL_CAPTURE_POLICY.map(p=>({table_name:p.table,row_count:0,rows_sha256:hash})),checkpointSha256:hash,
  syntheticActorCount:2,productionPermissionProven:false,productionForeignDataProven:false,excludedCredentialTablesRestored:false,storageRecoveryVerified:false};
 assert.equal(assertBusinessRehearsalVerification(value,'reset',hash),value);
 for(const patch of [{tableCensus:value.tableCensus.slice(1)},{frozen:false},{generation:2},{contractsSha256:'b'.repeat(64)},{productionPermissionProven:true},{rows:[]},
  {tableCensus:[{...value.tableCensus[0],row_text:'private'},...value.tableCensus.slice(1)]},
  {tableCensus:value.tableCensus.map(r=>({...r,row_count:1}))}])assert.throws(()=>assertBusinessRehearsalVerification({...value,...patch},'reset',hash),/rehearsal_verification_invalid/);
});
test('execution proof projects aggregate status and refuses incomplete or stale checkpoints',()=>{
 const value={format:'nestory-local-ram-reset-execution-v1',operation:{operation_id:id,status:'actions_complete',source_generation:0,target_generation:1,checkpoint_kind:'checked-reports',
  checkpoint_generation_current:true,action_count:2,applied_count:2,known_zero_verified:true,recovery_verified:false,checkpoint_sha256:hash,private_rows:['must-not-persist']},
  checkpoint:{kind:'checked-reports',sha256:hash,generation:1,resultSha256:hash},authorityKind:'local-sql-session-fixture',productionPermissionProven:false,productionForeignDataProven:false,controlReopened:false,
  private_reports:['must-not-persist'],authorityTiming:{consumedAgeSeconds:20,remainingSeconds:280}};
 const result=summarizeBusinessRehearsalExecution(value,'reset',id);assert.equal(result.appliedCount,2);assert.ok(!JSON.stringify(result).includes('must-not-persist'));
 for(const patch of [{status:'executing'},{applied_count:1},{checkpoint_generation_current:false},{target_generation:2},{known_zero_verified:false}])
  assert.throws(()=>summarizeBusinessRehearsalExecution({...value,operation:{...value.operation,...patch}},'reset',id),/rehearsal_execution_invalid/);
 assert.throws(()=>summarizeBusinessRehearsalExecution({...value,checkpoint:{...value.checkpoint,scopes:[]}},'reset',id),/rehearsal_execution_invalid/);
 for(const authorityTiming of [null,{consumedAgeSeconds:300,remainingSeconds:0},{consumedAgeSeconds:20,remainingSeconds:281},{consumedAgeSeconds:-1,remainingSeconds:20},
  {consumedAgeSeconds:20,remainingSeconds:NaN},{consumedAgeSeconds:20,remainingSeconds:280,token:'private'}])
  assert.throws(()=>summarizeBusinessRehearsalExecution({...value,authorityTiming},'reset',id),/rehearsal_execution_invalid/);
});
test('only the fixed reset execution receives a longer process watchdog',()=>{
 assert.equal(businessSqlTimeoutMs(),180000);assert.equal(businessSqlTimeoutMs('execute'),600000);
 for(const value of ['observe','execute-recovery',null,600000,{}])assert.throws(()=>businessSqlTimeoutMs(value),/process_budget_invalid/);
});
test('phase diagnostics survive split chunks and discard native customer context',()=>{
 const d=createBusinessDatabaseDiagnostics();
 const text='psql:<stdin>:12: NOTICE:  00000: local_ram_rehearsal_phase:known_zero:success:12345\n'+
  'CONTEXT: private customer row must never survive\n'+
  'x'.repeat(9000)+'\n'+
  'NOTICE:  00000: local_ram_rehearsal_phase:continuation:success:700\n'+
  'NOTICE:  00000: local_ram_rehearsal_phase:reports:failure:60000\n'+
  'psql:<stdin>:99: ERROR:  57014: local_ram_rehearsal_execute_reports_failed\nDETAIL: private sql\n';
 for(let i=0;i<text.length;i+=17)d.push(text.slice(i,i+17));
 assert.deepEqual(d.finish(),{sqlState:'57014',databaseCode:'local_ram_rehearsal_execute_reports_failed',phaseTimings:[
  {phase:'known_zero',outcome:'success',elapsedMilliseconds:12345},{phase:'continuation',outcome:'success',elapsedMilliseconds:700},
  {phase:'reports',outcome:'failure',elapsedMilliseconds:60000}]});
});
test('timing observations reject arbitrary phases, payloads, overflow and duplicate notices',()=>{
 const d=createBusinessDatabaseDiagnostics();
 for(const message of ['known_zero:success:-1','known_zero:success:1.2','known_zero:success:600001','known_zero:success:01',
  'known_zero:success:1:private','private:success:1','reports:approved:2'])d.push(`NOTICE: 00000: local_ram_rehearsal_phase:${message}\n`);
 d.push('NOTICE: 00000: local_ram_rehearsal_phase:known_zero:success:0\nNOTICE: 00000: local_ram_rehearsal_phase:known_zero:failure:1\n');
 assert.deepEqual(d.finish(),{phaseTimings:[{phase:'known_zero',outcome:'success',elapsedMilliseconds:0}]});
});
test('restore statistics use only the fixed imported roster with local and unchanged-catalog guards',()=>{
 const sql=buildBusinessRestoreAnalyzeSql();
 const analyzed=[...sql.matchAll(/^\s*ANALYZE "([a-z_]+)"\."([a-z_]+)";/gm)].map(m=>`${m[1]}.${m[2]}`);
 assert.deepEqual(analyzed,[...LOCAL_CAPTURE_POLICY.filter(p=>p.capture==='full-row-image').map(p=>p.table),'storage.buckets','storage.objects','auth.users']);
 assert.equal(new Set(analyzed).size,analyzed.length);
 assert.match(sql,/current_setting\('data_directory'\)<>'\/db\/pg'/);
 assert.match(sql,/inet_server_addr\(\) IS NOT NULL/);
 assert.match(sql,/ram_analyze_catalog\) IS DISTINCT FROM/);
 assert.doesNotMatch(sql,/VACUUM|DISABLE TRIGGER|session_replication_role|ANALYZE VERBOSE/);
});
test('private vendor recovery bundle proves every reviewed source without workspace vendor paths',()=>{
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const vendorSources=Array.from({length:130},(_,i)=>({group:'auth-migrations',name:`${i}.up.sql`,sql:`SELECT ${i};`}));
 const core={format:'nestory-local-business-vendor-sources-v1',vendors:vendorSources.map(s=>({group:s.group,name:s.name,sha256:digest(s.sql)}))};
 const bytes=Buffer.from(JSON.stringify({format:'nestory-local-business-vendor-bundle-v1',manifest:core,vendorSources}));
 const manifest={...core,recoveryBundle:{keyId:request.keyId,archiveId:id,ciphertextSha256:hash,plaintextSha256:digest(bytes),plaintextBytes:bytes.length}};
 assert.equal(verifyBusinessVendorBundle(bytes,manifest).size,130);
 const changed=Buffer.from(bytes);changed[changed.length-3]^=1;assert.throws(()=>verifyBusinessVendorBundle(changed,manifest),/vendor_bundle_changed/);
 assert.throws(()=>verifyBusinessVendorBundle(bytes,{...manifest,vendors:manifest.vendors.slice(1)}),/vendor_bundle_invalid/);
 assert.throws(()=>verifyBusinessVendorBundle(bytes,{...manifest,recoveryBundle:{...manifest.recoveryBundle,archiveId:'../source'}}),/vendor_bundle_changed/);
});
test('owned RAM runtime rejects every disk, network, logging and swap relaxation',async t=>{
 const f=fixture();assert.equal(assertBusinessRamContainer(f.binding,f.c),true);
 const cases={wrongImage:c=>c.Image=hash,wrongId:c=>c.Id='b'.repeat(64),wrongOwner:c=>c.Config.Labels={},rootWritable:c=>c.HostConfig.ReadonlyRootfs=false,
 network:c=>c.HostConfig.NetworkMode='bridge',extraNetwork:c=>c.NetworkSettings.Networks.other={},logging:c=>c.HostConfig.LogConfig.Type='json-file',swap:c=>c.HostConfig.MemorySwap=-1,
 bind:c=>c.HostConfig.Binds=['C:/tmp:/db'],mount:c=>c.Mounts=[{Type:'volume',Destination:'/db'}],tmp:c=>c.HostConfig.Tmpfs['/tmp']='rw',core:c=>c.HostConfig.Ulimits[0].Hard=1,
 caps:c=>c.HostConfig.CapAdd=['SYS_ADMIN'],privileged:c=>c.HostConfig.Privileged=true,port:c=>c.HostConfig.PortBindings={'5432/tcp':[{HostPort:'5432'}]},sharedIpc:c=>c.HostConfig.IpcMode='host',
 inheritedVolume:c=>c.Config.Volumes={'/var/lib/postgresql/data':{}},stopped:c=>c.State.Running=false};
 for(const [name,mutate]of Object.entries(cases))await t.test(name,()=>{const f=fixture();mutate(f.c);assert.throws(()=>assertBusinessRamContainer(f.binding,f.c),/container_custody_changed/)});
});
test('live spill observations expire and cannot replace pinned restart/configuration evidence',()=>{
 const now=Date.now(),o={format:'nestory-local-business-spill-observation-v1',observedAtUtc:new Date(now).toISOString(),configSha256:'d3d609da96b511d8d553315005bc47ee2be8db5c3d4b624f3790e14cafe19697',restartProofSha256:'edb1906efe7e67f8ce272012f820cbbb1f8ab495ef77ca809a14765482c4e0e9',wslSwapEntries:0,privateCrashDirectoryVerified:true,ancestorHandlesPinned:true};
 assert.equal(assertBusinessSpillObservation(o,now),o);
 for(const patch of [{wslSwapEntries:1},{privateCrashDirectoryVerified:false},{ancestorHandlesPinned:false},{configSha256:hash},{restartProofSha256:hash},{observedAtUtc:new Date(now-31000).toISOString()}])assert.throws(()=>assertBusinessSpillObservation({...o,...patch},now),/spill_unverified/);
});
test('verified replay requires the immutable reviewed manifest plus actual statement hashes',async()=>{
 const manifest=await readFile(new URL('../supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json',import.meta.url));
 const sql='\nSELECT 1;\n',ledger=[{version:'20261026000100',name:'example',statements:[describeMigrationStatement(sql)]}],sources=[{name:'20261026000100_example.sql',sql}];
 const replay=verifyBusinessMigrationReplay(ledger,sources,manifest);assert.equal(replay.sources.length,1);assert.deepEqual(replay.contract.reconciledVersions,[]);
 assert.throws(()=>verifyBusinessMigrationReplay(ledger,[{...sources[0],sql:'SELECT 2;'}],manifest),/migration_content_unproven/);
 assert.throws(()=>verifyBusinessMigrationReplay(ledger,sources,Buffer.from('{}')),/reconciliation_manifest_invalid/);
 assert.throws(()=>verifyBusinessMigrationReplay([...ledger,...ledger],sources,manifest),/migration_ledger_order_invalid/);
 assert.throws(()=>verifyBusinessMigrationReplay(ledger,[...sources,...sources],manifest),/migration_source_invalid/);
});
test('CLI never echoes malformed requests or native details',()=>{
 const secret='not-for-output-secret';
 for(const command of ['restore','rehearse']){
  const r=spawnSync(process.execPath,['scripts/local-backup-business-runtime.mjs',command],{input:JSON.stringify({...request,endpoint:secret}),encoding:'utf8',windowsHide:true});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'local_business_runtime_request_failed\n');assert.ok(!r.stderr.includes(secret));
 }
});
test('database failure diagnostics retain only SQLSTATE and exact reviewed exception names',()=>{
 const secret='private-row-value';
 assert.deepEqual(parseBusinessDatabaseFailure(`psql:<stdin>:40: ERROR:  23514: financial_reset_action_after_invalid\nCONTEXT: SQL statement '${secret}'\nLOCATION: source, line 4\n`),{sqlState:'23514',databaseCode:'financial_reset_action_after_invalid'});
 for(const message of [secret,`financial_reset_${secret}`,`financial_reset_action_after_invalid ${secret}`,`financial_reset_action_after_invalid: ${secret}`]){
  const result=parseBusinessDatabaseFailure(`ERROR:  23514: ${message}\nCONTEXT: ${secret}\n`);
  assert.deepEqual(result,{sqlState:'23514'});assert.ok(!JSON.stringify(result).includes(secret));
 }
 assert.deepEqual(parseBusinessDatabaseFailure('ERROR: 23514\n'),{sqlState:'23514'});
 assert.deepEqual(parseBusinessDatabaseFailure(`CONTEXT: ERROR: 23514: financial_reset_action_after_invalid ${secret}\n`),{});
 for(const section of ['operation','archive','actions','zero_scope','continuation','zero_plan','readback']){
  const code=`local_ram_rehearsal_prepare_${section}_failed`;
  assert.deepEqual(parseBusinessDatabaseFailure(`ERROR: 21000: ${code}\nCONTEXT: ${secret}\n`),{sqlState:'21000',databaseCode:code});
  assert.deepEqual(parseBusinessDatabaseFailure(`ERROR: 21000: ${code} ${secret}\n`),{sqlState:'21000'});
 }
 assert.deepEqual(parseBusinessDatabaseFailure(`ERROR: 21000: local_ram_rehearsal_prepare_${secret}_failed\n`),{sqlState:'21000'});
 for(const section of ['endorsement','seal','authorize','native_start','native_arm','native_action','native_complete','known_zero','continuation','reports','readback_checks']){
  const code=`local_ram_rehearsal_execute_${section}_failed`;
  assert.deepEqual(parseBusinessDatabaseFailure(`ERROR: 57014: ${code}\nCONTEXT: ${secret}\n`),{sqlState:'57014',databaseCode:code});
  assert.deepEqual(parseBusinessDatabaseFailure(`ERROR: 57014: ${code}: ${secret}\n`),{sqlState:'57014'});
 }
 assert.deepEqual(parseBusinessDatabaseFailure(`ERROR: 57014: local_ram_rehearsal_execute_${secret}_failed\n`),{sqlState:'57014'});
});
test('execution and verification diagnostics accept only the two fixed runtime codes',()=>{
 for(const code of ['local_business_runtime_rehearsal_execution_invalid','local_business_runtime_rehearsal_verification_invalid']){
  assert.equal(safeBusinessRehearsalFailureCode(code),code);
  assert.equal(safeBusinessRehearsalFailureCode(code+' private-row-value'),null);
 }
 for(const value of [null,{},'local_business_runtime_private_row_value','local_business_runtime_rehearsal_execution_invalid_private'])
  assert.equal(safeBusinessRehearsalFailureCode(value),null);
});
