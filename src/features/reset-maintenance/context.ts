import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permission-context";
import { getSupabaseEnv } from "@/lib/db/env";
import { createSupabaseServerClient } from "@/lib/db/server";
import { PILOT_RESET_ORGANIZATION, PILOT_RESET_PROJECT, pilotManualRestartStatusSchema } from "./review";

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

export async function getPilotManualRestartStatus() {
  await requirePilotResetContext();
  const client = await createSupabaseServerClient();
  const result = await client.rpc("get_pilot_manual_restart_status");
  if (result.error) return null;
  const parsed = pilotManualRestartStatusSchema.safeParse(result.data);
  return parsed.success ? parsed.data : null;
}
