import { isOrganizationWideRole } from "@/features/organization/access-status";
import { buildAccessByPersonId } from "@/features/organization/access-status";
import type {
  OrganizationBranch,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationStaffOption,
} from "@/features/organization/data";

export type AccessRegisterView = "active" | "invitations" | "no_access";

type AccessCollections = {
  branches: OrganizationBranch[];
  invitations: OrganizationInvitation[];
  members: OrganizationMembership[];
};

type AccessRegisterFilterInput = AccessCollections & {
  people: OrganizationStaffOption[];
  query: string;
  role: string;
  scope: string;
  staff: OrganizationStaffOption[];
};

export function getInitialAccessRegisterView({
  focusedInvitationId,
  focusedMemberId,
  requestedStaffId,
}: {
  focusedInvitationId?: string;
  focusedMemberId?: string;
  requestedStaffId?: string;
}): AccessRegisterView {
  if (focusedInvitationId) return "invitations";
  if (focusedMemberId) return "active";
  if (requestedStaffId) return "no_access";
  return "active";
}

export function getNoAccessStaff(
  {
    branches,
    invitations,
    members,
    staff,
  }: AccessCollections & { staff: OrganizationStaffOption[] },
  now = new Date(),
) {
  const eligible = uniqueActiveStaff(staff);
  const accessByPersonId = buildAccessByPersonId(
    eligible.map((person) => person.id),
    members,
    invitations,
    now,
    branches,
  );

  return eligible.filter(
    (person) => accessByPersonId[person.id]?.state === "no_access",
  );
}

export function filterAccessRegister({
  branches,
  invitations,
  members,
  people,
  query,
  role,
  scope,
  staff,
}: AccessRegisterFilterInput) {
  const normalizedQuery = normalize(query);
  const personById = new Map(people.map((person) => [person.id, person]));
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const matchesRole = (value: {
    customRoleId?: string | null;
    role: string;
  }) =>
    role === "all" ||
    value.role === role ||
    (value.role === "custom" && value.customRoleId === role);
  const matchesScope = (value: { branchId: string | null; role: string }) => {
    if (scope === "all") return true;
    if (scope === "organization") return isOrganizationWideRole(value.role);
    return !isOrganizationWideRole(value.role) && value.branchId === scope;
  };

  return {
    invitations: invitations.filter(
      (invitation) =>
        matchesRole(invitation) &&
        matchesScope(invitation) &&
        matchesQuery(normalizedQuery, [
          invitation.email,
          personById.get(invitation.personId ?? "")?.label,
          personById.get(invitation.personId ?? "")?.primaryEmail,
          branchById.get(invitation.branchId ?? "")?.name,
        ]),
    ),
    members: members.filter(
      (member) =>
        matchesRole(member) &&
        matchesScope(member) &&
        matchesQuery(normalizedQuery, [
          member.email,
          personById.get(member.personId ?? "")?.label,
          personById.get(member.personId ?? "")?.primaryEmail,
          branchById.get(member.branchId ?? "")?.name,
        ]),
    ),
    staff: staff.filter(
      (person) =>
        role === "all" &&
        scope === "all" &&
        matchesQuery(normalizedQuery, [
          person.label,
          person.primaryEmail,
          person.description,
        ]),
    ),
  };
}

function uniqueActiveStaff(staff: OrganizationStaffOption[]) {
  const byId = new Map<string, OrganizationStaffOption>();

  for (const person of staff) {
    if (
      !person.activeStaff ||
      person.archived ||
      !person.roles.includes("staff") ||
      byId.has(person.id)
    ) {
      continue;
    }
    byId.set(person.id, person);
  }

  return [...byId.values()];
}

function matchesQuery(query: string, values: Array<string | null | undefined>) {
  return query.length === 0 || values.some((value) => normalize(value).includes(query));
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}
