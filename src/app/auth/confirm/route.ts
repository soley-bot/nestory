import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/server";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";

function redirectTo(
  request: NextRequest,
  destination: string,
) {
  const url = request.nextUrl.clone();
  const target = new URL(destination, request.url);
  url.pathname = target.pathname;
  url.search = target.search;
  return NextResponse.redirect(url);
}

function safeNextPath(value: string | null) {
  if (value === "/update-password") {
    return value;
  }

  if (value) {
    const match = value.match(
      /^\/accept-invite\?invitation=([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    );
    if (match) {
      return `/accept-invite?invitation=${match[1]}`;
    }
  }

  return WORKSPACE_ENTRY_PATH;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return redirectTo(request, "/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.user) {
    return redirectTo(request, "/login");
  }

  return redirectTo(
    request,
    safeNextPath(request.nextUrl.searchParams.get("next")),
  );
}
