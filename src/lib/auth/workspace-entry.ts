import type { WorkspacePermissionContext } from "@/lib/auth/permission-context";
import type { PermissionKey } from "@/lib/auth/permission-catalog";

export const WORKSPACE_ENTRY_PATH = "/workspace" as const;

type WorkspaceEntryAuthority = Pick<
  WorkspacePermissionContext,
  "isSuperAdmin" | "permissionKeys"
>;

export function getWorkspaceEntryPath(authority: WorkspaceEntryAuthority) {
  if (authority.isSuperAdmin) {
    return "/overview" as const;
  }

  const orderedEntries: readonly [PermissionKey, string][] = [
    ["properties.view", "/properties"],
    ["people.view", "/people"],
    ["finance.view", "/finance"],
    ["leases.view", "/leases"],
    ["maintenance.create_assign", "/maintenance"],
    ["maintenance.review", "/maintenance"],
    ["maintenance.complete", "/tasks"],
    ["maintenance.view", "/maintenance"],
  ];

  for (const [permission, href] of orderedEntries) {
    if (authority.permissionKeys.has(permission)) {
      return href;
    }
  }

  return "/no-access" as const;
}
