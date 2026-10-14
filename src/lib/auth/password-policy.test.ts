import { describe, expect, it } from "vitest";
import { AuthWeakPasswordError } from "@supabase/supabase-js";
import {
  getNewPasswordRejectionMessage,
  NEW_PASSWORD_REQUIREMENT,
  newPasswordSchema,
} from "@/lib/auth/password-policy";

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

describe("provider password rejection messages", () => {
  const privateDetails = "password=CorrectHorse9Battery email=private@example.invalid token=provider-token-canary";

  it.each([
    new AuthWeakPasswordError(privateDetails, 422, ["length"]),
    new AuthWeakPasswordError(privateDetails, 422, ["characters"]),
    new AuthWeakPasswordError(privateDetails, 422, []),
    { code: "weak_password", message: privateDetails },
    { code: "weak_password", reasons: ["unknown-reason"], message: privateDetails },
    { code: "weak_password", reasons: "pwned", message: privateDetails },
  ])("uses the shared policy for a recognized weak-password error %#", (error) => {
    expect(getNewPasswordRejectionMessage(error)).toBe(NEW_PASSWORD_REQUIREMENT);
  });

  it("prioritizes leaked-password guidance without echoing provider details", () => {
    const error = new AuthWeakPasswordError(privateDetails, 422, ["characters", "pwned"]);

    expect(getNewPasswordRejectionMessage(error)).toBe(
      "This password has appeared in a data breach. Choose a different password that you have not used elsewhere.",
    );
  });

  it.each([
    null,
    undefined,
    privateDetails,
    new Error(`weak_password pwned ${privateDetails}`),
    { code: "unexpected_failure", reasons: ["pwned"], message: privateDetails },
    { name: "AuthWeakPasswordError", message: privateDetails },
  ])("leaves unknown errors to the caller's safe fallback %#", (error) => {
    expect(getNewPasswordRejectionMessage(error)).toBeNull();
  });
});
