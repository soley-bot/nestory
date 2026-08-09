import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationSlugFromHost } from "@/lib/auth/tenant";
import {
  getWorkspaceCapabilities,
  isWorkspaceRole,
  WORKSPACE_ROLES,
  type WorkspaceCapabilities,
  type WorkspaceRole,
} from "@/lib/auth/capabilities";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  normalizeOrganizationTheme,
  type OrganizationTheme,
} from "@/lib/theme/organization-theme";

export type { WorkspaceCapabilities, WorkspaceRole } from "@/lib/auth/capabilities";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AuthUser = {
  email?: string;
  id: string;
};

type WorkspaceMembership = {
  branchId?: string;
  organizationId: string;
  organizationName: string;
  organizationSlug?: string;
  personId?: string;
  role: WorkspaceRole;
  theme: OrganizationTheme;
};

type WorkspaceMembershipOptions = {
  organizationSlug?: string | null;
};

type FinanceRole = Extract<
  WorkspaceRole,
  "super_admin" | "finance_manager" | "finance_member"
>;
type FinanceManagerRole = Extract<
  WorkspaceRole,
  "super_admin" | "finance_manager"
>;
type OperationsRole = Extract<
  WorkspaceRole,
  "super_admin" | "operations_manager" | "operations_member"
>;

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

  return membership?.role === "super_admin" ? membership : null;
}

export async function getFinanceReportMembershipForUser(
  userId: string,
  client?: SupabaseServerClient,
  options?: WorkspaceMembershipOptions,
): Promise<WorkspaceMembership | null> {
  const membership = await getWorkspaceMembershipForUser(userId, client, options);

  return membership && getWorkspaceCapabilities(membership.role).canReadFinanceReports
    ? membership
    : null;
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
    .select("organization_id, role, person_id, branch_id, created_at, organizations!inner(name, slug, theme_mode, accent_preset, accent_seed)")
    .eq("user_id", userId)
    .in("role", [...WORKSPACE_ROLES]);

  if (membershipOptions.organizationSlug) {
    query = query.eq("organizations.slug", membershipOptions.organizationSlug);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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
    theme: normalizeOrganizationTheme({
      accentPreset: organization.accent_preset,
      accentSeed: organization.accent_seed,
      mode: organization.theme_mode,
    }),
  };
}

export async function getCurrentOrganizationSlug() {
  const requestHeaders = await headers();
  return getOrganizationSlugFromHost(requestHeaders.get("host"));
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
    capabilities: getWorkspaceCapabilities(membership.role),
    userEmail: user.email,
    userId: user.id,
  };
});

async function requireCapability(
  capability: keyof WorkspaceCapabilities,
) {
  const context = await requireWorkspaceContext();

  if (!context.capabilities[capability]) {
    redirect("/no-access");
  }

  return context;
}

export const requireSuperAdminContext = cache(async () =>
  requireCapability("canManageAccess").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireLeaseConfigurationContext = cache(async () =>
  requireCapability("canConfigureLeases").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireFinanceContext = cache(async () =>
  requireCapability("canReadFinance").then((context) => ({
    ...context,
    role: context.role as FinanceRole,
  })),
);

export const requireFinanceSubmissionContext = cache(async () =>
  requireCapability("canSubmitExpense").then((context) => ({
    ...context,
    role: context.role as Extract<WorkspaceRole, "super_admin" | "finance_member">,
  })),
);

export const requireFinanceReviewContext = cache(async () =>
  requireCapability("canReviewExpense").then((context) => ({
    ...context,
    role: context.role as Extract<WorkspaceRole, "super_admin" | "finance_manager">,
  })),
);

export const requireFinanceReversalContext = cache(async () =>
  requireCapability("canReverseExpense").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireFinanceOperationContext = cache(async () =>
  requireCapability("canOperateFinance").then((context) => ({
    ...context,
    role: context.role as FinanceManagerRole,
  })),
);

export const requireFinancePettyCashContext = cache(async () =>
  requireCapability("canManagePettyCash").then((context) => ({
    ...context,
    role: context.role as FinanceManagerRole,
  })),
);

export const requireFinanceReportContext = cache(async () =>
  requireCapability("canReadFinanceReports").then((context) => ({
    ...context,
    role: context.role as FinanceManagerRole,
  })),
);

export const requireCurrentRentRetryContext = cache(async () =>
  requireCapability("canRetryCurrentRent").then((context) => ({
    ...context,
    role: context.role as FinanceManagerRole,
  })),
);

export const requireFinancialMonthLockContext = cache(async () =>
  requireCapability("canLockFinancialMonth").then((context) => ({
    ...context,
    role: context.role as FinanceManagerRole,
  })),
);

export const requireFinancialMonthUnlockContext = cache(async () =>
  requireCapability("canUnlockFinancialMonth").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireOperationsManagementContext = cache(async () =>
  requireCapability("canManageOperations").then((context) => ({
    ...context,
    role: context.role as Extract<WorkspaceRole, "super_admin" | "operations_manager">,
  })),
);

export const requireOperationsExecutionContext = cache(async () =>
  requireCapability("canExecuteOperations").then((context) => ({
    ...context,
    role: context.role as OperationsRole,
  })),
);
