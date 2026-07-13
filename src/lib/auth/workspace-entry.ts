import type { WorkspaceRole } from "@/lib/auth/context";

export const WORKSPACE_ENTRY_PATH = "/workspace" as const;

export function getWorkspaceEntryPath(role: WorkspaceRole) {
  if (role === "admin") {
    return "/overview" as const;
  }

  if (role === "manager") {
    return "/maintenance" as const;
  }

  return "/tasks" as const;
}
