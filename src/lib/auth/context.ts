import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AuthUser = {
  email?: string;
  id: string;
};

type AdminMembership = {
  organizationId: string;
  organizationName: string;
  role: "admin";
};

type MembershipRow = {
  organization_id: string;
  organizations: { name: string } | { name: string }[] | null;
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
): Promise<AdminMembership | null> {
  const supabase = client ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as MembershipRow;
  const organization = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations;

  if (row.role !== "admin" || !organization?.name) {
    return null;
  }

  return {
    organizationId: row.organization_id,
    organizationName: organization.name,
    role: "admin",
  };
}

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
