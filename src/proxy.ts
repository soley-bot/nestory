import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/db/env";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";
import type { Database } from "@/types/database";

const AUTH_ROUTES = new Set(["/login"]);
const AUTH_CALLBACK_ROUTE = "/auth/callback";
const AUTH_CONFIRM_ROUTE = "/auth/confirm";
const PUBLIC_ROUTES = new Set([
  "/",
  "/accept-invite",
  AUTH_CALLBACK_ROUTE,
  AUTH_CONFIRM_ROUTE,
  "/forgot-password",
  "/signup",
  "/update-password",
  ...AUTH_ROUTES,
]);
const REDIRECT_AUTHENTICATED_ROUTES = new Set(["/", ...AUTH_ROUTES]);

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

function redirectToWorkspace(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = WORKSPACE_ENTRY_PATH;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const isPublicRoute = PUBLIC_ROUTES.has(request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  let supabaseUrl: string;
  let supabaseKey: string;

  try {
    ({ supabaseKey, supabaseUrl } = getSupabaseEnv());
  } catch {
    return isPublicRoute ? response : redirectToLogin(request);
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

  if (!isAuthenticated && !isPublicRoute) {
    return redirectToLogin(request);
  }

  if (
    isAuthenticated &&
    REDIRECT_AUTHENTICATED_ROUTES.has(request.nextUrl.pathname)
  ) {
    return redirectToWorkspace(request);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
