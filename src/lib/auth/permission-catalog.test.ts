import { describe, expect, it } from "vitest";
import * as permissionCatalog from "@/lib/auth/permission-catalog";
import type { PermissionGroupKey } from "@/lib/auth/permission-catalog";

const {
  isPermissionKey,
  normalizePermissionSelection,
  PERMISSION_CATALOG,
} = permissionCatalog;

const EXPECTED_PERMISSION_GROUPS = [
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

const EXPECTED_GROUP_KEYS = [
  "properties",
  "people",
  "leases",
  "finance",
  "maintenance",
] as const satisfies readonly PermissionGroupKey[];

const EXPECTED_PERMISSION_CATALOG = [
  { group: "Properties", key: "properties.view", label: "View" },
  { group: "Properties", key: "properties.write", label: "Add & edit" },
  { group: "Properties", key: "properties.archive", label: "Archive" },
  { group: "People", key: "people.view", label: "View" },
  { group: "People", key: "people.write", label: "Add & edit" },
  { group: "People", key: "people.archive", label: "Archive" },
  { group: "Leases", key: "leases.view", label: "View" },
  { group: "Leases", key: "leases.prepare", label: "Prepare drafts" },
  { group: "Leases", key: "leases.activate", label: "Activate" },
  { group: "Leases", key: "leases.change_terms", label: "Change terms" },
  { group: "Leases", key: "leases.close", label: "Close" },
  { group: "Leases", key: "leases.archive", label: "Archive" },
  { group: "Finance", key: "finance.view", label: "View" },
  {
    group: "Finance",
    key: "finance.record_payments",
    label: "Record payments",
  },
  {
    group: "Finance",
    key: "finance.submit_expenses",
    label: "Submit expenses",
  },
  {
    group: "Finance",
    key: "finance.approve_expenses",
    label: "Approve expenses",
  },
  {
    group: "Finance",
    key: "finance.correct_records",
    label: "Correct records",
  },
  {
    group: "Finance",
    key: "finance.close_periods",
    label: "Lock month",
  },
  { group: "Finance", key: "finance.publish", label: "Publish" },
  { group: "Maintenance", key: "maintenance.view", label: "View" },
  {
    group: "Maintenance",
    key: "maintenance.create_assign",
    label: "Create & assign",
  },
  { group: "Maintenance", key: "maintenance.complete", label: "Complete" },
  { group: "Maintenance", key: "maintenance.review", label: "Review" },
] as const;

describe("permission catalogue", () => {
  it("publishes stable lowercase group keys with ordered permissions", () => {
    const groups = permissionCatalog.PERMISSION_GROUPS;

    expect(groups).toEqual(EXPECTED_PERMISSION_GROUPS);
    expect(groups.map(({ key }) => key)).toEqual(EXPECTED_GROUP_KEYS);
  });

  it("publishes the exact 23 stable keys in product order", () => {
    expect(PERMISSION_CATALOG).toEqual(EXPECTED_PERMISSION_CATALOG);
  });

  it("accepts catalogue keys and rejects unknown values", () => {
    expect(PERMISSION_CATALOG.map(({ key }) => isPermissionKey(key))).toEqual(
      Array.from({ length: 23 }, () => true),
    );
    expect(
      ["properties.delete", "finance.reopen_periods", "", null, 23].map(
        isPermissionKey,
      ),
    ).toEqual([false, false, false, false, false]);
  });

  it("rejects unknown keys instead of silently dropping them", () => {
    expect(() =>
      normalizePermissionSelection(["properties.view", "properties.delete"]),
    ).toThrowError("Unknown permission key: properties.delete");
  });

  it("deduplicates and returns selected permissions in catalogue order", () => {
    expect(
      normalizePermissionSelection([
        "maintenance.review",
        "properties.view",
        "maintenance.view",
        "properties.view",
        "finance.view",
      ]),
    ).toEqual([
      "properties.view",
      "finance.view",
      "maintenance.view",
      "maintenance.review",
    ]);
  });

  it.each([
    ["properties.archive", ["properties.view", "properties.archive"]],
    ["people.write", ["people.view", "people.write"]],
    ["leases.activate", ["leases.view", "leases.activate"]],
    [
      "finance.submit_expenses",
      ["finance.view", "finance.submit_expenses"],
    ],
    [
      "maintenance.create_assign",
      ["maintenance.view", "maintenance.create_assign"],
    ],
  ] as const)("adds the group View permission with %s", (dependent, expected) => {
    expect(normalizePermissionSelection([dependent])).toEqual(expected);
  });

  it("removes every group dependent when View is explicitly removed", () => {
    expect(
      normalizePermissionSelection(
        [
          "properties.write",
          "leases.prepare",
          "finance.submit_expenses",
          "finance.publish",
          "maintenance.view",
          "maintenance.complete",
        ],
        ["properties.view", "leases.view", "finance.view"],
      ),
    ).toEqual(["maintenance.view", "maintenance.complete"]);
  });

  it("removes View and its dependents when the removal set still appears in selection", () => {
    expect(
      normalizePermissionSelection(
        ["finance.view", "finance.publish"],
        ["finance.view"],
      ),
    ).toEqual([]);
  });
});
