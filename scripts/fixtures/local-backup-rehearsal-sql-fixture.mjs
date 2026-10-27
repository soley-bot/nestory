// Shared synthetic test data only. No private archives or customer sources.
import {createHash} from 'node:crypto';
import {pilotRamPlanFixture} from './local-backup-ram-plan-fixture.mjs';
import {buildPilotRehearsalBinding} from '../local-backup-packet-bridge.mjs';
import {buildPilotRamInversePlan} from '../local-backup-ram-rehearsal-plan.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,h='a'.repeat(64);
export function rehearsalSqlFixture(){
 const source=pilotRamPlanFixture(),plan=source.planner.acceptMaterialization(source.preview,source.materialization),planBinding=buildPilotRehearsalBinding(plan);
 const fixture={maker:id(1),reviewer:id(2),makerSession:id(3),reviewerSession:id(4)},fixtureTransactionId='100',b=planBinding;
 const zeroPlan={version:4,operation_id:b.operationId,organization_id:b.organizationId,manifest_sha256:b.materialization.manifestSha256,reset_plan_sha256:b.planSha256,
 maker_actor_id:fixture.maker,reviewer_actor_id:fixture.reviewer,effective_date:'2026-10-01',currencies:['USD'],scopes:[{property_id:id(5),property_owner_id:id(6),owner_person_id:id(7),
 ownership_percent:100,ownership_roster_hash:h,currency:'USD',property_row_sha256:h,property_archived_at:null,owner_person_row_sha256:h}]};
 const continuationPlan={version:4,actor_id:fixture.maker,billing_period_start:'2026-10-01',issue_date:'2026-10-01',execution_business_date:'2026-10-27',invoice_date_policy:'empty-books-no-invoices',contracts_sha256:h,
 leases:[{lease_id:id(8),disposition:'preserve-unbilled',source_sha256:h}]};
 const phases={zeroPlan,zeroPlanText:JSON.stringify(zeroPlan),zeroReviewSha256:hash(JSON.stringify(zeroPlan)),continuationPlan,continuationPlanText:JSON.stringify(continuationPlan),
 reportPlan:{report_review_sha256:h},auditTimestamp:'2026-10-27T00:00:00Z',timezone:'Asia/Bangkok',executionBusinessDate:'2026-10-27',fixtureSourceSha256:h,fixtureForeignSha256:h,fixtureTransactionId,
 fixtureRows:[fixture.maker,fixture.reviewer].map(user_id=>{const rowText=JSON.stringify({id:user_id,organization_id:b.organizationId,user_id,role:'super_admin',branch_id:null,person_id:null});return{rowText,rowSha256:hash(rowText)}}),reportRevisionBefore:'1'};
 const row={id:id(9),organization_id:b.organizationId,financial_generation:1},before=JSON.stringify(row);
 const phaseBinding=Object.fromEntries(['schema_sha256','zero_review_sha256','zero_authority_sha256','continuation_review_sha256','continuation_before_sha256','continuation_after_sha256','sources_sha256','source_sha256','report_checkpoint_sha256'].map(k=>[k,h]));
 const continuationReviewText=JSON.stringify({...continuationPlan,source_sha256:phaseBinding.continuation_before_sha256});
 phaseBinding.continuation_review_sha256=hash(continuationReviewText);
 const inverseInputs={phaseSources:[{relation_name:'public.owner_opening_balance_entries',primary_key:{id:row.id},kind:'recovery-prune',before_row_text:before,after_row_text:null,before_sha256:hash(before),after_sha256:null,provenance:'known-zero'}],incomingEdges:[],phaseBinding,phaseBindingText:JSON.stringify(phaseBinding),continuationReviewText};
 const recoveryId=id(10),inverse=buildPilotRamInversePlan(plan,inverseInputsSubset(inverseInputs));
 const actions=inverse.actions.map((a,i)=>{const sha=hash(`${recoveryId}:${i+1}`),action_id=`${sha.slice(0,8)}-${sha.slice(8,12)}-4${sha.slice(13,16)}-8${sha.slice(17,20)}-${sha.slice(20,32)}`;
  const {candidate_after_row_text,...rest}=a;return{...rest,action_id,ordinal:i+1,after_row_text:candidate_after_row_text,after_sha256:candidate_after_row_text===null?null:hash(candidate_after_row_text),insert_columns:['id','organization_id']}});
 const descriptors=actions.map(({before_row_text,after_row_text,changed_columns,insert_columns,...d})=>{void before_row_text;void after_row_text;void changed_columns;void insert_columns;return d}),actionDescriptorText=JSON.stringify(descriptors);
 const canonicalInverse={actions,actionDescriptorText,actionSha256:hash(actionDescriptorText),auditTimestamp:'2026-10-27T00:01:00Z'};
 return{...source,plan,planBinding,fixture,fixtureTransactionId,phases,inverseInputs,recoveryId,canonicalInverse,
  authorityTiming:{consumedAgeSeconds:35.25,remainingSeconds:264.75}};
}
function inverseInputsSubset(v){return{phaseSources:v.phaseSources,incomingEdges:v.incomingEdges}}
