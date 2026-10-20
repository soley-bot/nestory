import type { PermissionKey } from "@/lib/auth/permission-catalog";

// Restrict mixed-domain feeds before loading snapshots, including during a
// rollout from legacy activity-log policies. Source-record RLS still decides
// access to individual timeline events and documents in the target resolver.
const activityViewPermissions: Readonly<Record<string, readonly PermissionKey[]>> = {
  timeline_event: ["properties.view", "leases.view", "finance.view", "maintenance.view"],
  document: ["properties.view", "leases.view", "finance.view", "maintenance.view"],
  property: ["properties.view"],
  unit: ["properties.view"],
  lease: ["leases.view"],
  ledger_entry: ["finance.view"],
  financial_month: ["finance.view"],
  finance_income_item: ["finance.view"],
  finance_expense_item: ["finance.view"],
  petty_cash_entry: ["finance.view"],
  task: ["maintenance.view"],
  tenant_request: ["maintenance.view"],
};

export function filterTimelineActivityEntityTypes(
  entityTypes: readonly string[],
  permissionKeys: ReadonlySet<PermissionKey>,
): string[] {
  return entityTypes.filter((entityType) =>
    Object.hasOwn(activityViewPermissions, entityType) &&
    activityViewPermissions[entityType].some((permission) => permissionKeys.has(permission)),
  );
}
