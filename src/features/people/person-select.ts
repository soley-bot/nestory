import type { PersonRoleValue } from "@/features/people/people.types";

export type PersonSelectOption = {
  archived: boolean;
  description: string;
  id: string;
  label: string;
  roles: PersonRoleValue[];
};

export type PersonSelectPersonRow = {
  archived_at: string | null;
  display_name: string;
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
};

export type PersonSelectRoleRow = {
  archived_at: string | null;
  person_id: string;
  role: string;
  status: string;
};

export function buildPersonSelectOptions({
  includeArchived = false,
  people,
  requestedRoles,
  roles,
}: {
  includeArchived?: boolean;
  people: PersonSelectPersonRow[];
  requestedRoles: PersonRoleValue[];
  roles: PersonSelectRoleRow[];
}): PersonSelectOption[] {
  const requested = new Set(requestedRoles);
  const rolesByPerson = new Map<string, Set<PersonRoleValue>>();

  for (const row of roles) {
    if (
      row.archived_at ||
      row.status !== "active" ||
      !isPersonRole(row.role) ||
      !requested.has(row.role)
    ) {
      continue;
    }

    const personRoles = rolesByPerson.get(row.person_id) ?? new Set();
    personRoles.add(row.role);
    rolesByPerson.set(row.person_id, personRoles);
  }

  return people
    .filter(
      (person) =>
        rolesByPerson.has(person.id) &&
        (includeArchived || person.archived_at === null),
    )
    .map((person) => {
      const personRoles = [...(rolesByPerson.get(person.id) ?? [])].toSorted();
      const contact = person.primary_email ?? person.primary_phone;
      const roleLabel = personRoles.map(formatRole).join(", ");

      return {
        archived: person.archived_at !== null,
        description: [roleLabel, contact].filter(Boolean).join(" · "),
        id: person.id,
        label: person.display_name,
        roles: personRoles,
      };
    })
    .toSorted(
      (first, second) =>
        first.label.localeCompare(second.label, undefined, {
          numeric: true,
          sensitivity: "base",
        }) || first.id.localeCompare(second.id),
    );
}

function isPersonRole(value: string): value is PersonRoleValue {
  return (
    value === "tenant" ||
    value === "owner" ||
    value === "vendor" ||
    value === "staff"
  );
}

function formatRole(role: PersonRoleValue) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
