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

const AUTH_REFRESH_HEADERS = {
  "Cache-Control":
    "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};
const CUSTOM_AUTH_REFRESH_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, custom-auth-policy=1",
  Expires: "Thu, 01 Jan 1970 00:00:00 GMT",
  Pragma: "no-cache",
};

function expectAuthRefreshHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe(
    AUTH_REFRESH_HEADERS["Cache-Control"],
  );
  expect(response.headers.get("expires")).toBe(AUTH_REFRESH_HEADERS.Expires);
  expect(response.headers.get("pragma")).toBe(AUTH_REFRESH_HEADERS.Pragma);
}

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

    expect(createServerClient.mock.calls[0][2].cookieOptions).toMatchObject({
      domain: ".nestory-kh.com",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
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
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self' 'nonce-",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expectAuthRefreshHeaders(response);
  });

  it("keeps unauthenticated protected routes behind login", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(
      new NextRequest("http://localhost:3000/tasks?review=open"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
    expect(response.headers.get("x-action-redirect")).toBeNull();
    expectAuthRefreshHeaders(response);
  });

  it("uses the Server Action redirect protocol when a protected action loses authentication", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(
      new NextRequest("https://app.nestory-kh.com/settings/organization", {
        headers: { "next-action": "test-action-id" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-action-redirect")).toBe("/login;replace");
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self' 'nonce-",
    );
    expectAuthRefreshHeaders(response);
  });

  it("preserves refreshed and cleared Auth cookies on a Server Action login redirect", async () => {
    getClaims.mockImplementation(async () => {
      createServerClient.mock.calls[0][2].cookies.setAll([
        {
          name: "sb-refresh",
          options: { httpOnly: true },
          value: "rotated",
        },
        {
          name: "sb-stale",
          options: { httpOnly: true, maxAge: 0 },
          value: "",
        },
      ], AUTH_REFRESH_HEADERS);
      return { data: { claims: null }, error: new Error("expired") };
    });

    const response = await proxy(
      new NextRequest("https://app.nestory-kh.com/settings/organization", {
        headers: { "next-action": "test-action-id" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-action-redirect")).toBe("/login;replace");
    expect(response.cookies.get("sb-refresh")?.value).toBe("rotated");
    expect(response.cookies.get("sb-stale")?.value).toBe("");
    expect(response.cookies.get("sb-stale")?.maxAge).toBe(0);
    expectAuthRefreshHeaders(response);
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the public request route available without a session", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(
      new NextRequest("http://localhost:3000/request?intent=demo"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(/.+/);
  });

  it("keeps the CSP nonce and forwarded nonce aligned after Auth refreshes cookies", async () => {
    getClaims.mockImplementation(async () => {
      createServerClient.mock.calls[0][2].cookies.setAll([
        { name: "sb-test", value: "refreshed", options: { httpOnly: true } },
      ], AUTH_REFRESH_HEADERS);
      return { data: { claims: { sub: "user-1" } }, error: null };
    });

    const response = await proxy(new NextRequest("https://app.nestory-kh.com/account"));
    const nonce = response.headers.get("x-middleware-request-x-nonce");

    expect(nonce).toMatch(/.+/);
    expect(response.headers.get("content-security-policy")).toContain(
      `'nonce-${nonce}'`,
    );
    expect(response.cookies.get("sb-test")?.value).toBe("refreshed");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-test=refreshed",
    );
    expectAuthRefreshHeaders(response);
  });

  it("uses a distinct nonce for every request", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const first = await proxy(new NextRequest("https://app.nestory-kh.com/request"));
    const second = await proxy(new NextRequest("https://app.nestory-kh.com/request"));

    expect(first.headers.get("x-middleware-request-x-nonce")).not.toBe(
      second.headers.get("x-middleware-request-x-nonce"),
    );
  });

  it("keeps refreshed Auth cookies on an authenticated login redirect", async () => {
    getClaims.mockImplementation(async () => {
      createServerClient.mock.calls[0][2].cookies.setAll(
        [
          {
            name: "sb-refresh",
            value: "rotated",
            options: { httpOnly: true },
          },
        ],
        AUTH_REFRESH_HEADERS,
      );
      return { data: { claims: { sub: "user-1" } }, error: null };
    });

    const response = await proxy(new NextRequest("https://app.nestory-kh.com/login"));

    expect(response.headers.get("location")).toBe(
      "https://app.nestory-kh.com/workspace",
    );
    expect(response.cookies.get("sb-refresh")?.value).toBe("rotated");
    expectAuthRefreshHeaders(response);
  });

  it("keeps Auth cookie deletion on a protected-route login redirect", async () => {
    getClaims.mockImplementation(async () => {
      createServerClient.mock.calls[0][2].cookies.setAll([
        { name: "sb-stale", value: "", options: { maxAge: 0 } },
      ], CUSTOM_AUTH_REFRESH_HEADERS);
      return { data: { claims: null }, error: new Error("expired") };
    });

    const response = await proxy(new NextRequest("https://app.nestory-kh.com/tasks"));

    expect(response.headers.get("location")).toBe(
      "https://app.nestory-kh.com/login",
    );
    expect(response.cookies.get("sb-stale")?.value).toBe("");
    expect(response.headers.get("cache-control")).toBe(
      CUSTOM_AUTH_REFRESH_HEADERS["Cache-Control"],
    );
    expect(response.headers.get("expires")).toBe(
      CUSTOM_AUTH_REFRESH_HEADERS.Expires,
    );
    expect(response.headers.get("pragma")).toBe(
      CUSTOM_AUTH_REFRESH_HEADERS.Pragma,
    );
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
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
