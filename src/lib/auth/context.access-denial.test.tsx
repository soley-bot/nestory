import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), redirect: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <Value,>(operation: Value) => operation };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: {
      sub: "user-1", session_id: "30000000-0000-4000-8000-000000000001",
    } }, error: null }) },
    from: mocks.from,
  }),
}));

import { requireFinanceContext, requirePermission, requireWorkspaceContext } from "@/lib/auth/context";
import NoAccessPage from "@/app/no-access/page";

describe("access denial destination", () => {
  beforeEach(() => {
    mocks.redirect.mockReset().mockImplementation((path: string) => { throw new Error(path); });
    const results: Record<string, unknown> = {
      organization_members: {
        organization_id: "org-1", role: "custom", branch_id: "branch-1", custom_role_id: "role-1",
        organizations: { name: "Example Workspace", slug: "example" },
      },
      organization_authorization_states: { ordinary_access_enabled: true },
      organization_branches: { id: "branch-1", status: "active", archived_at: null },
      organization_roles: { id: "role-1", name: "Property viewer", status: "active", archived_at: null },
      organization_role_permissions: [{ permission_key: "properties.view" }],
    };
    mocks.from.mockReset().mockImplementation((table: string) => {
      const result = { data: results[table], error: null };
      const query = {
        eq: vi.fn(), select: vi.fn(), order: vi.fn(), limit: vi.fn(),
        maybeSingle: async () => result,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      for (const method of ["eq", "select", "order", "limit"] as const) query[method].mockReturnValue(query);
      return query;
    });
  });

  it.each([
    ["capability", () => requireFinanceContext()],
    ["permission", () => requirePermission("finance.view")],
  ])("explains a denied %s without denying existing membership", async (_label, requireAccess) => {
    await expect(requireWorkspaceContext()).resolves.toMatchObject({ organizationId: "org-1" });
    await expect(requireAccess()).rejects.toThrow("/no-access?reason=capability");
    const destination = new URL(mocks.redirect.mock.calls[0][0], "https://example.test");
    const html = renderToStaticMarkup(await NoAccessPage({ searchParams: Promise.resolve(Object.fromEntries(destination.searchParams)) }));
    expect(html).toContain("Back to your workspace");
    expect(html).not.toContain("not linked to this workspace");
  });

  it("keeps the membership failure destination distinct", async () => {
    mocks.from.mockImplementation(() => {
      const query = { eq: vi.fn(), select: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: async () => ({ data: null, error: null }) };
      for (const method of ["eq", "select", "order", "limit"] as const) query[method].mockReturnValue(query);
      return query;
    });
    await expect(requireWorkspaceContext()).rejects.toThrow("/no-access");
    expect(mocks.redirect).toHaveBeenCalledWith("/no-access");
  });
});
