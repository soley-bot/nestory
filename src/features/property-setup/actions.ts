"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLeaseConfigurationContext } from "@/lib/auth/context";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { createSupabaseServerClient } from "@/lib/db/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

const activateSetupLeaseSchema = z.object({
  leaseId: postgresUuid("Choose a lease."),
});

export async function activateSetupLeaseAction(formData: FormData) {
  const parsed = activateSetupLeaseSchema.safeParse({
    leaseId: formData.get("leaseId"),
  });
  if (!parsed.success) throw new Error("Choose the lease to activate.");

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
    throw new Error("The selected lease is no longer available.");
  }
  if (leaseResult.data.status !== "draft") {
    throw new Error("Only a draft lease can be activated from setup.");
  }

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
    throw new Error("The lease occupancy record could not be found.");
  }

  const effectiveDate = getBusinessDateValue();
  const transitionResult = await supabase.rpc("transition_lease_lifecycle", {
    p_effective_date: effectiveDate,
    p_expected_occupancy_id: occupancyResult.data.id,
    p_expected_status: "draft",
    p_idempotency_key: `property-setup-activate-${crypto.randomUUID()}`,
    p_lease_id: parsed.data.leaseId,
    p_organization_id: context.organizationId,
    p_reason: "Lease activated during guided property setup.",
    p_scheduled_move_out_date: null as unknown as string,
    p_transition: "activate",
  });

  const activatedOccupancyId =
    transitionResult.data &&
    typeof transitionResult.data === "object" &&
    !Array.isArray(transitionResult.data) &&
    typeof transitionResult.data.occupancyId === "string"
      ? transitionResult.data.occupancyId
      : null;

  if (transitionResult.error || !activatedOccupancyId) {
    throw new Error("The lease could not be activated.");
  }

  const evidenceResult = await supabase.rpc(
    "record_current_lease_occupancy_evidence",
    {
      p_actual_move_in_date: effectiveDate,
      p_expected_occupancy_id: activatedOccupancyId,
      p_lease_id: parsed.data.leaseId,
      p_organization_id: context.organizationId,
      p_reason: "Move-in confirmed during guided property setup.",
      p_scheduled_move_in_date: effectiveDate,
      p_scheduled_move_out_date: null as unknown as string,
    },
  );

  if (evidenceResult.error) {
    throw new Error("The lease was activated, but move-in confirmation needs attention.");
  }

  revalidatePath("/properties/setup");
  revalidatePath("/leases");
  revalidatePath(`/leases/${parsed.data.leaseId}`);
  revalidatePath("/rent-income");
}
