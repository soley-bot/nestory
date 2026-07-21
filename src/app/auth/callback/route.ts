import { type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  authRedirectResponse,
  safeAuthNextPath,
} from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return authRedirectResponse(request, "/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return authRedirectResponse(request, "/login");
  }

  return authRedirectResponse(
    request,
    safeAuthNextPath(request.nextUrl.searchParams.get("next")),
  );
}
