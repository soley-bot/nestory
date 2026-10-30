import type { PermissionKey } from "@/lib/auth/permission-catalog";
import { reportKindValues } from "@/features/reports/report-catalog";

export type SavedView = { name: string; query: string };
const reportKeys = ["month", "propertyId", "unitId", "ownerPersonId", "dateFrom", "dateTo", "query", "transactionType", "transactionStatus", "payeeId", "groupBy", "columns", "status"];
const commonKeys = ["archiveState", "pageSize", "query", "sort", "status"];
const registers: Record<string, { permission: PermissionKey; keys: readonly string[] }> = {
  "/properties": { permission: "properties.view", keys: [...commonKeys, "leaseStatus", "netStatus", "ownerStatus", "review"] },
  "/units": { permission: "properties.view", keys: [...commonKeys, "leaseStatus", "occupancy", "propertyId", "scope"] },
  "/leases": { permission: "leases.view", keys: [...commonKeys, "endMonth", "endsWithin", "propertyId", "tenantStatus", "unitId"] },
  "/people": { permission: "people.view", keys: [...commonKeys, "role"] },
  "/maintenance": { permission: "maintenance.view", keys: [...commonKeys, "month", "priority", "propertyId", "review", "scope", "unitId", "view"] },
};

export function getSavedViewResource(resource: string) {
  if (Object.hasOwn(registers, resource)) return registers[resource];
  if (reportKindValues.some(kind => resource === `/reports/${kind}`)) return { permission: "finance.publish" as const, keys: reportKeys };
}

export function sanitizeViewQuery(resource: string, query: string) {
  const config = getSavedViewResource(resource);
  if (!config || query.length > 4000) throw new Error("Invalid saved view.");
  const safe = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query)) {
    if (!config.keys.includes(key)) continue;
    if (value.length > 1000) throw new Error("A filter is too long to save.");
    safe.set(key, value);
  }
  if (safe.toString().length > 2000) throw new Error("This view has too many filters to save.");
  return safe.toString();
}

export function parseSavedViews(resource: string, value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 60 || typeof item.query !== "string") return [];
    try { return [{ name: item.name, query: sanitizeViewQuery(resource, item.query) }]; } catch { return []; }
  }).slice(0, 12);
}
