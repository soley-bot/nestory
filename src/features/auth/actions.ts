"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
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
  email: z.email("Enter a valid email address.").trim(),
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

async function getAuthCallbackUrl(nextPath?: string, route = "/auth/callback") {
  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const callbackUrl = new URL(route, origin);
  if (nextPath) {
    callbackUrl.searchParams.set("next", nextPath);
  }
  return callbackUrl.toString();
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
    redirectTo: await getAuthCallbackUrl("/update-password", "/auth/confirm"),
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

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      message: "We could not update the password. Request a new recovery link.",
      status: "error",
    };
  }

  await supabase.auth.signOut();
  redirect("/login?password=updated");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
