import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/db/env", () => ({
  getSupabaseEnv: () => ({ supabaseUrl: "https://example.supabase.co" }),
}));

import { createSupabaseAdminClient } from "@/lib/db/admin";

describe("createSupabaseAdminClient", () => {
  beforeEach(() => {
    createClient.mockClear();
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("removes a leading BOM and surrounding whitespace from the server secret", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = " \uFEFFsb_secret_example \r\n";

    createSupabaseAdminClient();

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_secret_example",
      expect.any(Object),
    );
  });
});
