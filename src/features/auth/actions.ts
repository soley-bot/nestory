"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getCurrentUser,
  getCurrentOrganizationSlug,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AuthFieldErrors = {
  email?: string[];
  organizationName?: string[];
  password?: string[];
  workspaceSlug?: string[];
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

const workspaceSlugSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(63, "Keep the workspace URL under 63 characters.")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers, and hyphens.",
  )
  .refine((value) => !["api", "app", "www"].includes(value), {
    message: "That workspace URL is reserved.",
  });

const signupSchema = loginSchema.extend({
  password: z.string().min(8, "Use at least 8 characters."),
});

const setupSchema = organizationSchema.extend({
  workspaceSlug: workspaceSlugSchema,
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
  workspaceSlug: string,
  client?: SupabaseServerClient,
): Promise<AuthActionState | null> {
  const supabase = client ?? (await createSupabaseServerClient());
  const { error } = await supabase.rpc("bootstrap_admin_organization", {
    organization_name: organizationName,
    workspace_slug: workspaceSlug,
  });

  if (error) {
    if (error.message.includes("Workspace URL is already taken")) {
      return {
        fieldErrors: {
          workspaceSlug: ["That workspace URL is already taken."],
        },
        status: "error",
      };
    }

    if (
      error.message.includes("Workspace URL is invalid") ||
      error.message.includes("Workspace URL is reserved")
    ) {
      return {
        fieldErrors: {
          workspaceSlug: ["Choose another workspace URL."],
        },
        status: "error",
      };
    }

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

  const organizationSlug = await getCurrentOrganizationSlug();
  const membership = await getWorkspaceMembershipForUser(data.user.id, supabase, {
    organizationSlug,
  });

  redirect(membership ? "/overview" : organizationSlug ? "/no-access" : "/setup");
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

  const organizationSlug = await getCurrentOrganizationSlug();

  if (organizationSlug) {
    redirect("/no-access");
  }

  const parsed = setupSchema.safeParse({
    organizationName: readString(formData, "organizationName"),
    workspaceSlug: readString(formData, "workspaceSlug"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const existingMembership = await getWorkspaceMembershipForUser(user.id);

  if (existingMembership) {
    redirect("/overview");
  }

  const bootstrapError = await bootstrapAdminOrganization(
    parsed.data.organizationName,
    parsed.data.workspaceSlug,
  );

  if (bootstrapError) {
    return bootstrapError;
  }

  redirect("/overview");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
