import {rehearsalSqlFixture as fixture} from './fixtures/local-backup-rehearsal-sql-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_CAPTURE_POLICY} from './local-backup-capture.mjs';
import {buildRamActorFixtureSql,buildRamResetPrepareSql,buildRamResetExecuteSql,buildRamInverseReadbackSql,
 buildRamInverseCanonicalSql,buildRamInverseExecuteSql,buildRamRehearsalVerificationSql} from './local-backup-business-rehearsal-sql.mjs';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const builders=[buildRamResetPrepareSql,buildRamResetExecuteSql,buildRamInverseReadbackSql,buildRamInverseCanonicalSql,buildRamInverseExecuteSql,
 v=>buildRamRehearsalVerificationSql({...v,phase:'reset'}),v=>buildRamRehearsalVerificationSql({...v,phase:'recovered'})];
test('every SQL phase enforces the exact local socket and reviewed schema boundary',()=>{
 const v=fixture();for(const build of builders){const sql=build(v);assert.match(sql,/session_user<>'postgres'/);assert.match(sql,/inet_server_addr\(\) IS NOT NULL/);
 assert.match(sql,/current_setting\('data_directory'\)<>'\/db\/pg'/);assert.match(sql,/current_setting\('listen_addresses'\)<>''/);assert.match(sql,/20261027005615/);
 assert.match(sql,/execution_schema_changed/);assert.match(sql,/COMMIT;$/)}
});
test('synthetic actor creation rejects collisions and never rewrites customer actors or step-up policy',()=>{
 const sql=buildRamActorFixtureSql(fixture().fixture);assert.match(sql,/synthetic_actor_collision/);assert.match(sql,/@test\.invalid/);assert.match(sql,/step_up_policy_not_fixture_eligible/);
 assert.doesNotMatch(sql,/UPDATE (auth\.|app_private.privileged)/);assert.match(sql,/'customerAuthImpersonated',false/);
 assert.throws(()=>buildRamActorFixtureSql({...fixture().fixture,reviewer:id(1)}),/fixture_invalid/);
 assert.throws(()=>buildRamActorFixtureSql({...fixture().fixture,maker:"'; SELECT 1; --"}),/fixture_invalid/);
});
test('all plan builders reject unbranded or changed bindings',()=>{
 for(const build of builders){const v=fixture();assert.throws(()=>build({...v,plan:structuredClone(v.plan)}),/provenance_missing/);
 assert.throws(()=>build({...v,planBinding:{...v.planBinding,planSha256:'b'.repeat(64)}}),/binding_changed/)}
});
for(const [label,mutate]of[
 ['canonical zero text',p=>p.zeroPlanText=p.zeroPlanText.replace('100','50')],['fixture actor image',p=>p.fixtureRows[0].rowText+=' '],
 ['duplicate fixture actor',p=>p.fixtureRows[1]=p.fixtureRows[0]],['zero reviewer',p=>p.zeroPlan.reviewer_actor_id=id(91)],
 ['unbound continuation',p=>p.continuationPlanText=p.continuationPlanText.replace('2026-10-27','2026-10-28')],['extra phase',p=>p.ignored=true],
 ['invalid source revision',p=>p.reportRevisionBefore='1;drop table x'],
 ['invalid fixture transaction',p=>p.fixtureTransactionId='1;drop table x']
])test(`rejects ${label} before generating execution SQL`,()=>{const v=fixture();mutate(v.phases);assert.throws(()=>buildRamResetExecuteSql(v));});
test('reset uses native consumed authority and phase commands with bounded checkpoint output',()=>{
 const sql=buildRamResetExecuteSql(fixture());assert.match(sql,/SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated/);
 for(const token of ['approve_financial_reset_zero_plan','consume_financial_reset_actor_authorization','apply_financial_reset_known_zero','apply_financial_reset_continuation','apply_financial_reset_reports','assert_financial_reset_empty_sources'])assert.ok(sql.includes(token));
 assert.doesNotMatch(sql,/'checkpoint',\(SELECT result_json/);assert.match(sql,/'productionPermissionProven',false/);assert.match(sql,/9007199254740993\.1200/);
 const timing=sql.slice(sql.indexOf("'authorityTiming'"),sql.lastIndexOf("'authorityKind'"));
 assert.match(timing,/'consumedAgeSeconds',extract\(epoch FROM timing\.observed_at-a\.consumed_at\)/);
 assert.match(timing,/'remainingSeconds',extract\(epoch FROM a\.expires_at-timing\.observed_at\)/);
 assert.match(timing,/a\.action='execute' AND a\.consumed_at IS NOT NULL/);
 assert.match(timing,/a\.backend_pid=pg_backend_pid\(\) AND a\.transaction_id=pg_current_xact_id\(\)/);
 assert.equal((timing.match(/clock_timestamp\(\)/g)??[]).length,1);
 assert.doesNotMatch(timing,/'(authorizationId|actorId|sessionId)'|greatest\(/);
 assert.doesNotMatch(buildRamInverseExecuteSql(fixture()),/'authorityTiming'/);
});
test('preparation explicitly selects reviewed v4 scopes before a zero plan exists',()=>{
 const sql=buildRamResetPrepareSql(fixture());
 assert.match(sql,/jsonb_build_object\('version',4,'operation_id'/);
 assert.match(sql,/financial_reset_empty_zero_scope_on_date\(/);
 assert.match(sql,/prepare_financial_reset_empty_zero_plan\(/);
 assert.doesNotMatch(sql,/financial_reset_known_zero_scope\(/);
});

test('execution matches production statement budgets and reports fixed cancellation stages',()=>{
 const v=fixture(),sql=buildRamResetExecuteSql(v);
 const blocks=[...sql.matchAll(/^[ \t]*DO (\$[a-zA-Z0-9_]+\$) ([\s\S]*?) \1;/gm)].map(m=>m[2]);
 const sections=['endorsement','seal','authorize','native_start','native_arm','native_action','native_complete',
  'known_zero','continuation','reports','readback_checks'];
 for(const section of sections){
  const selected=blocks.filter(b=>b.includes(`MESSAGE='local_ram_rehearsal_execute_${section}_failed'`));
  assert.ok(selected.length,section);
  for(const b of selected){
   assert.match(b,/EXCEPTION WHEN query_canceled OR OTHERS THEN\s+RAISE EXCEPTION USING ERRCODE=SQLSTATE,/);
   assert.match(b,/DETAIL='', HINT=''/);
   assert.doesNotMatch(b,/SQLERRM|GET STACKED DIAGNOSTICS|RAISE (NOTICE|WARNING)/);
  }
 }
 for(const [section,call] of [['known_zero','apply_financial_reset_known_zero'],['continuation','prepare_financial_reset_continuation'],['reports','apply_financial_reset_reports']]){
  const b=blocks.find(b=>b.includes(`MESSAGE='local_ram_rehearsal_execute_${section}_failed'`));
  assert.ok(b.includes(call));
  for(const other of ['apply_financial_reset_known_zero','prepare_financial_reset_continuation','apply_financial_reset_reports'])
   if(other!==call)assert.ok(!b.includes(other),`${section} must have its own statement timeout`);
 }
 assert.equal(blocks.filter(b=>b.includes("MESSAGE='local_ram_rehearsal_execute_native_action_failed'")).length,v.plan.actions.length);
 assert.equal(blocks.filter(b=>b.includes("MESSAGE='local_ram_rehearsal_execute_native_arm_failed'")).length,v.plan.actions.length);
 const nativeStart=sql.indexOf('start_financial_reset_actions');
 assert.match(sql.slice(0,nativeStart),/SET LOCAL statement_timeout='60s'/);
 const afterStart=sql.slice(nativeStart);
 assert.deepEqual([...afterStart.matchAll(/SET LOCAL statement_timeout='([^']+)'/g)].map(m=>m[1]),['300s','60s']);
 assert.match(afterStart,/SET LOCAL statement_timeout='300s';\s+DO (\$[a-zA-Z0-9_]+\$) BEGIN\s+PERFORM app_private\.apply_financial_reset_known_zero\([^\n]+\);\s+EXCEPTION WHEN query_canceled OR OTHERS THEN\s+RAISE EXCEPTION USING ERRCODE=SQLSTATE, MESSAGE='local_ram_rehearsal_execute_known_zero_failed', DETAIL='', HINT='';\s+END \1;\s+SET LOCAL statement_timeout='60s';/);
 assert.equal((sql.match(/^BEGIN ISOLATION LEVEL READ COMMITTED;/gm)??[]).length,1);
 assert.equal((sql.match(/^ COMMIT;$/gm)??[]).length,1);
 assert.match(sql,/SET CONSTRAINTS ALL IMMEDIATE/);
});

test('report revisions preserve weighted baseline and add only the fixture and executed transaction entries',()=>{
 const v=fixture(),prepare=buildRamResetPrepareSql(v);
 assert.match(prepare,/SELECT coalesce\(sum\(revision\),0\)::text FROM app_private.financial_report_source_revisions/);
 assert.doesNotMatch(prepare,/SELECT revision::text FROM app_private.financial_report_source_revisions/);
 assert.match(buildRamActorFixtureSql(v.fixture),/'fixtureTransactionId',txid_current\(\)::text/);
 for(const phase of ['reset','recovered']){
  const sql=buildRamRehearsalVerificationSql({...v,phase});
  assert.match(sql,/sum\(\(row_text::jsonb->>'revision'\)::numeric\)/);
  assert.ok(sql.includes(`'last_transaction_id','${v.phases.fixtureTransactionId}'::bigint`));
  assert.match(sql,/'revision',1,'last_transaction_id',o.execution_xid::text::bigint/);
  assert.match(sql,/actual::text IS DISTINCT FROM expected::text/);
  assert.doesNotMatch(sql,/s\.revision=.*::bigint\+[12]/);
  // Current revision rows cannot become expected rows through lifecycle adoption.
  const adoption=sql.match(/FOR r IN SELECT \* FROM jsonb_to_recordset\('([^\n]+)'::jsonb\) x\(table_name text\) LOOP/);
  assert.ok(adoption);
  assert.ok(!JSON.parse(adoption[1]).some(r=>r.table_name==='app_private.financial_report_source_revisions'));
 }
 for(const fixtureTransactionId of [undefined,'0','01','-1','9223372036854775808','1; SELECT 1'])
  assert.throws(()=>buildRamResetPrepareSql({...v,fixtureTransactionId}),/fixture_transaction_invalid/);
});

test('prepare diagnostics identify seven fixed sections without changing error state or exposing native details',()=>{
 const sql=buildRamResetPrepareSql(fixture());
 const sections=[['operation','prepare_financial_reset_operation'],['archive','archive_financial_reset_rows'],
  ['actions','prepare_financial_reset_actions'],['zero_scope','financial_reset_empty_zero_scope_on_date'],
  ['continuation','assert_financial_reset_empty_semantic'],['zero_plan','prepare_financial_reset_empty_zero_plan'],
  ['readback','CREATE TEMP TABLE ram_prepare_readback']];
 let previous=-1;
 for(const [section,call]of sections){
  const tag=`local_ram_rehearsal_prepare_${section}_failed`,start=sql.indexOf(call),end=sql.indexOf(`MESSAGE='${tag}'`);
  assert.ok(start>previous&&end>start,section);
  const block=sql.slice(start,end);
  assert.match(block,/EXCEPTION WHEN OTHERS THEN\s+RAISE EXCEPTION USING ERRCODE=SQLSTATE, $/);
  assert.equal(sql.split(tag).length-1,1);previous=end;
 }
 assert.equal((sql.match(/DETAIL='', HINT=''/g)??[]).length,7);
 assert.doesNotMatch(sql,/SQLERRM|GET STACKED DIAGNOSTICS|RAISE (NOTICE|WARNING)|WHEN OTHERS THEN\s+NULL/);
 assert.equal((sql.match(/^BEGIN ISOLATION LEVEL READ COMMITTED;/gm)??[]).length,1);
 assert.equal((sql.match(/^ COMMIT;$/gm)??[]).length,1);
 assert.match(sql,/SELECT result FROM ram_prepare_readback;\s+COMMIT;$/);
 // Both phase expressions retain a shared SQL statement timestamp.
 const phaseBlock=sql.slice(sql.indexOf('DECLARE zero_value'),sql.indexOf("MESSAGE='local_ram_rehearsal_prepare_zero_plan_failed'"));
 assert.ok(phaseBlock.indexOf('zero_value:=')<phaseBlock.indexOf('continuation_value:='));
 assert.match(phaseBlock,/rent_business_date\([^\n]+statement_timestamp\(\)\)/);
});
test('inverse conversion is bounded and preserves exact decimal lexemes',()=>{
 const sql=buildRamInverseCanonicalSql(fixture());assert.match(sql,/FOR r IN SELECT value FROM jsonb_array_elements/);assert.doesNotMatch(sql.slice(sql.indexOf('CREATE TEMP TABLE ram_inverse_typed')),/UNION ALL/);
 assert.match(sql,/9007199254740993\.1200/);assert.match(sql,/inverse_type_changed/);
 const execute=buildRamInverseExecuteSql(fixture());assert.match(execute,/inverse_readback_changed/);assert.match(execute,/prepare_financial_reset_recovery/);
});
test('inverse cannot adopt a surviving foreign key or altered candidate identity',()=>{
 const v=fixture();v.inverseInputs.incomingEdges.push({source:{relation_name:'public.leases',primary_key:{id:id(80)}},target:{relation_name:'public.owner_opening_balance_entries',primary_key:{id:id(9)}}});
 assert.throws(()=>buildRamInverseCanonicalSql(v),/surviving_phase_reference/);
 const changed=fixture();changed.canonicalInverse.actions[0].primary_key={id:id(81)};assert.throws(()=>buildRamInverseExecuteSql(changed),/inverse_canonical_changed/);
});
test('incoming foreign key names remain schema qualified independent of search_path',()=>{
 const sql=buildRamInverseReadbackSql(fixture());assert.match(sql,/n.nspname\|\|'\.'\|\|t.relname AS source_name/);assert.match(sql,/f.source_name,f.conrelid/);assert.match(sql,/%s::oid/);
});
test('verification has a complete table roster, explicit audit exceptions and no mutable-row adoption',()=>{
 const sql=buildRamRehearsalVerificationSql({...fixture(),phase:'reset'});
 for(const policy of LOCAL_CAPTURE_POLICY)assert.ok(sql.includes(policy.table),policy.table);
 for(const condition of ['exact_projection_changed','audit_pair_changed','retired_intent_count_changed','lifecycle_count_changed','archive_changed','action_changed','source_revision_changed','foreign_key_unresolved'])assert.ok(sql.includes(condition));
 assert.match(sql,/c.after_images->k.relation_name/);assert.match(sql,/actual::text IS DISTINCT FROM expected::text/);
 assert.match(sql,/'productionForeignDataProven',false/);assert.match(sql,/'excludedCredentialTablesRestored',false/);
});
test('recovered verification uses persisted immutable sources and full original projection',()=>{
 const v=fixture(),sql=buildRamRehearsalVerificationSql({...v,phase:'recovered'});
 assert.doesNotMatch(sql,/financial_reset_recovery_candidates\(/);assert.match(sql,/FROM app_private.financial_reset_recovery_sources WHERE operation_id=/);
 assert.match(sql,/9007199254740993\.1200/);assert.match(sql,/'generation',2/);assert.match(sql,/recovery_sources_changed/);
 assert.throws(()=>buildRamRehearsalVerificationSql({...v,phase:'ignore'}),/verification_phase_invalid/);
});
