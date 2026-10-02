"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  RECOVERY_MARKER_COOKIE,
} from "@/lib/auth/recovery-marker";
import { getPasswordRecoveryUser } from "@/lib/auth/recovery-session";
import { getLoginPath, safeLoginNextPath } from "@/lib/auth/login-redirect";
import { recordPasswordCredentialProof } from "@/lib/auth/password-credential-proof";
import { newPasswordSchema } from "@/lib/auth/password-policy";
import { createSupabaseServerClient } from "@/lib/db/server";

type AuthFieldErrors = {
  email?: string[];
  password?: string[];
  passwordConfirm?: string[];
};

export type AuthActionState = {
  fieldErrors?: AuthFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  password: z.string().min(1, "Enter your password."),
});

const recoverySchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
});

const updatePasswordSchema = z
  .object({
    password: newPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: "Passwords do not match.",
    path: ["passwordConfirm"],
  });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): AuthActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as AuthFieldErrors,
    status: "error",
  };
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: readString(formData, "email"),
    password: readString(formData, "password"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return {
      message: "Email or password was not accepted.",
      status: "error",
    };
  }

  const proofRecorded = await recordPasswordCredentialProof(
    data.user.id,
    "password_login",
  );
  if (!proofRecorded) {
    await supabase.auth.signOut();
    return {
      message: "We could not verify this sign-in. Try again.",
      status: "error",
    };
  }

  redirect(safeLoginNextPath(readString(formData, "next")));
}

export async function requestPasswordRecoveryAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = recoverySchema.safeParse({
    email: readString(formData, "email"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  return {
    message: "If that account exists, a password reset link has been sent.",
    status: "success",
  };
}

export async function updatePasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: readString(formData, "password"),
    passwordConfirm: readString(formData, "passwordConfirm"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const recoveryUser = await getPasswordRecoveryUser(supabase);
  if (!recoveryUser) {
    return {
      message: "Open a fresh password recovery link and try again.",
      status: "error",
    };
  }

  const cookieStore = await cookies();

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      message: "We could not update the password. Request a new recovery link.",
      status: "error",
    };
  }

  const proofRecorded = await recordPasswordCredentialProof(
    recoveryUser.id,
    "password_recovery",
  );
  if (!proofRecorded) {
    cookieStore.delete(RECOVERY_MARKER_COOKIE);
    await supabase.auth.signOut();
    return {
      message: "Your password was updated. Sign in with it to finish securing your account.",
      status: "error",
    };
  }

  cookieStore.delete(RECOVERY_MARKER_COOKIE);
  await supabase.auth.signOut();
  redirect("/login?password=updated");
}

export async function signOutAction(formData?: FormData) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(getLoginPath(formData ? readString(formData, "next") : null));
}
