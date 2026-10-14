import { describe, expect, it } from "vitest";
import { newPasswordSchema } from "@/lib/auth/password-policy";

describe("new password policy", () => {
  it.each([
    "Abcdef1",
    "abcdefg1",
    "ABCDEFG1",
    "Abcdefgh",
  ])("rejects a weak new password: %s", (password) => {
    expect(newPasswordSchema.safeParse(password).success).toBe(false);
  });

  it.each(["Abcdefg1", "Abcdef1!", "NestorySafe1"])(
    "accepts a mixed-case password with a digit at or above eight characters: %s",
    (password) => {
      expect(newPasswordSchema.safeParse(password).success).toBe(true);
    },
  );
});
