import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "./route";
const mocks = vi.hoisted(() => ({ user: vi.fn(), membership: vi.fn(), client: vi.fn(), table: vi.fn(), filters: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getCurrentUser: mocks.user, getWorkspaceMembershipForUser: mocks.membership }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: mocks.client }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "user-1" });
  mocks.membership.mockResolvedValue({ organizationId: "org-1", isSuperAdmin: false, permissionKeys: new Set(["properties.view"]) });
  const result = { data: [{ name: "Vacancies", query: "occupancy=unoccupied" }], error: null };
  const builder = { select: () => builder, eq: mocks.filters, order: () => builder, limit: async () => result, upsert: mocks.upsert, delete: mocks.remove, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  mocks.filters.mockReturnValue(builder); mocks.upsert.mockReturnValue(builder); mocks.remove.mockReturnValue(builder);
  mocks.table.mockReturnValue(builder); mocks.client.mockResolvedValue({ from: mocks.table });
});
const request = (method = "GET", body?: Record<string, unknown>, origin = "https://nestory.test") => new Request("https://nestory.test/api/workspace/saved-views?resource=%2Funits", { method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify({ scope: "org-1:user-1", ...body }) } : {}) });
describe("saved views API", () => {
  it("derives user and workspace identity from the session on reads", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.filters).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.filters).toHaveBeenCalledWith("organization_id", "org-1");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("persists only sanitized preferences for the signed-in workspace", async () => {
    const response = await POST(request("POST", { resource: "/units", name: "Vacancies", query: "occupancy=unoccupied&action=create&financialGeneration=5" }));
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({ organization_id: "org-1", user_id: "user-1", resource: "/units", name: "Vacancies", query: "occupancy=unoccupied" }, expect.anything());
  });
  it("denies anonymous users and missing route permission before reading preferences", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
    mocks.membership.mockResolvedValueOnce({ organizationId: "org-1", permissionKeys: new Set(), isSuperAdmin: false });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.table).not.toHaveBeenCalled();
  });
  it("rejects forged scope and cross-origin mutations", async () => {
    expect((await POST(request("POST", { resource: "/units", name: "x", query: "", userId: "other" }))).status).toBe(400);
    expect((await DELETE(request("DELETE", { resource: "/units", name: "x" }, "https://outside.test"))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("deletes only the named preference in the session scope", async () => {
    expect((await DELETE(request("DELETE", { resource: "/units", name: "Vacancies" }))).status).toBe(200);
    expect(mocks.filters).toHaveBeenCalledWith("name", "Vacancies");
    expect(mocks.filters).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.filters).toHaveBeenCalledWith("organization_id", "org-1");
  });
  it("refuses to write an old tab's views into a newly selected workspace", async () => {
    expect((await POST(request("POST", { resource: "/units", name: "x", query: "", scope: "old-org:user-1" }))).status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
