import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims },
  }),
}));

vi.mock("@/lib/db/env", () => ({
  getSupabaseEnv: () => ({
    supabaseKey: "test-anon-key",
    supabaseUrl: "https://example.supabase.co",
  }),
}));

import { proxy } from "@/proxy";

describe("proxy", () => {
  beforeEach(() => {
    getClaims.mockReset();
  });

  it("sends an authenticated login visit through the role-aware workspace entry", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });

    const response = await proxy(
      new NextRequest("http://localhost:3000/login"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/workspace",
    );
  });

  it("keeps unauthenticated protected routes behind login", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(
      new NextRequest("http://localhost:3000/tasks?review=open"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });
});
