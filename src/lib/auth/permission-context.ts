import {
  isPermissionKey,
  normalizePermissionSelection,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  type PermissionGroupKey,
  type PermissionKey,
} from "@/lib/auth/permission-catalog";

export type WorkspacePermissionContext = {
  branchId?: string;
  isSuperAdmin: boolean;
  organizationId: string;
  permissionKeys: ReadonlySet<PermissionKey>;
  roleId?: string;
  roleKind: "super_admin" | "custom";
  roleName: string;
  userId: string;
};

type ResolvedCustomRole = {
  id: string | null;
  name: string | null;
  permissionKeys: readonly unknown[] | null;
  status: string | null;
};

type ResolvedBranch = {
  id: string | null;
  status: string | null;
};

export type ResolvedWorkspacePermissionInput = {
  branch: ResolvedBranch | null;
  customRole: ResolvedCustomRole | null;
  ordinaryAccessActive: boolean;
  organizationId: string;
  roleKind: "super_admin" | "custom";
  userId: string;
};

export type PermissionContextDenialReason =
  | "ordinary_access_inactive"
  | "role_missing"
  | "role_inactive"
  | "role_empty"
  | "branch_missing"
  | "branch_inactive"
  | "unknown_permission";

export type WorkspacePermissionContextResult =
  | { context: WorkspacePermissionContext; ok: true }
  | { context: null; ok: false; reason: PermissionContextDenialReason };

function deny(
  reason: PermissionContextDenialReason,
): WorkspacePermissionContextResult {
  return { context: null, ok: false, reason };
}

export function buildWorkspacePermissionContext(
  input: ResolvedWorkspacePermissionInput,
): WorkspacePermissionContextResult {
  if (input.roleKind === "super_admin") {
    return {
      context: {
        isSuperAdmin: true,
        organizationId: input.organizationId,
        permissionKeys: new Set(PERMISSION_KEYS),
        roleKind: "super_admin",
        roleName: "Super Admin",
        userId: input.userId,
      },
      ok: true,
    };
  }

  if (!input.ordinaryAccessActive) {
    return deny("ordinary_access_inactive");
  }

  const role = input.customRole;
  if (!role?.id?.trim() || !role.name?.trim() || !role.permissionKeys) {
    return deny("role_missing");
  }
  if (role.status !== "active") {
    return deny("role_inactive");
  }

  const branch = input.branch;
  if (!branch?.id?.trim()) {
    return deny("branch_missing");
  }
  if (branch.status !== "active") {
    return deny("branch_inactive");
  }

  if (!role.permissionKeys.every(isPermissionKey)) {
    return deny("unknown_permission");
  }

  const permissionKeys = normalizePermissionSelection(role.permissionKeys);
  if (permissionKeys.length === 0) {
    return deny("role_empty");
  }

  return {
    context: {
      branchId: branch.id,
      isSuperAdmin: false,
      organizationId: input.organizationId,
      permissionKeys: new Set(permissionKeys),
      roleId: role.id,
      roleKind: "custom",
      roleName: role.name,
      userId: input.userId,
    },
    ok: true,
  };
}

export function hasPermission(
  context: WorkspacePermissionContext,
  permission: unknown,
): boolean {
  return (
    isPermissionKey(permission) &&
    (context.isSuperAdmin || context.permissionKeys.has(permission))
  );
}

export function getPermissionGroupPresence(
  context: WorkspacePermissionContext,
): readonly PermissionGroupKey[] {
  return PERMISSION_GROUPS.filter(({ permissions }) =>
    permissions.some(({ key }) => hasPermission(context, key)),
  ).map(({ key }) => key);
}
