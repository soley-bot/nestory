"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { isPrivilegedStepUpRequiredError, privilegedStepUpRequiredActionMessage } from "@/lib/auth/privileged-step-up-error";
import { createSupabaseServerClient } from "@/lib/db/server";
import { financialWriteError } from "@/lib/finance/financial-write-context";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Enter a non-negative amount with up to two decimal places.").transform(Number);
const inputSchema = z.object({
  leaseId: postgresUuid("Choose a valid lease."),
  amount: money,
  expectedAmount: money,
  expectedDepositId: z.union([postgresUuid("Refresh the lease and try again."), z.literal("")]),
  reason: z.string().trim().min(8, "Explain why the required deposit is changing.").max(500),
  idempotencyKey: postgresUuid("Refresh the form and try again."),
});

export type DepositRequirementState = { status?: "error" | "success"; message?: string };

export async function updateDepositRequirementAction(
  _state: DepositRequirementState, formData: FormData,
): Promise<DepositRequirementState> {
  const context = await requirePermission("leases.change_terms");
  const parsed = inputSchema.safeParse(Object.fromEntries(
    Object.keys(inputSchema.shape).map(key => [key, formData.get(key) ?? ""]),
  ));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const input = parsed.data;
  const supabase = await createSupabaseServerClient(formData);
  const { data, error } = await supabase.rpc("update_lease_deposit_requirement", {
    p_organization_id: context.organizationId,
    p_lease_id: input.leaseId,
    p_amount: input.amount,
    p_expected_amount: input.expectedAmount,
    p_expected_deposit_id: input.expectedDepositId || undefined,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const message = `${error.message} ${error.details ?? ""}`;
    const lifecycle = financialWriteError(message);
    if (lifecycle) return { status: "error", message: lifecycle };
    if (isPrivilegedStepUpRequiredError(error)) return { status: "error", message: privilegedStepUpRequiredActionMessage };
    if (message.includes("deposit_requirement_below_held")) return { status: "error", message: "The required deposit cannot be less than the amount currently held. Record any agreed refund first, then update the requirement." };
    if (/deposit_requirement_changed|deposit_requirement_active_lease_required/.test(message)) return { status: "error", message: "The lease or required deposit has changed. Close this form, refresh the lease and try again." };
    if (/deposit_requirement_ambiguous|deposit_requirement_legacy_evidence/.test(message)) return { status: "error", message: "This deposit has historical records that need review before its requirement can be changed." };
    if (error.code === "42501") return { status: "error", message: "You do not have permission to change this lease's required deposit." };
    return { status: "error", message: "The required deposit could not be updated. Refresh the lease before trying again." };
  }
  if (data !== input.leaseId) return { status: "error", message: "The save could not be confirmed. Retry with the same details to check its result." };
  revalidatePath("/leases");
  revalidatePath(`/leases/${input.leaseId}`);
  revalidatePath("/properties/[propertyId]", "layout");
  revalidatePath("/units/[unitId]", "page");
  return { status: "success", message: "Required deposit updated. The held balance is unchanged." };
}
