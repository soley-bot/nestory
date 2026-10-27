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
  return { format: "nestory-pilot-reset-session-review-v1", action, binding,
    bindingSha256: createHash("sha256").update(canonicalReviewBinding(binding)).digest("hex") };
}
