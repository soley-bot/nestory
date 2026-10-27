import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {pilotRamPlanFixture} from './fixtures/local-backup-ram-plan-fixture.mjs';
import {createPilotLiveWitnessBuilder,inspectPilotLiveWitness,bindPilotLiveRehearsal,assertPilotLiveEconomicSemantics} from './local-backup-live-witness.mjs';
import {readFile} from 'node:fs/promises';
import {buildPilotRehearsalBinding,bindPilotRehearsalSemantics} from './local-backup-packet-bridge.mjs';
import {preparePilotLivePacket,assertPilotLivePacketBinding} from './local-backup-live-packet.mjs';
import {SOURCE_ENTRYPOINTS} from './pilot-finance-reset-operator-core.mjs';
import {digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const manifestPath='supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json',manifest=await readFile(new URL('../'+manifestPath,import.meta.url),'utf8');
const files=()=>new Map([[manifestPath,manifest],['supabase/migrations/20261026000100_fixture.sql','SELECT 1;'],['supabase/migrations/20261027005615_financial_reset_empty_books_preserved_contracts.sql','SELECT 2;']]);
function refreshSummary(value){const{manifest_sha256,summary_text,...summary}=value.preview;void manifest_sha256;void summary_text;value.preview.summary_text=JSON.stringify(summary);value.preview.manifest_sha256=hash(value.preview.summary_text);}
function fixture(){
 const f=pilotRamPlanFixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization),builder=createPilotLiveWitnessBuilder({manifestBytes:f.manifestBytes,expectedSourceSha256:f.expectedSourceSha256,operationId:f.operationId});
 const census=full=>f.snapshot.tables.filter(t=>(t.capture==='full-row-image')===full).map(t=>({table_name:t.table_name,row_count:t.row_count,rows_sha256:t.rows_sha256})).sort((a,b)=>a.table_name.localeCompare(b.table_name));
 const summary={...f.materialization.summary,source_snapshot_sha256:'8'.repeat(64),foreign_snapshot_sha256:'9'.repeat(64)},summary_text=JSON.stringify(summary,null,2);
 const value={format:'nestory-local-pilot-live-witness-v1',status:'ready',operationId:f.operationId,archiveSourceSha256:f.expectedSourceSha256,observedCaptureSha256:'7'.repeat(64),
  businessCensus:census(true),securityCensus:census(false),storageObjectCount:0,storageBucketCount:0,storageClosureSha256:hash(':'),foreignOrganizationCount:4,foreignCensusSha256:summary.foreign_snapshot_sha256,
  preview:{...summary,summary_text,manifest_sha256:hash(summary_text)}};
 return{...f,plan,builder,value};
}
test('aggregate SQL reuses fixed scoped capture and same-transaction materializer without selecting row payloads',()=>{
 const f=fixture(),sql=f.builder.sql();assert.match(sql,/^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
 assert.match(sql,/live_plan AS MATERIALIZED \(WITH RECURSIVE/);assert.match(sql,/'businessCensus'/);assert.match(sql,/'storageClosureSha256'/);
 const output=sql.slice(sql.lastIndexOf("SELECT jsonb_build_object('format','nestory-local-pilot-live-witness-v1'"));
 assert.doesNotMatch(output,/'row_text'|'primary_key'|'path'|'object_id'/);assert.match(output,/'foreignOrganizationCount'/);
 assert.doesNotMatch(sql,/SET ROLE|request\.jwt|INSERT INTO|DELETE FROM|UPDATE public|pgp_pub_encrypt/);
});
test('only explicit live security and foreign context may differ; result is not execution admission',()=>{
 const f=fixture(),policy=f.value.securityCensus.find(r=>r.table_name==='app_private.privileged_email_step_up_policies');policy.row_count=1;policy.rows_sha256='6'.repeat(64);
 f.value.preview.counts=[{relation_name:policy.table_name,disposition:'preserve',count:1}];refreshSummary(f.value);
 const witness=f.builder.accept(f.value,f.plan),view=inspectPilotLiveWitness(witness);
 assert.equal(view.productionAdmission,false);assert.equal(view.executionDescriptorAdmissionRequired,true);
 assert.notEqual(view.liveManifestSha256,view.localManifestSha256);assert.equal(view.archiveSourceSha256,f.expectedSourceSha256);
 assert.throws(()=>inspectPilotLiveWitness(structuredClone(witness)));assert.ok(Object.isFrozen(witness.businessCensus));
});
test('live security counts are exact and cannot conceal economic count changes',()=>{
 for(const change of [v=>v.preview.counts=[],v=>v.preview.counts[0].count=2,v=>v.preview.counts[0].disposition='archive-remove',
  v=>v.preview.counts.push({...v.preview.counts[0]}),v=>v.preview.counts.push({relation_name:'public.people',disposition:'preserve',count:1})]){
  const f=fixture(),policy=f.value.securityCensus.find(r=>r.table_name==='app_private.privileged_email_step_up_policies');policy.row_count=1;
  f.value.preview.counts=[{relation_name:policy.table_name,disposition:'preserve',count:1}];change(f.value);refreshSummary(f.value);
  assert.throws(()=>f.builder.accept(f.value,f.plan));
 }
});
for(const[name,change]of[
 ['business row changed',v=>v.businessCensus[0].rows_sha256='a'.repeat(64)],['missing business table',v=>v.businessCensus.pop()],
 ['storage metadata changed',v=>v.storageClosureSha256='a'.repeat(64)],['extra storage object',v=>v.storageObjectCount=1],
 ['vacuous foreign preservation',v=>v.foreignOrganizationCount=0],['another foreign witness',v=>v.foreignCensusSha256='a'.repeat(64)],
 ['security roster changed',v=>v.securityCensus.pop()],['nonempty capability',v=>v.securityCensus.find(r=>!r.table_name.startsWith('app_private.privileged_email_step_up_')).row_count=1],
 ['economic action changed',v=>{v.preview.action_sha256='b'.repeat(64);const{manifest_sha256,summary_text,...s}=v.preview;void manifest_sha256;void summary_text;v.preview.summary_text=JSON.stringify(s);v.preview.manifest_sha256=hash(v.preview.summary_text)}],
])test(`${name} refuses a live projection bridge`,()=>{const f=fixture();change(f.value);assert.throws(()=>f.builder.accept(f.value,f.plan));});
test('live binding verifies the original hosted ledger prefix and exact reviewed forward files, never a replacement hash',()=>{
 const f=fixture(),witness=f.builder.accept(f.value,f.plan),args={plan:f.plan,witness,hostedLedgerText:f.materialization.ledger_text,sourceFiles:files()},b=bindPilotLiveRehearsal(args);
 assert.equal(b.materialization.sourceSnapshotSha256,'8'.repeat(64));assert.notEqual(b.rehearsalPlanSha256,b.planSha256);
 assert.equal(b.materialization.archiveSha256,f.materialization.summary.archive_sha256);
 assert.throws(()=>bindPilotLiveRehearsal({...args,hostedLedgerText:args.hostedLedgerText+' '}));
 const altered=files();altered.set('supabase/migrations/20261027005615_financial_reset_empty_books_preserved_contracts.sql','SELECT 3;');
 assert.throws(()=>bindPilotLiveRehearsal({...args,sourceFiles:altered}));
 assert.throws(()=>bindPilotLiveRehearsal({...args,witness:structuredClone(witness)}));
 const replacement=fixture(),ledger=JSON.parse(replacement.materialization.ledger_text),sql='SELECT 3;';
 ledger.at(-1).statements=[{byteLength:Buffer.byteLength(sql),sha256:hash(sql)}];const hostedLedgerText=JSON.stringify(ledger);
 replacement.value.preview.ledger_snapshot_sha256=hash(hostedLedgerText);refreshSummary(replacement.value);
 const replacementWitness=replacement.builder.accept(replacement.value,replacement.plan);
 assert.throws(()=>bindPilotLiveRehearsal({plan:replacement.plan,witness:replacementWitness,hostedLedgerText,sourceFiles:altered}));
});
test('dual-context semantic bridge permits only separately bound manifest/plan/actor changes',()=>{
 const f=fixture(),witness=f.builder.accept(f.value,f.plan),liveBinding=bindPilotLiveRehearsal({plan:f.plan,witness,hostedLedgerText:f.materialization.ledger_text,sourceFiles:files()}),local=buildPilotRehearsalBinding(f.plan),
  id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,h='a'.repeat(64),
  zeroPlan={operation_id:local.operationId,organization_id:local.organizationId,manifest_sha256:local.materialization.manifestSha256,reset_plan_sha256:local.planSha256,
   maker_actor_id:id(1),reviewer_actor_id:id(2),effective_date:'2026-10-01',currencies:['USD'],scopes:[{property_id:id(3),property_owner_id:id(4),owner_person_id:id(5),ownership_percent:100,
    ownership_roster_hash:h,currency:'USD',property_row_sha256:h,property_archived_at:null}]},
  phases={zeroPlan,zeroPlanText:JSON.stringify(zeroPlan),continuationPlan:{version:4,actor_id:id(1),billing_period_start:'2026-10-01',issue_date:'2026-10-01',execution_business_date:'2026-10-27',invoice_date_policy:'empty-books-no-invoices',contracts_sha256:h,leases:[]},reportPlan:{report_review_sha256:h}};
 const rehearsal=bindPilotRehearsalSemantics(f.plan,phases),target=structuredClone(phases);
 target.zeroPlan.manifest_sha256=liveBinding.materialization.manifestSha256;target.zeroPlan.reset_plan_sha256=liveBinding.planSha256;
 target.zeroPlan.maker_actor_id=id(6);target.zeroPlan.reviewer_actor_id=id(7);target.continuationPlan.actor_id=id(6);target.zeroPlanText=JSON.stringify(target.zeroPlan);
 assert.equal(assertPilotLiveEconomicSemantics({liveBinding,rehearsal,phases:target}),true);
 target.zeroPlan.scopes[0].ownership_percent=50;target.zeroPlanText=JSON.stringify(target.zeroPlan);
 assert.throws(()=>assertPilotLiveEconomicSemantics({liveBinding,rehearsal,phases:target}));
});
test('live packet derives exact archived actions and new actor bindings while missing evidence stays blocked',()=>{
 const f=fixture(),sourceFiles=files();for(const name of SOURCE_ENTRYPOINTS)sourceFiles.set(name,'synthetic source only');
 const witness=f.builder.accept(f.value,f.plan),liveBinding=bindPilotLiveRehearsal({plan:f.plan,witness,hostedLedgerText:f.materialization.ledger_text,sourceFiles}),b=buildPilotRehearsalBinding(f.plan);
 const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,h='a'.repeat(64),zeroPlan={version:4,operation_id:b.operationId,organization_id:b.organizationId,
  manifest_sha256:b.materialization.manifestSha256,reset_plan_sha256:b.planSha256,maker_actor_id:id(1),reviewer_actor_id:id(2),effective_date:'2026-10-01',currencies:['USD'],
  scopes:[{property_id:id(3),property_owner_id:id(4),owner_person_id:id(5),ownership_percent:100,ownership_roster_hash:h,currency:'USD',property_row_sha256:h,property_archived_at:null,owner_person_row_sha256:h}]};
 const continuationPlan={version:4,actor_id:id(1),billing_period_start:'2026-10-01',issue_date:'2026-10-01',execution_business_date:'2026-10-27',invoice_date_policy:'empty-books-no-invoices',contracts_sha256:h,leases:[]};
 const phases={zeroPlan,zeroPlanText:JSON.stringify(zeroPlan),continuationPlan,reportPlan:{report_review_sha256:h}},rehearsal=bindPilotRehearsalSemantics(f.plan,phases);
 const args={plan:f.plan,liveBinding,rehearsal,savedPhases:{...phases,continuationPlanText:JSON.stringify(continuationPlan)},actors:{maker:id(6),reviewer:id(7)},
  release:{mainSha:'a'.repeat(40),auditTimestamp:'2026-10-27T00:00:00Z',timezone:'Asia/Bangkok'},sourceFiles};
 const result=preparePilotLivePacket(args);assert.equal(result.packet.executionSupported,false);assert.ok(result.packet.evidenceBlockers.includes('missing_restoreProof'));
 assert.equal(result.artifacts.zeroPlan.maker_actor_id,id(6));assert.equal(result.artifacts.zeroPlan.reset_plan_sha256,liveBinding.planSha256);
 assert.equal(result.artifacts.zeroPlan.version,4);assert.equal(result.artifacts.zeroPlan.scopes[0].owner_person_row_sha256,h);
 assert.deepEqual(result.artifacts.actions.actions,f.plan.actions);assert.notEqual(result.packet.sourceSnapshotSha256,b.materialization.sourceSnapshotSha256);
 assert.equal(assertPilotLivePacketBinding({...args,...result}),true);
 assert.throws(()=>preparePilotLivePacket({...args,liveBinding:structuredClone(liveBinding)}));
 assert.throws(()=>preparePilotLivePacket({...args,evidenceBytes:{actions:'{}'}}));
 const changed=structuredClone(result);changed.packet.ledgerSha256=b.recoveryBaseline.ledgerSha256;const{packetSha256,...body}=changed.packet;void packetSha256;changed.packet.packetSha256=digestJson(body);
 assert.throws(()=>assertPilotLivePacketBinding({...args,...changed}));
 const rows=structuredClone(result);rows.artifacts.actions.actions[0].before_sha256='f'.repeat(64);assert.throws(()=>assertPilotLivePacketBinding({...args,...rows}));
});
