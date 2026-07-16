"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";

export type OrganizationActionState = {
  message?: string;
  status?: "error" | "success";
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

const userAccessSchema = z.object({
  branchId: optionalUuidSchema,
  email: z.email().trim(),
  personId: optionalUuidSchema,
  role: z.enum(["admin", "manager", "member"]),
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
  const { error } = await supabase.rpc("create_organization_branch", {
    p_address: parsed.data.address || null,
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
  });

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
  const { error } = await supabase.rpc("create_organization_team", {
    p_branch_id: parsed.data.branchId,
    p_manager_person_id: parsed.data.managerPersonId,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
  });

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
  const { error } = await supabase.rpc("update_organization_member_access", {
    p_branch_id: parsed.data.branchId,
    p_member_id: parsed.data.memberId,
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
    p_role: parsed.data.role,
  });

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
  });

  if (!parsed.success) {
    return { message: "Enter a valid email and role.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  let { error } = await supabase.rpc("add_existing_organization_member", {
    p_branch_id: parsed.data.branchId,
    p_email: parsed.data.email,
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
    p_role: parsed.data.role,
  });
  let invited = false;

  if (error) {
    if (error.message.includes("User account not found")) {
      const inviteResult = await inviteAuthUser(parsed.data.email);

      if (inviteResult.status === "error") {
        return { message: inviteResult.message, status: "error" };
      }

      invited = inviteResult.status === "invited";
      ({ error } = await supabase.rpc("add_existing_organization_member", {
        p_branch_id: parsed.data.branchId,
        p_email: parsed.data.email,
        p_organization_id: context.organizationId,
        p_person_id: parsed.data.personId,
        p_role: parsed.data.role,
      }));
    }

    if (error) {
      return { message: organizationErrorMessage(error.message), status: "error" };
    }
  }

  revalidateSettings();
  return {
    message: invited ? "Invite sent and access added." : "User access added.",
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
  if (message.includes("Cannot demote the last administrator")) {
    return "Add another administrator before changing this role.";
  }

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

async function inviteAuthUser(
  email: string,
): Promise<{ status: "error" | "invited" | "skipped"; message?: string }> {
  try {
    const { error } = await createSupabaseAdminClient().auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: await getAuthCallbackUrl(),
      },
    );

    if (!error) {
      return { status: "invited" };
    }

    if (isExistingAuthUserError(error.message)) {
      return { status: "skipped" };
    }

    return { message: authAdminErrorMessage(error.message), status: "error" };
  } catch (error) {
    return {
      message:
        error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY")
          ? "Add SUPABASE_SERVICE_ROLE_KEY before sending invites."
          : "We could not send the invite.",
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
  if (message.toLowerCase().includes("email")) {
    return "Use a valid invite email.";
  }

  return "We could not send the invite.";
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
