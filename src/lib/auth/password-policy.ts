import { z } from "zod";

export const NEW_PASSWORD_MIN_LENGTH = 8;
export const NEW_PASSWORD_REQUIREMENT =
  "Use at least 8 characters with lowercase, uppercase, and a number. Symbols are optional.";

export function getNewPasswordRejectionMessage(error: unknown): string | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "weak_password"
  ) {
    return null;
  }

  // Match provider codes only; raw messages can contain private request details.
  if ("reasons" in error && Array.isArray(error.reasons) && error.reasons.includes("pwned")) {
    return "This password has appeared in a data breach. Choose a different password that you have not used elsewhere.";
  }

  return NEW_PASSWORD_REQUIREMENT;
}

export const newPasswordSchema = z.string().superRefine((password, context) => {
  if (
    password.length < NEW_PASSWORD_MIN_LENGTH ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    context.addIssue({
      code: "custom",
      message: NEW_PASSWORD_REQUIREMENT,
    });
  }
});
