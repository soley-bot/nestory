import { z } from "zod";

// This UI accepts hostedBinding() and exact zero-plan text, never executable
// SQL, credentials, row archives, endpoint URLs or arbitrary RPC names.
export const PILOT_RESET_ORGANIZATION = "752a87b8-bd04-4a45-9cb8-00687af66e73";
export const PILOT_RESET_PROJECT = "pfvmztxktkwyewvxfgot";
export const MAX_REVIEW_BYTES = 256 * 1024;
export const RESET_STAGE_LABELS = {
  freeze: "Authorize the financial write freeze",
  checkpoint: "Authorize the frozen-source checkpoint",
  prepare: "Authorize preparation of the reviewed reset",
  seal: "Authorize sealing of the reviewed reset",
  execute: "Authorize the October empty-books reset",
  "prepare-recovery": "Authorize preparation of the reviewed recovery",
  "execute-recovery": "Authorize the separately reviewed recovery",
  "approve-zero-plan": "Endorse the reviewed zero opening balances",
} as const;

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const operationId = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const octoberDate = z.string().regex(/^2026-10-(?:0[1-9]|[12][0-9]|3[01])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
});
const continuation = z.object({
  version: z.literal(4), actor_id: uuid,
  billing_period_start: z.literal("2026-10-01"), issue_date: z.literal("2026-10-01"),
  execution_business_date: octoberDate, invoice_date_policy: z.literal("empty-books-no-invoices"),
  contracts_sha256: sha,
  leases: z.array(z.object({ lease_id: uuid, disposition: z.literal("preserve-unbilled"), source_sha256: sha }).strict()).max(1000),
}).strict().refine(value => new Set(value.leases.map(lease => lease.lease_id)).size === value.leases.length);
const recovery = z.object({
  operation_id: operationId, source_generation: count, target_generation: count,
  plan_sha256: sha, action_sha256: sha, action_count: count.positive(),
  report_checkpoint_sha256: sha, phase_binding_sha256: sha, review_artifact_sha256: sha,
  execution_business_date: date,
}).strict();
const binding = z.object({
  version: z.literal(1), operation_id: operationId,
  project_ref: z.literal(PILOT_RESET_PROJECT), organization_id: z.literal(PILOT_RESET_ORGANIZATION),
  packet_sha256: sha, main_sha: z.string().regex(/^[a-f0-9]{40}$/), sources_sha256: sha,
  schema_sha256: sha, ledger_sha256: sha, source_snapshot_sha256: sha,
  source_generation: count, target_generation: count,
  cutoff: z.literal("2026-10-01"), issue_date: z.literal("2026-10-01"),
  timezone: z.string().min(1).max(64).regex(/^[A-Za-z_]+(?:\/[A-Za-z_+-]+)*$/),
  execution_business_date: octoberDate, invoice_date_policy: z.literal("empty-books-no-invoices"),
  manifest_sha256: sha, plan_sha256: sha, archive_sha256: sha, action_sha256: sha,
  archive_artifact_sha256: sha, archive_count: count.positive(), action_count: count.positive(),
  zero_review_sha256: sha, continuation_semantic_sha256: sha, report_review_sha256: sha,
  continuation_semantic: continuation, recovery: recovery.optional(),
}).strict().refine(value => value.target_generation === value.source_generation + 1 &&
  value.execution_business_date === value.continuation_semantic.execution_business_date &&
  (!value.recovery || (value.recovery.operation_id !== value.operation_id &&
    value.recovery.source_generation === value.target_generation &&
    value.recovery.target_generation === value.recovery.source_generation + 1)));

// Display-only plan metadata; the action verifies the untouched database text
// digest against the existing native zero_review_sha256 before any RPC.
const reviewedZeroPlan = z.object({
  version: z.literal(4), approval_policy: z.literal("pilot-october-single-admin-v1").optional(),
  operation_id: operationId, organization_id: z.literal(PILOT_RESET_ORGANIZATION),
  manifest_sha256: sha, reset_plan_sha256: sha, maker_actor_id: uuid, reviewer_actor_id: uuid.nullable(),
  effective_date: z.literal("2026-10-01"), currencies: z.tuple([z.literal("USD")]),
  scopes: z.array(z.object({
    property_id: uuid, property_owner_id: uuid, owner_person_id: uuid, ownership_percent: z.number().positive().max(100),
    ownership_roster_hash: sha, currency: z.literal("USD"), property_row_sha256: sha,
    property_archived_at: z.string().nullable(), owner_person_row_sha256: sha,
  }).strict()).min(1).max(1000),
}).strict().refine(plan => plan.approval_policy
  ? plan.reviewer_actor_id === null
  : plan.reviewer_actor_id !== null && plan.reviewer_actor_id !== plan.maker_actor_id);

export const sessionReviewSchema = z.object({
  format: z.literal("nestory-pilot-reset-session-review-v1"),
  action: z.enum(["freeze", "checkpoint", "prepare", "seal", "execute", "prepare-recovery", "execute-recovery", "approve-zero-plan"]),
  binding, bindingSha256: sha, zeroPlanText: z.string().min(1).max(MAX_REVIEW_BYTES),
}).strict().refine(value => value.action.endsWith("-recovery") === Boolean(value.binding.recovery))
  .refine(value => {
    try {
      const plan = reviewedZeroPlan.parse(JSON.parse(value.zeroPlanText));
      const b = value.binding;
      return (!plan.approval_policy || b.source_generation === 0 && b.target_generation === 1) &&
        plan.operation_id === b.operation_id && plan.organization_id === b.organization_id &&
        plan.manifest_sha256 === b.manifest_sha256 && plan.reset_plan_sha256 === b.plan_sha256 &&
        plan.maker_actor_id === b.continuation_semantic.actor_id;
    } catch { return false; }
  });
export type SessionReview = z.infer<typeof sessionReviewSchema>;
export function reviewUsesSoleAdministrator(review: SessionReview): boolean {
  return JSON.parse(review.zeroPlanText).approval_policy === "pilot-october-single-admin-v1";
}
export type MaintenanceActionState = {
  kind: "idle" | "invalid" | "issued" | "endorsed" | "uncertain";
  message?: string;
  authorizationId?: string;
};

export function parseSessionReview(source: string): SessionReview | null {
  if (typeof source !== "string" || new TextEncoder().encode(source).length > MAX_REVIEW_BYTES) return null;
  try { return sessionReviewSchema.parse(JSON.parse(source)); } catch { return null; }
}

// Identical compact sorted-key encoding to the operator's canonicalJson. The
// PostgreSQL semantic digests remain DB-verified; this is the file binding hash.
export function canonicalReviewBinding(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalReviewBinding).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalReviewBinding(record[key])}`).join(",")}}`;
  }
  throw new Error("Invalid review binding");
}
