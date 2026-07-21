"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";
import {
  RECOVERY_MARKER_COOKIE,
  verifyRecoveryMarker,
} from "@/lib/auth/recovery-marker";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";
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
    password: z.string().min(8, "Use at least 8 characters."),
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

  redirect(WORKSPACE_ENTRY_PATH);
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
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: getAuthCallbackUrl("/auth/confirm", "/update-password"),
  });

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
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return {
      message: "Open a fresh password recovery link and try again.",
      status: "error",
    };
  }

  const cookieStore = await cookies();
  let recoveryMarkerValid = false;
  try {
    recoveryMarkerValid = verifyRecoveryMarker(
      cookieStore.get(RECOVERY_MARKER_COOKIE)?.value,
      data.user.id,
    );
  } catch {
    recoveryMarkerValid = false;
  }
  if (!recoveryMarkerValid) {
    return {
      message: "Open a fresh password recovery link and try again.",
      status: "error",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      message: "We could not update the password. Request a new recovery link.",
      status: "error",
    };
  }

  cookieStore.delete(RECOVERY_MARKER_COOKIE);
  await supabase.auth.signOut();
  redirect("/login?password=updated");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
