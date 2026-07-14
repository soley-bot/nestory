import { describe, expect, it } from "vitest";
import {
  getExecutableMaintenanceAssigneeOptions,
  getMaintenanceBranchControlMode,
  getMaintenanceExecutionMode,
} from "@/features/maintenance/maintenance.execution";

const memberships = [
  { branchId: "branch-a", personId: "member-a" },
  { branchId: "branch-b", personId: "member-b" },
];

describe("maintenance execution mode", () => {
  it("requires an exact linked-member branch match", () => {
    expect(getMaintenanceExecutionMode({ assigneePersonId: "member-a", branchId: "branch-a" }, memberships))
      .toBe("member_assigned");
    expect(getMaintenanceExecutionMode({ assigneePersonId: "member-a", branchId: "branch-b" }, memberships))
      .toBe("manager_coordinated");
    expect(getMaintenanceExecutionMode({ assigneePersonId: "offline-person", branchId: "branch-a" }, memberships))
      .toBe("manager_coordinated");
    expect(getMaintenanceExecutionMode({ assigneePersonId: undefined, branchId: "branch-a" }, memberships))
      .toBe("manager_coordinated");
  });

  it("offers only active staff who have an exact linked member identity", () => {
    expect(getExecutableMaintenanceAssigneeOptions({
      activePersonIds: new Set(["member-a", "member-b", "offline-person"]),
      branchId: "branch-a",
      memberIdentities: memberships,
      people: [
        { id: "member-a", label: "A" },
        { id: "member-b", label: "B" },
        { id: "offline-person", label: "Offline" },
      ],
      staffPersonIds: new Set(["member-a", "member-b", "offline-person"]),
    })).toEqual([{ branchId: "branch-a", id: "member-a", label: "A" }]);
  });

  it("excludes archived people even when membership and active staff-role links remain", () => {
    expect(getExecutableMaintenanceAssigneeOptions({
      activePersonIds: new Set(["member-a"]),
      branchId: "branch-a",
      memberIdentities: [
        { branchId: "branch-a", personId: "member-a" },
        { branchId: "branch-a", personId: "archived-member" },
      ],
      people: [
        { id: "member-a", label: "A" },
        { id: "archived-member", label: "Archived" },
      ],
      staffPersonIds: new Set(["member-a", "archived-member"]),
    })).toEqual([{ branchId: "branch-a", id: "member-a", label: "A" }]);
  });

  it("fixes a branch-bound manager and labels an unbound manager all-branches", () => {
    expect(getMaintenanceBranchControlMode({ branchId: "branch-a", role: "manager" })).toBe("fixed");
    expect(getMaintenanceBranchControlMode({ role: "manager" })).toBe("all_branches");
    expect(getMaintenanceBranchControlMode({ role: "admin" })).toBe("selectable");
  });
});
