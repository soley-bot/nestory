import test from 'node:test';
import './pilot-finance-reset-direct-once.node-test.mjs';
import './pilot-finance-reset-worker-readiness.node-test.mjs';
import './local-backup-execute-transition.node-test.mjs';
import './local-backup-execute-adapter.node-test.mjs';
import './local-backup-execute-resume.node-test.mjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {LOCAL_CUSTODY_BUCKET,LOCAL_CUSTODY_JOB,localCustodyObjectPath,assertLocalCustodySignedUrl,encryptLocalCustodyTransfer,
 decryptLocalCustodyTransfer,assertLocalCustodyJob,createLocalCustodySingleAttempt,readLocalCustodyAfterRefresh,runLocalCustodyWorker,localCustodyMutationSql,assertLocalCustodyBucketMetadata,exerciseLocalCustodyBucketProvision,LOCAL_CUSTODY_CA_SHA256,LOCAL_CUSTODY_SOURCES,assertLocalCustodyResetScope,localCustodyFailureCode,classifyLocalCustodyDatabaseFailure} from './pilot-finance-reset-local-custody-runner.mjs';
import {createHash} from 'node:crypto';
import {localCustodyBucketReadValue} from './pilot-finance-reset-local-custody-runner.mjs';
import {LOCAL_DISPATCH_WORKFLOW,LOCAL_DISPATCH_REPOSITORY} from './local-backup-dispatch-bundle.mjs';
const locator={operationId:'11111111-1111-4111-8111-111111111111',nonce:'22222222-2222-4222-8222-222222222222',action:'freeze'};
const url=`https://pfvmztxktkwyewvxfgot.supabase.co/storage/v1/object/sign/${LOCAL_CUSTODY_BUCKET}/${localCustodyObjectPath(locator)}?token=${'a'.repeat(30)}`;
const bucket=()=>({id:LOCAL_CUSTODY_BUCKET,name:LOCAL_CUSTODY_BUCKET,public:false,file_size_limit:33554432,allowed_mime_types:['application/octet-stream']});

test('failure diagnostics expose only exact fixed codes, never private error text',()=>{
 assert.equal(localCustodyFailureCode(Error('local_custody_swap_present')),'local_custody_swap_present');
 for(const value of ['PRIVATE_PASSWORD', 'local_custody_swap_present PRIVATE_PASSWORD', 'local_custody_arbitrary_private_value'])
  assert.equal(localCustodyFailureCode(Error(value)),'local_custody_worker_stopped');
 for(const [message,expected]of [
  ['certificate verify failed PRIVATE_PASSWORD','local_custody_tls_certificate_failed'],
  ['connection to server at PRIVATE_HOST failed: FATAL: password authentication failed for user PRIVATE_USER','local_custody_database_authentication_failed'],
  ['FATAL: Tenant or user not found PRIVATE_USER','local_custody_database_endpoint_failed'],
  ['connection to server at PRIVATE_HOST failed: timeout expired','local_custody_database_network_failed'],
  ['ERROR: local_custody_database_identity PRIVATE_ROW','local_custody_database_identity_failed'],
  ['ERROR: local_custody_private_bucket_changed PRIVATE_ROW','local_custody_database_bucket_failed'],
  ['unrecognized PRIVATE_ROW PRIVATE_PASSWORD','hosted_transport_process_failed'],
 ]){
  const code=classifyLocalCustodyDatabaseFailure(Buffer.from(message));
  assert.equal(code,expected);assert.equal(localCustodyFailureCode(Error(code)),expected);assert.doesNotMatch(code,/PRIVATE/);
 }
});
test('existing matching handoff bucket is accepted without a write',async()=>{
 const r=await exerciseLocalCustodyBucketProvision({read:async()=>bucket(),create:async()=>assert.fail('unexpected create'),refresh:async()=>assert.fail('unexpected refresh')});
 assert.deepEqual(r,{outcome:'existing-matching',createAttempted:false});
});
test('exact Storage HTTP400 NoSuchBucket response permits one verified creation',async()=>{
 const missing={status:400,value:{statusCode:'404',code:'NoSuchBucket',error:'Bucket not found',message:'Bucket not found'}};
 let response=missing;const calls=[];
 const result=await exerciseLocalCustodyBucketProvision({read:async()=>{calls.push('read');return localCustodyBucketReadValue(response)},
  refresh:async()=>calls.push('refresh'),create:async()=>{calls.push('create');response={status:200,value:bucket()}}});
 assert.deepEqual(calls,['read','refresh','create','read']);assert.equal(result.outcome,'created-and-verified');
});
test('legacy HTTP404 missing bucket handling is preserved',()=>{
 for(const extra of [{code:'NoSuchBucket'},{error:'Bucket not found'}])
  assert.equal(localCustodyBucketReadValue({status:404,value:{message:'Bucket not found',...extra}}),null);
});
test('other bad requests and denied reads never permit creation',async()=>{
 const missing={statusCode:'404',code:'NoSuchBucket',error:'Bucket not found',message:'Bucket not found'};
 const responses=[401,403,500].map(status=>({status,value:missing}));
 for(const field of Object.keys(missing)){
  responses.push({status:400,value:{...missing,[field]:'different'}});
  const value={...missing};delete value[field];responses.push({status:400,value});
 }
 responses.push({status:400,value:{...missing,statusCode:404}},{status:400,value:{...missing,extra:'unexpected'}},
  {status:400,value:null},{status:404,value:{message:'denied'}});
 for(const response of responses)await assert.rejects(exerciseLocalCustodyBucketProvision({
  read:async()=>localCustodyBucketReadValue(response),refresh:async()=>assert.fail('unexpected refresh'),create:async()=>assert.fail('unexpected create'),
 }),/local_custody_bucket_read_unavailable/);
});
test('provision diagnostic categories remain exact and redact appended private values',()=>{
 const codes=['local_custody_provision_inputs_invalid','local_custody_provision_credential_unavailable','local_custody_provision_authority_changed',
  'local_custody_read_unavailable','local_custody_read_limit','local_custody_bucket_request_unknown','local_custody_bucket_request_invalid',
  'local_custody_bucket_response_limit','local_custody_bucket_read_unavailable','local_custody_bucket_mismatch','local_custody_bucket_create_outcome_unknown',
  'local_backup_files_cli_credential_response_invalid','local_backup_files_cli_credential_ambiguous','local_backup_files_cli_credential_missing','local_backup_files_cli_credential_key_invalid'];
 for(const code of codes){
  assert.equal(localCustodyFailureCode(Error(code)),code);
  assert.equal(localCustodyFailureCode(Error(code+' PRIVATE_VALUE')),'local_custody_worker_stopped');
 }
});
for(const [name,change]of[['public',b=>b.public=true],['name',b=>b.name='other'],['id',b=>b.id='other'],['size',b=>b.file_size_limit++],['mime',b=>b.allowed_mime_types.push('application/pdf')],['missing limit',b=>delete b.file_size_limit]])
 test(`existing ${name} mismatch never updates or creates`,async()=>{
  const b=bucket();change(b);assert.throws(()=>assertLocalCustodyBucketMetadata(b),/bucket_mismatch/);
  await assert.rejects(exerciseLocalCustodyBucketProvision({read:async()=>b,create:async()=>assert.fail('unexpected create')}),/bucket_mismatch/);
 });
test('absent handoff bucket is created once only after refreshed protected authority',async()=>{
 let current=null;const calls=[];const r=await exerciseLocalCustodyBucketProvision({read:async()=>{calls.push('read');return current},
  refresh:async()=>calls.push('refresh'),create:async()=>{calls.push('create');current=bucket()}});
 assert.deepEqual(calls,['read','refresh','create','read']);assert.equal(r.outcome,'created-and-verified');
});
test('lost create acknowledgement reads the committed result without retry',async()=>{
 let current=null,posts=0;const r=await exerciseLocalCustodyBucketProvision({read:async()=>current,refresh:async()=>{},
  create:async()=>{posts++;current=bucket();throw Error('synthetic lost reply')}});
 assert.equal(posts,1);assert.equal(r.outcome,'matching-after-unknown-create');
});
test('unknown failed create remains unknown and never retries',async()=>{
 let posts=0;await assert.rejects(exerciseLocalCustodyBucketProvision({read:async()=>null,refresh:async()=>{},create:async()=>{posts++;throw Error('synthetic timeout')}}),/outcome_unknown/);
 assert.equal(posts,1);
});
test('denied initial read or changed protected authority cannot create a bucket',async()=>{
 for(const ports of [{read:async()=>{throw Error('denied')},refresh:async()=>{}},{read:async()=>null,refresh:async()=>{throw Error('changed')}}])
  await assert.rejects(exerciseLocalCustodyBucketProvision({...ports,create:async()=>assert.fail('unexpected create')}),/denied|changed/);
});
test('only fixed owned private handoff object URL is accepted',()=>assert.equal(assertLocalCustodySignedUrl(url,locator),url));
for(const [name,change]of[['host',s=>s.replace('pfvmztxktkwyewvxfgot','other')],['bucket',s=>s.replace('pilot-reset-handoff','organization-assets')],
 ['path',s=>s.replace('bundle.bin','other.bin')],['credential',s=>s.replace('https://','https://user@')],['fragment',s=>s+'#secret'],['query',s=>s+'&download=true'],
 ['duplicate token',s=>s+'&token=another'],['redirect protocol',s=>s.replace('https:','http:')]])test(`handoff ${name} change denied`,()=>assert.throws(()=>assertLocalCustodySignedUrl(change(url),locator),/url_invalid/));
test('AEAD handoff round-trips and authenticates exact action and object scope',()=>{
 const key=randomBytes(32),doc={format:'nestory-local-custody-waiting-v1',...locator},sealed=encryptLocalCustodyTransfer(doc,key,locator);
 assert.deepEqual(decryptLocalCustodyTransfer(sealed,key,locator),doc);
 for(const changed of [{...locator,action:'execute'},{...locator,nonce:locator.operationId}])assert.throws(()=>decryptLocalCustodyTransfer(sealed,key,changed),/invalid/);
 const corrupt=Buffer.from(sealed);corrupt[20]^=1;assert.throws(()=>decryptLocalCustodyTransfer(corrupt,key,locator),/invalid/);
 assert.throws(()=>decryptLocalCustodyTransfer(sealed,randomBytes(32),locator),/invalid/);
 assert.throws(()=>decryptLocalCustodyTransfer(sealed.subarray(0,-1),key,locator),/invalid/);
});
function jobFixture(){const main='a'.repeat(40);return {environment:{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_ARCH:'X64',
 RUNNER_NAME:'GitHub Actions 1',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:LOCAL_DISPATCH_REPOSITORY,GITHUB_REF:'refs/heads/main',
 GITHUB_WORKFLOW_REF:`${LOCAL_DISPATCH_REPOSITORY}/${LOCAL_DISPATCH_WORKFLOW}@refs/heads/main`,GITHUB_WORKFLOW_SHA:main,GITHUB_SHA:main,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'},
 gitHead:main,currentMain:main,run:{id:123,run_attempt:1,path:LOCAL_DISPATCH_WORKFLOW,repository:{full_name:LOCAL_DISPATCH_REPOSITORY},head_sha:main,head_branch:'main',event:'workflow_dispatch',status:'in_progress'},
 jobs:{total_count:1,jobs:[{id:9,runner_id:8,run_id:123,run_attempt:1,head_sha:main,runner_name:'GitHub Actions 1',labels:['ubuntu-24.04'],name:LOCAL_CUSTODY_JOB,status:'in_progress'}]},
 protectedEnvironment:{name:'production-database',protection_rules:[{type:'branch_policy'}],deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}},protectedBranchNames:['main'],deploymentPolicies:null};}
test('actual-shaped GitHub run and protected-main job binding accepted',()=>assert.equal(assertLocalCustodyJob(jobFixture()).runId,'123'));
for(const [name,change]of[['rerun',f=>f.environment.GITHUB_RUN_ATTEMPT='2'],['main drift',f=>f.currentMain='b'.repeat(40)],
 ['different runner',f=>f.jobs.jobs[0].runner_name='other'],['two jobs',f=>{f.jobs.jobs.push({...f.jobs.jobs[0]});f.jobs.total_count++;}],
 ['unprotected environment',f=>f.protectedEnvironment.protection_rules=[]],['truncated jobs',f=>f.jobs.total_count=2],['workflow mismatch',f=>f.run.path='.github/workflows/ci.yml']])
 test(`${name} fails run admission`,()=>{const f=jobFixture();change(f);assert.throws(()=>assertLocalCustodyJob(f));});
test('after-commit lost reply reconciles once and cannot write again',async()=>{
 let writes=0,reads=0,committed=false;const run=createLocalCustodySingleAttempt({write:async()=>{writes++;committed=true;throw Error('lost')},readback:async()=>{reads++;return committed},reconcile:o=>o?'verified':'unknown'});
 assert.equal(await run(),'verified');await assert.rejects(run(),/existing_attempt/);assert.equal(writes,1);assert.equal(reads,1);
});
test('failed reconciliation retains attempted state and never retries mutation',async()=>{
 let writes=0;const run=createLocalCustodySingleAttempt({write:async()=>{writes++},readback:async()=>{throw Error('unavailable')},reconcile:()=>{throw Error('unused')}});
 await assert.rejects(run(),/unavailable/);await assert.rejects(run(),/existing_attempt/);assert.equal(writes,1);
});
test('concurrent invocation cannot produce two writes',async()=>{
 let writes=0;const run=createLocalCustodySingleAttempt({write:async()=>{writes++},readback:async()=>true,reconcile:o=>o});
 const result=await Promise.allSettled([run(),run()]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes,1);
});
test('historical read refreshes admission after waiting and denies changed main before any database read',async()=>{
 const expected=assertLocalCustodyJob(jobFixture());let reads=0,refreshes=0;
 await assert.rejects(readLocalCustodyAfterRefresh({expected,refresh:async()=>{refreshes++;return {...expected,mainSha:'f'.repeat(40)}},read:()=>{reads++}}),/read_authority_changed/);
 assert.equal(refreshes,1);assert.equal(reads,0);
});
function resetOptions(){const operationId=locator.operationId,org='752a87b8-bd04-4a45-9cb8-00687af66e73';return {action:'freeze',recovery:null,
 binding:{operation_id:operationId,organization_id:org,project_ref:'pfvmztxktkwyewvxfgot',source_generation:0,target_generation:1,cutoff:'2026-10-01',issue_date:'2026-10-01',invoice_date_policy:'empty-books-no-invoices'},
 artifacts:{zeroPlan:{operation_id:operationId,organization_id:org,version:4,approval_policy:'pilot-october-single-admin-v1',maker_actor_id:locator.nonce,reviewer_actor_id:null,effective_date:'2026-10-01'},continuationPlan:{version:4}}};}
test('only five marked reset stages reach existing SQL admission',()=>{
 for(const action of ['freeze','checkpoint','prepare','seal','execute'])assert.equal(assertLocalCustodyResetScope({...resetOptions(),action}),true);
 for(const change of [f=>f.action='prepare-recovery',f=>f.action='execute-recovery',f=>f.action='reopen',f=>f.action='inspect',
  f=>f.recovery={},f=>delete f.recovery,f=>delete f.artifacts.zeroPlan.approval_policy,f=>f.artifacts.zeroPlan.reviewer_actor_id=locator.operationId,
  f=>f.artifacts.zeroPlan.approval_policy='other',f=>f.artifacts.continuationPlan.version=3,f=>f.binding.organization_id=locator.nonce,
  f=>f.binding.project_ref='other',f=>f.binding.source_generation=1,f=>f.binding.target_generation=2,f=>f.binding.cutoff='2026-11-01',
  f=>f.binding.issue_date='2026-11-01',f=>f.binding.invoice_date_policy='other']){
  const f=resetOptions();change(f);assert.throws(()=>assertLocalCustodyResetScope(f));assert.throws(()=>localCustodyMutationSql(f));
 }
});
test('invalid worker mode and recovery stage reject before provider or database work',async()=>{
 const original=globalThis.fetch,mode=process.env.RESET_MODE,action=process.env.RESET_ACTION;let reads=0;globalThis.fetch=()=>{reads++;throw Error('must not run')};
 try{for(const m of ['execute','reconcile'])for(const a of ['prepare-recovery','execute-recovery','reopen','unknown']){
  process.env.RESET_MODE=m;process.env.RESET_ACTION=a;await assert.rejects(runLocalCustodyWorker(),/reset_scope_invalid/);
 }process.env.RESET_MODE='unknown';await assert.rejects(runLocalCustodyWorker(),/mode_invalid/);assert.equal(reads,0);
 }finally{globalThis.fetch=original;if(mode===undefined)delete process.env.RESET_MODE;else process.env.RESET_MODE=mode;if(action===undefined)delete process.env.RESET_ACTION;else process.env.RESET_ACTION=action;}
});
test('payload scope precedes database credentials while generic routes remain held',async()=>{
 const source=await readFile(new URL('./pilot-finance-reset-local-custody-runner.mjs',import.meta.url),'utf8');
 assert.ok(source.indexOf('sql=verifyLocalCustodyPayload(verified)')<source.indexOf('privateDb=await privateConnection(env)'));
 assert.ok(source.lastIndexOf('assertLocalCustodyResetScope(')<source.indexOf('return await createLocalCustodySingleAttempt('));
 const {assertHostedTransportDispatchImplemented}=await import('./pilot-finance-reset-hosted-transport.mjs');
 const {assertNoBackupTransportDispatchImplemented}=await import('./pilot-finance-reset-no-backup-transport.mjs');
 const {dispatchManualReset}=await import('./pilot-finance-reset-manual-coordinator.mjs');
 for(const held of [assertHostedTransportDispatchImplemented,assertNoBackupTransportDispatchImplemented,dispatchManualReset])assert.throws(held,/integration_incomplete/);
 for(const name of ['pilot-finance-reset-github-hosted-runner.mjs','pilot-finance-reset-hosted-runner.mjs'])assert.match(await readFile(new URL('./'+name,import.meta.url),'utf8'),/assertHostedTransportDispatchImplemented()/);
});

test('fixed session identity is checked inside the only mutation transaction before actor consumption',()=>{
 const options={...resetOptions(),authorizationId:locator.nonce,
  authoritySha256:'a'.repeat(64),observation:{catalog:[],ledger:[],foreignSha256:'b'.repeat(64)}};
 const sql=localCustodyMutationSql(options);
 assert.match(sql,/^BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;\nDO /);
 assert.ok(sql.indexOf("session_user<>'postgres'")<sql.indexOf('consume_financial_reset_actor_authorization'));
 assert.match(sql,/current_user<>'postgres' OR current_database\(\)<>'postgres'/);
 assert.match(sql,/storage\.buckets WHERE id='pilot-reset-handoff'.*public=false.*file_size_limit=33554432/);
 assert.match(sql,/ARRAY\['application\/octet-stream'\]::text\[\]/);
 assert.equal((sql.match(/COMMIT;/g)??[]).length,1);
 assert.ok(sql.indexOf('local_custody_foreign_baseline_changed')<sql.indexOf('consume_financial_reset_actor_authorization'));
 assert.match(sql,/financial_reset_hosted_foreign_census\('752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid\)/);
 assert.notEqual(localCustodyMutationSql({...options,observation:{...options.observation,foreignSha256:'c'.repeat(64)}}),sql);
 assert.throws(()=>localCustodyMutationSql({...options,observation:{catalog:[],ledger:[]}}),/foreign_baseline_invalid/);
 assert.throws(()=>localCustodyMutationSql({...options,binding:{...options.binding,organization_id:locator.nonce}}),/policy_invalid/);
});
test('tracked public CA exactly matches reviewed SHA',async()=>{
 const ca=await readFile(new URL('./certificates/supabase-prod-ca-2021.crt',import.meta.url));
 assert.equal(createHash('sha256').update(ca).digest('hex'),LOCAL_CUSTODY_CA_SHA256);
});
test('worker source coverage includes the complete local import closure including real journal verifier',async()=>{
 const pending=['scripts/pilot-finance-reset-local-custody-runner.mjs'],seen=new Set();
 while(pending.length){const name=pending.pop();if(seen.has(name))continue;seen.add(name);
  assert.ok(LOCAL_CUSTODY_SOURCES.includes(name),`missing source pin: ${name}`);
  const text=await readFile(new URL('../'+name,import.meta.url),'utf8');
  for(const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g))pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1])));
 }
 assert.ok(seen.has('scripts/pilot-finance-reset-windows-journal.mjs'));
 assert.ok(seen.has('scripts/pilot-finance-reset-manual-coordinator.mjs'));
});
test('workflow keeps serialized protected writer, pinned actions and no ordinary artifacts',async()=>{
 const text=await readFile(new URL('../.github/workflows/pilot-financial-reset-local-custody.yml',import.meta.url),'utf8');
 assert.match(text,/environment: production-database/);assert.match(text,/group: production-supabase/);assert.match(text,/cancel-in-progress: false/);
 assert.match(text,/github.run_attempt == 1/);assert.match(text,/SUPABASE_DB_PASSWORD: \$\{\{ secrets.SUPABASE_DB_PASSWORD \}\}/);
 assert.doesNotMatch(text,/uses: .*@(main|v\d)\b|upload-artifact|actions\/cache|id-token: write/);
 assert.ok(text.indexOf('case "$RESET_ACTION" in')<text.indexOf('SUPABASE_DB_PASSWORD:'));
 assert.match(text,/options: \[freeze, checkpoint, prepare, seal, execute\]/);assert.doesNotMatch(text,/prepare-recovery|execute-recovery|assertHostedTransportDispatchImplemented/);
 assert.match(text,/default: capability-probe/);assert.match(text,/if: inputs.mode == 'provision-handoff'/);
 assert.match(text,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets.SUPABASE_ACCESS_TOKEN \}\}/);
 assert.match(text,/SUPABASE_PROJECT_ID: \$\{\{ secrets.SUPABASE_PROJECT_ID \}\}/);
 const jobCondition=text.split('\n').find(line=>line.startsWith('    if:'));
 assert.equal(jobCondition?.trim(),"if: github.ref == 'refs/heads/main' && github.workflow_sha == github.sha && github.run_attempt == 1");
 assert.match(text,/PILOT_RESET_LOCAL_CUSTODY_ENABLED: \$\{\{ vars.PILOT_RESET_LOCAL_CUSTODY_ENABLED \}\}/);
 assert.match(text,/test "\$PILOT_RESET_LOCAL_CUSTODY_ENABLED" = reviewed-operation-only/);
 assert.ok(text.indexOf('test "$PILOT_RESET_LOCAL_CUSTODY_ENABLED"')<text.indexOf('- name: Check out exact main'));
 assert.ok(text.indexOf('sudo swapoff -a')<text.indexOf('SUPABASE_DB_PASSWORD:'));
 assert.ok(text.indexOf('sudo swapoff -a')<text.indexOf('SUPABASE_ACCESS_TOKEN:'));
 assert.match(text,/awk 'END \{ exit \(NR != 1\) \}' \/proc\/swaps/);
 const runner=await readFile(new URL('./pilot-finance-reset-local-custody-runner.mjs',import.meta.url),'utf8');
 assert.match(runner,/readFile\('\/proc\/swaps','utf8'\)/);
 assert.match(runner,/fail\('swap_present'\)/);
});
