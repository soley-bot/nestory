import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {createPilotRamRehearsalPlanner,buildPilotRamInversePlan,inspectPilotRamRehearsalPlan} from './local-backup-ram-rehearsal-plan.mjs';
import {pilotRamPlanFixture as fixture} from './fixtures/local-backup-ram-plan-fixture.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org='752a87b8-bd04-4a45-9cb8-00687af66e73';

test('planning SQL reuses graph policy and requires fixed local socket/captured baseline before exposing any rows',()=>{
  const f=fixture(),preview=f.planner.previewSql(),materialize=f.planner.materializeSql(f.preview);
  assert.match(preview,/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(preview,/data_directory'\)<>'\/db\/pg'/);assert.match(preview,/inet_server_addr\(\) IS NOT NULL/);
  assert.match(preview,/pilot_ram_plan_baseline_count_changed/);assert.match(preview,/pilot_ram_plan_baseline_row_changed/);
  assert.ok(preview.indexOf('pilot_ram_captured_baseline')<preview.indexOf('WITH RECURSIVE'));
  assert.ok(preview.indexOf("timezone='UTC'")<preview.indexOf('pilot_ram_captured_baseline'));
  assert.ok(materialize.indexOf('standard_conforming_strings=on')<materialize.indexOf('pilot_ram_captured_baseline'));
  assert.match(preview,/pilot_ram_plan_empty_books_migration_required/);
  assert.match(materialize,/CREATE TEMP TABLE nestory_maintenance_materialized/);assert.match(materialize,/ROLLBACK;$/);
  assert.doesNotMatch(materialize,/consume_financial_reset_actor|PERFORM app_private.prepare_financial_reset_operation|SET ROLE|request\.jwt/);
  assert.ok(materialize.includes(f.preview.manifest_sha256));
});
test('strict planner does not accept arbitrary SQL/scope or relabeled synthetic inventory',()=>{
  const f=fixture();assert.throws(()=>createPilotRamRehearsalPlanner({...f,sql:'DELETE'}),/options_invalid/);
  assert.throws(()=>createPilotRamRehearsalPlanner({manifestBytes:f.manifestBytes,expectedSourceSha256:'f'.repeat(64),operationId:f.operationId}));
  f.snapshot.organizationId=id(1);const b=Buffer.from(JSON.stringify(f.snapshot));
  assert.throws(()=>createPilotRamRehearsalPlanner({manifestBytes:b,expectedSourceSha256:hash(b),operationId:f.operationId}),/scope_invalid/);
});
test('preview blockers, changed digest and added fields refuse materialization',()=>{
  const f=fixture();for(const p of [{...f.preview,accepted:false},{...f.preview,manifest_sha256:'f'.repeat(64)},{...f.preview,rawSql:'SELECT 1;'}])
    assert.throws(()=>f.planner.materializeSql(p),/pilot_ram_plan_/);
});
test('accepted materialization retains every master/contract/retired row and precision',()=>{
  const f=fixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization);
  assert.equal(plan.actions.length,4);assert.equal(plan.originalRows.length,6);assert.equal(plan.retainedRows.length,4);
  assert.match(plan.actions[0].action_id,/^[a-f0-9]{8}-[a-f0-9]{4}-2[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(plan.actions[0].action_id,f.materialization.actions[0].action_id);
  assert.match(plan.actions[0].after_row_text,/9007199254740993\.1200/);
  assert.equal(plan.retainedRows.find(r=>r.relation_name==='public.leases').row_text,plan.retainedRows.find(r=>r.relation_name==='public.leases').expected_row_text);
  assert.equal(plan.retainedRows.find(r=>r.relation_name==='app_private.financial_idempotency_requests').expected_row_text,f.retired.row_text);
  assert.equal(plan.actualResetRecoveryProven,false);assert.equal(plan.hostedExecutionSupported,false);
  assert.equal(Object.hasOwn(plan,'syntheticOnly'),false);assert.equal(Object.hasOwn(plan,'customerApproval'),false);
});
test('accepted readback exposes exact source and artifact digests without caller aliases or authority claims',()=>{
  const f=fixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization);
  assert.deepEqual(plan.materializationReadback,{summary:f.materialization.summary,summaryText:f.preview.summary_text,manifestSha256:f.preview.manifest_sha256,
    archiveDescriptorText:f.materialization.archive_descriptor_text,actionDescriptorText:f.materialization.action_descriptor_text});
  assert.ok(Object.isFrozen(plan.materializationReadback));assert.ok(Object.isFrozen(plan.materializationReadback.summary));
  assert.ok(Object.isFrozen(plan.materializationReadback.summary.counts));
  const original=plan.materializationReadback.summary.source_snapshot_sha256;
  f.materialization.summary.source_snapshot_sha256='f'.repeat(64);
  assert.equal(plan.materializationReadback.summary.source_snapshot_sha256,original);
  assert.throws(()=>{plan.materializationReadback.summary.source_snapshot_sha256='f'.repeat(64)},TypeError);
  assert.equal(plan.actualResetRecoveryProven,false);assert.equal(plan.hostedExecutionSupported,false);
});
test('server text is hashed exactly; compact JS digest cannot replace PostgreSQL witness',()=>{
 const f=fixture();assert.notEqual(f.preview.manifest_sha256,digestDatabaseJson(f.materialization.summary));
 assert.throws(()=>f.planner.materializeSql({...f.preview,manifest_sha256:digestDatabaseJson(f.materialization.summary)}),/canonical_text_changed/);
 for(const field of ['summary_text','archive_descriptor_text','action_descriptor_text','catalog_text','ledger_text']){
  const m=structuredClone(f.materialization);m[field]+=' ';assert.throws(()=>f.planner.acceptMaterialization(f.preview,m),/canonical_text_changed/);
 }
 assert.match(f.planner.previewSql(),/'summary_text',payload::text/);
 assert.match(f.planner.materializeSql(f.preview),/'catalog_text'/);
});
test('branded inspection retains distinct recovery and execution descriptors and rejects JSON copies',()=>{
 const f=fixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization),p=inspectPilotRamRehearsalPlan(plan);
 assert.equal(p.operationId,f.operationId);assert.equal(p.sourceSha256,f.expectedSourceSha256);
 assert.deepEqual(p.recoveryBaseline.ledger,f.snapshot.ledger);assert.equal(p.executionBaseline.ledgerText,f.materialization.ledger_text);
 assert.ok(Object.isFrozen(p.recoveryBaseline.ledger));assert.ok(Object.isFrozen(p.executionBaseline));
 assert.throws(()=>inspectPilotRamRehearsalPlan(structuredClone(plan)),/plan_provenance_missing/);
 f.snapshot.ledger[0].name='changed';assert.notEqual(p.recoveryBaseline.ledger[0].name,'changed');
});
for(const[name,change]of [
  ['archive substitution',v=>v.archive[0].row_text='{}'],['archive omission',v=>v.archive.pop()],['duplicate archive',v=>v.archive[1]=v.archive[0]],
  ['unrelated financial amount change',v=>{v.actions[0].after_row_text=v.actions[0].after_row_text.replace('9007199254740993.1200','9007199254740992.1200');v.actions[0].after_sha256=hash(v.actions[0].after_row_text)}],
  ['wrong after hash',v=>v.actions[0].after_sha256='f'.repeat(64)],['reordered ordinal',v=>v.actions[0].ordinal=2],
  ['changed action identity',v=>v.actions[0].primary_key={id:id(1000)}],['master deletion',v=>v.actions[0].relation_name='public.leases'],
  ['unlisted changed column',v=>v.actions[0].changed_columns.push('amount')],['missing cycle staging',v=>v.actions.splice(0,1)],
])test(`${name} is rejected without SQL execution`,()=>{const f=fixture(),m=structuredClone(f.materialization);change(m);assert.throws(()=>f.planner.acceptMaterialization(f.preview,m),/pilot_ram_plan_/)});
function phaseRow(n,table='public.owner_opening_balance_entries') {
  const before_row_text=JSON.stringify({id:id(n),organization_id:org,financial_generation:1});
  return {relation_name:table,primary_key:{id:id(n)},kind:'recovery-prune',before_row_text,after_row_text:null,before_sha256:hash(before_row_text),after_sha256:null,provenance:'known-zero'};
}
test('inverse restores parent before child, repairs cycle pointers, restores deposit header and leaves retired generation unchanged',()=>{
  const f=fixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization),ph=phaseRow(201);
  const inverse=buildPilotRamInversePlan(plan,{phaseSources:[ph],incomingEdges:[]});
  assert.equal(inverse.actions[0].kind,'recovery-prune');
  assert.deepEqual(inverse.actions.slice(1,3).map(a=>a.relation_name),['public.ledger_entries','public.finance_expense_items']);
  assert.equal(JSON.parse(inverse.actions[2].candidate_after_row_text).ledger_entry_id,null);
  assert.equal(JSON.parse(inverse.actions[3].candidate_after_row_text).ledger_entry_id,id(3));
  assert.match(inverse.actions[3].candidate_after_row_text,/9007199254740993\.1200/);
  assert.equal(JSON.parse(inverse.actions[3].candidate_after_row_text).financial_generation,2);
  assert.equal(inverse.actions.at(-1).candidate_after_row_text,f.deposit.row_text);
  assert.equal(inverse.originalRowsExpectedAfterInverse.find(r=>r.relation_name===f.retired.relation_name).expected_row_text,f.retired.row_text);
  assert.equal(inverse.actualResetRecoveryProven,false);assert.equal(inverse.typedAfterImageVerificationRequired,true);
  assert.equal(inverse.exactLifecycleDeltaVerificationRequired,true);
});
test('generated phase pruning honors observed edges and refuses missing sources, repair, old archive, and cycles',()=>{
  const f=fixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization),a=phaseRow(201),b=phaseRow(202,'public.owner_opening_balance_requests');
  const identity=r=>({relation_name:r.relation_name,primary_key:r.primary_key}),edge={source:identity(a),target:identity(b)};
  assert.deepEqual(buildPilotRamInversePlan(plan,{phaseSources:[b,a],incomingEdges:[edge]}).actions.slice(0,2).map(a=>a.primary_key.id),[id(201),id(202)]);
  for(const options of [
    {phaseSources:[a],incomingEdges:[edge]},
    {phaseSources:[a,b],incomingEdges:[edge,{source:identity(b),target:identity(a)}]},
    {phaseSources:[{...a,kind:'recovery-repair'}],incomingEdges:[]},
    {phaseSources:[{...a,relation_name:'public.leases'}],incomingEdges:[]},
    {phaseSources:[{...a,before_sha256:'f'.repeat(64)}],incomingEdges:[]},
  ])assert.throws(()=>buildPilotRamInversePlan(plan,options),/pilot_ram_plan_/);
  assert.throws(()=>buildPilotRamInversePlan(structuredClone(plan),{phaseSources:[],incomingEdges:[]}),/inverse_inputs_invalid/);
});
