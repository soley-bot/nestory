"use server";

import { requirePilotRentPostingContext } from "./pilot-rent-posting-context";
import { requirePrivilegedStepUp } from "@/lib/auth/privileged-step-up-guard";
import { isPrivilegedStepUpRequiredError } from "@/lib/auth/privileged-step-up-error";
import { createSupabaseServerClient } from "@/lib/db/server";
import { FINANCIAL_GENERATION_FIELD } from "@/lib/finance/financial-write-context";
import { getFinancialWriteContext } from "@/lib/finance/financial-write-context.server";

export type PilotRentPostingActionState =
  | { kind: "idle" | "invalid" | "uncertain"; message?: string }
  | { kind: "confirmed"; enabled: boolean; message: string };

export async function setPilotRentAutoPostingAction(
  _previous: PilotRentPostingActionState,
  formData: FormData,
): Promise<PilotRentPostingActionState> {
  const context = await requirePilotRentPostingContext();
  const invalid: PilotRentPostingActionState = { kind: "invalid", message: "Refresh this page to verify Pilot's current rent posting setting." };
  const keys = [...formData.keys()].filter(key => !key.startsWith("$ACTION_"));
  if (keys.some(key => !["enabled", "expectedUpdatedAt", FINANCIAL_GENERATION_FIELD].includes(key)) ||
    ["enabled", "expectedUpdatedAt", FINANCIAL_GENERATION_FIELD].some(key => formData.getAll(key).length !== 1)) return invalid;
  const enabled = formData.get("enabled");
  const timestamp = formData.get("expectedUpdatedAt");
  const generation = formData.get(FINANCIAL_GENERATION_FIELD);
  if ((enabled !== "true" && enabled !== "false") ||
    typeof timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || Number.isNaN(Date.parse(timestamp))) return invalid;

  let current;
  try { current = await getFinancialWriteContext(context.organizationId); }
  catch { return { kind: "invalid", message: "Pilot's financial status is unavailable. Refresh this page and try again." }; }
  if (current.status !== "open" || !current.enforced ||
    generation !== String(current.generation) || current.automatic_rent_enabled === undefined ||
    !current.automatic_rent_updated_at ||
    current.automatic_rent_updated_at !== timestamp) return invalid;
  if (current.automatic_rent_enabled === (enabled === "true")) return invalid;

  const client = await createSupabaseServerClient(formData);
  try { await requirePrivilegedStepUp(context, client); }
  catch (error) {
    if (isPrivilegedStepUpRequiredError(error)) return { kind: "invalid", message: "Verify this signed-in session by email, then retry saving." };
    throw error;
  }
  try {
    const result = await client.rpc("set_pilot_rent_auto_posting", {
      p_organization_id: context.organizationId,
      p_enabled: enabled === "true",
      p_expected_updated_at: timestamp,
    });
    if (result.error) {
      if (result.error.code === "40001") return { kind: "invalid", message: "The setting changed in another session. Reload the page to see the current value before trying again." };
      if (result.error.code === "55P03") return { kind: "invalid", message: "Billing is busy. Try again in a moment." };
      if (result.error.code === "55000") return { kind: "invalid", message: "Financial changes are paused while Pilot is frozen. Reload the page after the reset is complete." };
      if (result.error.code === "42501") return { kind: "invalid", message: "This session is not authorized to change Pilot's rent posting setting." };
      return { kind: "uncertain", message: "The result could not be confirmed. Reload the page to check the saved setting before trying again." };
    }
    if (result.data !== (enabled === "true")) return { kind: "uncertain", message: "The result could not be confirmed. Reload the page to check the saved setting before trying again." };
    return { kind: "confirmed", enabled: result.data, message: result.data ? "Automatic rent posting is on." : "Automatic rent posting is off." };
  } catch {
    return { kind: "uncertain", message: "The result could not be confirmed. Reload the page to check the saved setting before trying again." };
  }
}
