"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
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

function revalidateSettings() {
  revalidatePath("/settings");
  revalidatePath("/users-roles");
  revalidatePath("/maintenance");
  revalidatePath("/tasks");
}

function organizationErrorMessage(message: string) {
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
