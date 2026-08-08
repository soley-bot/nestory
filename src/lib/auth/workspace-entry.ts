import type { WorkspaceRole } from "@/lib/auth/context";

export const WORKSPACE_ENTRY_PATH = "/workspace" as const;

export function getWorkspaceEntryPath(role: WorkspaceRole) {
  if (role === "super_admin") {
    return "/overview" as const;
  }

  if (role === "finance_manager" || role === "finance_member") {
    return "/finance" as const;
  }

  if (role === "operations_manager") {
    return "/maintenance" as const;
  }

  return "/tasks" as const;
}
