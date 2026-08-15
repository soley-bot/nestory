import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getClaims } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
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
    createServerClient.mockReset();
    createServerClient.mockReturnValue({ auth: { getClaims } });
  });

  it("keeps refreshed Auth cookies valid on company subdomains", async () => {
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    await proxy(new NextRequest("https://www.nestory-kh.com/login"));

    expect(createServerClient.mock.calls[0][2].cookieOptions).toEqual({
      domain: ".nestory-kh.com",
    });
    delete process.env.APP_ROOT_DOMAIN;
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

  it("keeps the public request route available without a session", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(
      new NextRequest("http://localhost:3000/request?intent=demo"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("keeps the fail-closed local target attestation available before login", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(
      new NextRequest("http://localhost:3000/api/local-smoke-target"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it.each(["/auth/complete?next=%2Faccept-invite", "/auth/session"])(
    "keeps the implicit email boundary public without a session: %s",
    async (path) => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(
      new NextRequest(`http://localhost:3000${path}`),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
    },
  );
});
