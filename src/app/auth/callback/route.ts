import { type NextRequest } from "next/server";
import { createSupabaseAuthRouteClient } from "@/lib/db/auth-route";
import {
  authRedirectResponse,
  safeAuthNextPath,
} from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return authRedirectResponse(request, "/login");
  }

  const response = authRedirectResponse(
    request,
    safeAuthNextPath(request.nextUrl.searchParams.get("next")),
  );
  const supabase = createSupabaseAuthRouteClient(request, response);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return authRedirectResponse(request, "/login", response);
  }

  return response;
}
