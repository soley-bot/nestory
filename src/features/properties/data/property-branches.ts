import type { PropertyBranchOption } from "@/features/properties/property.types";
import { createSupabaseServerClient } from "@/lib/db/server";

export async function getActivePropertyBranchOptions(
  organizationId: string,
): Promise<PropertyBranchOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_branches")
    .select("id, name, code")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load branches: ${error.message}`);
  }

  return (data ?? []).map((branch) => ({
    id: branch.id,
    label: branch.code ? `${branch.code} — ${branch.name}` : branch.name,
  }));
}
