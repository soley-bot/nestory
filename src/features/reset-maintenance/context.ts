import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permission-context";
import { getSupabaseEnv } from "@/lib/db/env";
import { PILOT_RESET_ORGANIZATION, PILOT_RESET_PROJECT } from "./review";

export function canViewPilotResetContext(
  context: Awaited<ReturnType<typeof requireWorkspaceContext>>,
  host: string | null | undefined,
) {
  return !(host?.toLowerCase() !== "pilot.nestory-kh.com" || context.organizationId !== PILOT_RESET_ORGANIZATION ||
    context.organizationSlug !== "pilot" || context.role !== "super_admin" || context.roleKind !== "super_admin" ||
    !context.isSuperAdmin || context.branchId || context.personId ||
    getSupabaseEnv().supabaseUrl !== `https://${PILOT_RESET_PROJECT}.supabase.co` ||
    !hasPermission(context.permissionContext, "finance.correct_records") ||
    !hasPermission(context.permissionContext, "finance.close_periods") ||
    !hasPermission(context.permissionContext, "leases.change_terms"));
}

export async function requirePilotResetContext() {
  const context = await requireWorkspaceContext();
  if (!canViewPilotResetContext(context, (await headers()).get("host"))) notFound();
  return context;
}
