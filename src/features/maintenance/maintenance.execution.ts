import type {
  MaintenanceActor,
  MaintenanceAssigneeOption,
  MaintenanceExecutionMode,
  MaintenancePersonOption,
} from "@/features/maintenance/maintenance.types";

export type MaintenanceBranchControlMode = "all_branches" | "fixed" | "selectable";

export function getMaintenanceBranchControlMode(
  actor: MaintenanceActor,
): MaintenanceBranchControlMode {
  if (actor.role !== "manager") return "selectable";
  return actor.branchId ? "fixed" : "all_branches";
}

export type MaintenanceMemberIdentity = {
  branchId?: string;
  personId: string;
};

type MaintenanceAssignment = {
  assigneePersonId?: string;
  branchId?: string;
};

export function getMaintenanceExecutionMode(
  assignment: MaintenanceAssignment,
  memberIdentities: MaintenanceMemberIdentity[],
): MaintenanceExecutionMode {
  if (!assignment.assigneePersonId) {
    return "manager_coordinated";
  }

  return memberIdentities.some(
    (identity) =>
      identity.personId === assignment.assigneePersonId &&
      identity.branchId === assignment.branchId,
  )
    ? "member_assigned"
    : "manager_coordinated";
}

export function getExecutableMaintenanceAssigneeOptions({
  activePersonIds,
  branchId,
  memberIdentities,
  people,
  staffPersonIds,
}: {
  activePersonIds: ReadonlySet<string>;
  branchId?: string;
  memberIdentities: MaintenanceMemberIdentity[];
  people: MaintenancePersonOption[];
  staffPersonIds: ReadonlySet<string>;
}): MaintenanceAssigneeOption[] {
  const executablePersonIds = new Set(
    memberIdentities
      .filter((identity) => identity.branchId === branchId)
      .map((identity) => identity.personId),
  );

  return people
    .filter(
      (person) =>
        activePersonIds.has(person.id) &&
        staffPersonIds.has(person.id) &&
        executablePersonIds.has(person.id),
    )
    .map((person) => ({ ...person, branchId }));
}
