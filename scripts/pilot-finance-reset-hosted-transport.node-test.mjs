// Offline process/contract tests only. They do not issue SQL or emulate genuine
// Auth authority. Actual SQL proof is a separate disposable-database check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS, canonicalJson, hashBytes, hashSourceBytes, prepareOperatorPacket } from './pilot-finance-reset-operator-core.mjs';
import { HOSTED_ACTIONS, TRANSPORT_SOURCE_FILES, hostedBinding, digestJson, digestDatabaseJson, mutationSql, observationSql, validateArtifacts, validateZeroPlanText, timestampMicros } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { createHostedResetTransport, HOSTED_TRANSPORT_IMPLEMENTATION_GAPS, assertHostedTransportDispatchImplemented } from './pilot-finance-reset-hosted-transport.mjs';

const root=path.resolve(import.meta.dirname,'..'),id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const catalog=[{kind:'function',name:'app_private.synthetic_contract()',sha256:'b'.repeat(64)}];
async function fixture(rawOwnership=null) {
 const names=[...new Set([...SOURCE_ENTRYPOINTS,...TRANSPORT_SOURCE_FILES])].sort();
 const files=await Promise.all(names.map(async name=>[name,await readFile(path.join(root,name))]));
 const ledger=files.filter(([name])=>/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(name)).map(([name,bytes])=>{
  const body=bytes.toString('utf8').replace(/\r\n/g,'\n').replace(/^[\t\n\r ;]+/,'');
  return {version:name.split('/').at(-1).slice(0,14),name:name.split('/').at(-1).slice(15,-4),
   statements:[{byteLength:Buffer.byteLength(body),sha256:hashBytes(body)}]};
 });
 const ciphertext=Object.fromEntries(REQUIRED_ARTIFACTS.map(role=>[role,`synthetic-encrypted-${role}`]));
 const review={format:'nestory-protected-reset-review-v1',operation:{operationId:id(10),projectRef:'syntheticprojectrefa',organizationId:id(11),mainSha:'a'.repeat(40),
  sourceGeneration:0,targetGeneration:1,cutoff:'2026-10-01',issueDate:'2026-10-01',timezone:'Asia/Phnom_Penh',
  executionBusinessDate:'2026-10-23',invoiceDatePolicy:'original-reviewed-october'},schemaSha256:digestJson(catalog),
  ledgerSha256:digestJson(ledger),sourceSnapshotSha256:'d'.repeat(64),archiveRows:1,actionCount:1,
  databaseBinding:Object.fromEntries(['manifestSha256','planSha256','archiveSha256','actionSha256','zeroReviewSha256','continuationSemanticSha256','reportReviewSha256']
   .map((key,index)=>[key,String(index+1).repeat(64)])),artifacts:Object.fromEntries(Object.entries(ciphertext).map(([key,value])=>[key,hashBytes(value)]))};
 const zeroPlanBase={operation_id:review.operation.operationId,organization_id:review.operation.organizationId,
  manifest_sha256:review.databaseBinding.manifestSha256,reset_plan_sha256:review.databaseBinding.planSha256,
  effective_date:review.operation.cutoff,maker_actor_id:id(1),reviewer_actor_id:id(2),currencies:['USD'],scopes:[]};
 const zeroPlanText=rawOwnership===null?JSON.stringify(zeroPlanBase):JSON.stringify(zeroPlanBase).replace('"scopes":[]',`"scopes":[{"ownership_percent":${rawOwnership}}]`);
 review.databaseBinding.zeroReviewSha256=hashBytes(zeroPlanText);
 const packet=prepareOperatorPacket({review,artifacts:ciphertext,candidateHead:review.operation.mainSha,sources:files.map(([name,bytes])=>({path:name,sha256:hashSourceBytes(bytes)}))});
 const o=packet.operation,b=packet.databaseBinding;
 const rowText=JSON.stringify({id:id(30),organization_id:o.organizationId,notes:"reviewed \\ path ' quote",amount:'1000.00'});
 const action={action_id:id(31),ordinal:1,relation_name:'public.financial_month_locks',primary_key:{id:id(30)},kind:'archive-delete',
  before_row_text:rowText,before_sha256:hashBytes(rowText),after_row_text:null,after_sha256:null,changed_columns:[]};
 const operation={operation_id:o.operationId,organization_id:o.organizationId,operation_kind:'reset',restore_of:null,source_generation:0,target_generation:1,
  manifest_sha256:b.manifestSha256,plan_sha256:b.planSha256,schema_sha256:packet.schemaSha256,archive_sha256:b.archiveSha256,action_sha256:b.actionSha256,
  archive_count:1,action_count:1,audit_timestamp:'2026-10-23T12:00:00Z',audit_actor:null};
 const artifacts={manifest:{manifest_sha256:b.manifestSha256,source_snapshot_sha256:packet.sourceSnapshotSha256,schema_sha256:packet.schemaSha256,ledger_sha256:packet.ledgerSha256},
  actions:{operation,actions:[action]},archive:[{relation_name:action.relation_name,primary_key:action.primary_key,row_text:rowText,row_sha256:action.before_sha256}],
  zeroPlan:JSON.parse(zeroPlanText),zeroPlanText,
  continuationPlan:{version:3,actor_id:id(1),billing_period_start:o.cutoff,issue_date:o.issueDate,
   execution_business_date:o.executionBusinessDate,invoice_date_policy:o.invoiceDatePolicy,leases:[{lease_id:id(44),monthly_rent:'1000.00'}]},
  reportPlan:{report_review_sha256:b.reportReviewSha256}};
 const binding=hostedBinding(packet,artifacts.continuationPlan);
 const observation={catalog,ledger,businessDate:o.executionBusinessDate,timezone:o.timezone,sourceSha256:packet.sourceSnapshotSha256,foreignSha256:'e'.repeat(64),
  control:null,reservation:null,recoveryReservation:null,recoveryCheckpoint:null,operation:null,appliedCount:0,archiveCount:0,actionCount:0,
  capabilityCount:0,zero:null,continuation:null,phaseFences:[],approvalCount:0,checkpoint:null,authorization:null,actionReceipt:null};
 return {packet,artifacts,binding,observation};
}
async function harness(config={}) {
 const f=await fixture(config.rawOwnership??null),calls=[],records=new Map(),events=[],authorization=Object.freeze({syntheticOpaqueHandle:true});
 const connection={expectedProjectRef:f.packet.operation.projectRef,host:`db.${f.packet.operation.projectRef}.supabase.co`,port:5432,database:'postgres',user:'postgres',
  psqlPath:'/protected/bin/psql',sslRootCertPath:'/protected/root.crt',passwordFilePath:'/protected/pgpass'};
 const input={...f,calls,records,events,authorization,connection};
 const ports={packet:f.packet,connection,artifacts:{async read(role){events.push(`artifact:${role}`);return Buffer.from(role==='zeroPlan'?f.artifacts.zeroPlanText:JSON.stringify(f.artifacts[role]));},
   async inspectRecoveryCheckpoint(){return Object.freeze({opaqueSyntheticCheckpoint:true});}},
  journal:{async read(key){return records.get(key)??null;},async putIfAbsent(key,body){events.push(key.endsWith('/intent')?'intent':'receipt');
   if(records.has(key))return 'exists';records.set(key,body);return 'created';}},
  runtime:{async assertCurrent(){events.push('runtime');return {authoritySha256:'f'.repeat(64)};}},
  actor:{async consume(value,{action,binding}){assert.equal(value,authorization);return {authorizationId:id(99),binding,action};}},
  spawnProcess(executable,args,options){
   const call={executable,args,options,input:''};calls.push(call);
   const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
   child.stdin=new Writable({write(bytes,enc,cb){call.input+=bytes.toString();cb();},final(cb){cb();queueMicrotask(()=>{
    const mutation=call.input.startsWith('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;');events.push(mutation?'mutation':'observe');
    if(mutation) {
     config.mutate?.(input,call);
     if(!config.noCommit) {
      f.observation.control={status:'frozen',generation:1,cutoff:'2026-10-01'};
      f.observation.reservation={binding:f.binding,bindingSha256:'7'.repeat(64),foreignSha256:f.observation.foreignSha256,backendPid:81,transactionId:'12345'};
      f.observation.authorization={authorizationId:id(99),status:'consumed',bindingMatches:true,backendPid:81,transactionId:'12345',expiresAt:'2026-10-23T12:15:00Z'};
     }
     if(config.lostReply){child.stderr.write('SYNTHETIC_PRIVATE_DRIVER_DETAIL');child.emit('close',1,null);return;}
     child.emit('close',0,null);
    } else {config.beforeRead?.(input,call);child.stdout.write(JSON.stringify(f.observation));child.emit('close',0,null);}
   });}});return child;
  }};
 config.configure?.(input,ports);input.ports=ports;input.transport=createHostedResetTransport(ports);return input;
}
const mutationCalls=h=>h.calls.filter(c=>c.input.startsWith('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;'));
function seedIntent(h,action='freeze') {
 const intent={format:'nestory-hosted-reset-action-intent-v1',operationId:h.packet.operation.operationId,packetSha256:h.packet.packetSha256,
  action,bindingSha256:digestJson(h.binding),authorizationId:id(99),authoritySha256:'f'.repeat(64),sourceObservationSha256:digestJson(h.observation),sqlSha256:'a'.repeat(64)};
 h.records.set(`financial-reset/${h.packet.operation.operationId}/hosted-action/${action}/intent`,canonicalJson(intent));return intent;
}
function seedCommittedFreeze(h) {
 h.observation.control={status:'frozen',generation:1,cutoff:'2026-10-01'};
 h.observation.reservation={binding:h.binding,bindingSha256:'7'.repeat(64),foreignSha256:h.observation.foreignSha256,backendPid:81,transactionId:'12345'};
 h.observation.authorization={authorizationId:id(99),actorId:id(1),status:'consumed',bindingMatches:true,backendPid:81,transactionId:'12345',expiresAt:'2026-10-23T12:15:00Z'};
}
function seedCommittedStage(h,action) {
 seedCommittedFreeze(h);const o=h.observation;
 o.recoveryCheckpoint={bindingSha256:o.reservation.bindingSha256,sourceSha256:h.packet.sourceSnapshotSha256,
  foreignSha256:o.foreignSha256,backendPid:80,transactionId:'12344',authoritySha256:'f'.repeat(64)};
 o.operation={...structuredClone(h.artifacts.actions.operation),status:action==='prepare'?'prepared':'sealed'};
 o.archiveCount=h.packet.archiveRows;o.actionCount=h.packet.actionCount;
 o.zero=action==='seal'?{status:'prepared',reviewSha256:h.binding.zero_review_sha256,planSha256:h.binding.zero_review_sha256,plan:structuredClone(h.artifacts.zeroPlan)}:null;
 o.actionReceipt={operationId:h.binding.operation_id,organizationId:h.binding.organization_id,action,binding:structuredClone(h.binding),
  bindingSha256:o.reservation.bindingSha256,authorizationId:id(99),authoritySha256:'f'.repeat(64),actorId:id(1),backendPid:81,transactionId:'12345',
  sha256:'a'.repeat(64),hashValid:true,result:{version:1,action,operation:structuredClone(o.operation),archiveCount:h.packet.archiveRows,actionCount:h.packet.actionCount,
   appliedCount:0,archiveSha256:h.binding.archive_sha256,actionSha256:h.binding.action_sha256,zero:structuredClone(o.zero)}};
}

test('construction dispatches nothing and rejects arbitrary connection or operation selectors',async()=>{
 const h=await harness();assert.equal(h.calls.length,0);
 assert.throws(()=>createHostedResetTransport({...h.ports,sql:'DELETE FROM public.people'}),/options_invalid/);
 assert.throws(()=>createHostedResetTransport({...h.ports,connection:{...h.connection,host:'elsewhere.example'}}),/connection_invalid/);
 assert.throws(()=>createHostedResetTransport({...h.ports,connection:{...h.connection,port:6543}}),/connection_invalid/);
 await assert.rejects(h.transport.dispatch({action:'reopen',authorization:h.authorization}),/action_invalid/);
 await assert.rejects(h.transport.dispatch({action:'freeze',authorization:h.authorization,actorId:id(1)}),/action_invalid/);
 assert.equal(h.calls.length,0);
});

test('inspection independently reads catalog and complete ledger with fixed TLS and no inherited environment',async()=>{
 const h=await harness();await h.transport.inspect();assert.equal(h.calls.length,1);
 const c=h.calls[0];assert.match(c.input,/REPEATABLE READ READ ONLY/);assert.match(c.input,/pg_get_functiondef/);assert.match(c.input,/pg_get_triggerdef/);
 assert.match(c.input,/schema_migrations/);assert.equal(c.options.shell,false);assert.equal(c.options.env.PGSSLMODE,'verify-full');
 assert.equal(c.options.env.PGPASSFILE,h.connection.passwordFilePath);assert.equal(c.options.env.PGPASSWORD,undefined);
 assert.equal(c.options.env.PGOPTIONS,undefined);assert.equal(c.options.env.PGSERVICE,undefined);
 assert.equal(c.args.join(' ').includes(h.connection.passwordFilePath),false);
});

test('wrong installed schema and ledger fail before any mutation even when operation metadata is copied',async()=>{
 for(const key of ['catalog','ledger']) {
  const h=await harness({configure(h){h.observation[key]=[];}});
  await assert.rejects(h.transport.inspect(),/installed_schema_or_ledger_changed/);
  assert.equal(mutationCalls(h).length,0);assert.equal(h.records.size,0);
 }
});

test('packet source drift is checked from disk before a process starts',async()=>{
 const h=await harness();h.packet.sourceFiles.find(s=>s.path.includes('transport.mjs')).sha256='0'.repeat(64);
 h.packet.sourcesSha256=digestJson(h.packet.sourceFiles);const body={...h.packet};delete body.packetSha256;h.packet.packetSha256=digestJson(body);
 const transport=createHostedResetTransport({...h.ports,packet:h.packet});
 await assert.rejects(transport.inspect(),/source_changed/);assert.equal(h.calls.length,0);
});

test('decrypted artifacts are authenticated by their reader, not compared to ciphertext packet hashes',async()=>{
 const h=await harness();assert.notEqual(hashBytes(JSON.stringify(h.artifacts.archive)),h.packet.artifacts.archive.sha256);
 await h.transport.inspect();assert.equal(h.calls.length,1);
});

test('exact scoped images and closed registry reject unreviewed relations, foreign rows and extra SQL',async()=>{
 const f=await fixture();
 for(const mutate of [a=>{a.actions.actions[0].relation_name='public.people';},a=>{a.actions.sql='delete everything';},
  a=>{const r=a.actions.actions[0];r.before_row_text=JSON.stringify({id:id(30),organization_id:id(500)});r.before_sha256=hashBytes(r.before_row_text);}]) {
  const a=structuredClone(f.artifacts);mutate(a);assert.throws(()=>validateArtifacts(f.packet,a),/hosted_transport_/);
 }
});

test('every mutation is blocked before private artifacts, runtime, journal or process access while integration is incomplete',async()=>{
 const h=await harness();assert.equal(Object.isFrozen(HOSTED_TRANSPORT_IMPLEMENTATION_GAPS),true);
 assert.throws(assertHostedTransportDispatchImplemented,/integration_incomplete/);
 for(const action of HOSTED_ACTIONS)await assert.rejects(h.transport.dispatch({action,authorization:h.authorization}),/integration_incomplete/);
 assert.equal(h.calls.length,0);assert.equal(h.events.length,0);assert.equal(h.records.size,0);
});

test('read-only reconciliation settles original freeze from immutable reservation and consumed authorization sharing a transaction',async()=>{
 const h=await harness();seedIntent(h);seedCommittedFreeze(h);
 const before=[...h.records.entries()];const result=await h.transport.reconcile({action:'freeze'});
 assert.equal(result.outcome,'committed-and-verified');assert.equal(mutationCalls(h).length,0);assert.equal(h.calls.length,1);
 assert.deepEqual([...h.records.entries()],before);assert.equal(result.normalWritesReopened,false);
});

test('unknown or absent commit stays quarantined across a new transport instance; reconciliation is read only',async()=>{
 const h=await harness();seedIntent(h);
 const next=createHostedResetTransport(h.ports);
 await assert.rejects(next.dispatch({action:'freeze',authorization:h.authorization}),/integration_incomplete/);
 const result=await next.reconcile({action:'freeze'});assert.equal(result.outcome,'not-proven-do-not-retry');assert.equal(result.mutationRetried,false);
 assert.equal(mutationCalls(h).length,0);
});

test('reconciliation rejects malformed original intent metadata before database inspection',async()=>{
 for(const change of [i=>{i.format='other';},i=>{i.operationId=id(500);},i=>{i.extra=true;},i=>{i.authoritySha256='invalid';},
  i=>{delete i.sqlSha256;},i=>{i.sourceObservationSha256='bad';},i=>{i.bindingSha256='b'.repeat(64);}]) {
  const h=await harness();const intent=seedIntent(h);change(intent);
  h.records.set(`financial-reset/${h.packet.operation.operationId}/hosted-action/freeze/intent`,JSON.stringify(intent));
  await assert.rejects(h.transport.reconcile({action:'freeze'}),/original_intent_mismatch/);assert.equal(h.calls.length,0);
 }
});

test('date rollover does not fabricate a retry or invalidate read-only proof of an earlier committed freeze',async()=>{
 const h=await harness();seedIntent(h);seedCommittedFreeze(h);h.observation.businessDate='2026-10-24';
 assert.equal((await h.transport.reconcile({action:'freeze'})).outcome,'committed-and-verified');
 assert.equal(mutationCalls(h).length,0);
});

test('checked reset uses one READ COMMITTED backend and real actor consumer, preserving reviewed semantics',async()=>{
 const f=await fixture();const sql=mutationSql({...f,action:'execute',authorizationId:id(99),authoritySha256:'f'.repeat(64),recovery:null});
 for(const command of ['start_financial_reset_actions','arm_financial_reset_action','complete_financial_reset_actions','apply_financial_reset_known_zero',
  'prepare_financial_reset_continuation','apply_financial_reset_continuation','apply_financial_reset_reports'])assert.ok(sql.includes(command));
 const zero=sql.indexOf('apply_financial_reset_known_zero'),snapshot=sql.indexOf("'source_sha256',app_private.financial_reset_hash");assert.ok(snapshot>zero);
 assert.match(sql,/READ COMMITTED/);assert.doesNotMatch(sql,/REPEATABLE READ|request\.jwt|SET ROLE|auth\.uid\(\)\s*:=/);
 assert.equal((sql.match(/^BEGIN TRANSACTION/gm)??[]).length,1);assert.equal((sql.match(/^COMMIT;/gm)??[]).length,1);
 assert.ok(sql.indexOf('standard_conforming_strings=on')<sql.indexOf('DO $catalog$'));
 assert.ok(observationSql(f.packet,f.binding,id(99),'execute').includes("'execute')"));assert.equal(Object.hasOwn(f.binding,'_action'),false);
 assert.ok(sql.includes("reviewed \\\\ path '' quote"));
});

test('separate recovery review is required for read-only recovery reconciliation',async()=>{
 const h=await harness();for(const action of ['prepare-recovery','execute-recovery'])
  await assert.rejects(h.transport.reconcile({action}),/separate_recovery_review_required/);
 assert.equal(h.calls.length,0);assert.equal(h.records.size,0);
 assert.deepEqual(HOSTED_ACTIONS,['freeze','checkpoint','prepare','seal','execute','prepare-recovery','execute-recovery']);
});

test('checkpoint reconciliation requires the persisted authority digest to match the exact intent',async()=>{
 const h=await harness();seedIntent(h,'checkpoint');seedCommittedFreeze(h);
 h.observation.recoveryCheckpoint={bindingSha256:h.observation.reservation.bindingSha256,sourceSha256:h.packet.sourceSnapshotSha256,
  foreignSha256:h.observation.foreignSha256,backendPid:81,transactionId:'12345',authoritySha256:'0'.repeat(64)};
 assert.equal((await h.transport.reconcile({action:'checkpoint'})).outcome,'not-proven-do-not-retry');
 h.observation.recoveryCheckpoint.authoritySha256='f'.repeat(64);
 assert.equal((await h.transport.reconcile({action:'checkpoint'})).outcome,'committed-and-verified');
 assert.equal(mutationCalls(h).length,0);
});
test('prepare and seal record the receipt after the complete fixed stage and before the only COMMIT',async()=>{
 const f=await fixture();for(const action of ['prepare','seal']) {
  const sql=mutationSql({...f,action,authorizationId:id(99),authoritySha256:'f'.repeat(64),recovery:null});
  const receipt=sql.indexOf('record_financial_reset_hosted_action_receipt');
  const lastStage=sql.indexOf(action==='prepare'?'prepare_financial_reset_actions':'prepare_financial_reset_zero_plan');
  assert.ok(lastStage>sql.indexOf('consume_financial_reset_actor_authorization'));
  assert.ok(receipt>lastStage&&receipt<sql.indexOf('COMMIT;'));
  assert.equal((sql.match(/^COMMIT;/gm)??[]).length,1);
  assert.match(observationSql(f.packet,f.binding,id(99),action),/financial_reset_hosted_action_receipts/);
 }
});
test('seal preserves the reviewed PostgreSQL numeric text instead of reserializing financial decimals',async()=>{
 for(const rawOwnership of ['100.000','37.1250']) {
  const f=await fixture(rawOwnership);
  assert.doesNotThrow(()=>validateArtifacts(f.packet,f.artifacts));
  assert.notEqual(hashBytes(JSON.stringify(f.artifacts.zeroPlan)),f.binding.zero_review_sha256);
  const sql=mutationSql({...f,action:'seal',authorizationId:id(99),authoritySha256:'f'.repeat(64)});
  assert.ok(sql.includes(`'${f.artifacts.zeroPlanText.replace(/'/g,"''")}'::jsonb`));
  assert.ok(sql.includes(`"ownership_percent":${rawOwnership}`));
  assert.equal(hashBytes(validateZeroPlanText(f.artifacts,f.binding.zero_review_sha256)),f.binding.zero_review_sha256);
 }
});

test('missing, changed or mismatched zero-plan raw text fails before generating a seal transaction',async()=>{
 const f=await fixture('100.000');
 for(const change of [a=>{delete a.zeroPlanText;},a=>{a.zeroPlanText=JSON.stringify(a.zeroPlan);},
  a=>{a.zeroPlanText+=' ';},a=>{a.zeroPlan.scopes[0].ownership_percent=99;}]) {
  const artifacts=structuredClone(f.artifacts);change(artifacts);
  assert.throws(()=>validateArtifacts(f.packet,artifacts),/zero_plan_text_/);
  assert.throws(()=>mutationSql({...f,artifacts,action:'seal',authorizationId:id(99),authoritySha256:'f'.repeat(64)}),/zero_plan_text_/);
 }
 assert.throws(()=>validateZeroPlanText({zeroPlanText:'{',zeroPlan:{}},hashBytes('{')),/zero_plan_text_invalid/);
 assert.throws(()=>validateZeroPlanText({zeroPlanText:'null',zeroPlan:null},hashBytes('null')),/zero_plan_text_mismatch/);
});

test('read-only lost-seal-response reconciliation supports fractional values without changing the reviewed hash',async()=>{
 const h=await harness({rawOwnership:'37.1250'});seedIntent(h,'seal');seedCommittedStage(h,'seal');
 const result=await h.transport.reconcile({action:'seal'});
 assert.equal(result.outcome,'committed-and-verified');assert.equal(mutationCalls(h).length,0);
 assert.equal(h.observation.zero.reviewSha256,hashBytes(h.artifacts.zeroPlanText));
 assert.equal(result.observationSha256,digestDatabaseJson(h.observation));
});

test('parsed observation digests are deterministic metadata hashes and reject non-JSON values',()=>{
 assert.equal(digestDatabaseJson({b:[37.125,{a:100}],a:true}),digestDatabaseJson({a:true,b:[37.125,{a:100}]}));
 assert.notEqual(digestDatabaseJson({value:37.125}),digestDatabaseJson({value:37.126}));
 for(const value of [NaN,Infinity,undefined,{value:undefined},new Date(),[,,]])
  assert.throws(()=>digestDatabaseJson(value),/database_observation_json_invalid/);
});

test('lost-response prepare and seal reconciliation requires immutable receipts and never mutates',async()=>{
 for(const action of ['prepare','seal']) {
  const h=await harness();seedIntent(h,action);seedCommittedStage(h,action);const before=[...h.records.entries()];
  const result=await createHostedResetTransport(h.ports).reconcile({action});
  assert.equal(result.outcome,'committed-and-verified');assert.equal(result.actionReceiptSha256,'a'.repeat(64));
  assert.equal(result.mutationRetried,false);assert.equal(mutationCalls(h).length,0);assert.deepEqual([...h.records.entries()],before);
  h.observation.actionReceipt=null;
  assert.equal((await h.transport.reconcile({action})).outcome,'not-proven-do-not-retry');
 }
});
test('prepare and seal cannot be proven by copied mutable state, a consumed actor, or another transaction receipt',async()=>{
 const changes=[r=>{r.authorizationId=id(98);},r=>{r.actorId=id(2);},r=>{r.backendPid=82;},r=>{r.transactionId='12346';},
  r=>{r.transactionId=12345;},r=>{r.hashValid=false;},r=>{r.binding.packet_sha256='0'.repeat(64);},
  r=>{r.binding.sources_sha256='0'.repeat(64);},r=>{r.binding.main_sha='0'.repeat(40);},r=>{r.binding.schema_sha256='0'.repeat(64);},
  r=>{r.binding.ledger_sha256='0'.repeat(64);},r=>{r.binding.source_snapshot_sha256='0'.repeat(64);},r=>{r.binding.action_sha256='0'.repeat(64);},
  r=>{r.operationId=id(500);},r=>{r.organizationId=id(500);},r=>{r.action='freeze';},r=>{r.authoritySha256='0'.repeat(64);},
  r=>{r.result.actionCount=2;},r=>{r.result.archiveSha256='0'.repeat(64);},r=>{r.result.appliedCount=1;},
  r=>{r.result.operation.status='actions_complete';},r=>{r.result.operation.audit_timestamp='2026-10-01T00:00:00Z';}];
 for(const action of ['prepare','seal'])for(const change of changes) {
  const h=await harness();seedIntent(h,action);seedCommittedStage(h,action);change(h.observation.actionReceipt);
  assert.equal((await h.transport.reconcile({action})).outcome,'not-proven-do-not-retry');assert.equal(mutationCalls(h).length,0);
 }
});
test('receipt persists proof of its earlier committed stage after current status advances and business date rolls over',async()=>{
 for(const action of ['prepare','seal']) {
  const h=await harness();seedIntent(h,action);seedCommittedStage(h,action);
  h.observation.operation.status='actions_complete';h.observation.businessDate='2026-10-24';h.observation.appliedCount=1;
  h.observation.actionReceipt.result.operation.audit_timestamp='2026-10-23T12:00:00+00:00';
  assert.equal((await h.transport.reconcile({action})).outcome,'committed-and-verified');
  assert.equal(mutationCalls(h).length,0);
 }
});
test('exact operation timestamp comparison preserves PostgreSQL microseconds across equivalent timezone spellings',async()=>{
 for(const action of ['prepare','seal']) {
  const h=await harness();h.artifacts.actions.operation.audit_timestamp='2026-10-23T12:00:00.000001Z';
  seedIntent(h,action);seedCommittedStage(h,action);
  for(const value of ['2026-10-23T19:00:00.000001+07:00','2026-10-23T07:00:00.000001-05:00','2026-10-24T02:00:00.000001+14:00']) {
   h.observation.actionReceipt.result.operation.audit_timestamp=value;
   assert.equal((await h.transport.reconcile({action})).outcome,'committed-and-verified');
  }
  for(const value of ['2026-10-23T12:00:00.000002+00:00','2026-10-23T12:00:00.000999+00:00','2026-10-23T12:00:00Z']) {
   h.observation.actionReceipt.result.operation.audit_timestamp=value;
   assert.equal((await h.transport.reconcile({action})).outcome,'not-proven-do-not-retry');
  }
  assert.equal(mutationCalls(h).length,0);
 }
});

test('timestamp validation rejects invalid dates and precision before accepting an artifact or receipt',async()=>{
 const invalid=[null,1,'invalid','2026-02-30T12:00:00Z','2025-02-29T12:00:00Z','2026-10-32T12:00:00Z',
  '2026-13-01T12:00:00Z','2026-10-23T24:00:00Z','2026-10-23T12:60:00Z','2026-10-23T12:00:60Z',
  '2026-10-23T12:00:00+24:00','2026-10-23T12:00:00+07:60','2026-10-23T12:00:00.0000001Z',
  '2026-10-23T12:00:00','0000-01-01T00:00:00Z'];
 for(const value of invalid)assert.equal(timestampMicros(value),null,`${value}`);
 assert.equal(timestampMicros('1969-12-31T23:59:59.999999Z'),-1n);
 assert.equal(timestampMicros('2024-02-29T12:00:00.1Z'),timestampMicros('2024-02-29T19:00:00.100000+07:00'));
 const f=await fixture();
 for(const value of invalid) {
  const artifacts=structuredClone(f.artifacts);artifacts.actions.operation.audit_timestamp=value;
  assert.throws(()=>validateArtifacts(f.packet,artifacts),/operation_artifact_invalid/);
 }
 for(const action of ['prepare','seal']) {
  const h=await harness();seedIntent(h,action);seedCommittedStage(h,action);
  for(const value of invalid) {
   h.observation.actionReceipt.result.operation.audit_timestamp=value;
   assert.equal((await h.transport.reconcile({action})).outcome,'not-proven-do-not-retry');
  }
  assert.equal(mutationCalls(h).length,0);
 }
});
test('seal receipt requires its exact immutable zero plan and preparation receipt carries no zero result',async()=>{
 for(const action of ['prepare','seal']) {
  const h=await harness();seedIntent(h,action);seedCommittedStage(h,action);
  if(action==='prepare')h.observation.actionReceipt.result.zero={status:'prepared'};
  else h.observation.actionReceipt.result.zero.plan.reviewer_actor_id=id(99);
  assert.equal((await h.transport.reconcile({action})).outcome,'not-proven-do-not-retry');
 }
});
test('recovery-only native contract rows pass the closed phase projection without broadening reset deletion',async()=>{
 const f=await fixture();
 const reviewFor=a=>({artifactSha256:'8'.repeat(64),review:{operation:{...f.artifacts.actions.operation,operation_id:id(60),operation_kind:'restore',
  restore_of:f.binding.operation_id,source_generation:1,target_generation:2,plan_sha256:'9'.repeat(64)},actions:[a],
  phaseBinding:{report_checkpoint_sha256:'a'.repeat(64)},phaseBindingSha256:'b'.repeat(64),executionBusinessDate:'2026-10-23'}});
 const actionFor=(relation,kind,after=null)=>{
  const before={id:id(30),organization_id:f.binding.organization_id,status:'expired',rent:'1000.00'};
  const beforeText=JSON.stringify(before),afterText=after?JSON.stringify({...before,...after}):null;
  return {...f.artifacts.actions.actions[0],relation_name:relation,kind,before_row_text:beforeText,before_sha256:hashBytes(beforeText),
   after_row_text:afterText,after_sha256:afterText?hashBytes(afterText):null,changed_columns:after?Object.keys(after):[]};
 };
 for(const relation of ['public.lease_terms','public.lease_billing_terms']) {
  const a=actionFor(relation,'recovery-prune');
  assert.doesNotThrow(()=>validateArtifacts(f.packet,f.artifacts,reviewFor(a)));
  const reset=structuredClone(f.artifacts);reset.actions.actions[0]={...a,kind:'archive-delete'};
  assert.throws(()=>validateArtifacts(f.packet,reset),/action_outside_closed_registry/);
 }
 assert.doesNotThrow(()=>validateArtifacts(f.packet,f.artifacts,reviewFor(actionFor('public.lease_terms','recovery-repair',{status:'active'}))));
 const decimal=actionFor('public.lease_terms','recovery-repair',{status:'active'});
 decimal.before_row_text=decimal.before_row_text.replace('"1000.00"','1000.25').replace('"status"','"large":9007199254740993,"status"');
 decimal.after_row_text=decimal.after_row_text.replace('"1000.00"','1000.25').replace('"status"','"large":9007199254740993,"status"');
 decimal.before_sha256=hashBytes(decimal.before_row_text);decimal.after_sha256=hashBytes(decimal.after_row_text);
 assert.doesNotThrow(()=>validateArtifacts(f.packet,f.artifacts,reviewFor(decimal)));
 const roundedChange={...decimal,after_row_text:decimal.after_row_text.replace('9007199254740993','9007199254740992')};
 roundedChange.after_sha256=hashBytes(roundedChange.after_row_text);
 assert.throws(()=>validateArtifacts(f.packet,f.artifacts,reviewFor(roundedChange)),/recovery_repair_invalid/);
 for(const value of ['2026-02-30T12:00:00Z','2026-10-23T12:00:00.0000001Z']) {
  const recovery=reviewFor(decimal);recovery.review.operation.audit_timestamp=value;
  assert.throws(()=>validateArtifacts(f.packet,f.artifacts,recovery),/recovery_review_binding_invalid/);
 }
 for(const a of [actionFor('public.leases','recovery-prune'),actionFor('public.lease_deposits','recovery-prune'),
  actionFor('public.lease_billing_terms','recovery-repair',{status:'active'}),
  actionFor('public.lease_terms','recovery-repair',{status:'active',rent:'1500.00'}),
  {...actionFor('public.lease_terms','recovery-repair',{status:'active'}),changed_columns:['updated_at']}]) {
  assert.throws(()=>validateArtifacts(f.packet,f.artifacts,reviewFor(a)),/hosted_transport_/);
 }
});
