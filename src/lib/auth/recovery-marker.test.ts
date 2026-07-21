import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRecoveryMarker,
  verifyRecoveryMarker,
} from "@/lib/auth/recovery-marker";

describe("password recovery markers", () => {
  const originalSecret = process.env.NESTORY_AUTH_COOKIE_SECRET;

  beforeEach(() => {
    process.env.NESTORY_AUTH_COOKIE_SECRET = "test-recovery-cookie-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.NESTORY_AUTH_COOKIE_SECRET;
    } else {
      process.env.NESTORY_AUTH_COOKIE_SECRET = originalSecret;
    }
  });

  it("binds a short-lived signed marker to the recovered user", () => {
    const now = Date.UTC(2026, 6, 21, 12, 0, 0);
    const marker = createRecoveryMarker("user-1", now);

    expect(verifyRecoveryMarker(marker, "user-1", now + 60_000)).toBe(true);
    expect(verifyRecoveryMarker(marker, "user-2", now + 60_000)).toBe(false);
    expect(verifyRecoveryMarker(marker, "user-1", now + 601_000)).toBe(false);
    expect(
      verifyRecoveryMarker(`${marker.slice(0, -1)}x`, "user-1", now + 60_000),
    ).toBe(false);
  });
});
