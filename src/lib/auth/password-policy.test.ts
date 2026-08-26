import { describe, expect, it } from "vitest";
import { newPasswordSchema } from "@/lib/auth/password-policy";

describe("new password policy", () => {
  it.each([
    "Short1",
    "alllowercase1",
    "ALLUPPERCASE1",
    "NoDigitsHere",
  ])("rejects a weak new password: %s", (password) => {
    expect(newPasswordSchema.safeParse(password).success).toBe(false);
  });

  it("accepts a twelve-character mixed-case password with a digit", () => {
    expect(newPasswordSchema.safeParse("NestorySafe1").success).toBe(true);
  });
});
