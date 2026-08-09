import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function removeUnregisteredDocumentObject(
  supabase: SupabaseClient<Database>,
  storagePath: string,
) {
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (error || data) return;

  await supabase.storage.from("nestory-documents").remove([storagePath]);
}
