import { z } from "zod";
import { getLeaseBillingFormConfig } from "@/features/leases/data/leases";
import { getMaintenanceCreateFormOptions } from "@/features/maintenance/data/maintenance";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { getPersonSelectOptions } from "@/features/people/data/person-options";
import type { UnitFormOptionsResponse } from "@/features/units/unit-form-options.types";
import {
  getCurrentUser,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const { unitId } = await params;
  const mode = new URL(request.url).searchParams.get("mode");
  if (
    !z.uuid().safeParse(unitId).success ||
    (mode !== "lease" && mode !== "maintenance")
  ) {
    return errorResponse("Form unavailable.", 400);
  }

  const user = await getCurrentUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const client = await createSupabaseServerClient();
    const membership = await getWorkspaceMembershipForUser(user.id, client);
    if (!membership || !membership.permissionKeys.has("properties.view")) {
      return errorResponse("Forbidden", 403);
    }
    const capabilities = getMaintenanceCapabilities(membership);
    const canLoad =
      mode === "lease"
        ? membership.permissionKeys.has("leases.prepare")
        : membership.permissionKeys.has("maintenance.view") && capabilities.canCreateCase;
    if (!canLoad) return errorResponse("Forbidden", 403);

    const result = await client
      .from("units")
      .select("id, property_id, archived_at")
      .eq("organization_id", membership.organizationId)
      .eq("id", unitId)
      .abortSignal(request.signal)
      .maybeSingle();
    if (result.error) throw new Error("Unit unavailable");
    if (!result.data) return errorResponse("Form unavailable.", 404);
    if (result.data.archived_at !== null) {
      return errorResponse("Form unavailable for an archived unit.", 409);
    }
    if (request.signal.aborted) return errorResponse("Request cancelled.", 499);

    const propertyId = result.data.property_id;
    if (mode === "lease") {
      const [tenants, billingFormConfig] = await Promise.all([
        getPersonSelectOptions({
          organizationId: membership.organizationId,
          roles: ["tenant"],
        }),
        getLeaseBillingFormConfig(membership.organizationId),
      ]);
      return Response.json(
        {
          mode, unitId, propertyId, options: { tenants, billingFormConfig },
        } satisfies UnitFormOptionsResponse<"lease">,
        { headers: PRIVATE_HEADERS },
      );
    }

    const actor = {
      branchId: membership.branchId,
      dataScope: membership.isSuperAdmin ? "organization" : "branch",
      personId: membership.personId,
      workflowMode: "coordinator",
    } as const;
    const options = await getMaintenanceCreateFormOptions(
      membership.organizationId, actor, capabilities,
    );
    return Response.json(
      {
        mode,
        unitId,
        propertyId,
        options: {
          actor,
          branches: options.branchOptions,
          canRecordActualCost: capabilities.canRecordActualCost,
          properties: options.propertyOptions,
          staff: options.staffOptions,
          units: options.unitOptions,
          vendors: options.vendorOptions,
        },
      } satisfies UnitFormOptionsResponse<"maintenance">,
      { headers: PRIVATE_HEADERS },
    );
  } catch {
    return errorResponse("Could not load this form. Try again.", 503);
  }
}

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { headers: PRIVATE_HEADERS, status });
}
