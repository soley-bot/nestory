import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";

export function authRedirectResponse(
  request: NextRequest,
  destination: string,
) {
  const url = request.nextUrl.clone();
  const target = new URL(destination, request.url);
  url.pathname = target.pathname;
  url.search = target.search;

  return NextResponse.redirect(url);
}

export function safeAuthNextPath(value: string | null) {
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
