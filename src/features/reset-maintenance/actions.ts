"use server";

import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/db/server";
import { requirePrivilegedStepUp } from "@/lib/auth/privileged-step-up-guard";
import { isPrivilegedStepUpRequiredError } from "@/lib/auth/privileged-step-up-error";
import { requirePilotResetContext } from "./context";
import { canonicalReviewBinding, parseSessionReview, reviewUsesSoleAdministrator, type MaintenanceActionState } from "./review";

export async function submitMaintenanceReviewAction(
  _previous: MaintenanceActionState,
  form: FormData,
): Promise<MaintenanceActionState> {
  const context = await requirePilotResetContext();
  const invalid: MaintenanceActionState = { kind: "invalid", message: "Choose the reviewed Pilot authorization file and confirm the displayed stage." };
  // Next forms may include $ACTION_ transport metadata (bundled forms guide).
  // Ignore those entries entirely; they cannot supply consent, scope or an RPC.
  const businessKeys = [...form.keys()].filter(key => !key.startsWith("$ACTION_"));
  if (form.getAll("review").length !== 1 || form.getAll("confirm").length !== 1 || form.get("confirm") !== "reviewed" ||
    businessKeys.some(key => key !== "review" && key !== "confirm")) return invalid;
  const source = form.get("review");
  const review = typeof source === "string" ? parseSessionReview(source) : null;
  if (!review || review.binding.timezone !== context.operationalTimezone ||
    createHash("sha256").update(canonicalReviewBinding(review.binding)).digest("hex") !== review.bindingSha256 ||
    (review.action !== "approve-zero-plan" && review.binding.continuation_semantic.actor_id !== context.userId)) return invalid;

  if (createHash("sha256").update(review.zeroPlanText).digest("hex") !== review.binding.zero_review_sha256 ||
    reviewUsesSoleAdministrator(review) && review.binding.continuation_semantic.actor_id !== context.userId) return invalid;

  const client = await createSupabaseServerClient();
  // The guard's returned service client is deliberately discarded. These two
  // RPCs must reach PostgREST through this exact signed-in cookie-session client.
  try { await requirePrivilegedStepUp(context, client); }
  catch (error) {
    if (isPrivilegedStepUpRequiredError(error)) return { kind: "invalid", message: "Verify this signed-in session by email before recording this approval." };
    throw error; // Preserve login redirects and framework control flow.
  }
  const uncertain: MaintenanceActionState = {
    kind: "uncertain", message: "The result could not be confirmed. Do not resubmit until the operator checks the recorded authorization or endorsement.",
  };
  try {
    if (review.action === "approve-zero-plan") {
      const result = await client.rpc("approve_financial_reset_zero_plan", {
        p_operation_id: review.binding.operation_id, p_review_sha256: review.binding.zero_review_sha256,
      });
      if (result.error) return /^(42501|22023|23514|P0001)$/.test(result.error.code)
        ? { kind: "invalid", message: "Endorsement was refused. The operator must check the prepared plan, your assigned maker or reviewer identity, and this session's current authority." }
        : uncertain;
      if (result.data !== null && result.data !== undefined) return uncertain;
      return { kind: "endorsed", message: "Your signed-in session endorsed the reviewed zero opening balances. This page has not executed the reset." };
    }
    const result = await client.rpc("authorize_financial_reset_hosted_action", {
      p_binding: review.binding, p_action: review.action,
    });
    if (result.error) return /^(42501|22023|23514|P0001)$/.test(result.error.code)
      ? { kind: "invalid", message: "Authorization was refused. Check the reviewed binding and this session's current authority with the operator." }
      : uncertain;
    if (typeof result.data !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(result.data)) return uncertain;
    return { kind: "issued", authorizationId: result.data,
      message: "Authorization issued for this stage only. It expires automatically, may expire sooner with your session, and can be used once by the protected operator." };
  } catch { return uncertain; }
}
