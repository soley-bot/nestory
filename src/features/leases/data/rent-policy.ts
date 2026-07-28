import { createSupabaseServerClient } from "@/lib/db/server";
import type { Database } from "@/types/database";

export type RentPolicyVersion =
  Database["public"]["Tables"]["rent_policy_versions"]["Row"];

export async function getRentPolicyVersions(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rent_policy_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("version_number", { ascending: false });

  if (error) {
    throw new Error(`Could not load rent policy: ${error.message}`);
  }

  return (data ?? []) as RentPolicyVersion[];
}
