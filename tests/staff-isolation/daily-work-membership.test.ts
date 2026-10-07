import { describe, expect, it, vi } from "vitest";

import { getWorkspaceMembershipForUser } from "@/lib/auth/context";

type QueryResult = { data: unknown; error: unknown };

function createClient(results: Record<string, QueryResult>) {
  const queries: Record<string, ReturnType<typeof createQuery>> = {};
  const from = vi.fn((table: string) => {
    const query = createQuery(results[table] ?? { data: null, error: null });
    queries[table] = query;
    return query;
  });

  return { client: { from }, queries };
}

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn(),
    select: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  for (const method of ["eq", "limit", "order", "select"] as const) {
    query[method].mockReturnValue(query);
  }
  return query;
}

import { hasPermission } from "@/lib/auth/permission-context";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import type { PermissionKey } from "@/lib/auth/permission-catalog";

const scopes = [
  { company: "company-1", branch: "company-1-A" },
  { company: "company-1", branch: "company-1-B" },
  { company: "company-2", branch: "company-2-A" },
  { company: "company-2", branch: "company-2-B" },
];
const profiles: { name: string; keys: PermissionKey[]; allowed: PermissionKey; denied: PermissionKey }[] = [
  { name: "record operator", keys: ["properties.write", "people.write", "leases.prepare"], allowed: "properties.write", denied: "finance.publish" },
  { name: "finance recorder", keys: ["finance.record_payments", "finance.submit_expenses"], allowed: "finance.record_payments", denied: "finance.approve_expenses" },
  { name: "maintenance executor", keys: ["maintenance.complete"], allowed: "maintenance.complete", denied: "maintenance.review" },
  { name: "report publisher", keys: ["finance.publish"], allowed: "finance.publish", denied: "finance.correct_records" },
  { name: "record reader", keys: ["properties.view", "people.view", "leases.view", "finance.view"], allowed: "leases.view", denied: "leases.change_terms" },
];
function fixture(company: string, branch: string, keys: PermissionKey[]) {
  return {
    organization_members: { data: { branch_id: branch, created_at: "2026-10-05T00:00:00Z", custom_role_id: company + "-role", organization_id: company, organizations: { name: company, slug: company, operational_timezone: "UTC" }, person_id: company + "-shared-person", role: "custom" }, error: null },
    organization_authorization_states: { data: { ordinary_access_enabled: true }, error: null },
    organization_branches: { data: { archived_at: null, id: branch, status: "active" }, error: null },
    organization_roles: { data: { archived_at: null, id: company + "-role", name: "Synthetic daily role", status: "active" }, error: null },
    organization_role_permissions: { data: keys.map(permission_key => ({ permission_key })), error: null },
  };
}
describe.each(scopes)("ordinary daily membership $company/$branch", ({ company, branch }) => {
  it.each(profiles)("resolves $name with only existing operation authority", async ({ keys, allowed, denied }) => {
    const { client, queries } = createClient(fixture(company, branch, keys));
    const membership = await getWorkspaceMembershipForUser("synthetic-user", client as never, { organizationSlug: company });
    expect(membership).not.toBeNull();
    expect(membership).toMatchObject({ organizationId: company, branchId: branch, isSuperAdmin: false, roleKind: "custom" });
    expect(hasPermission({ ...membership!, userId: "synthetic-user" }, allowed)).toBe(true);
    expect(hasPermission({ ...membership!, userId: "synthetic-user" }, denied)).toBe(false);
    expect(membership?.capabilities.canManageAccess).toBe(false);
    const maintenance = getMaintenanceCapabilities(membership!);
    expect(maintenance.canUploadMaintenanceEvidence).toBe(false);
    expect(maintenance.canArchiveCase).toBe(false);
    expect(membership?.capabilities.canReadFinanceReports).toBe(keys.includes("finance.publish"));
    expect(queries.organization_members.eq).toHaveBeenCalledWith("user_id", "synthetic-user");
    expect(queries.organization_members.eq).toHaveBeenCalledWith("organizations.slug", company);
    for (const table of ["organization_authorization_states", "organization_branches", "organization_roles", "organization_role_permissions"]) {
      expect(queries[table].eq).toHaveBeenCalledWith("organization_id", company);
    }
    expect(queries.organization_branches.eq).toHaveBeenCalledWith("id", branch);
    expect(queries.organization_roles.eq).toHaveBeenCalledWith("id", company + "-role");
    expect(queries.organization_role_permissions.eq).toHaveBeenCalledWith("role_id", company + "-role");
    expect(client.from).not.toHaveBeenCalledWith("person_branch_relationships");
  });
  it.each(["organization_branches", "organization_roles", "organization_role_permissions"])("fails closed when scoped %s lookup rejects a foreign ID", async table => {
    const results: Record<string, QueryResult> = fixture(company, branch, ["properties.view"]);
    results[table] = { data: null, error: { code: "42501" } };
    const { client } = createClient(results);
    await expect(getWorkspaceMembershipForUser("synthetic-user", client as never, { organizationSlug: company })).resolves.toBeNull();
  });
});
