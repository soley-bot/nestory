import { describe, expect, it } from "vitest";

import {
  createPublicInterestRateLimitKey,
  getTrustedPublicClientSubject,
} from "@/lib/security/public-interest-rate-limit";

const secret = "test-only-public-interest-secret-32-bytes";

describe("public-interest rate-limit identity", () => {
  it("uses only Vercel's normalized forwarding header in production", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.99",
      "x-vercel-forwarded-for": "203.0.113.17",
    });

    expect(
      getTrustedPublicClientSubject(headers, {
        nodeEnv: "production",
        vercel: "1",
      }),
    ).toBe("203.0.113.17");
  });

  it("rejects ambiguous or malformed production forwarding values", () => {
    for (const value of [
      "203.0.113.17, 198.51.100.99",
      "not-an-ip",
      "203.0.113.17:443",
    ]) {
      expect(
        getTrustedPublicClientSubject(
          new Headers({ "x-vercel-forwarded-for": value }),
          { nodeEnv: "production", vercel: "1" },
        ),
      ).toBeNull();
    }
  });

  it("fails closed in an untrusted production environment", () => {
    expect(
      getTrustedPublicClientSubject(
        new Headers({ "x-forwarded-for": "203.0.113.17" }),
        { nodeEnv: "production", vercel: undefined },
      ),
    ).toBeNull();
  });

  it("uses one non-identifying sentinel for local development", () => {
    expect(
      getTrustedPublicClientSubject(new Headers(), {
        nodeEnv: "test",
        vercel: undefined,
      }),
    ).toBe("local-development");
  });

  it("returns a rotating 32-byte HMAC without embedding the source address", () => {
    const first = createPublicInterestRateLimitKey(
      "203.0.113.17",
      secret,
      new Date("2026-08-25T23:59:59.000Z"),
    );
    const nextDay = createPublicInterestRateLimitKey(
      "203.0.113.17",
      secret,
      new Date("2026-08-26T00:00:00.000Z"),
    );

    expect(first).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(first).not.toContain("203.0.113.17");
    expect(nextDay).not.toBe(first);
  });

  it("rejects secrets that are too short", () => {
    expect(() =>
      createPublicInterestRateLimitKey(
        "203.0.113.17",
        "short",
        new Date("2026-08-26T00:00:00.000Z"),
      ),
    ).toThrow("PUBLIC_INTEREST_RATE_LIMIT_SECRET");
  });
});
