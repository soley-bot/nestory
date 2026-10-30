import { z } from "zod";
import { getLeaseBillingFormConfig } from "@/features/leases/data/leases";
import type { PropertyFormOptionsResponse } from "@/features/properties/property-form-options.types";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const mode = new URL(request.url).searchParams.get("mode");
  if (!z.uuid().safeParse(propertyId).success || (mode !== "edit" && mode !== "lease")) {
    return errorResponse("Form unavailable.", 400);
  }
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);
    const client = await createSupabaseServerClient();
    const membership = await getWorkspaceMembershipForUser(user.id, client);
    if (!membership?.permissionKeys.has("properties.view") ||
      !membership.permissionKeys.has(mode === "edit" ? "properties.write" : "leases.prepare")) {
      return errorResponse("Forbidden", 403);
    }
    const result = await client.from("properties")
      .select("id, archived_at, rental_structure")
      .eq("organization_id", membership.organizationId)
      .eq("id", propertyId)
      .abortSignal(request.signal)
      .maybeSingle();
    if (result.error) throw new Error("Property unavailable");
    if (!result.data) return errorResponse("Form unavailable.", 404);
    if (result.data.archived_at !== null || (mode === "lease" && result.data.rental_structure !== "single_space")) {
      return errorResponse("Form unavailable for this property.", 409);
    }
    if (request.signal.aborted) return errorResponse("Request cancelled.", 499);
    if (mode === "edit") {
      const owners: [] = [];
      return Response.json({ mode, propertyId, options: { owners } } satisfies PropertyFormOptionsResponse<"edit">, { headers: PRIVATE_HEADERS });
    }
    const tenants: [] = [];
    const billingFormConfig = await getLeaseBillingFormConfig(membership.organizationId);
    return Response.json({ mode, propertyId, options: { tenants, billingFormConfig } } satisfies PropertyFormOptionsResponse<"lease">, { headers: PRIVATE_HEADERS });
  } catch {
    return errorResponse("Could not load this form. Try again.", 503);
  }
}

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { headers: PRIVATE_HEADERS, status });
}
