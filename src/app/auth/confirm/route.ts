import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/server";
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
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return authRedirectResponse(request, "/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.user) {
    return authRedirectResponse(request, "/login");
  }

  const response = authRedirectResponse(
    request,
    safeAuthNextPath(request.nextUrl.searchParams.get("next")),
  );

  if (type === "recovery") {
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
