import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/server";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";

function redirectTo(
  request: NextRequest,
  pathname: "/login" | typeof WORKSPACE_ENTRY_PATH,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
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

  return redirectTo(request, WORKSPACE_ENTRY_PATH);
}
