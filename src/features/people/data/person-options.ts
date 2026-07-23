import { createSupabaseServerClient } from "@/lib/db/server";
import {
  buildPersonSelectOptions,
  type PersonSelectOption,
  type PersonSelectPersonRow,
  type PersonSelectRoleRow,
} from "@/features/people/person-select";
import type { PersonRoleValue } from "@/features/people/people.types";

export async function getPersonSelectOptions({
  includeArchived = false,
  organizationId,
  roles,
}: {
  includeArchived?: boolean;
  organizationId: string;
  roles: PersonRoleValue[];
}): Promise<PersonSelectOption[]> {
  if (roles.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const rolesResult = await supabase
    .from("person_roles")
    .select("person_id, role, status, archived_at")
    .eq("organization_id", organizationId)
    .in("role", roles)
    .eq("status", "active")
    .is("archived_at", null);

  if (rolesResult.error) {
    throw new Error(`Could not load person roles: ${rolesResult.error.message}`);
  }

  const roleRows = (rolesResult.data ?? []) as PersonSelectRoleRow[];
  const personIds = [...new Set(roleRows.map((row) => row.person_id))];

  if (personIds.length === 0) {
    return [];
  }

  let peopleQuery = supabase
    .from("people")
    .select("id, display_name, primary_email, primary_phone, archived_at")
    .eq("organization_id", organizationId)
    .in("id", personIds)
    .order("display_name", { ascending: true });

  if (!includeArchived) {
    peopleQuery = peopleQuery.is("archived_at", null);
  }

  const peopleResult = await peopleQuery;

  if (peopleResult.error) {
    throw new Error(`Could not load people options: ${peopleResult.error.message}`);
  }

  return buildPersonSelectOptions({
    includeArchived,
    people: (peopleResult.data ?? []) as PersonSelectPersonRow[],
    requestedRoles: roles,
    roles: roleRows,
  });
}
