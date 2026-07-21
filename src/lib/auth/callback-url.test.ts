import { afterEach, describe, expect, it } from "vitest";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";

const originalAppUrl = process.env.NESTORY_APP_URL;
const originalVercelUrl = process.env.VERCEL_URL;

afterEach(() => {
  restoreEnvironment("NESTORY_APP_URL", originalAppUrl);
  restoreEnvironment("VERCEL_URL", originalVercelUrl);
});

describe("getAuthCallbackUrl", () => {
  it("uses the trusted application URL and encodes an internal destination", () => {
    process.env.NESTORY_APP_URL = "https://app.example.com";
    delete process.env.VERCEL_URL;

    expect(
      getAuthCallbackUrl(
        "/auth/confirm",
        "/accept-invite?invitation=11111111-1111-4111-8111-111111111111",
      ),
    ).toBe(
      "https://app.example.com/auth/confirm?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111",
    );
  });

  it("uses the Vercel deployment hostname when no canonical URL is configured", () => {
    delete process.env.NESTORY_APP_URL;
    process.env.VERCEL_URL = "nestory-preview.vercel.app";

    expect(getAuthCallbackUrl("/auth/confirm", "/update-password")).toBe(
      "https://nestory-preview.vercel.app/auth/confirm?next=%2Fupdate-password",
    );
  });

  it("rejects configured URLs with credentials or a non-root path", () => {
    process.env.NESTORY_APP_URL = "https://user:pass@app.example.com/auth";

    expect(() => getAuthCallbackUrl("/auth/confirm")).toThrow(
      "NESTORY_APP_URL must be an HTTP(S) application origin.",
    );
  });

  it("rejects external or protocol-relative callback routes", () => {
    process.env.NESTORY_APP_URL = "https://app.example.com";

    expect(() => getAuthCallbackUrl("https://evil.example/callback")).toThrow(
      "Auth callback route must be an internal path.",
    );
    expect(() => getAuthCallbackUrl("//evil.example/callback")).toThrow(
      "Auth callback route must be an internal path.",
    );
  });
});

function restoreEnvironment(key: "NESTORY_APP_URL" | "VERCEL_URL", value?: string) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
