import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permission-catalog";
import { buildRolePermissionPreview } from "./role-permission-preview";

describe("ordinary role permission preview", () => {
  it("keeps an empty role empty and excludes administrative operations", () => {
    const preview = buildRolePermissionPreview([]);
    expect(preview.permissions).toEqual([]);
    expect(preview.groups.every((group) => group.selected.length === 0)).toBe(true);
    expect(preview.effects).toEqual([]);
    expect(preview.excluded).toContain("Staff access and role administration");
    expect(preview.hasPermissionChanges).toBe(false);
  });

  it.each(PERMISSION_KEYS)("never turns %s into administrative authority", (permission) => {
    const preview = buildRolePermissionPreview([permission]);
    expect(preview.excluded).toContain("Staff access and role administration");
    expect(preview.excluded).toContain("Maintenance evidence upload");
    expect(preview.excluded).toContain("Maintenance archive and restore");
    expect(preview.excluded).toContain("Reconciliation setup");
    expect(preview.excluded).toContain("Reopening locked financial months");
    expect(preview.permissions).toContain(permission);
  });

  it("shows term-edit deposit coupling without adding finance permissions", () => {
    const preview = buildRolePermissionPreview(["leases.change_terms"]);
    expect(preview.permissions).toEqual(["leases.view", "leases.change_terms"]);
    expect(preview.effects).toEqual(["Change terms also controls deposit events and reversals."]);
    expect(preview.groups.find((group) => group.key === "finance")?.selected).toEqual([]);
  });

  it("distinguishes finance reading from report/export publication authority", () => {
    expect(buildRolePermissionPreview(["finance.view"]).effects).toEqual([]);
    const preview = buildRolePermissionPreview(["finance.publish"]);
    expect(preview.permissions).toEqual(["finance.view", "finance.publish"]);
    expect(preview.effects).toEqual(["Publish also controls report access and PDF/Excel exports."]);
  });

  it("shows additions and removals against the normalized saved role", () => {
    const preview = buildRolePermissionPreview(["finance.record_payments"], ["finance.publish"]);
    expect(preview.groups.find((group) => group.key === "finance")).toMatchObject({
      selected: ["View", "Record payments"], added: ["Record payments"], removed: ["Publish"],
    });
    expect(preview.effects).toEqual([]);
    expect(preview.hasPermissionChanges).toBe(true);
  });

  it("does not mutate or broaden the selected and saved arrays", () => {
    const selected = Object.freeze(["maintenance.complete"] as const);
    const baseline = Object.freeze(["maintenance.create_assign"] as const);
    const preview = buildRolePermissionPreview(selected, baseline);
    expect(selected).toEqual(["maintenance.complete"]);
    expect(baseline).toEqual(["maintenance.create_assign"]);
    expect(preview.permissions).toEqual(["maintenance.view", "maintenance.complete"]);
    expect(preview.groups.find((group) => group.key === "maintenance")).toMatchObject({
      added: ["Complete"], removed: ["Create & assign"],
    });
  });

  it("keeps all catalog permissions ordinary and rejects proposed unknown keys", () => {
    const preview = buildRolePermissionPreview(PERMISSION_KEYS);
    expect(preview.permissions).toEqual(PERMISSION_KEYS);
    expect(preview.excluded).toContain("Maintenance evidence upload");
    expect(() => buildRolePermissionPreview(["finance.export" as PermissionKey])).toThrow("Unknown permission key");
  });
});
