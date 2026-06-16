import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/db/env";
import type { Database } from "@/types/database";

export function createSupabaseBrowserClient() {
  const { supabaseKey, supabaseUrl } = getSupabaseEnv();

  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
