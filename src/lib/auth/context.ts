import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationSlugFromHost } from "@/lib/auth/tenant";
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
  organizationSlug?: string;
  personId?: string;
  role: WorkspaceRole;
};

type WorkspaceMembershipOptions = {
  organizationSlug?: string | null;
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
  options?: WorkspaceMembershipOptions,
): Promise<WorkspaceMembership | null> {
  const membership = await getWorkspaceMembershipForUser(userId, client, options);

  return membership?.role === "admin" ? membership : null;
}

export async function getWorkspaceMembershipForUser(
  userId: string,
  client?: SupabaseServerClient,
  options?: WorkspaceMembershipOptions,
): Promise<WorkspaceMembership | null> {
  const membershipOptions = options ?? {
    organizationSlug: await getCurrentOrganizationSlug(),
  };
  const supabase = client ?? (await createSupabaseServerClient());

  let query = supabase
    .from("organization_members")
    .select("organization_id, role, person_id, branch_id, created_at, organizations!inner(name, slug)")
    .eq("user_id", userId)
    .in("role", ["admin", "manager", "member"]);

  if (membershipOptions.organizationSlug) {
    query = query.eq("organizations.slug", membershipOptions.organizationSlug);
  }

  let { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error && !membershipOptions.organizationSlug) {
    const legacyResult = await supabase
      .from("organization_members")
      .select("organization_id, role, person_id, branch_id, created_at, organizations(name, slug)")
      .eq("user_id", userId)
      .in("role", ["admin", "manager", "member"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error || !data) {
    return null;
  }

  const organization = Array.isArray(data.organizations)
    ? data.organizations[0]
    : data.organizations;

  if (!isWorkspaceRole(data.role) || !organization?.name) {
    return null;
  }

  return {
    branchId: data.branch_id ?? undefined,
    organizationId: data.organization_id,
    organizationName: organization.name,
    organizationSlug: organization.slug ?? undefined,
    personId: data.person_id ?? undefined,
    role: data.role,
  };
}

export async function getCurrentOrganizationSlug() {
  const requestHeaders = await headers();
  return getOrganizationSlugFromHost(requestHeaders.get("host"));
}

function isWorkspaceRole(role: string): role is WorkspaceRole {
  return role === "admin" || role === "manager" || role === "member";
}

export const requireWorkspaceContext = cache(async () => {
  const user = await requireUser();
  const organizationSlug = await getCurrentOrganizationSlug();
  const membership = await getWorkspaceMembershipForUser(user.id, undefined, {
    organizationSlug,
  });

  if (!membership) {
    redirect("/no-access");
  }

  return {
    ...membership,
    userEmail: user.email,
    userId: user.id,
  };
});

export const requireAdminContext = cache(async () => {
  const user = await requireUser();
  const organizationSlug = await getCurrentOrganizationSlug();
  const membership = await getWorkspaceMembershipForUser(user.id, undefined, {
    organizationSlug,
  });

  if (!membership) {
    redirect("/no-access");
  }

  if (membership.role !== "admin") {
    redirect("/no-access");
  }

  return {
    ...membership,
    userEmail: user.email,
    userId: user.id,
  };
});
