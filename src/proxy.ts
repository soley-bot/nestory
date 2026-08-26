import { createServerClient } from "@supabase/ssr";
import { isAuthError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthCookieOptions } from "@/lib/auth/tenant";
import { getSupabaseEnv } from "@/lib/db/env";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";
import {
  BROWSER_SECURITY_HEADERS,
  buildContentSecurityPolicy,
} from "@/lib/security/browser-security";
import type { Database } from "@/types/database";

const AUTH_ROUTES = new Set(["/login"]);
const AUTH_CALLBACK_ROUTE = "/auth/callback";
const AUTH_CONFIRM_ROUTE = "/auth/confirm";
const AUTH_COMPLETE_ROUTE = "/auth/complete";
const AUTH_SESSION_ROUTE = "/auth/session";
const PUBLIC_ROUTES = new Set([
  "/",
  "/accept-invite",
  "/api/local-smoke-target",
  AUTH_CALLBACK_ROUTE,
  AUTH_COMPLETE_ROUTE,
  AUTH_CONFIRM_ROUTE,
  AUTH_SESSION_ROUTE,
  "/forgot-password",
  "/request",
  "/update-password",
  ...AUTH_ROUTES,
]);
const REDIRECT_AUTHENTICATED_ROUTES = new Set(["/", ...AUTH_ROUTES]);

function redirectToLogin(
  request: NextRequest,
  contentSecurityPolicy: string,
  currentResponse: NextResponse,
) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const redirect = isServerActionRequest(request)
    ? createSecureServerActionRedirect(
      url,
      currentResponse,
      contentSecurityPolicy,
    )
    : createSecureRedirect(url, currentResponse, contentSecurityPolicy);
  return applyAuthNoStoreHeaders(redirect);
}

function redirectToWorkspace(
  request: NextRequest,
  contentSecurityPolicy: string,
  currentResponse: NextResponse,
) {
  const url = request.nextUrl.clone();
  url.pathname = WORKSPACE_ENTRY_PATH;
  url.search = "";
  return applyAuthNoStoreHeaders(
    createSecureRedirect(url, currentResponse, contentSecurityPolicy),
  );
}

export async function proxy(request: NextRequest) {
  const isPublicRoute = PUBLIC_ROUTES.has(request.nextUrl.pathname);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const requestHeaders = new Headers(request.headers);
  const contentSecurityPolicy = buildContentSecurityPolicy({
    environment: readEnvironment(),
    nonce,
    requestUrl: request.url,
    sentryDsn: process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  let response = createForwardResponse(requestHeaders, contentSecurityPolicy);

  let supabaseUrl: string;
  let supabaseKey: string;

  try {
    ({ supabaseKey, supabaseUrl } = getSupabaseEnv());
  } catch {
    return isPublicRoute
      ? response
      : redirectToLogin(request, contentSecurityPolicy, response);
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        const refreshedCookieHeader = request.headers.get("cookie");
        if (refreshedCookieHeader) {
          requestHeaders.set("cookie", refreshedCookieHeader);
        }

        response = createForwardResponse(requestHeaders, contentSecurityPolicy);

        for (const [key, value] of Object.entries(responseHeaders)) {
          response.headers.set(key, value);
        }

        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  let isAuthenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    isAuthenticated = !error && typeof data?.claims?.sub === "string";
  } catch (error) {
    if (!isAuthError(error)) throw error;
  }

  if (!isAuthenticated && !isPublicRoute) {
    return redirectToLogin(request, contentSecurityPolicy, response);
  }

  if (
    isAuthenticated &&
    REDIRECT_AUTHENTICATED_ROUTES.has(request.nextUrl.pathname)
  ) {
    return redirectToWorkspace(request, contentSecurityPolicy, response);
  }

  return response;
}

function createSecureRedirect(
  url: URL,
  currentResponse: NextResponse,
  contentSecurityPolicy: string,
) {
  const redirect = NextResponse.redirect(url);
  copyRedirectResponseHeaders(currentResponse, redirect);
  for (const cookie of currentResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return applyBrowserSecurityHeaders(redirect, contentSecurityPolicy);
}

function createSecureServerActionRedirect(
  url: URL,
  currentResponse: NextResponse,
  contentSecurityPolicy: string,
) {
  const redirect = new NextResponse(null, { status: 200 });
  copyRedirectResponseHeaders(currentResponse, redirect);
  redirect.headers.set("content-type", "text/plain");
  redirect.headers.set("x-action-redirect", `${url.pathname};replace`);
  for (const cookie of currentResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return applyBrowserSecurityHeaders(redirect, contentSecurityPolicy);
}

function copyRedirectResponseHeaders(
  currentResponse: NextResponse,
  redirect: NextResponse,
) {
  for (const [key, value] of currentResponse.headers) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === "location" ||
      normalizedKey === "set-cookie" ||
      normalizedKey.startsWith("x-middleware-")
    ) {
      continue;
    }
    redirect.headers.set(key, value);
  }
}

function isServerActionRequest(request: NextRequest) {
  return request.method === "POST" && request.headers.has("next-action");
}

function createForwardResponse(
  requestHeaders: Headers,
  contentSecurityPolicy: string,
) {
  return applyBrowserSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    contentSecurityPolicy,
  );
}

function applyBrowserSecurityHeaders(
  response: NextResponse,
  contentSecurityPolicy: string,
) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  for (const { key, value } of BROWSER_SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  return response;
}

function applyAuthNoStoreHeaders(response: NextResponse) {
  if (!response.headers.has("Cache-Control")) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
  }
  if (!response.headers.has("Expires")) {
    response.headers.set("Expires", "0");
  }
  if (!response.headers.has("Pragma")) {
    response.headers.set("Pragma", "no-cache");
  }
  return response;
}

function readEnvironment(): "development" | "production" | "test" {
  if (process.env.NODE_ENV === "development") return "development";
  if (process.env.NODE_ENV === "test") return "test";
  return "production";
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
