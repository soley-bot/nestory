"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getAdminMembershipForUser,
  getCurrentUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AuthFieldErrors = {
  email?: string[];
  organizationName?: string[];
  password?: string[];
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

const organizationSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Enter the company name.")
    .max(120, "Keep the company name under 120 characters."),
});

const signupSchema = loginSchema.extend({
  password: z.string().min(8, "Use at least 8 characters."),
});

const setupSchema = organizationSchema;

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

async function getAuthCallbackUrl() {
  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return new URL("/auth/callback", origin).toString();
}

async function bootstrapAdminOrganization(
  organizationName: string,
  client?: SupabaseServerClient,
): Promise<AuthActionState | null> {
  const supabase = client ?? (await createSupabaseServerClient());
  const { error } = await supabase.rpc("bootstrap_admin_organization", {
    organization_name: organizationName,
  });

  if (error) {
    return {
      message: "We could not create the workspace. Please try again.",
      status: "error",
    };
  }

  return null;
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

  const membership = await getAdminMembershipForUser(data.user.id, supabase);
  redirect(membership ? "/timeline" : "/setup");
}

export async function signupAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    email: readString(formData, "email"),
    password: readString(formData, "password"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const emailRedirectTo = await getAuthCallbackUrl();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    options: {
      emailRedirectTo,
    },
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      message: "We could not create the account. Please try again.",
      status: "error",
    };
  }

  if (data.session) {
    redirect("/setup");
  }

  return {
    message: "Account created. Confirm the email address to continue setup.",
    status: "success",
  };
}

export async function setupOrganizationAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = setupSchema.safeParse({
    organizationName: readString(formData, "organizationName"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const existingMembership = await getAdminMembershipForUser(user.id);

  if (existingMembership) {
    redirect("/timeline");
  }

  const bootstrapError = await bootstrapAdminOrganization(
    parsed.data.organizationName,
  );

  if (bootstrapError) {
    return bootstrapError;
  }

  redirect("/timeline");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
