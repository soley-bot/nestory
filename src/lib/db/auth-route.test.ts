import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn((_url, _key, options) => options),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/db/env", () => ({
  getSupabaseEnv: () => ({
    supabaseKey: "publishable-key",
    supabaseUrl: "https://example.supabase.co",
  }),
}));

import { createSupabaseAuthRouteClient } from "@/lib/db/auth-route";

const originalRootDomain = process.env.APP_ROOT_DOMAIN;

afterEach(() => {
  if (originalRootDomain === undefined) {
    delete process.env.APP_ROOT_DOMAIN;
  } else {
    process.env.APP_ROOT_DOMAIN = originalRootDomain;
  }
});

describe("createSupabaseAuthRouteClient", () => {
  it("reads request cookies and writes Auth cookies to the returned response", () => {
    const request = new NextRequest("https://app.example.com/auth/confirm", {
      headers: { cookie: "existing=value" },
    });
    const response = NextResponse.redirect(
      new URL("/accept-invite", request.url),
    );

    const client = createSupabaseAuthRouteClient(request, response) as unknown as {
      cookies: {
        getAll(): { name: string; value: string }[];
        setAll(values: { name: string; value: string; options: { httpOnly: boolean } }[]): void;
      };
    };

    expect(client.cookies.getAll()).toEqual(
      expect.arrayContaining([{ name: "existing", value: "value" }]),
    );

    client.cookies.setAll([
      {
        name: "sb-session",
        value: "verified",
        options: { httpOnly: true },
      },
    ]);

    expect(response.cookies.get("sb-session")?.value).toBe("verified");
  });

  it("shares verified Auth cookies with company subdomains in production", () => {
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";
    const request = new NextRequest("https://www.nestory-kh.com/auth/complete");
    const response = NextResponse.redirect(
      new URL("/accept-invite", request.url),
    );

    const client = createSupabaseAuthRouteClient(
      request,
      response,
    ) as unknown as { cookieOptions?: { domain?: string } };

    expect(client.cookieOptions).toEqual({ domain: ".nestory-kh.com" });
  });
});
