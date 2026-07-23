import { describe, expect, it, vi } from "vitest";
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
});
