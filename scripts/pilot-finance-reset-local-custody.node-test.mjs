import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {LOCAL_CUSTODY_BUCKET,LOCAL_CUSTODY_JOB,localCustodyObjectPath,assertLocalCustodySignedUrl,encryptLocalCustodyTransfer,
 decryptLocalCustodyTransfer,assertLocalCustodyJob,createLocalCustodySingleAttempt,readLocalCustodyAfterRefresh,runLocalCustodyWorker,localCustodyMutationSql,assertLocalCustodyBucketMetadata,exerciseLocalCustodyBucketProvision,LOCAL_CUSTODY_CA_SHA256,LOCAL_CUSTODY_SOURCES} from './pilot-finance-reset-local-custody-runner.mjs';
import {createHash} from 'node:crypto';
import {LOCAL_DISPATCH_WORKFLOW,LOCAL_DISPATCH_REPOSITORY} from './local-backup-dispatch-bundle.mjs';
const locator={operationId:'11111111-1111-4111-8111-111111111111',nonce:'22222222-2222-4222-8222-222222222222',action:'freeze'};
const url=`https://pfvmztxktkwyewvxfgot.supabase.co/storage/v1/object/sign/${LOCAL_CUSTODY_BUCKET}/${localCustodyObjectPath(locator)}?token=${'a'.repeat(30)}`;
const bucket=()=>({id:LOCAL_CUSTODY_BUCKET,name:LOCAL_CUSTODY_BUCKET,public:false,file_size_limit:33554432,allowed_mime_types:['application/octet-stream']});
test('existing matching handoff bucket is accepted without a write',async()=>{
 const r=await exerciseLocalCustodyBucketProvision({read:async()=>bucket(),create:async()=>assert.fail('unexpected create'),refresh:async()=>assert.fail('unexpected refresh')});
 assert.deepEqual(r,{outcome:'existing-matching',createAttempted:false});
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
test('unconditional production hold precedes environment/credential/network work',async()=>{
 const original=globalThis.fetch;let reads=0;globalThis.fetch=()=>{reads++;throw Error('must not run')};
 try{await assert.rejects(runLocalCustodyWorker(),/integration_incomplete/);assert.equal(reads,0);}finally{globalThis.fetch=original;}
});
test('fixed session identity is checked inside the only mutation transaction before actor consumption',()=>{
 const options={binding:{operation_id:locator.operationId,organization_id:'752a87b8-bd04-4a45-9cb8-00687af66e73'},action:'freeze',authorizationId:locator.nonce,
  authoritySha256:'a'.repeat(64),observation:{catalog:[],ledger:[],foreignSha256:'b'.repeat(64)},artifacts:{},recovery:null};
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
 assert.throws(()=>localCustodyMutationSql({...options,binding:{...options.binding,organization_id:locator.nonce}}),/foreign_baseline_invalid/);
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
 assert.ok(text.indexOf('assertHostedTransportDispatchImplemented();')<text.indexOf('SUPABASE_DB_PASSWORD:'));
 assert.match(text,/default: capability-probe/);assert.match(text,/if: inputs.mode == 'provision-handoff'/);
 assert.match(text,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets.SUPABASE_ACCESS_TOKEN \}\}/);
 assert.match(text,/SUPABASE_PROJECT_ID: \$\{\{ secrets.SUPABASE_PROJECT_ID \}\}/);
 const jobCondition=text.split('\n').find(line=>line.startsWith('    if:'));
 assert.equal(jobCondition?.trim(),"if: github.ref == 'refs/heads/main' && github.workflow_sha == github.sha && github.run_attempt == 1");
 assert.match(text,/PILOT_RESET_LOCAL_CUSTODY_ENABLED: \$\{\{ vars.PILOT_RESET_LOCAL_CUSTODY_ENABLED \}\}/);
 assert.match(text,/test "\$PILOT_RESET_LOCAL_CUSTODY_ENABLED" = reviewed-operation-only/);
 assert.ok(text.indexOf('test "$PILOT_RESET_LOCAL_CUSTODY_ENABLED"')<text.indexOf('- name: Check out exact main'));
});
