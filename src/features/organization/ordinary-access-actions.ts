"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminContext } from "@/lib/auth/context";
import {
  isPrivilegedStepUpRequiredError,
  privilegedStepUpRequiredActionMessage,
} from "@/lib/auth/privileged-step-up-error";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getOrdinaryAccessReadiness } from "./ordinary-access-data";
import {
  ordinaryAccessActivationRequestSchema,
  parseOrdinaryAccessActivationReceipt,
  type OrdinaryAccessActivationRequest,
  type OrdinaryAccessActivationResult,
  type OrdinaryAccessReadResult,
} from "./ordinary-access";

export async function refreshOrdinaryAccessReadinessAction(): Promise<OrdinaryAccessReadResult> {
  const context = await requireSuperAdminContext();
  return getOrdinaryAccessReadiness(context.organizationId);
}

export async function activateOrdinaryAccessAction(
  input: OrdinaryAccessActivationRequest,
): Promise<OrdinaryAccessActivationResult> {
  const context = await requireSuperAdminContext();
  const parsed = ordinaryAccessActivationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "error", message: "Review the current staff access impact and confirm activation." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("activate_organization_ordinary_access", {
      p_organization_id: context.organizationId,
      p_expected_version: parsed.data.expectedVersion,
      p_expected_impact_fingerprint: parsed.data.expectedImpactFingerprint,
      p_confirm: true,
    });
    if (error) {
      if (isPrivilegedStepUpRequiredError(error)) {
        return { kind: "error", message: privilegedStepUpRequiredActionMessage };
      }
      if (error.code === "40001") {
        return { kind: "stale", message: "Staff access changed. Review refreshed readiness before activating." };
      }
      if (error.code === "42501") {
        return { kind: "error", message: "Only a current Super Admin can enable staff access." };
      }
      return {
        kind: "error",
        message: "Staff access could not be activated. Refresh readiness and review any remaining requirements.",
      };
    }
    const receipt = parseOrdinaryAccessActivationReceipt(data, context.organizationId);
    if (!receipt || (
      receipt.kind === "activated" &&
      receipt.readiness.authorization_version <= parsed.data.expectedVersion
    )) {
      return {
        kind: "error",
        message: "The activation result could not be confirmed. Refresh readiness before trying again.",
      };
    }
    revalidatePath("/settings/access");
    revalidatePath("/workspace");
    return receipt;
  } catch {
    return {
      kind: "error",
      message: "The activation result could not be confirmed. Refresh readiness before trying again.",
    };
  }
}
