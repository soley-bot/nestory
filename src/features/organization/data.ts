import { createSupabaseServerClient } from "@/lib/db/server";

type UntypedSupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

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

type BranchRow = {
  address: string | null;
  code: string;
  id: string;
  name: string;
  status: string;
};

type TeamRow = {
  branch_id: string | null;
  id: string;
  manager_person_id: string | null;
  name: string;
};

type PersonRow = {
  display_name: string;
  id: string;
};

type RoleRow = {
  person_id: string;
};

type MembershipRow = {
  branch_id: string | null;
  email?: string | null;
  id: string;
  person_id: string | null;
  role: string;
  user_id: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getOrganizationSettingsData(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const untypedSupabase = supabase as unknown as UntypedSupabaseClient;

  const [branches, teams, staff] = await Promise.all([
    loadBranches(untypedSupabase, organizationId),
    loadTeams(untypedSupabase, organizationId),
    loadStaffForOrganization(supabase, organizationId),
  ]);

  return { branches, staff, teams };
}

export async function getAccessSettingsData(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const untypedSupabase = supabase as unknown as UntypedSupabaseClient;

  const [branches, members, staff] = await Promise.all([
    loadBranches(untypedSupabase, organizationId),
    loadMemberships(untypedSupabase, organizationId),
    loadStaffForOrganization(supabase, organizationId),
  ]);

  return { branches, members, staff };
}

async function loadBranches(
  supabase: UntypedSupabaseClient,
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

  return (((data ?? []) as unknown) as BranchRow[]).map((branch) => ({
    address: branch.address,
    code: branch.code,
    id: branch.id,
    name: branch.name,
    status: branch.status,
  }));
}

async function loadTeams(
  supabase: UntypedSupabaseClient,
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

  return (((data ?? []) as unknown) as TeamRow[]).map((team) => ({
    branchId: team.branch_id,
    id: team.id,
    managerPersonId: team.manager_person_id,
    name: team.name,
  }));
}

async function loadMemberships(
  supabase: UntypedSupabaseClient,
  organizationId: string,
): Promise<OrganizationMembership[]> {
  const membersResult = await supabase.rpc("get_organization_access_members", {
    p_organization_id: organizationId,
  });
  let memberRows = ((membersResult.data ?? []) as unknown) as MembershipRow[];

  if (membersResult.error) {
    const fallback = await supabase
      .from("organization_members")
      .select("id, user_id, role, person_id, branch_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (fallback.error) {
      throw new Error(`Could not load memberships: ${fallback.error.message}`);
    }

    memberRows = ((fallback.data ?? []) as unknown) as MembershipRow[];
  }

  return memberRows.map((member) => ({
    branchId: member.branch_id,
    email: member.email ?? null,
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

  const staffIds = Array.from(new Set(((data ?? []) as RoleRow[]).map((role) => role.person_id)));
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

  return ((data ?? []) as PersonRow[]).map((person) => ({
    id: person.id,
    label: person.display_name,
  }));
}

function normalizeRole(role: string): OrganizationMembership["role"] {
  return role === "manager" || role === "member" ? role : "admin";
}
