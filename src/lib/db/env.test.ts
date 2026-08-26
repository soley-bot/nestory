import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabaseEnv } from "@/lib/db/env";

describe("getSupabaseEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a remote plaintext Supabase origin before a service-role client can use it", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://project.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");

    expect(() => getSupabaseEnv()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL must use HTTPS for non-local hosts.",
    );
  });

  it("retains plaintext loopback support for the local Supabase stack", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");

    expect(getSupabaseEnv()).toEqual({
      supabaseKey: "publishable-test-key",
      supabaseUrl: "http://127.0.0.1:54321",
    });
  });

  it.each([
    "http://localhost:54321",
    "http://[::1]:54321",
    "http://host.docker.internal:54321",
    "https://project.supabase.co",
  ])("accepts the supported local or encrypted origin %s", (supabaseUrl) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");

    expect(getSupabaseEnv().supabaseUrl).toBe(new URL(supabaseUrl).origin);
  });

  it.each([
    "http://localhost.example.com:54321",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/rest/v1",
    "https://project.supabase.co?redirect=elsewhere",
  ])("rejects the unsafe or non-origin URL %s", (supabaseUrl) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");

    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL must/);
  });
});
