import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/db/env";
import type { Database } from "@/types/database";

const AUTH_ROUTES = new Set(["/login", "/signup"]);

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

function redirectToTimeline(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/timeline";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const isAuthRoute = AUTH_ROUTES.has(request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  let supabaseUrl: string;
  let supabaseKey: string;

  try {
    ({ supabaseKey, supabaseUrl } = getSupabaseEnv());
  } catch {
    return isAuthRoute ? response : redirectToLogin(request);
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && typeof data?.claims?.sub === "string";

  if (!isAuthenticated && !isAuthRoute) {
    return redirectToLogin(request);
  }

  if (isAuthenticated && isAuthRoute) {
    return redirectToTimeline(request);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
