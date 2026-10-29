import { createSupabaseServerClient } from "@/lib/db/server";
import { z } from "zod";
import { readAllRows, readAllRowsByIds } from "@/lib/db/read-all-rows";
import {
  buildPersonSelectOptions,
  type PersonSelectOption,
  type PersonSelectPersonRow,
  type PersonSelectRoleRow,
} from "@/features/people/person-select";
import type { PersonRoleValue } from "@/features/people/people.types";

const personOptionSchema = z.object({ archived: z.boolean(), description: z.string(), id: z.string(), label: z.string(), partyType: z.enum(["individual","company"]), roles: z.array(z.enum(["tenant","owner","vendor","staff"])) });
const personPageSchema = z.object({ options: z.array(personOptionSchema).max(25), selectedOption: personOptionSchema.nullable(), hasMore: z.boolean() });

export async function getPersonSelectPage({ organizationId, roles, query = "", page = 1, selectedId }: { organizationId: string; roles: PersonRoleValue[]; query?: string; page?: number; selectedId?: string }): Promise<{ options: PersonSelectOption[]; selectedOption: PersonSelectOption | null; hasMore: boolean }> {
  if (!Number.isSafeInteger(page) || page < 1 || roles.length === 0 || query.length > 200 || (selectedId && !z.uuid().safeParse(selectedId).success)) throw new Error("Invalid person selection.");
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_person_select_page", { p_organization_id: organizationId, p_roles: roles, p_query: query, p_page: page, ...(selectedId ? { p_selected_id: selectedId } : {}) });
  if (result.error) throw new Error(`Could not load people options: ${result.error.message}`);
  const parsed = personPageSchema.safeParse(result.data);
  if (!parsed.success || new Set(parsed.data.options.map(option => option.id)).size !== parsed.data.options.length || (parsed.data.selectedOption && parsed.data.selectedOption.id !== selectedId)) throw new Error("Could not load people options: malformed response.");
  return parsed.data;
}

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
  const rolesResult = await readAllRows((from, to) => supabase
    .from("person_roles")
    .select("person_id, role, status, archived_at")
    .eq("organization_id", organizationId)
    .in("role", roles)
    .eq("status", "active")
    .is("archived_at", null)
    .order("person_id").order("role").order("id").range(from, to));

  if (rolesResult.error) {
    throw new Error(`Could not load person roles: ${rolesResult.error.message}`);
  }

  const roleRows = (rolesResult.data ?? []) as PersonSelectRoleRow[];
  const personIds = [...new Set(roleRows.map((row) => row.person_id))];

  if (personIds.length === 0) {
    return [];
  }

  const peopleResult = await readAllRowsByIds(personIds, (ids, from, to) => {
    let peopleQuery = supabase
    .from("people")
    .select("id, display_name, party_type, primary_email, primary_phone, archived_at")
    .eq("organization_id", organizationId)
    .in("id", ids)
    .order("display_name", { ascending: true }).order("id");

    if (!includeArchived) {
      peopleQuery = peopleQuery.is("archived_at", null);
    }
    return peopleQuery.range(from, to);
  });

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
