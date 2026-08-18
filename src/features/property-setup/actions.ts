"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLeaseConfigurationContext } from "@/lib/auth/context";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { createSupabaseServerClient } from "@/lib/db/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import type { ActivateSetupLeaseState } from "@/features/property-setup/property-setup-state";

const activateSetupLeaseSchema = z.object({
  leaseId: postgresUuid("Choose a lease."),
});

export async function activateSetupLeaseAction(
  _previousState: ActivateSetupLeaseState,
  formData: FormData,
): Promise<ActivateSetupLeaseState> {
  const parsed = activateSetupLeaseSchema.safeParse({
    leaseId: formData.get("leaseId"),
  });
  if (!parsed.success) {
    return { message: "Choose the lease to activate.", status: "error" };
  }

  const context = await requireLeaseConfigurationContext();
  const supabase = await createSupabaseServerClient();
  const leaseResult = await supabase
    .from("current_leases")
    .select("status")
    .eq("organization_id", context.organizationId)
    .eq("id", parsed.data.leaseId)
    .is("archived_at", null)
    .maybeSingle();

  if (leaseResult.error || !leaseResult.data) {
    return {
      message: "The selected lease is no longer available.",
      status: "error",
    };
  }
  if (!["draft", "active"].includes(leaseResult.data.status)) {
    return {
      message: "This lease can no longer be started from property setup.",
      status: "error",
    };
  }

  if (leaseResult.data.status === "draft") {
    const occupancyResult = await supabase
      .from("lease_occupancies")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("lease_id", parsed.data.leaseId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (occupancyResult.error || !occupancyResult.data) {
      return {
        message: "The lease occupancy record could not be found.",
        status: "error",
      };
    }

    const transitionResult = await supabase.rpc("transition_lease_lifecycle", {
      p_effective_date: getBusinessDateValue(),
      p_expected_occupancy_id: occupancyResult.data.id,
      p_expected_status: "draft",
      p_idempotency_key: `property-setup-activate-${crypto.randomUUID()}`,
      p_lease_id: parsed.data.leaseId,
      p_organization_id: context.organizationId,
      p_reason:
        "Lease activated and move-in confirmed during guided property setup.",
      p_scheduled_move_out_date: null as unknown as string,
      p_transition: "activate",
    });

    if (transitionResult.error) {
      return {
        message: "The lease could not be activated. Try again.",
        status: "error",
      };
    }
  }

  revalidatePath("/properties/setup");
  revalidatePath("/leases");
  revalidatePath(`/leases/${parsed.data.leaseId}`);
  revalidatePath("/rent-income");
  return {
    message: "Lease activated and move-in confirmed.",
    status: "success",
  };
}
