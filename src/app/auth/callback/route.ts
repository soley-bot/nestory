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
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return redirectTo(request, "/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return redirectTo(request, "/login");
  }

  return redirectTo(request, WORKSPACE_ENTRY_PATH);
}
