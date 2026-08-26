import { describe, expect, it } from "vitest";
import {
  createPrivilegedStepUpDigest,
  generatePrivilegedStepUpCode,
} from "@/lib/auth/privileged-step-up-crypto";

describe("privileged email step-up challenge material", () => {
  it("generates an eight-digit code", () => {
    expect(generatePrivilegedStepUpCode()).toMatch(/^\d{8}$/);
  });

  it("binds the HMAC digest to purpose, organization, user, and session", () => {
    const base = {
      organizationId: "org-1",
      secret: "a-secret-long-enough-for-this-focused-unit-test",
      sessionId: "session-1",
      userId: "user-1",
      value: "12345678",
    };
    const digest = createPrivilegedStepUpDigest({ ...base, purpose: "code" });

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(createPrivilegedStepUpDigest({ ...base, purpose: "email" })).not.toBe(digest);
    expect(createPrivilegedStepUpDigest({ ...base, sessionId: "session-2", purpose: "code" })).not.toBe(digest);
  });
});
