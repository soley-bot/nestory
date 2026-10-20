import { createSupabaseServerClient } from "@/lib/db/server";
import {
  parseOrdinaryAccessReadiness,
  type OrdinaryAccessReadResult,
} from "./ordinary-access";

export async function getOrdinaryAccessReadiness(
  organizationId: string,
): Promise<OrdinaryAccessReadResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_organization_ordinary_access_activation", {
      p_organization_id: organizationId,
    });
    const readiness = error ? null : parseOrdinaryAccessReadiness(data, organizationId);
    if (readiness) return { kind: "ready", readiness };
  } catch {
    // An unavailable or malformed response must never become activation consent.
  }
  return {
    kind: "unavailable",
    message: "Staff access readiness could not be loaded. Refresh to try again.",
  };
}
