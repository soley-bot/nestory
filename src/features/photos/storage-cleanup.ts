import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function reconcilePhotoUpload(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  storagePath: string,
): Promise<"registered" | "removed" | "retained"> {
  try {
    const { data, error } = await supabase
      .from("asset_photos")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("storage_path", storagePath)
      .maybeSingle();

    if (error) return "retained";
    if (data) return "registered";

    const removal = await supabase.storage
      .from("nestory-photos")
      .remove([storagePath]);
    return removal.error ? "retained" : "removed";
  } catch {
    return "retained";
  }
}
