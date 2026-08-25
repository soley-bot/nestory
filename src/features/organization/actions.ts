"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  ACCENT_PRESET_NAMES,
  normalizeHexColor,
  THEME_MODES,
} from "@/lib/theme/organization-theme";
import {
  isPermissionKey,
  normalizePermissionSelection,
  type PermissionKey,
} from "@/lib/auth/permission-catalog";
import {
  getCompanyLogoStoragePath,
  validateCompanyLogo,
} from "@/features/organization/company-logo";

export type OrganizationActionState = {
  message?: string;
  status?: "error" | "success";
};

export type OrganizationRoleSaveRequest = {
  confirmRemovals: boolean;
  expectedVersion: number | null;
  id: string | null;
  name: string;
  permissions: PermissionKey[];
};

export type OrganizationRoleMutationResult =
  | { affectedUserCount: number; kind: "confirmation_required" }
  | { kind: "error"; message: string }
  | {
      kind: "saved";
      permissions?: PermissionKey[];
      roleId: string;
      version?: number;
    }
  | { kind: "stale" };

export type OrganizationStructureMutationResult =
  | { kind: "error"; message: string }
  | { kind: "saved"; message: string };

export type OrganizationBranchUpdateRequest = {
  address: string;
  code: string;
  id: string;
  name: string;
};

export type OrganizationTeamUpdateRequest = {
  branchId: string | null;
  id: string;
  managerPersonId: string | null;
  name: string;
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
  customRoleId: optionalUuidSchema,
  memberId: uuidShapeSchema,
  personId: optionalUuidSchema,
  roleKind: z.enum(["super_admin", "custom"]),
});

const branchUpdateSchema = branchSchema.extend({ id: uuidShapeSchema });
const teamUpdateSchema = teamSchema.extend({ id: uuidShapeSchema });

const userAccessSchema = z.object({
  branchId: optionalUuidSchema,
  customRoleId: optionalUuidSchema,
  email: z.string().trim().toLowerCase().pipe(z.email()),
  personId: optionalUuidSchema,
  roleKind: z.enum(["super_admin", "custom"]),
});
const invitationIdSchema = z.object({ invitationId: uuidShapeSchema });
const memberIdSchema = z.object({ memberId: uuidShapeSchema });
const appearanceSchema = z.object({
  accentPreset: z.enum(ACCENT_PRESET_NAMES),
  accentSeed: z.string().trim(),
  mode: z.enum(THEME_MODES),
});
const organizationIdentitySchema = z.object({
  name: z.string().trim().min(2).max(120),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updateOrganizationAppearanceAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
  const parsed = appearanceSchema.safeParse({
    accentPreset: readString(formData, "accentPreset"),
    accentSeed: readString(formData, "accentSeed"),
    mode: readString(formData, "mode"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid theme and accent.", status: "error" };
  }

  const accentSeed =
    parsed.data.accentPreset === "custom"
      ? normalizeHexColor(parsed.data.accentSeed)
      : null;
  if (parsed.data.accentPreset === "custom" && !accentSeed) {
    return {
      message: "Enter a valid six-digit hex color.",
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_organization_appearance", {
    p_accent_preset: parsed.data.accentPreset,
    p_accent_seed: accentSeed,
    p_organization_id: context.organizationId,
    p_theme_mode: parsed.data.mode,
  });
  if (error) {
    return {
      message: organizationErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateSettings();
  revalidatePath("/", "layout");
  return { message: "Appearance updated.", status: "success" };
}

export async function updateOrganizationIdentityAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
  const parsed = organizationIdentitySchema.safeParse({
    name: readString(formData, "name"),
  });
  if (!parsed.success) {
    return {
      message: "Enter a workspace name between 2 and 120 characters.",
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_organization_identity", {
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
  });
  if (error) {
    return {
      message: organizationErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePath("/settings/organization");
  revalidatePath("/", "layout");
  return { message: "Workspace name updated.", status: "success" };
}

export async function uploadOrganizationLogoAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return { message: "Choose a company logo.", status: "error" };
  }

  const validation = await validateCompanyLogo(file);
  if ("error" in validation) {
    return { message: validation.error, status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const previousPath = await getCurrentLogoPath(
    supabase,
    context.organizationId,
  );
  const storagePath = getCompanyLogoStoragePath(
    context.organizationId,
    validation.extension,
  );
  const bucket = supabase.storage.from("organization-assets");
  const { error: uploadError } = await bucket.upload(
    storagePath,
    validation.bytes,
    {
    cacheControl: "31536000",
    contentType: validation.contentType,
    upsert: false,
    },
  );
  if (uploadError) {
    return {
      message: "We could not upload the company logo.",
      status: "error",
    };
  }

  const { error } = await supabase.rpc("update_organization_logo", {
    p_logo_storage_path: storagePath,
    p_organization_id: context.organizationId,
  });
  if (error) {
    await bucket.remove([storagePath]);
    return { message: "We could not save the company logo.", status: "error" };
  }

  if (previousPath && previousPath !== storagePath) {
    await bucket.remove([previousPath]);
  }
  revalidateBranding();
  return { message: "Company logo updated.", status: "success" };
}

export async function removeOrganizationLogoAction(
  _state: OrganizationActionState,
  _formData: FormData,
): Promise<OrganizationActionState> {
  void _state;
  void _formData;
  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const previousPath = await getCurrentLogoPath(
    supabase,
    context.organizationId,
  );
  const { error } = await supabase.rpc("update_organization_logo", {
    p_logo_storage_path: "",
    p_organization_id: context.organizationId,
  });
  if (error) {
    return {
      message: "We could not remove the company logo.",
      status: "error",
    };
  }

  if (previousPath) {
    await supabase.storage.from("organization-assets").remove([previousPath]);
  }
  revalidateBranding();
  return { message: "Company logo removed.", status: "success" };
}

export async function createBranchAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
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
    return {
      message: organizationErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateSettings();
  return { message: "Branch added.", status: "success" };
}

export async function createTeamAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
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
    return {
      message: organizationErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateSettings();
  return { message: "Team added.", status: "success" };
}

export async function updateOrganizationBranchAction(
  request: OrganizationBranchUpdateRequest,
): Promise<OrganizationStructureMutationResult> {
  const context = await requireSuperAdminContext();
  const parsed = branchUpdateSchema.safeParse(request);
  if (!parsed.success) {
    return { kind: "error", message: "Enter a valid branch name and code." };
  }

  const supabase = await createSupabaseServerClient();
  const result = await callStructureRpc(supabase, "update_organization_branch", {
    p_address: parsed.data.address || null,
    p_branch_id: parsed.data.id,
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
  });
  if (result.error) return structureMutationError(result.error.message, "branch");
  revalidateStructure();
  return { kind: "saved", message: "Branch updated." };
}

export async function archiveOrganizationBranchAction(
  branchId: string,
): Promise<OrganizationStructureMutationResult> {
  return mutateStructureLifecycle("archive_organization_branch", "branch", branchId);
}

export async function restoreOrganizationBranchAction(
  branchId: string,
): Promise<OrganizationStructureMutationResult> {
  return mutateStructureLifecycle("restore_organization_branch", "branch", branchId);
}

export async function updateOrganizationTeamAction(
  request: OrganizationTeamUpdateRequest,
): Promise<OrganizationStructureMutationResult> {
  const context = await requireSuperAdminContext();
  const parsed = teamUpdateSchema.safeParse({
    ...request,
    branchId: request.branchId ?? "",
    managerPersonId: request.managerPersonId ?? "",
  });
  if (!parsed.success) {
    return { kind: "error", message: "Enter a valid team name and scope." };
  }

  const supabase = await createSupabaseServerClient();
  const result = await callStructureRpc(supabase, "update_organization_team", {
    p_branch_id: parsed.data.branchId,
    p_manager_person_id: parsed.data.managerPersonId,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
    p_team_id: parsed.data.id,
  });
  if (result.error) return structureMutationError(result.error.message, "team");
  revalidateStructure();
  return { kind: "saved", message: "Team updated." };
}

export async function archiveOrganizationTeamAction(
  teamId: string,
): Promise<OrganizationStructureMutationResult> {
  return mutateStructureLifecycle("archive_organization_team", "team", teamId);
}

export async function restoreOrganizationTeamAction(
  teamId: string,
): Promise<OrganizationStructureMutationResult> {
  return mutateStructureLifecycle("restore_organization_team", "team", teamId);
}

export async function saveOrganizationRoleAction(
  request: OrganizationRoleSaveRequest,
): Promise<OrganizationRoleMutationResult> {
  const context = await requireSuperAdminContext();
  const name = request.name.trim().replace(/\s+/g, " ");
  if (
    name.length < 2 ||
    name.length > 80 ||
    !request.permissions.every(isPermissionKey)
  ) {
    return {
      kind: "error",
      message: "Enter a valid role name and permissions.",
    };
  }

  const permissions = normalizePermissionSelection(request.permissions);
  const supabase = await createSupabaseServerClient();
  let roleId = request.id;
  let expectedVersion = request.expectedVersion;

  if (!roleId) {
    const created = await callRoleRpc(supabase, "create_organization_role", {
      p_name: name,
      p_organization_id: context.organizationId,
    });
    if (created.error || typeof created.data !== "string") {
      return roleMutationError(created.error?.message);
    }
    roleId = created.data;
    expectedVersion = 1;
    if (permissions.length === 0) {
      revalidateRoles();
      return { kind: "saved", permissions, roleId, version: 1 };
    }
  }

  if (!expectedVersion || expectedVersion < 1) {
    return { kind: "error", message: "Reload this role before saving." };
  }

  const saved = await callRoleRpc(supabase, "save_organization_role", {
    p_confirm_removals: request.confirmRemovals,
    p_expected_version: expectedVersion,
    p_name: name,
    p_organization_id: context.organizationId,
    p_permission_keys: permissions,
    p_role_id: roleId,
  });
  if (saved.error) return roleMutationError(saved.error.message);

  const result = readRoleSaveResult(saved.data);
  if (!result) {
    return { kind: "error", message: "The role could not be saved." };
  }
  if (result.status === "confirmation_required") {
    return {
      affectedUserCount: result.affectedUserCount,
      kind: "confirmation_required",
    };
  }

  revalidateRoles();
  return {
    kind: "saved",
    permissions: result.permissionKeys,
    roleId,
    version: result.version,
  };
}

export async function duplicateOrganizationRoleAction(
  roleId: string,
): Promise<OrganizationRoleMutationResult> {
  const context = await requireSuperAdminContext();
  if (!uuidShapeSchema.safeParse(roleId).success) {
    return { kind: "error", message: "Choose a valid role." };
  }
  const supabase = await createSupabaseServerClient();
  const loaded = await callRoleRpc(supabase, "get_organization_roles", {
    p_organization_id: context.organizationId,
  });
  if (loaded.error || !Array.isArray(loaded.data)) {
    return roleMutationError(loaded.error?.message);
  }
  const roles = loaded.data.filter(isRoleNameRecord);
  const source = roles.find((role) => role.id === roleId);
  if (!source) {
    return { kind: "error", message: "This role is no longer available." };
  }

  const name = nextRoleCopyName(source.name, roles.map((role) => role.name));
  const duplicated = await callRoleRpc(
    supabase,
    "duplicate_organization_role",
    {
      p_name: name,
      p_organization_id: context.organizationId,
      p_role_id: roleId,
    },
  );
  if (duplicated.error || typeof duplicated.data !== "string") {
    return roleMutationError(duplicated.error?.message);
  }

  revalidateRoles();
  return { kind: "saved", roleId: duplicated.data };
}

export async function archiveOrganizationRoleAction({
  expectedVersion,
  id,
}: {
  expectedVersion: number;
  id: string;
}): Promise<OrganizationRoleMutationResult> {
  const context = await requireSuperAdminContext();
  if (!uuidShapeSchema.safeParse(id).success || expectedVersion < 1) {
    return { kind: "error", message: "Reload this role before archiving." };
  }
  const supabase = await createSupabaseServerClient();
  const archived = await callRoleRpc(supabase, "archive_organization_role", {
    p_expected_version: expectedVersion,
    p_organization_id: context.organizationId,
    p_role_id: id,
  });
  if (archived.error || typeof archived.data !== "string") {
    return roleMutationError(archived.error?.message);
  }

  revalidateRoles();
  return { kind: "saved", roleId: archived.data };
}

type RoleRpcName =
  | "archive_organization_role"
  | "create_organization_role"
  | "duplicate_organization_role"
  | "get_organization_roles"
  | "save_organization_role";

async function callRoleRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  name: RoleRpcName,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    rpcName: RoleRpcName,
    rpcArgs: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  return rpc(name, args);
}

function readRoleSaveResult(value: unknown):
  | {
      affectedUserCount: number;
      permissionKeys: PermissionKey[];
      status: "saved";
      version: number;
    }
  | { affectedUserCount: number; status: "confirmation_required" }
  | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const affectedUserCount = Number(result.affectedUserCount);
  if (
    result.status === "confirmation_required" &&
    Number.isFinite(affectedUserCount)
  ) {
    return { affectedUserCount, status: "confirmation_required" };
  }
  if (
    result.status !== "saved" ||
    !Array.isArray(result.permissionKeys) ||
    !result.permissionKeys.every(isPermissionKey) ||
    !Number.isFinite(Number(result.version))
  ) {
    return null;
  }
  return {
    affectedUserCount,
    permissionKeys: result.permissionKeys,
    status: "saved",
    version: Number(result.version),
  };
}

function roleMutationError(message?: string): OrganizationRoleMutationResult {
  if (message?.includes("Role has changed")) return { kind: "stale" };
  if (message?.includes("Role name is already in use")) {
    return { kind: "error", message: "That role name is already in use." };
  }
  if (message?.includes("Reassign users before archiving")) {
    return {
      kind: "error",
      message: "Reassign the assigned users before archiving.",
    };
  }
  if (message?.includes("Reassign pending invitations before archiving")) {
    return {
      kind: "error",
      message: "Revoke or update pending invitations before archiving.",
    };
  }
  return { kind: "error", message: "The role could not be saved." };
}

function isRoleNameRecord(value: unknown): value is { id: string; name: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string";
}

function nextRoleCopyName(sourceName: string, names: string[]) {
  const used = new Set(names.map((name) => name.trim().toLocaleLowerCase()));
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const ending = suffix === 1 ? " copy" : ` copy ${suffix}`;
    const candidate = `${sourceName.slice(0, 80 - ending.length).trimEnd()}${ending}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `Role copy ${Date.now()}`.slice(0, 80);
}

function revalidateRoles() {
  revalidatePath("/settings/roles");
  revalidatePath("/settings/access");
}

type StructureRpcName =
  | "archive_organization_branch"
  | "archive_organization_team"
  | "restore_organization_branch"
  | "restore_organization_team"
  | "update_organization_branch"
  | "update_organization_team";

type StructureRpcArgs = {
  p_address?: string | null;
  p_branch_id?: string | null;
  p_code?: string;
  p_manager_person_id?: string | null;
  p_name?: string;
  p_organization_id: string;
  p_team_id?: string;
};

async function callStructureRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  name: StructureRpcName,
  args: StructureRpcArgs,
) {
  // Contained until migration 105 is included in the next generated DB types.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    rpcName: StructureRpcName,
    rpcArgs: StructureRpcArgs,
  ) => Promise<{ data: string | null; error: { message: string } | null }>;
  return rpc(name, args);
}

async function mutateStructureLifecycle(
  name: Extract<
    StructureRpcName,
    | "archive_organization_branch"
    | "archive_organization_team"
    | "restore_organization_branch"
    | "restore_organization_team"
  >,
  entity: "branch" | "team",
  id: string,
): Promise<OrganizationStructureMutationResult> {
  if (!uuidShapeSchema.safeParse(id).success) {
    return { kind: "error", message: `Choose a valid ${entity}.` };
  }
  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const result = await callStructureRpc(supabase, name, {
    p_organization_id: context.organizationId,
    ...(entity === "branch" ? { p_branch_id: id } : { p_team_id: id }),
  });
  if (result.error) return structureMutationError(result.error.message, entity);
  revalidateStructure();
  const restored = name.startsWith("restore_");
  return {
    kind: "saved",
    message: `${entity === "branch" ? "Branch" : "Team"} ${restored ? "restored" : "archived"}.`,
  };
}

function structureMutationError(
  message: string,
  entity: "branch" | "team",
): OrganizationStructureMutationResult {
  if (
    message.includes("before archiving this branch") ||
    message.includes("while ordinary access is enabled") ||
    message.startsWith("Restore the team branch") ||
    message.startsWith("Restore or replace the team manager")
  ) {
    return { kind: "error", message };
  }
  if (message.includes("already in use")) {
    return {
      kind: "error",
      message: `That ${entity} name${entity === "branch" ? " or code" : ""} is already in use.`,
    };
  }
  return { kind: "error", message: `The ${entity} could not be saved.` };
}

function revalidateStructure() {
  revalidatePath("/settings/branches");
  revalidatePath("/settings/teams");
  revalidatePath("/settings/access");
  revalidatePath("/properties");
  revalidatePath("/people");
  revalidatePath("/maintenance");
}

export async function updateMemberAccessAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
  const parsed = memberSchema.safeParse({
    branchId: readString(formData, "branchId"),
    customRoleId: readString(formData, "customRoleId"),
    memberId: readString(formData, "memberId"),
    personId: readString(formData, "personId"),
    roleKind: readString(formData, "roleKind"),
  });

  if (!parsed.success) {
    return { message: "Choose a valid role and membership.", status: "error" };
  }

  const scopeError = workspaceRoleScopeError(parsed.data);
  if (scopeError) {
    return { message: scopeError, status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await callWorkspaceAccessRpc(
    supabase,
    "update_organization_member_access",
    {
    p_branch_id: parsed.data.branchId,
    p_custom_role_id: parsed.data.customRoleId,
    p_member_id: parsed.data.memberId,
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
    p_role_kind: parsed.data.roleKind,
    },
  );

  if (error) {
    return {
      message: organizationErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateSettings(parsed.data.personId);
  return { message: "Access updated.", status: "success" };
}

export async function inviteOrganizationUserAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
  const parsed = userAccessSchema.safeParse({
    branchId: readString(formData, "branchId"),
    customRoleId: readString(formData, "customRoleId"),
    email: readString(formData, "email"),
    personId: readString(formData, "personId"),
    roleKind: readString(formData, "roleKind"),
  });

  if (!parsed.success) {
    return {
      message:
        "Choose a valid email, branch, and role.",
      status: "error",
    };
  }

  const scopeError = workspaceRoleScopeError(parsed.data);
  if (scopeError) {
    return { message: scopeError, status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const createResult = await callWorkspaceAccessRpc(
    supabase,
    "create_organization_invitation",
    {
    p_branch_id: parsed.data.branchId,
    p_custom_role_id: parsed.data.customRoleId,
    p_email: parsed.data.email,
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
    p_role_kind: parsed.data.roleKind,
    },
  );

  if (createResult.error || !createResult.data) {
    return {
      message: organizationErrorMessage(
        createResult.error?.message ?? "Invitation was not created",
      ),
      status: "error",
    };
  }

  const delivery = await deliverInvitation(
    parsed.data.email,
    createResult.data,
  );
  const finalizeResult = delivery.error
    ? await supabase.rpc("mark_organization_invitation_delivery_failed", {
        p_error: delivery.error,
        p_invitation_id: createResult.data,
      })
    : await supabase.rpc("mark_organization_invitation_sent", {
        p_auth_user_id: delivery.authUserId,
        p_delivery_method: delivery.method,
        p_invitation_id: createResult.data,
      });

  revalidateSettings(parsed.data.personId);
  if (finalizeResult.error) {
    return {
      message: "Invitation state could not be finalized.",
      status: "error",
    };
  }

  return delivery.error
    ? {
        message:
          "Invitation saved, but email delivery failed. Retry from Pending invitations.",
        status: "error",
      }
    : {
        message: parsed.data.personId
          ? `Invitation sent to ${parsed.data.email} for the selected Staff record.`
          : `Invitation sent to ${parsed.data.email}.`,
        status: "success",
      };
}

function workspaceRoleScopeError({
  branchId,
  customRoleId,
  personId,
  roleKind,
}: {
  branchId: string | null;
  customRoleId: string | null;
  personId: string | null;
  roleKind: "super_admin" | "custom";
}) {
  if (roleKind === "custom" && (!branchId || !customRoleId)) {
    return "Choose one branch and one role.";
  }

  if (roleKind === "super_admin" && (branchId || customRoleId || personId)) {
    return "Super Admin access is organization-wide.";
  }

  return undefined;
}

type WorkspaceAccessRpcName =
  | "create_organization_invitation"
  | "update_organization_member_access";

type WorkspaceAccessRpcArgs = {
  p_branch_id: string | null;
  p_custom_role_id: string | null;
  p_email?: string;
  p_member_id?: string;
  p_organization_id: string;
  p_person_id: string | null;
  p_role_kind: "super_admin" | "custom";
};

async function callWorkspaceAccessRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  name: WorkspaceAccessRpcName,
  args: WorkspaceAccessRpcArgs,
) {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    rpcName: WorkspaceAccessRpcName,
    rpcArgs: WorkspaceAccessRpcArgs,
  ) => Promise<{ data: string | null; error: { message: string } | null }>;

  return rpc(name, args);
}

export async function resendOrganizationInvitationAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  await requireSuperAdminContext();
  const parsed = invitationIdSchema.safeParse({
    invitationId: readString(formData, "invitationId"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid invitation.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const refreshResult = await supabase.rpc("refresh_organization_invitation", {
    p_invitation_id: parsed.data.invitationId,
  });
  const invitation = refreshResult.data?.[0];
  if (refreshResult.error || !invitation) {
    return {
      message: refreshResult.error
        ? organizationErrorMessage(refreshResult.error.message)
        : "Invitation could not be refreshed.",
      status: "error",
    };
  }
  const delivery = await deliverInvitation(
    invitation.email,
    invitation.invitation_id,
  );
  const finalizeResult = delivery.error
    ? await supabase.rpc("mark_organization_invitation_delivery_failed", {
        p_error: delivery.error,
        p_invitation_id: invitation.invitation_id,
      })
    : await supabase.rpc("mark_organization_invitation_sent", {
        p_auth_user_id: delivery.authUserId,
        p_delivery_method: delivery.method,
        p_invitation_id: invitation.invitation_id,
      });

  revalidateSettings();
  if (finalizeResult.error || delivery.error) {
    return {
      message: "Invitation email could not be resent.",
      status: "error",
    };
  }

  return { message: "Invitation resent.", status: "success" };
}

export async function revokeOrganizationInvitationAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  await requireSuperAdminContext();
  const parsed = invitationIdSchema.safeParse({
    invitationId: readString(formData, "invitationId"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid invitation.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_organization_invitation", {
    p_invitation_id: parsed.data.invitationId,
  });
  if (error) {
    return {
      message: organizationErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateSettings();
  return { message: "Invitation revoked.", status: "success" };
}

export async function removeMemberAccessAction(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const context = await requireSuperAdminContext();
  const parsed = memberIdSchema.safeParse({
    memberId: readString(formData, "memberId"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid membership.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_organization_member_access", {
    p_member_id: parsed.data.memberId,
    p_organization_id: context.organizationId,
  });
  if (error) {
    return {
      message: organizationErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateSettings();
  return { message: "Access removed.", status: "success" };
}

function revalidateSettings(personId?: string | null) {
  revalidatePath("/settings");
  revalidatePath("/settings/access");
  revalidatePath("/staff");
  revalidatePath("/people");
  revalidatePath("/people/[personId]", "page");
  revalidatePath("/maintenance");
  revalidatePath("/tasks");
  if (personId) revalidatePath(`/people/${personId}`);
}

function revalidateBranding() {
  revalidatePath("/settings/appearance");
  revalidatePath("/", "layout");
}

async function getCurrentLogoPath(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organizations")
    .select("logo_storage_path")
    .eq("id", organizationId)
    .single();
  if (error) return null;
  return data?.logo_storage_path ?? null;
}

function organizationErrorMessage(message: string) {
  if (
    message.includes(
      "Every ordinary invitation requires one active branch and one active role with permissions",
    ) ||
    message.includes(
      "Every ordinary membership requires one active branch and one active role with permissions",
    )
  ) {
    return "Choose an active branch and an active role with at least one permission.";
  }

  if (
    message.includes("ordinary access activation") ||
    message.includes("legacy ordinary") ||
    message.includes("transition manifest")
  ) {
    return "Ordinary access is not ready. Complete the approved access transition first.";
  }

  if (message.includes("active role with permissions")) {
    return "Choose an active role with at least one permission.";
  }

  if (message.includes("This staff member already has workspace access")) {
    return "This Staff member already has workspace access. Review the existing member.";
  }

  if (message.includes("This staff member already has an active invitation")) {
    return "This Staff member already has an active invitation. Review the existing invitation.";
  }

  if (message.includes("An active invitation already exists for this email")) {
    return "That invitation email already has an active invitation.";
  }

  if (message.includes("final administrator")) {
    return message;
  }

  if (message.includes("duplicate key")) {
    return "That code or team name is already in use.";
  }

  if (message.includes("Branch not found")) {
    return "Choose an active branch.";
  }

  if (message.includes("Manager person not found")) {
    return "Choose an active person.";
  }

  if (message.includes("Person not found")) {
    return "Choose an active Staff member.";
  }

  return "We could not save the organization setting.";
}

async function deliverInvitation(email: string, invitationId: string) {
  try {
    const adminClient = createSupabaseAdminClient();
    const redirectTo = await getInvitationConfirmUrl(invitationId);
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo },
    );

    if (!error) {
      return {
        authUserId: data.user?.id ?? null,
        error: null,
        method: "invite",
      };
    }

    if (isExistingAuthUserError(error)) {
      const claimResult = await adminClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });
      return {
        authUserId: null,
        error: claimResult.error?.message ?? null,
        method: "magic_link",
      };
    }

    return { authUserId: null, error: error.message, method: "invite" };
  } catch (error) {
    return {
      authUserId: null,
      error: error instanceof Error ? error.message : "Invite delivery failed",
      method: "invite",
    };
  }
}

function isExistingAuthUserError(error: { code?: string; message: string }) {
  if (error.code) {
    return (
      error.code === "email_exists" || error.code === "user_already_exists"
    );
  }

  const normalized = error.message.toLowerCase();

  return (
    normalized.includes("already") ||
    normalized.includes("registered") ||
    normalized.includes("exists")
  );
}

async function getInvitationConfirmUrl(invitationId: string) {
  return getAuthCallbackUrl(
    "/auth/complete",
    `/accept-invite?invitation=${invitationId}`,
  );
}
