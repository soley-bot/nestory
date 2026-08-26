import { afterEach, describe, expect, it, vi } from "vitest";

const { cookieStore, createServerClient } = vi.hoisted(() => ({
  cookieStore: {
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  },
  createServerClient: vi.fn((_url, _key, options) => options),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue(cookieStore) }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/db/env", () => ({
  getSupabaseEnv: () => ({
    supabaseKey: "publishable-key",
    supabaseUrl: "https://example.supabase.co",
  }),
}));

import { createSupabaseServerClient } from "@/lib/db/server";

const originalRootDomain = process.env.APP_ROOT_DOMAIN;

afterEach(() => {
  if (originalRootDomain === undefined) {
    delete process.env.APP_ROOT_DOMAIN;
  } else {
    process.env.APP_ROOT_DOMAIN = originalRootDomain;
  }
});

describe("createSupabaseServerClient", () => {
  it("keeps server-action Auth cookies valid on company subdomains", async () => {
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";

    const client = await createSupabaseServerClient() as unknown as {
      cookieOptions?: { domain?: string };
    };

    expect(client.cookieOptions).toMatchObject({
      domain: ".nestory-kh.com",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
  });
});
