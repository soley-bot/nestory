import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function removeUnselectedCompanyLogoObject(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  storagePath: string,
): Promise<"selected" | "removed" | "retained"> {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("logo_storage_path")
      .eq("id", organizationId)
      .single();

    if (error || !data) return "retained";
    if (data.logo_storage_path === storagePath) return "selected";

    const removal = await supabase.storage
      .from("organization-assets")
      .remove([storagePath]);
    return removal.error ? "retained" : "removed";
  } catch {
    return "retained";
  }
}
