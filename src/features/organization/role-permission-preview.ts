import { getWorkspaceCapabilitiesFromPermissions } from "@/lib/auth/capabilities";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import {
  normalizePermissionSelection,
  PERMISSION_GROUPS,
  type PermissionKey,
} from "@/lib/auth/permission-catalog";

export const ROLE_PERMISSION_EFFECTS = {
  "leases.change_terms": "Change terms also controls deposit events and reversals.",
  "finance.publish": "Publish also controls report access and PDF/Excel exports.",
  "finance.post_expenses": "Post new expenses without a separate approval. Submit expenses is also required. This does not approve other pending expenses.",
  "finance.correct_expenses": "Edit posted expenses through an audited replacement. Submit expenses is also required. This does not grant standalone deletion or other financial corrections.",
} satisfies Partial<Record<PermissionKey, string>>;

export function buildRolePermissionPreview(
  selected: readonly PermissionKey[],
  baseline: readonly PermissionKey[] = [],
) {
  const permissions = normalizePermissionSelection(selected);
  const previous = normalizePermissionSelection(baseline);
  const authority = { isSuperAdmin: false, permissionKeys: new Set(permissions) };
  const workspace = getWorkspaceCapabilitiesFromPermissions(authority);
  const maintenance = getMaintenanceCapabilities(authority);
  const groups = PERMISSION_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    selected: group.permissions
      .filter(({ key }) => permissions.includes(key))
      .map(({ label }) => label),
    added: group.permissions
      .filter(({ key }) => permissions.includes(key) && !previous.includes(key))
      .map(({ label }) => label),
    removed: group.permissions
      .filter(({ key }) => previous.includes(key) && !permissions.includes(key))
      .map(({ label }) => label),
  }));
  const effects: string[] = [];
  for (const permission of ["finance.post_expenses", "finance.correct_expenses"] as const) {
    if (permissions.includes(permission)) effects.push(ROLE_PERMISSION_EFFECTS[permission]);
  }
  if (permissions.includes("leases.change_terms")) {
    effects.push(ROLE_PERMISSION_EFFECTS["leases.change_terms"]);
  }
  if (workspace.canReadFinanceReports) {
    effects.push(ROLE_PERMISSION_EFFECTS["finance.publish"]);
  }
  const excluded: string[] = [];
  if (!workspace.canManageAccess) excluded.push("Staff access and role administration");
  if (!maintenance.canUploadMaintenanceEvidence) excluded.push("Maintenance evidence upload");
  if (!maintenance.canArchiveCase) excluded.push("Maintenance archive and restore");
  if (!workspace.canManageReconciliationSources) excluded.push("Reconciliation setup");
  if (!workspace.canUnlockFinancialMonth || !workspace.canReopenOwnerMonth) {
    excluded.push("Reopening locked financial months");
  }
  return {
    permissions,
    groups,
    effects,
    excluded,
    hasPermissionChanges: groups.some(({ added, removed }) => added.length || removed.length),
  };
}
