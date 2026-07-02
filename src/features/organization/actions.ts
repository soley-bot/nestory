"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";

export type OrganizationActionState = {
  message?: string;
  status?: "error" | "success";
};

type UntypedSupabaseClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};

const uuidShapeSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const optionalUuidSchema = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(uuidShapeSchema.nullable());

const branchSchema = z.object({
  address: z.string().trim().max(240),
  code: z.string().trim().min(2).max(16),
  name: z.string().trim().min(2).max(120),
});

const teamSchema = z.object({
  branchId: optionalUuidSchema,
  managerPersonId: optionalUuidSchema,
  name: z.string().trim().min(2).max(120),
});

const memberSchema = z.object({
  branchId: optionalUuidSchema,
  memberId: uuidShapeSchema,
  personId: optionalUuidSchema,
  role: z.enum(["admin", "manager", "member"]),
});

const temporaryPasswordSchema = z
  .string()
  .transform((value) => (value.length > 0 ? value : null))
  .pipe(z.string().min(8).nullable());

const userAccessSchema = z.object({
  branchId: optionalUuidSchema,
  email: z.email().trim(),
  personId: optionalUuidSchema,
  role: z.enum(["admin", "manager", "member"]),
  temporaryPassword: temporaryPasswordSchema,
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function createBranchAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = branchSchema.safeParse({
    address: readString(formData, "address"),
    code: readString(formData, "code"),
    name: readString(formData, "name"),
  });

  if (!parsed.success) {
    return { message: "Enter a branch name and code.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await (supabase as unknown as UntypedSupabaseClient).rpc(
    "create_organization_branch",
    {
      p_address: parsed.data.address || null,
      p_code: parsed.data.code,
      p_name: parsed.data.name,
      p_organization_id: context.organizationId,
    },
  );

  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return { message: "Branch added.", status: "success" };
}

export async function createTeamAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = teamSchema.safeParse({
    branchId: readString(formData, "branchId"),
    managerPersonId: readString(formData, "managerPersonId"),
    name: readString(formData, "name"),
  });

  if (!parsed.success) {
    return { message: "Enter a team name.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await (supabase as unknown as UntypedSupabaseClient).rpc(
    "create_organization_team",
    {
      p_branch_id: parsed.data.branchId,
      p_manager_person_id: parsed.data.managerPersonId,
      p_name: parsed.data.name,
      p_organization_id: context.organizationId,
    },
  );

  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return { message: "Team added.", status: "success" };
}

export async function updateMemberAccessAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = memberSchema.safeParse({
    branchId: readString(formData, "branchId"),
    memberId: readString(formData, "memberId"),
    personId: readString(formData, "personId"),
    role: readString(formData, "role"),
  });

  if (!parsed.success) {
    return { message: "Choose a valid role and membership.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await (supabase as unknown as UntypedSupabaseClient).rpc(
    "update_organization_member_access",
    {
      p_branch_id: parsed.data.branchId,
      p_member_id: parsed.data.memberId,
      p_organization_id: context.organizationId,
      p_person_id: parsed.data.personId,
      p_role: parsed.data.role,
    },
  );

  if (error) {
    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return { message: "Access updated.", status: "success" };
}

export async function addExistingUserAccessAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireAdminContext();
  const parsed = userAccessSchema.safeParse({
    branchId: readString(formData, "branchId"),
    email: readString(formData, "email"),
    personId: readString(formData, "personId"),
    role: readString(formData, "role"),
    temporaryPassword: readString(formData, "temporaryPassword"),
  });

  if (!parsed.success) {
    return { message: "Enter a valid email, role, and 8+ character password.", status: "error" };
  }

  const authResult = await createAuthUserIfNeeded({
    email: parsed.data.email,
    password: parsed.data.temporaryPassword,
  });

  if (authResult.status === "error") {
    return { message: authResult.message, status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await (supabase as unknown as UntypedSupabaseClient).rpc(
    "add_existing_organization_member",
    {
      p_branch_id: parsed.data.branchId,
      p_email: parsed.data.email,
      p_organization_id: context.organizationId,
      p_person_id: parsed.data.personId,
      p_role: parsed.data.role,
    },
  );

  if (error) {
    if (error.message.includes("User account not found") && !parsed.data.temporaryPassword) {
      return {
        message: "Enter a temporary password to create this user.",
        status: "error",
      };
    }

    return { message: organizationErrorMessage(error.message), status: "error" };
  }

  revalidateSettings();
  return {
    message:
      authResult.status === "created"
        ? "User created and access added."
        : "User access added.",
    status: "success",
  };
}

function revalidateSettings() {
  revalidatePath("/settings");
  revalidatePath("/users-roles");
  revalidatePath("/maintenance");
  revalidatePath("/tasks");
}

function organizationErrorMessage(message: string) {
  if (
    message.includes("add_existing_organization_member") ||
    message.includes("Could not find the function")
  ) {
    return "The add-user database function is not deployed yet.";
  }

  if (message.includes("User account not found")) {
    return "That email has not signed up yet.";
  }

  if (message.includes("duplicate key")) {
    return "That code or team name is already in use.";
  }

  if (message.includes("Branch not found")) {
    return "Choose an active branch.";
  }

  if (message.includes("Person not found") || message.includes("Manager person not found")) {
    return "Choose an active person.";
  }

  return "We could not save the organization setting.";
}

async function createAuthUserIfNeeded({
  email,
  password,
}: {
  email: string;
  password: string | null;
}): Promise<{ status: "created" | "error" | "skipped"; message?: string }> {
  if (!password) {
    return { status: "skipped" };
  }

  try {
    const { error } = await createSupabaseAdminClient().auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });

    if (!error) {
      return { status: "created" };
    }

    if (isExistingAuthUserError(error.message)) {
      return { status: "skipped" };
    }

    return { message: authAdminErrorMessage(error.message), status: "error" };
  } catch (error) {
    return {
      message:
        error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY")
          ? "Add SUPABASE_SERVICE_ROLE_KEY before creating users with passwords."
          : "We could not create the auth user.",
      status: "error",
    };
  }
}

function isExistingAuthUserError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("already") ||
    normalized.includes("registered") ||
    normalized.includes("exists")
  );
}

function authAdminErrorMessage(message: string) {
  if (message.toLowerCase().includes("password")) {
    return "Use a stronger temporary password.";
  }

  return "We could not create the auth user.";
}
