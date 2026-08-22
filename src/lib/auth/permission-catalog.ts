export const PERMISSION_GROUPS = [
  {
    key: "properties",
    label: "Properties",
    permissions: [
      { key: "properties.view", label: "View" },
      { key: "properties.write", label: "Add & edit" },
      { key: "properties.archive", label: "Archive" },
    ],
  },
  {
    key: "people",
    label: "People",
    permissions: [
      { key: "people.view", label: "View" },
      { key: "people.write", label: "Add & edit" },
      { key: "people.archive", label: "Archive" },
    ],
  },
  {
    key: "leases",
    label: "Leases",
    permissions: [
      { key: "leases.view", label: "View" },
      { key: "leases.prepare", label: "Prepare drafts" },
      { key: "leases.activate", label: "Activate" },
      { key: "leases.change_terms", label: "Change terms" },
      { key: "leases.close", label: "Close" },
      { key: "leases.archive", label: "Archive" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    permissions: [
      { key: "finance.view", label: "View" },
      { key: "finance.record_payments", label: "Record payments" },
      { key: "finance.submit_expenses", label: "Submit expenses" },
      { key: "finance.approve_expenses", label: "Approve expenses" },
      { key: "finance.correct_records", label: "Correct records" },
      { key: "finance.close_periods", label: "Lock month" },
      { key: "finance.publish", label: "Publish" },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    permissions: [
      { key: "maintenance.view", label: "View" },
      { key: "maintenance.create_assign", label: "Create & assign" },
      { key: "maintenance.complete", label: "Complete" },
      { key: "maintenance.review", label: "Review" },
    ],
  },
] as const;

export type PermissionGroupDefinition = (typeof PERMISSION_GROUPS)[number];
export type PermissionGroupKey = PermissionGroupDefinition["key"];
export type PermissionGroup = PermissionGroupDefinition["label"];
export type GroupedPermissionDefinition =
  PermissionGroupDefinition["permissions"][number];
export type PermissionKey = GroupedPermissionDefinition["key"];
export type PermissionDefinition = {
  readonly group: PermissionGroup;
  readonly key: PermissionKey;
  readonly label: GroupedPermissionDefinition["label"];
};

export const PERMISSION_CATALOG: readonly PermissionDefinition[] =
  PERMISSION_GROUPS.flatMap(({ label: group, permissions }) =>
    permissions.map(({ key, label }) => ({ group, key, label })),
  );

export const PERMISSION_KEYS = PERMISSION_CATALOG.map(({ key }) => key);

const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && PERMISSION_KEY_SET.has(value);
}

function assertPermissionKeys(
  values: readonly unknown[],
): asserts values is readonly PermissionKey[] {
  for (const value of values) {
    if (!isPermissionKey(value)) {
      throw new TypeError(`Unknown permission key: ${String(value)}`);
    }
  }
}

export function normalizePermissionSelection(
  selected: readonly unknown[],
  removed: readonly unknown[] = [],
): PermissionKey[] {
  assertPermissionKeys(selected);
  assertPermissionKeys(removed);

  const normalized = new Set<PermissionKey>(selected);
  const removedPermissions = new Set<PermissionKey>(removed);

  for (const removedPermission of removedPermissions) {
    normalized.delete(removedPermission);
  }

  for (const { permissions } of PERMISSION_GROUPS) {
    const [viewPermission, ...dependents] = permissions;
    const viewKey = viewPermission.key;

    if (removedPermissions.has(viewKey)) {
      for (const { key } of dependents) {
        normalized.delete(key);
      }
      continue;
    }

    if (dependents.some(({ key }) => normalized.has(key))) {
      normalized.add(viewKey);
    }
  }

  return PERMISSION_KEYS.filter((key) => normalized.has(key));
}
