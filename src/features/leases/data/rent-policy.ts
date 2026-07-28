import { createSupabaseServerClient } from "@/lib/db/server";
import type { Database } from "@/types/database";

export type RentPolicyVersion =
  Database["public"]["Tables"]["rent_policy_versions"]["Row"];

export async function getRentPolicyVersions(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rent_policy_versions")
    .select(`
      approved_at,
      approved_by,
      concessions_support_state,
      created_at,
      created_by,
      due_day_source,
      effective_from,
      id,
      lease_end_proration_rule,
      lease_start_proration_rule,
      lifecycle,
      mid_period_rent_change_rule,
      notice_period_charging_rule,
      organization_id,
      policy_default_due_day,
      rent_calculation_timezone,
      rent_free_support_state,
      retired_at,
      retired_by,
      short_month_due_day_rule,
      superseded_at,
      superseded_by,
      supersedes_policy_id,
      supported_frequencies,
      updated_at,
      updated_by,
      version_number,
      waivers_support_state
    `)
    .eq("organization_id", organizationId)
    .order("version_number", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(`Could not load rent policy: ${error.message}`);
  }

  return data ?? [];
}
