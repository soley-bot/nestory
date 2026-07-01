import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AuthUser = {
  email?: string;
  id: string;
};

export type WorkspaceRole = "admin" | "manager" | "member";

type WorkspaceMembership = {
  branchId?: string;
  organizationId: string;
  organizationName: string;
  personId?: string;
  role: WorkspaceRole;
};

type MembershipRow = {
  branch_id: string | null;
  organization_id: string;
  organizations: { name: string } | { name: string }[] | null;
  person_id: string | null;
  role: string;
};

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  const claims = data.claims as { email?: unknown; sub?: unknown };

  if (typeof claims.sub !== "string") {
    return null;
  }

  return {
    email: typeof claims.email === "string" ? claims.email : undefined,
    id: claims.sub,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getAdminMembershipForUser(
  userId: string,
  client?: SupabaseServerClient,
): Promise<WorkspaceMembership | null> {
  const membership = await getWorkspaceMembershipForUser(userId, client);

  return membership?.role === "admin" ? membership : null;
}

export async function getWorkspaceMembershipForUser(
  userId: string,
  client?: SupabaseServerClient,
): Promise<WorkspaceMembership | null> {
  const supabase = client ?? (await createSupabaseServerClient());
  let { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, person_id, branch_id, organizations(name)")
    .eq("user_id", userId)
    .in("role", ["admin", "manager", "member"])
    .limit(1)
    .maybeSingle();

  if (error) {
    const legacyResult = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations(name)")
      .eq("user_id", userId)
      .in("role", ["admin", "manager", "member"])
      .limit(1)
      .maybeSingle();

    data = legacyResult.data as typeof data;
    error = legacyResult.error;
  }

  if (error || !data) {
    return null;
  }

  const row = data as unknown as MembershipRow;
  const organization = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations;

  if (!isWorkspaceRole(row.role) || !organization?.name) {
    return null;
  }

  return {
    branchId: row.branch_id ?? undefined,
    organizationId: row.organization_id,
    organizationName: organization.name,
    personId: row.person_id ?? undefined,
    role: row.role,
  };
}

function isWorkspaceRole(role: string): role is WorkspaceRole {
  return role === "admin" || role === "manager" || role === "member";
}

export const requireWorkspaceContext = cache(async () => {
  const user = await requireUser();
  const membership = await getWorkspaceMembershipForUser(user.id);

  if (!membership) {
    redirect("/setup");
  }

  return {
    ...membership,
    userEmail: user.email,
    userId: user.id,
  };
});

export const requireAdminContext = cache(async () => {
  const user = await requireUser();
  const membership = await getAdminMembershipForUser(user.id);

  if (!membership) {
    redirect("/setup");
  }

  return {
    ...membership,
    userEmail: user.email,
    userId: user.id,
  };
});
