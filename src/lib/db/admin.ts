import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/db/env";
import type { Database } from "@/types/database";

export function createSupabaseAdminClient() {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey || serviceRoleKey === "replace-with-service-role-key") {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
