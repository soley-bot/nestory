import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
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
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return authRedirectResponse(request, "/login");
  }

  const response = authRedirectResponse(
    request,
    safeAuthNextPath(request.nextUrl.searchParams.get("next")),
  );
  const supabase = createSupabaseAuthRouteClient(request, response);
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.user) {
    return authRedirectResponse(request, "/login", response);
  }

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

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  const failurePath =
    "/auth/complete?error=access_denied&error_code=otp_expired&next=%2Fupdate-password";

  if (typeof tokenHash !== "string" || type !== "recovery") {
    return NextResponse.redirect(new URL(failurePath, request.url), 303);
  }

  const response = NextResponse.redirect(
    new URL("/update-password", request.url),
    303,
  );
  const supabase = createSupabaseAuthRouteClient(request, response);
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error || !data.user) {
    return authRedirectResponse(request, failurePath, response);
  }

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

  return response;
}
