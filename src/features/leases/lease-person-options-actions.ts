"use server";

import { requirePermission } from "@/lib/auth/context";
import { getPersonSelectPage } from "@/features/people/data/person-options";

export async function getLeaseTenantOptionsAction(query: string, page: number, selectedId: string) {
  const context = await requirePermission("leases.prepare");
  return getPersonSelectPage({ organizationId: context.organizationId, roles: ["tenant"], query, page, selectedId: selectedId || undefined });
}
