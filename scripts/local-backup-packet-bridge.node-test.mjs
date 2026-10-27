import test from 'node:test';import assert from 'node:assert/strict';
import {pilotActorNeutralSemantics,buildPilotRehearsalBinding,bindPilotRehearsalSemantics,assertPilotPacketRehearsalBinding} from './local-backup-packet-bridge.mjs';
import {pilotRamPlanFixture} from './fixtures/local-backup-ram-plan-fixture.mjs';
import {digestJson,sortDescriptors} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {prepareOperatorPacket,REQUIRED_ARTIFACTS,SOURCE_ENTRYPOINTS,hashBytes} from './pilot-finance-reset-operator-core.mjs';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,h='a'.repeat(64);
const sync=p=>({...p,zeroPlanText:JSON.stringify(p.zeroPlan)});
function input(){return sync({zeroPlan:{operation_id:id(1),organization_id:'752a87b8-bd04-4a45-9cb8-00687af66e73',manifest_sha256:h,reset_plan_sha256:h,
 maker_actor_id:id(2),reviewer_actor_id:id(3),effective_date:'2026-10-01',currencies:['USD'],scopes:[{property_id:id(4),property_owner_id:id(5),owner_person_id:id(6),
 ownership_percent:100,ownership_roster_hash:h,currency:'USD',property_row_sha256:h,property_archived_at:null}]},
 continuationPlan:{version:4,actor_id:id(2),billing_period_start:'2026-10-01',issue_date:'2026-10-01',execution_business_date:'2026-10-27',invoice_date_policy:'empty-books-no-invoices',contracts_sha256:h,
 leases:[{lease_id:id(7),disposition:'preserve-unbilled',source_sha256:h}]},reportPlan:{report_review_sha256:h}});}
function versionFour(){const p=input();p.zeroPlan.version=4;p.zeroPlan.scopes[0].owner_person_row_sha256=h;return sync(p);}

test('marked v4 zero plan binds exact owner-person state and keeps the discriminator in its economic hash',()=>{
 const legacy=input(),marked=versionFour();
 assert.notEqual(pilotActorNeutralSemantics(legacy).economicZeroSha256,pilotActorNeutralSemantics(marked).economicZeroSha256);
 const changed=versionFour();changed.zeroPlan.scopes[0].owner_person_row_sha256='b'.repeat(64);
 assert.notEqual(pilotActorNeutralSemantics(marked).economicZeroSha256,pilotActorNeutralSemantics(sync(changed)).economicZeroSha256);
 const actors=versionFour();actors.zeroPlan.maker_actor_id=id(8);actors.zeroPlan.reviewer_actor_id=id(9);actors.continuationPlan.actor_id=id(8);
 assert.deepEqual(pilotActorNeutralSemantics(marked),pilotActorNeutralSemantics(sync(actors)));
});
for(const[name,change]of[
 ['unknown zero version',p=>p.zeroPlan.version=3],['string zero version',p=>p.zeroPlan.version='4'],['null zero version',p=>p.zeroPlan.version=null],
 ['missing owner-person image',p=>delete p.zeroPlan.scopes[0].owner_person_row_sha256],['invalid owner-person image',p=>p.zeroPlan.scopes[0].owner_person_row_sha256='x'],
 ['ordinary billing continuation',p=>p.continuationPlan.version=3],['another invoice policy',p=>p.continuationPlan.invoice_date_policy='original-reviewed-october'],
 ['extra historical-scope field',p=>p.zeroPlan.scopes[0].allow_archived=true],['marker removed but new scope retained',p=>delete p.zeroPlan.version],
])test(`${name} cannot opt into the archived-owner zero path`,()=>{const p=versionFour();change(p);assert.throws(()=>pilotActorNeutralSemantics(sync(p)));});
test('v4 zero-plan precision is retained in canonical raw text',()=>{
 const a=versionFour(),b=versionFour();a.zeroPlanText=a.zeroPlanText.replace('"ownership_percent":100','"ownership_percent":33.33333333333333331');
 b.zeroPlanText=b.zeroPlanText.replace('"ownership_percent":100','"ownership_percent":33.33333333333333332');
 a.zeroPlan=JSON.parse(a.zeroPlanText);b.zeroPlan=JSON.parse(b.zeroPlanText);assert.deepEqual(a.zeroPlan,b.zeroPlan);
 assert.notEqual(pilotActorNeutralSemantics(a).economicZeroSha256,pilotActorNeutralSemantics(b).economicZeroSha256);
});
test('duplicate v4 discriminator in raw reviewed text is rejected',()=>{
 const p=versionFour();p.zeroPlanText=p.zeroPlanText.replace('{','{"version":4,');assert.throws(()=>pilotActorNeutralSemantics(p));
});
test('only maker/reviewer/continuation actor identities are excluded from economic semantic digest',()=>{
 const before=input(),after=input();after.zeroPlan.maker_actor_id=id(8);after.zeroPlan.reviewer_actor_id=id(9);after.continuationPlan.actor_id=id(8);
 assert.deepEqual(pilotActorNeutralSemantics(before),pilotActorNeutralSemantics(sync(after)));
});
test('distinct ownership precision remains distinct even when JSON.parse rounds both values identically',()=>{
 const a=input(),b=input();
 a.zeroPlanText=a.zeroPlanText.replace('"ownership_percent":100','"ownership_percent":33.33333333333333331');
 b.zeroPlanText=b.zeroPlanText.replace('"ownership_percent":100','"ownership_percent":33.33333333333333332');
 a.zeroPlan=JSON.parse(a.zeroPlanText);b.zeroPlan=JSON.parse(b.zeroPlanText);
 assert.deepEqual(a.zeroPlan,b.zeroPlan);assert.notEqual(pilotActorNeutralSemantics(a).zeroSha256,pilotActorNeutralSemantics(b).zeroSha256);
});
test('missing, duplicate actor columns or mismatched raw zero plan fails closed',()=>{
 const p=input();delete p.zeroPlanText;assert.throws(()=>pilotActorNeutralSemantics(p));
 const d=input();d.zeroPlanText=d.zeroPlanText.replace('{','{"maker_actor_id":"'+id(2)+'",');assert.throws(()=>pilotActorNeutralSemantics(d));
 const m=input();m.zeroPlanText=m.zeroPlanText.replace('"ownership_percent":100','"ownership_percent":50');assert.throws(()=>pilotActorNeutralSemantics(m));
});
function packetFixture(){
 const f=pilotRamPlanFixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization),b=buildPilotRehearsalBinding(plan),p=input(),m=b.materialization;
 p.zeroPlan.operation_id=b.operationId;p.zeroPlan.manifest_sha256=m.manifestSha256;p.zeroPlan.reset_plan_sha256=b.planSha256;
 const rehearsal=bindPilotRehearsalSemantics(plan,sync(p)),operation={operationId:b.operationId,organizationId:b.organizationId,projectRef:'pfvmztxktkwyewvxfgot',mainSha:'a'.repeat(40),
  sourceGeneration:0,targetGeneration:1,cutoff:'2026-10-01',issueDate:'2026-10-01',timezone:'Asia/Bangkok',executionBusinessDate:'2026-10-27',invoiceDatePolicy:'empty-books-no-invoices'};
 const artifacts={...p,zeroPlanText:JSON.stringify(p.zeroPlan),archive:plan.archiveRows,
  manifest:{manifest_sha256:m.manifestSha256,source_snapshot_sha256:m.sourceSnapshotSha256,schema_sha256:b.executionBaseline.schemaSha256,ledger_sha256:b.executionBaseline.ledgerSha256},
  actions:{operation:{operation_id:b.operationId,organization_id:b.organizationId,operation_kind:'reset',restore_of:null,source_generation:0,target_generation:1,
   manifest_sha256:m.manifestSha256,plan_sha256:b.planSha256,schema_sha256:b.executionBaseline.schemaSha256,archive_sha256:m.archiveSha256,action_sha256:m.actionSha256,
   archive_count:m.archiveRows,action_count:m.actionCount,audit_timestamp:'2026-10-27T00:00:00Z',audit_actor:null},actions:plan.actions}};
 const files=Object.fromEntries(REQUIRED_ARTIFACTS.map(k=>[k,JSON.stringify(artifacts[k]??{})]));
 const review={format:'nestory-protected-reset-review-v1',operation,schemaSha256:b.executionBaseline.schemaSha256,ledgerSha256:b.executionBaseline.ledgerSha256,
  sourceSnapshotSha256:m.sourceSnapshotSha256,archiveRows:m.archiveRows,actionCount:m.actionCount,databaseBinding:{manifestSha256:m.manifestSha256,planSha256:b.planSha256,
   archiveSha256:m.archiveSha256,actionSha256:m.actionSha256,zeroReviewSha256:hashBytes(artifacts.zeroPlanText),continuationSemanticSha256:h,reportReviewSha256:h},
  artifacts:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hashBytes(v)]))};
 const sources=[...SOURCE_ENTRYPOINTS,'supabase/migrations/20261027005615_financial_reset_empty_books_preserved_contracts.sql'].map(path=>({path,sha256:h}));
 return{packet:prepareOperatorPacket({review,sources,artifacts:files,candidateHead:operation.mainSha}),artifacts,rehearsal};
}
test('final packet matches accepted plan and actor-neutral saved rehearsal without embedding its own digest',()=>{
 const f=packetFixture();assert.equal(assertPilotPacketRehearsalBinding(f),true);
 assert.equal(Object.hasOwn(f.rehearsal.binding,'packetSha256'),false);
 assert.equal(f.packet.executionSupported,false);assert.equal(f.packet.customerApprovalVerified,false);
});
for(const[name,change]of[
 ['older recovery ledger reused as execution',f=>f.packet.ledgerSha256=f.rehearsal.binding.recoveryBaseline.ledgerSha256],
 ['different source snapshot',f=>f.packet.sourceSnapshotSha256='b'.repeat(64)],
 ['different plan',f=>f.packet.databaseBinding.planSha256='b'.repeat(64)],
 ['different archive',f=>f.packet.databaseBinding.archiveSha256='b'.repeat(64)],
 ['different report semantic',f=>f.rehearsal.semantics.reportReviewSha256='b'.repeat(64)],
])test(`${name} cannot reuse saved rehearsal`,()=>{
 const f=structuredClone(packetFixture());change(f);const{packetSha256,...body}=f.packet;void packetSha256;f.packet.packetSha256=digestJson(body);
 assert.throws(()=>assertPilotPacketRehearsalBinding(f));
});
for(const[name,change]of[
 ['owner identity',v=>v.zeroPlan.scopes[0].owner_person_id=id(10)],['ownership',v=>v.zeroPlan.scopes[0].ownership_percent=50],
 ['property state',v=>v.zeroPlan.scopes[0].property_row_sha256='b'.repeat(64)],['contracts',v=>v.continuationPlan.contracts_sha256='b'.repeat(64)],
 ['lease roster',v=>v.continuationPlan.leases=[]],['date',v=>v.continuationPlan.execution_business_date='2026-10-28'],
 ['report',v=>v.reportPlan.report_review_sha256='b'.repeat(64)],['plan',v=>v.zeroPlan.reset_plan_sha256='b'.repeat(64)],
])test(`${name} change cannot reuse rehearsed economic semantics`,()=>{const v=input(),before=pilotActorNeutralSemantics(v);change(v);assert.notDeepEqual(pilotActorNeutralSemantics(sync(v)),before);});
for(const[name,change]of[
 ['same approver',v=>v.zeroPlan.reviewer_actor_id=v.zeroPlan.maker_actor_id],['actor mismatch',v=>v.continuationPlan.actor_id=id(9)],
 ['another org',v=>v.zeroPlan.organization_id=id(9)],['unexpected field',v=>v.zeroPlan.ignore=true],['duplicate scope',v=>v.zeroPlan.scopes.push(v.zeroPlan.scopes[0])],
])test(`${name} fails semantic bridge validation`,()=>{const v=input();change(v);assert.throws(()=>pilotActorNeutralSemantics(v));});
test('stable binding separates original recovery ledger from observed execution ledger without accepting caller hashes',()=>{
 const f=pilotRamPlanFixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization),b=buildPilotRehearsalBinding(plan);
 assert.equal(b.operationId,f.operationId);assert.equal(b.sourceSha256,f.expectedSourceSha256);
 assert.equal(b.recoveryBaseline.migrationCount,1);assert.equal(b.executionBaseline.migrationCount,2);
 assert.equal(b.recoveryBaseline.ledgerSha256,digestJson(f.snapshot.ledger));
 assert.equal(b.executionBaseline.schemaSha256,digestJson(sortDescriptors(JSON.parse(f.materialization.catalog_text))));
 assert.equal(b.executionBaseline.databaseCatalogSha256,f.preview.catalog_snapshot_sha256);
 assert.notEqual(b.executionBaseline.databaseCatalogSha256,b.executionBaseline.schemaSha256);
 assert.throws(()=>buildPilotRehearsalBinding(structuredClone(plan)),/plan_provenance_missing/);
 assert.ok(Object.isFrozen(b.executionBaseline));
});
test('phase bridge requires exact operation, manifest and acyclic plan identity',()=>{
 const f=pilotRamPlanFixture(),plan=f.planner.acceptMaterialization(f.preview,f.materialization),binding=buildPilotRehearsalBinding(plan),p=input();
 p.zeroPlan.operation_id=binding.operationId;p.zeroPlan.manifest_sha256=binding.materialization.manifestSha256;p.zeroPlan.reset_plan_sha256=binding.planSha256;
 const proven=bindPilotRehearsalSemantics(plan,sync(p));assert.deepEqual(proven.binding,binding);
 for(const key of ['operation_id','manifest_sha256','reset_plan_sha256']){
  const changed=structuredClone(p);changed.zeroPlan[key]=key==='operation_id'?id(81):'f'.repeat(64);
  assert.throws(()=>bindPilotRehearsalSemantics(plan,changed),/bridge_invalid/);
 }
 const actors=structuredClone(p);actors.zeroPlan.maker_actor_id=id(82);actors.zeroPlan.reviewer_actor_id=id(83);actors.continuationPlan.actor_id=id(82);
 assert.deepEqual(bindPilotRehearsalSemantics(plan,sync(actors)),proven);
});
