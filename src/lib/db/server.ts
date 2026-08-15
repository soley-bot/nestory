import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getAuthCookieOptions } from "@/lib/auth/tenant";
import { getSupabaseEnv } from "@/lib/db/env";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const { supabaseKey, supabaseUrl } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always set cookies. Middleware will own
          // session refresh once auth is wired.
        }
      },
    },
  });
}
