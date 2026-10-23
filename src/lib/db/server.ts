import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getAuthCookieOptions } from "@/lib/auth/tenant";
import { getSupabaseEnv } from "@/lib/db/env";
import type { Database } from "@/types/database";
import { financialGenerationHeaders } from "@/lib/finance/financial-write-context";
import { captureFinancialIntent } from "@/lib/finance/captured-financial-intent.server";

export async function createSupabaseServerClient(financialIntent?: FormData) {
  const { supabaseKey, supabaseUrl } = getSupabaseEnv();
  const cookieStore = await cookies();

  const client = createServerClient<Database>(supabaseUrl, supabaseKey, {
    global: { headers: financialGenerationHeaders(financialIntent) },
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
  if (financialIntent) captureFinancialIntent(client, financialIntent);
  return client;
}
