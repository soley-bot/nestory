import "server-only";

import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { PILOT_RESET_ORGANIZATION } from "@/features/reset-maintenance/review";

type WorkspaceContext = Awaited<ReturnType<typeof requireWorkspaceContext>>;

export function canManagePilotRentPosting(context: WorkspaceContext) {
  return context.organizationId === PILOT_RESET_ORGANIZATION &&
    context.role === "super_admin" && context.roleKind === "super_admin" &&
    context.isSuperAdmin && !context.branchId && !context.personId;
}

export async function requirePilotRentPostingContext() {
  const context = await requireWorkspaceContext();
  if (!canManagePilotRentPosting(context)) notFound();
  return context;
}
