import { type NextRequest } from "next/server";
import { createSupabaseAuthRouteClient } from "@/lib/db/auth-route";
import {
  authRedirectResponse,
  safeAuthNextPath,
} from "@/lib/auth/redirect";
import {
  createRecoveryMarker,
  RECOVERY_MARKER_COOKIE,
  RECOVERY_MARKER_MAX_AGE_SECONDS,
} from "@/lib/auth/recovery-marker";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return authRedirectResponse(request, "/login");
  }

  const nextPath = safeAuthNextPath(request.nextUrl.searchParams.get("next"));
  const response = authRedirectResponse(request, nextPath);
  const supabase = createSupabaseAuthRouteClient(request, response);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return authRedirectResponse(request, "/login", response);
  }

  if (nextPath === "/update-password") {
    response.cookies.set(
      RECOVERY_MARKER_COOKIE,
      createRecoveryMarker(data.user.id),
      {
        httpOnly: true,
        maxAge: RECOVERY_MARKER_MAX_AGE_SECONDS,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
  }

  return response;
}
