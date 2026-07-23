import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/db/env";
import type { Database } from "@/types/database";

export function createSupabaseAuthRouteClient(
  request: NextRequest,
  response: NextResponse,
) {
  const { supabaseKey, supabaseUrl } = getSupabaseEnv();

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
