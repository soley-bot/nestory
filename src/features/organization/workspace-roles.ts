import { z } from "zod";

import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "@/lib/auth/capabilities";

const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  finance_manager: "Finance Manager",
  finance_member: "Finance Member",
  operations_manager: "Operations Manager",
  operations_member: "Operations Member",
  super_admin: "Super Admin",
};

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);

export const WORKSPACE_ROLE_OPTIONS: Array<{
  label: string;
  value: WorkspaceRole;
}> = WORKSPACE_ROLES.map((value) => ({
  label: WORKSPACE_ROLE_LABELS[value],
  value,
}));
