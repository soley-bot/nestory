import { NextResponse, type NextRequest } from "next/server";
import { getAdminMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

function redirectTo(request: NextRequest, pathname: "/login" | "/setup" | "/timeline") {
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

  const membership = await getAdminMembershipForUser(data.user.id, supabase);
  return redirectTo(request, membership ? "/timeline" : "/setup");
}
