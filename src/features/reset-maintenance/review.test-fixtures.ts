import { createHash } from "node:crypto";
import { canonicalReviewBinding, PILOT_RESET_ORGANIZATION, PILOT_RESET_PROJECT, type SessionReview } from "./review";

export const fixtureActor = "10000000-0000-4000-8000-000000000001";
export function reviewFixture(action: SessionReview["action"] = "execute"): SessionReview {
  const sha = "a".repeat(64);
  const binding: SessionReview["binding"] = {
    version: 1, operation_id: "10000000-0000-4000-8000-000000000010", project_ref: PILOT_RESET_PROJECT,
    organization_id: PILOT_RESET_ORGANIZATION, packet_sha256: sha, main_sha: "b".repeat(40), sources_sha256: sha,
    schema_sha256: sha, ledger_sha256: sha, source_snapshot_sha256: sha, source_generation: 0, target_generation: 1,
    cutoff: "2026-10-01", issue_date: "2026-10-01", timezone: "Asia/Phnom_Penh", execution_business_date: "2026-10-27",
    invoice_date_policy: "empty-books-no-invoices", manifest_sha256: sha, plan_sha256: sha, archive_sha256: sha,
    action_sha256: sha, archive_artifact_sha256: sha, archive_count: 1, action_count: 1, zero_review_sha256: sha,
    continuation_semantic_sha256: sha, report_review_sha256: sha,
    continuation_semantic: { version: 4, actor_id: fixtureActor, billing_period_start: "2026-10-01", issue_date: "2026-10-01",
      execution_business_date: "2026-10-27", invoice_date_policy: "empty-books-no-invoices", contracts_sha256: sha,
      leases: [{ lease_id: "10000000-0000-4000-8000-000000000020", disposition: "preserve-unbilled", source_sha256: sha }] },
  };
  if (action.endsWith("-recovery")) binding.recovery = {
    operation_id: "10000000-0000-4000-8000-000000000030", source_generation: 1, target_generation: 2,
    plan_sha256: sha, action_sha256: sha, action_count: 1, report_checkpoint_sha256: sha,
    phase_binding_sha256: sha, review_artifact_sha256: sha, execution_business_date: "2026-10-27",
  };
  const zeroPlanText=JSON.stringify({version:4,operation_id:binding.operation_id,organization_id:binding.organization_id,
    manifest_sha256:binding.manifest_sha256,reset_plan_sha256:binding.plan_sha256,maker_actor_id:fixtureActor,
    reviewer_actor_id:"10000000-0000-4000-8000-000000000002",effective_date:"2026-10-01",currencies:["USD"],
    scopes:[{property_id:fixtureActor,property_owner_id:fixtureActor,owner_person_id:fixtureActor,ownership_percent:100,
      ownership_roster_hash:sha,currency:"USD",property_row_sha256:sha,property_archived_at:null,owner_person_row_sha256:sha}]});
  binding.zero_review_sha256=createHash("sha256").update(zeroPlanText).digest("hex");
  return { format: "nestory-pilot-reset-session-review-v1", action, binding, zeroPlanText,
    bindingSha256: createHash("sha256").update(canonicalReviewBinding(binding)).digest("hex") };
}

export function soleAdministratorReviewFixture(): SessionReview {
 const review=reviewFixture("approve-zero-plan"),b=review.binding,sha="a".repeat(64);
 const zero={version:4,approval_policy:"pilot-october-single-admin-v1",operation_id:b.operation_id,organization_id:b.organization_id,
  manifest_sha256:b.manifest_sha256,reset_plan_sha256:b.plan_sha256,maker_actor_id:fixtureActor,reviewer_actor_id:null,
  effective_date:"2026-10-01",currencies:["USD"],scopes:[{property_id:fixtureActor,property_owner_id:fixtureActor,owner_person_id:fixtureActor,
   ownership_percent:100,ownership_roster_hash:sha,currency:"USD",property_row_sha256:sha,property_archived_at:null,owner_person_row_sha256:sha}]};
 review.zeroPlanText=JSON.stringify(zero);
 b.zero_review_sha256=createHash("sha256").update(review.zeroPlanText).digest("hex");
 review.bindingSha256=createHash("sha256").update(canonicalReviewBinding(b)).digest("hex");
 return review;
}
