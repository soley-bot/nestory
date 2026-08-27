import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrganizationSlugFromHost } from "@/lib/auth/tenant";
import {
  getWorkspaceCapabilitiesFromPermissions,
  isWorkspaceRoleKind,
  type WorkspaceCapabilities,
  type WorkspaceRoleKind,
} from "@/lib/auth/capabilities";
import { type PermissionKey } from "@/lib/auth/permission-catalog";
import {
  buildWorkspacePermissionContext,
  hasPermission,
  type WorkspacePermissionContext,
} from "@/lib/auth/permission-context";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  normalizeOrganizationTheme,
  type OrganizationTheme,
} from "@/lib/theme/organization-theme";

export type {
  WorkspaceCapabilities,
  WorkspaceRole,
  WorkspaceRoleKind,
} from "@/lib/auth/capabilities";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AuthUser = {
  email?: string;
  id: string;
  sessionId?: string;
};

type WorkspaceMembership = {
  branchId?: string;
  capabilities: WorkspaceCapabilities;
  isSuperAdmin: boolean;
  organizationId: string;
  organizationName: string;
  organizationSlug?: string;
  permissionContext: WorkspacePermissionContext;
  permissionKeys: ReadonlySet<PermissionKey>;
  personId?: string;
  role: WorkspaceRoleKind;
  roleId?: string;
  roleKind: WorkspaceRoleKind;
  roleName: string;
  theme: OrganizationTheme;
};

type WorkspaceMembershipOptions = {
  organizationSlug?: string | null;
};

type QueryResult = { data: unknown; error: unknown };

type AuthorizationQuery = PromiseLike<QueryResult> & {
  eq(column: string, value: unknown): AuthorizationQuery;
  limit(count: number): AuthorizationQuery;
  maybeSingle(): Promise<QueryResult>;
  order(column: string, options?: { ascending: boolean }): AuthorizationQuery;
  select(columns: string): AuthorizationQuery;
};

type AuthorizationClient = {
  from(table: string): AuthorizationQuery;
};

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  const claims = data.claims as {
    email?: unknown;
    session_id?: unknown;
    sub?: unknown;
  };
  const sessionId = z.uuid().safeParse(claims.session_id);

  if (typeof claims.sub !== "string" || !sessionId.success) {
    return null;
  }

  return {
    email: typeof claims.email === "string" ? claims.email : undefined,
    id: claims.sub,
    sessionId: sessionId.data,
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

  return membership?.capabilities.canReadFinanceReports
    ? membership
    : null;
}

export async function getOwnerStatementMembershipForUser(
  userId: string,
  client?: SupabaseServerClient,
  options?: WorkspaceMembershipOptions,
): Promise<WorkspaceMembership | null> {
  const membership = await getWorkspaceMembershipForUser(userId, client, options);

  return membership?.capabilities.canReadOwnerBalanceAuthority
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
  const supabase = (client ?? (await createSupabaseServerClient())) as unknown as
    AuthorizationClient;

  let query = supabase
    .from("organization_members")
    .select("organization_id, role, person_id, branch_id, custom_role_id, created_at, organizations!inner(name, slug, theme_mode, accent_preset, accent_seed)")
    .eq("user_id", userId);

  if (membershipOptions.organizationSlug) {
    query = query.eq("organizations.slug", membershipOptions.organizationSlug);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !isObject(data)) {
    return null;
  }

  const organization = Array.isArray(data.organizations)
    ? data.organizations[0]
    : data.organizations;

  if (!isWorkspaceRoleKind(data.role) || !isObject(organization) || typeof organization.name !== "string") {
    return null;
  }

  const organizationId = readRequiredString(data.organization_id);
  if (!organizationId) {
    return null;
  }

  const roleKind = data.role;
  let resolvedPermissionContext;

  if (roleKind === "super_admin") {
    resolvedPermissionContext = buildWorkspacePermissionContext({
      branch: null,
      customRole: null,
      ordinaryAccessActive: false,
      organizationId,
      roleKind,
      userId,
    });
  } else {
    const branchId = readRequiredString(data.branch_id);
    const roleId = readRequiredString(data.custom_role_id);
    if (!branchId || !roleId) {
      return null;
    }

    const { data: stateData, error: stateError } = await supabase
      .from("organization_authorization_states")
      .select("ordinary_access_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (
      stateError ||
      !isObject(stateData) ||
      stateData.ordinary_access_enabled !== true
    ) {
      return null;
    }

    const [branchResult, roleResult, permissionResult] = await Promise.all([
      supabase
        .from("organization_branches")
        .select("id, status, archived_at")
        .eq("organization_id", organizationId)
        .eq("id", branchId)
        .maybeSingle(),
      supabase
        .from("organization_roles")
        .select("id, name, status, archived_at")
        .eq("organization_id", organizationId)
        .eq("id", roleId)
        .maybeSingle(),
      supabase
        .from("organization_role_permissions")
        .select("permission_key")
        .eq("organization_id", organizationId)
        .eq("role_id", roleId)
        .limit(24),
    ]);
    if (branchResult.error || roleResult.error || permissionResult.error) {
      return null;
    }

    const branch = isObject(branchResult.data) ? branchResult.data : null;
    const roleRecord = isObject(roleResult.data) ? roleResult.data : null;
    const permissionRows = Array.isArray(permissionResult.data)
      ? permissionResult.data
      : null;
    if (!branch || !roleRecord || !permissionRows) {
      return null;
    }

    resolvedPermissionContext = buildWorkspacePermissionContext({
      branch: {
        id: readRequiredString(branch.id),
        status:
          branch.archived_at === null && branch.status === "active"
            ? "active"
            : "archived",
      },
      customRole: {
        id: readRequiredString(roleRecord.id),
        name: readRequiredString(roleRecord.name),
        permissionKeys: permissionRows.map((row) =>
          isObject(row) ? row.permission_key : undefined,
        ),
        status:
          roleRecord.archived_at === null && roleRecord.status === "active"
            ? "active"
            : "archived",
      },
      ordinaryAccessActive: true,
      organizationId,
      roleKind,
      userId,
    });
  }

  if (!resolvedPermissionContext.ok) {
    return null;
  }

  const permissionContext = resolvedPermissionContext.context;

  return {
    branchId: permissionContext.branchId,
    capabilities: getWorkspaceCapabilitiesFromPermissions(permissionContext),
    isSuperAdmin: permissionContext.isSuperAdmin,
    organizationId,
    organizationName: organization.name,
    organizationSlug: readOptionalString(organization.slug),
    permissionContext,
    permissionKeys: permissionContext.permissionKeys,
    personId: readOptionalString(data.person_id),
    role: roleKind,
    roleId: permissionContext.roleId,
    roleKind,
    roleName: permissionContext.roleName,
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
  if (!user.sessionId) {
    redirect("/login");
  }
  const organizationSlug = await getCurrentOrganizationSlug();
  const membership = await getWorkspaceMembershipForUser(user.id, undefined, {
    organizationSlug,
  });

  if (!membership) {
    redirect("/no-access");
  }

  return {
    ...membership,
    sessionId: user.sessionId,
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

export async function requirePermission(permission: PermissionKey) {
  const context = await requireWorkspaceContext();

  if (!hasPermission(context.permissionContext, permission)) {
    redirect("/no-access");
  }

  return context;
}

export const requireSuperAdminContext = cache(async () =>
  requireCapability("canManageAccess").then((context) => ({
    ...context,
    role: context.role as "super_admin",
    roleKind: context.roleKind as "super_admin",
  })),
);

export const requireLeaseConfigurationContext = cache(async () =>
  requireCapability("canConfigureLeases"),
);

export const requireHistoricalRentRecoveryContext = cache(async () =>
  requireCapability("canRecoverHistoricalRent").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireFinanceContext = cache(async () =>
  requireCapability("canReadFinance"),
);

export const requireFinanceSubmissionContext = cache(async () =>
  requireCapability("canSubmitExpense"),
);

export const requireFinanceReviewContext = cache(async () =>
  requireCapability("canReviewExpense"),
);

export const requireFinanceReversalContext = cache(async () =>
  requireCapability("canReverseExpense").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireFinanceOperationContext = cache(async () =>
  requireCapability("canOperateFinance"),
);

export const requireFinanceCorrectionContext = cache(async () =>
  requireCapability("canCorrectFinance"),
);

export const requireFinancePettyCashContext = cache(async () =>
  requireCapability("canManagePettyCash"),
);

export const requireFinanceReportContext = cache(async () =>
  requireCapability("canReadFinanceReports"),
);

export const requireOwnerBalanceReadContext = cache(async () =>
  requireCapability("canReadOwnerBalanceAuthority"),
);

export const requireOwnerOpeningBalanceSubmissionContext = cache(async () =>
  requireCapability("canSubmitOwnerOpeningBalance"),
);

export const requireOwnerOpeningBalanceCorrectionContext = cache(async () =>
  requireCapability("canRequestOwnerOpeningBalanceCorrection"),
);

export const requireOwnerOpeningBalanceReviewContext = cache(async () =>
  requireCapability("canReviewOwnerOpeningBalance"),
);

export const requireOwnerCloseReadinessContext = cache(async () =>
  requireCapability("canInspectOwnerCloseReadiness"),
);

export const requireOwnerCloseContext = cache(async () =>
  requireCapability("canCloseOwnerMonth"),
);

export const requireOwnerMonthReopenContext = cache(async () =>
  requireCapability("canReopenOwnerMonth").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireOwnerStatementPublicationContext = cache(async () =>
  requireCapability("canPublishOwnerStatement"),
);

export const requireCurrentRentRetryContext = cache(async () =>
  requireCapability("canRetryCurrentRent"),
);

export const requireFinancialMonthLockContext = cache(async () =>
  requireCapability("canLockFinancialMonth"),
);

export const requireFinancialMonthUnlockContext = cache(async () =>
  requireCapability("canUnlockFinancialMonth").then((context) => ({
    ...context,
    role: context.role as "super_admin",
  })),
);

export const requireOperationsManagementContext = cache(async () =>
  requireCapability("canManageOperations"),
);

export const requireOperationsExecutionContext = cache(async () =>
  requireCapability("canExecuteOperations"),
);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
