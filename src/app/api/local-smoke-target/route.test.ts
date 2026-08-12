import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("local smoke target attestation", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("attests only a loopback app backed by loopback Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";

    const response = await GET(
      new Request("http://localhost:3014/api/local-smoke-target"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      supabaseOrigin: "http://127.0.0.1:54321",
    });
  });

  it("does not attest a localhost app backed by hosted Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://hosted.supabase.co";

    const response = await GET(
      new Request("http://localhost:3014/api/local-smoke-target"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("does not attest an externally addressed app", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";

    const response = await GET(
      new Request("https://nestory.example.com/api/local-smoke-target"),
    );

    expect(response.status).toBe(404);
  });
});
