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

const organization = {
  accent_preset: "ocean",
  accent_seed: null,
  name: "Nestory Test",
  slug: "nestory-test",
  theme_mode: "light",
};

describe("database-backed workspace permission membership", () => {
  it("gives Super Admin all permissions without a branch or role lookup", async () => {
    const { client } = createClient({
      organization_members: {
        data: {
          branch_id: null,
          created_at: "2026-08-09T00:00:00Z",
          custom_role_id: null,
          organization_id: "org-1",
          organizations: organization,
          person_id: null,
          role: "super_admin",
        },
        error: null,
      },
    });

    await expect(
      getWorkspaceMembershipForUser("user-1", client as never, {
        organizationSlug: "nestory-test",
      }),
    ).resolves.toMatchObject({
      branchId: undefined,
      isSuperAdmin: true,
      organizationId: "org-1",
      permissionKeys: expect.any(Set),
      role: "super_admin",
      roleKind: "super_admin",
      roleName: "Super Admin",
    });
  });

  it("loads an enabled active custom role from public RLS-protected relations", async () => {
    const { client } = createClient({
      organization_authorization_states: {
        data: { ordinary_access_enabled: true },
        error: null,
      },
      organization_branches: {
        data: { archived_at: null, id: "branch-1", status: "active" },
        error: null,
      },
      organization_members: {
        data: {
          branch_id: "branch-1",
          created_at: "2026-08-09T00:00:00Z",
          custom_role_id: "role-1",
          organization_id: "org-1",
          organizations: organization,
          person_id: "person-1",
          role: "custom",
        },
        error: null,
      },
      organization_role_permissions: {
        data: [
          { permission_key: "maintenance.view" },
          { permission_key: "maintenance.complete" },
        ],
        error: null,
      },
      organization_roles: {
        data: {
          archived_at: null,
          id: "role-1",
          name: "Caretaker",
          status: "active",
        },
        error: null,
      },
    });

    const membership = await getWorkspaceMembershipForUser(
      "user-1",
      client as never,
      { organizationSlug: "nestory-test" },
    );

    expect(membership).toMatchObject({
      branchId: "branch-1",
      isSuperAdmin: false,
      role: "custom",
      roleKind: "custom",
      roleName: "Caretaker",
    });
    expect([...(membership?.permissionKeys ?? [])]).toEqual([
      "maintenance.view",
      "maintenance.complete",
    ]);
  });

  it.each([
    "finance_manager",
    "finance_member",
    "operations_manager",
    "operations_member",
  ])("fails closed for contained legacy ordinary role %s", async (role) => {
    const { client, queries } = createClient({
      organization_members: {
        data: {
          branch_id: null,
          created_at: "2026-08-09T00:00:00Z",
          custom_role_id: null,
          organization_id: "org-1",
          organizations: organization,
          person_id: null,
          role,
        },
        error: null,
      },
    });

    await expect(
      getWorkspaceMembershipForUser("user-1", client as never, {
        organizationSlug: null,
      }),
    ).resolves.toBeNull();
    expect(queries.organization_members.eq).toHaveBeenCalledWith(
      "user_id",
      "user-1",
    );
  });

  it.each([
    ["ordinary access off", { ordinary_access_enabled: false }, { archived_at: null, id: "branch-1", status: "active" }, { archived_at: null, id: "role-1", name: "Caretaker", status: "active" }, [{ permission_key: "maintenance.view" }]],
    ["archived branch", { ordinary_access_enabled: true }, { archived_at: "2026-08-22T00:00:00Z", id: "branch-1", status: "archived" }, { archived_at: null, id: "role-1", name: "Caretaker", status: "active" }, [{ permission_key: "maintenance.view" }]],
    ["archived role", { ordinary_access_enabled: true }, { archived_at: null, id: "branch-1", status: "active" }, { archived_at: "2026-08-22T00:00:00Z", id: "role-1", name: "Caretaker", status: "archived" }, [{ permission_key: "maintenance.view" }]],
    ["empty role", { ordinary_access_enabled: true }, { archived_at: null, id: "branch-1", status: "active" }, { archived_at: null, id: "role-1", name: "Caretaker", status: "active" }, []],
    ["unknown permission", { ordinary_access_enabled: true }, { archived_at: null, id: "branch-1", status: "active" }, { archived_at: null, id: "role-1", name: "Caretaker", status: "active" }, [{ permission_key: "workspace.root" }]],
  ] as const)("fails closed for %s", async (_label, state, branch, roleRecord, permissions) => {
    const { client } = createClient({
      organization_authorization_states: { data: state, error: null },
      organization_branches: { data: branch, error: null },
      organization_members: {
        data: {
          branch_id: "branch-1",
          created_at: "2026-08-09T00:00:00Z",
          custom_role_id: "role-1",
          organization_id: "org-1",
          organizations: organization,
          person_id: null,
          role: "custom",
        },
        error: null,
      },
      organization_role_permissions: { data: permissions, error: null },
      organization_roles: { data: roleRecord, error: null },
    });

    await expect(
      getWorkspaceMembershipForUser("user-1", client as never, {
        organizationSlug: null,
      }),
    ).resolves.toBeNull();
  });
});
