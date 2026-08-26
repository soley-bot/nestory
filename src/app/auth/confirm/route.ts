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
import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";

const MAX_CONFIRM_BODY_BYTES = 4 * 1024;
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return authRedirectResponse(request, "/login");
  }

  if (type === "recovery") {
    const params = new URLSearchParams({ token_hash: tokenHash, type });
    return authRedirectResponse(request, `/auth/complete?${params.toString()}`);
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

  return response;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return confirmErrorResponse(403);
  }

  const body = await readBoundedRequestBody(request, MAX_CONFIRM_BODY_BYTES);
  if (!body.ok) {
    return confirmErrorResponse(body.status);
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== FORM_CONTENT_TYPE) {
    return confirmErrorResponse(415);
  }

  const formData = new URLSearchParams(body.text);
  const tokenValues = formData.getAll("token_hash");
  const typeValues = formData.getAll("type");
  const hasOnlyExpectedFields = Array.from(formData.keys()).every(
    (key) => key === "token_hash" || key === "type",
  );
  const tokenHash = tokenValues.length === 1 ? tokenValues[0] : null;
  const type = typeValues.length === 1 ? typeValues[0] : null;
  const failurePath =
    "/auth/complete?error=access_denied&error_code=otp_expired&next=%2Fupdate-password";

  if (
    !hasOnlyExpectedFields ||
    !tokenHash ||
    tokenHash.length > 2_048 ||
    !/^[\x21-\x7E]+$/.test(tokenHash) ||
    type !== "recovery"
  ) {
    return confirmRedirectResponse(request, failurePath);
  }

  const response = confirmRedirectResponse(request, "/update-password");
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

function confirmErrorResponse(status: number) {
  return NextResponse.json(
    { error: "This email link is invalid or has expired." },
    { headers: { "cache-control": "no-store" }, status },
  );
}

function confirmRedirectResponse(request: NextRequest, destination: string) {
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("cache-control", "no-store");
  return response;
}
