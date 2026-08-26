import { type NextRequest } from "next/server";
import { createSupabaseAuthRouteClient } from "@/lib/db/auth-route";
import {
  authRedirectResponse,
  safeAuthNextPath,
} from "@/lib/auth/redirect";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return authRedirectResponse(request, "/login");
  }

  const requestedNextPath = safeAuthNextPath(
    request.nextUrl.searchParams.get("next"),
  );
  const nextPath =
    requestedNextPath === "/update-password"
      ? WORKSPACE_ENTRY_PATH
      : requestedNextPath;
  const response = authRedirectResponse(request, nextPath);
  const supabase = createSupabaseAuthRouteClient(request, response);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return authRedirectResponse(request, "/login", response);
  }

  return response;
}
