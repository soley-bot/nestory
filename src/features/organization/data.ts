import { createSupabaseServerClient } from "@/lib/db/server";

export type OrganizationBranch = {
  address: string | null;
  code: string;
  id: string;
  name: string;
  status: string;
};

export type OrganizationTeam = {
  branchId: string | null;
  id: string;
  managerPersonId: string | null;
  name: string;
};

export type OrganizationPersonOption = {
  id: string;
  label: string;
};

export type OrganizationMembership = {
  branchId: string | null;
  email: string | null;
  id: string;
  personId: string | null;
  role: "admin" | "manager" | "member";
  userId: string;
};

export type OrganizationPersonAccessStatus = {
  email: string | null;
  role: OrganizationMembership["role"];
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getOrganizationSettingsData(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [branches, teams, staff] = await Promise.all([
    loadBranches(supabase, organizationId),
    loadTeams(supabase, organizationId),
    loadStaffForOrganization(supabase, organizationId),
  ]);

  return { branches, staff, teams };
}

export async function getAccessSettingsData(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [branches, members, staff] = await Promise.all([
    loadBranches(supabase, organizationId),
    loadMemberships(supabase, organizationId),
    loadStaffForOrganization(supabase, organizationId),
  ]);

  return { branches, members, staff };
}

export async function getAccessByPersonId(
  organizationId: string,
  personIds: string[],
): Promise<Record<string, OrganizationPersonAccessStatus>> {
  if (personIds.length === 0) {
    return {};
  }

  const supabase = await createSupabaseServerClient();
  const personIdSet = new Set(personIds);
  const memberships = await loadMemberships(supabase, organizationId);

  return Object.fromEntries(
    memberships.flatMap((member) =>
      member.personId && personIdSet.has(member.personId)
        ? [[member.personId, { email: member.email, role: member.role }]]
        : [],
    ),
  );
}

async function loadBranches(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<OrganizationBranch[]> {
  const { data, error } = await supabase
    .from("organization_branches")
    .select("id, name, code, address, status")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load branches: ${error.message}`);
  }

  return (data ?? []).map((branch) => ({
    address: branch.address,
    code: branch.code,
    id: branch.id,
    name: branch.name,
    status: branch.status,
  }));
}

async function loadTeams(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<OrganizationTeam[]> {
  const { data, error } = await supabase
    .from("organization_teams")
    .select("id, name, branch_id, manager_person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load teams: ${error.message}`);
  }

  return (data ?? []).map((team) => ({
    branchId: team.branch_id,
    id: team.id,
    managerPersonId: team.manager_person_id,
    name: team.name,
  }));
}

async function loadMemberships(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<OrganizationMembership[]> {
  const membersResult = await supabase.rpc("get_organization_access_members", {
    p_organization_id: organizationId,
  });

  if (!membersResult.error) {
    return (membersResult.data ?? []).map((member) => ({
      branchId: member.branch_id,
      email: member.email,
      id: member.id,
      personId: member.person_id,
      role: normalizeRole(member.role),
      userId: member.user_id,
    }));
  }

  const fallback = await supabase
    .from("organization_members")
    .select("id, user_id, role, person_id, branch_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (fallback.error) {
    throw new Error(`Could not load memberships: ${fallback.error.message}`);
  }

  return (fallback.data ?? []).map((member) => ({
    branchId: member.branch_id,
    email: null,
    id: member.id,
    personId: member.person_id,
    role: normalizeRole(member.role),
    userId: member.user_id,
  }));
}

async function loadStaffForOrganization(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<OrganizationPersonOption[]> {
  const { data, error } = await supabase
    .from("person_roles")
    .select("person_id")
    .eq("organization_id", organizationId)
    .eq("role", "staff")
    .eq("status", "active")
    .is("archived_at", null);

  if (error) {
    throw new Error(`Could not load staff roles: ${error.message}`);
  }

  const staffIds = Array.from(
    new Set((data ?? []).map((role) => role.person_id)),
  );
  return loadStaffOptions(supabase, organizationId, staffIds);
}

async function loadStaffOptions(
  supabase: SupabaseServerClient,
  organizationId: string,
  staffIds: string[],
): Promise<OrganizationPersonOption[]> {
  if (staffIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("people")
    .select("id, display_name")
    .eq("organization_id", organizationId)
    .in("id", staffIds)
    .is("archived_at", null)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load staff: ${error.message}`);
  }

  return (data ?? []).map((person) => ({
    id: person.id,
    label: person.display_name,
  }));
}

function normalizeRole(role: string): OrganizationMembership["role"] {
  return role === "manager" || role === "member" ? role : "admin";
}
