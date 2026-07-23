import { createSupabaseServerClient } from "@/lib/db/server";
import type { PersonSelectOption } from "@/features/people/person-select";

import {
  buildAccessByPersonId,
  type OrganizationPersonAccessStatus,
  type WorkspaceAccessRole,
} from "./access-status";

export type { OrganizationPersonAccessStatus } from "./access-status";

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

export type OrganizationStaffOption = PersonSelectOption & {
  activeStaff: boolean;
  primaryEmail: string | null;
};

export type OrganizationMembership = {
  branchId: string | null;
  email: string | null;
  id: string;
  personId: string | null;
  role: WorkspaceAccessRole;
  userId: string;
};

export type OrganizationInvitation = {
  branchId: string | null;
  email: string;
  expiresAt: string;
  id: string;
  invitedAt: string;
  lastSentAt: string | null;
  personId: string | null;
  role: OrganizationMembership["role"];
  status: "expired" | "pending" | "send_failed";
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

  const [branches, invitations, members, staff] = await Promise.all([
    loadBranches(supabase, organizationId),
    loadInvitations(supabase, organizationId),
    loadMemberships(supabase, organizationId),
    loadStaffForOrganization(supabase, organizationId),
  ]);

  const linkedPersonIds = Array.from(new Set(
    [...members, ...invitations].flatMap((record) => record.personId ? [record.personId] : []),
  ));
  const historicalOptions = await loadStaffOptions(
    supabase,
    organizationId,
    linkedPersonIds,
    { activeStaffIds: new Set(staff.map((person) => person.id)), includeArchived: true },
  );
  const linkedPeople = mergeStaffOptions(staff, historicalOptions);

  return { branches, invitations, linkedPeople, members, staff };
}

export async function getAccessByPersonId(
  organizationId: string,
  personIds: string[],
): Promise<Record<string, OrganizationPersonAccessStatus>> {
  if (personIds.length === 0) {
    return {};
  }

  const supabase = await createSupabaseServerClient();
  const [branches, invitations, memberships] = await Promise.all([
    loadBranches(supabase, organizationId),
    loadInvitations(supabase, organizationId),
    loadMemberships(supabase, organizationId),
  ]);

  return buildAccessByPersonId(
    personIds,
    memberships,
    invitations,
    new Date(),
    branches,
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

async function loadInvitations(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<OrganizationInvitation[]> {
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, branch_id, person_id, status, invited_at, last_sent_at, expires_at")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "send_failed", "expired"])
    .order("invited_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load invitations: ${error.message}`);
  }

  const now = Date.now();
  return (data ?? []).map((invitation) => ({
    branchId: invitation.branch_id,
    email: invitation.email,
    expiresAt: invitation.expires_at,
    id: invitation.id,
    invitedAt: invitation.invited_at,
    lastSentAt: invitation.last_sent_at,
    personId: invitation.person_id,
    role: normalizeRole(invitation.role),
    status:
      invitation.status === "expired" || Date.parse(invitation.expires_at) <= now
        ? "expired"
        : invitation.status === "send_failed"
          ? "send_failed"
          : "pending",
  }));
}

async function loadStaffForOrganization(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<OrganizationStaffOption[]> {
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
  options: { activeStaffIds?: Set<string>; includeArchived?: boolean } = {},
): Promise<OrganizationStaffOption[]> {
  if (staffIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("people")
    .select("id, display_name, primary_email, primary_phone, archived_at")
    .eq("organization_id", organizationId)
    .in("id", staffIds);
  if (!options.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("display_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load staff: ${error.message}`);
  }

  return (data ?? []).map((person) => ({
    activeStaff: options.activeStaffIds?.has(person.id) ?? !options.includeArchived,
    archived: person.archived_at !== null,
    description: ["Staff", person.primary_email ?? person.primary_phone]
      .filter(Boolean)
      .join(" · "),
    id: person.id,
    label: person.display_name,
    primaryEmail: person.primary_email,
    roles: ["staff"],
  }));
}

function mergeStaffOptions(
  active: OrganizationStaffOption[],
  historical: OrganizationStaffOption[],
) {
  return [...new Map(
    [...historical, ...active].map((person) => [person.id, person]),
  ).values()];
}

function normalizeRole(role: string): OrganizationMembership["role"] {
  return role === "manager" || role === "member" ? role : "admin";
}
