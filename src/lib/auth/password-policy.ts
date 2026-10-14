import { z } from "zod";

export const NEW_PASSWORD_MIN_LENGTH = 8;
export const NEW_PASSWORD_REQUIREMENT =
  "Use at least 8 characters with lowercase, uppercase, and a number. Symbols are optional.";

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
