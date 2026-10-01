import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { getLeaseBillingFormConfig } from "@/features/leases/data/leases";
import { getMaintenanceCreateFormOptions } from "@/features/maintenance/data/maintenance";
import { getPersonSelectOptions } from "@/features/people/data/person-options";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/features/leases/data/leases", () => ({ getLeaseBillingFormConfig: vi.fn() }));
vi.mock("@/features/maintenance/data/maintenance", () => ({ getMaintenanceCreateFormOptions: vi.fn() }));
vi.mock("@/features/people/data/person-options", () => ({ getPersonSelectOptions: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getWorkspaceMembershipForUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

const unitId = "10000000-0000-4000-8000-000000000001";
const permissions = ["properties.view", "leases.prepare", "maintenance.view", "maintenance.create_assign"];
const query = {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  abortSignal: vi.fn().mockReturnThis(), maybeSingle: vi.fn(),
};
const client = { from: vi.fn(() => query) };
const billingFormConfig = { companyOptions: [], operationalTimezone: "UTC", organizationName: "Synthetic" };

function setMembership(permissionKeys = permissions, overrides = {}) {
  vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue({
    branchId: "branch-a", isSuperAdmin: false, organizationId: "org-a",
    permissionKeys: new Set(permissionKeys), personId: "person-a", ...overrides,
  } as never);
}

function load(mode = "lease", id = unitId, extra = "", signal?: AbortSignal) {
  return GET(new Request(`http://localhost/api/units/${id}/form-options?mode=${mode}${extra}`, { signal }), {
    params: Promise.resolve({ unitId: id }),
  });
}

function expectNoOptionsRead() {
  expect(getPersonSelectOptions).not.toHaveBeenCalled();
  expect(getLeaseBillingFormConfig).not.toHaveBeenCalled();
  expect(getMaintenanceCreateFormOptions).not.toHaveBeenCalled();
}

describe("Unit form options authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-a" });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    setMembership();
    query.maybeSingle.mockResolvedValue({ data: { id: unitId, property_id: "property-a", archived_at: null }, error: null });
    vi.mocked(getPersonSelectOptions).mockResolvedValue([]);
    vi.mocked(getLeaseBillingFormConfig).mockResolvedValue(billingFormConfig);
    vi.mocked(getMaintenanceCreateFormOptions).mockResolvedValue({
      branchOptions: [], propertyOptions: [], staffOptions: [], unitOptions: [], vendorOptions: [],
    });
  });

  it("requires sign-in before any unit or directory read", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await load();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(client.from).not.toHaveBeenCalled();
    expectNoOptionsRead();
  });

  it.each([
    ["lease", ["properties.view"]],
    ["lease", ["leases.prepare"]],
    ["maintenance", ["properties.view", "maintenance.view"]],
    ["maintenance", ["properties.view", "maintenance.complete"]],
    ["maintenance", ["properties.view", "maintenance.create_assign"]],
  ])("requires the exact viewing and creation permissions for %s (%s)", async (mode, keys) => {
    setMembership(keys);
    expect((await load(mode)).status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
    expectNoOptionsRead();
  });

  it("denies an inactive or wrong-organization membership", async () => {
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(null);
    expect((await load()).status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
    expectNoOptionsRead();
  });

  it.each(["lease", "maintenance"])("checks the unit through RLS before %s options", async (mode) => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await load(mode)).status).toBe(404);
    expect(query.eq.mock.calls).toEqual([["organization_id", "org-a"], ["id", unitId]]);
    expectNoOptionsRead();
  });

  it("returns only lease options from the signed-in organization", async () => {
    const response = await load("lease", unitId, "&organizationId=evil&propertyId=evil&role=super_admin");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ mode: "lease", unitId, propertyId: "property-a", options: { tenants: [], billingFormConfig } });
    expect(getWorkspaceMembershipForUser).toHaveBeenCalledWith("user-a", client);
    expect(query.select).toHaveBeenCalledWith("id, property_id, archived_at");
    expect(query.eq.mock.calls).toEqual([["organization_id", "org-a"], ["id", unitId]]);
    expect(getPersonSelectOptions).toHaveBeenCalledExactlyOnceWith({ organizationId: "org-a", roles: ["tenant"] });
    expect(getLeaseBillingFormConfig).toHaveBeenCalledExactlyOnceWith("org-a");
    expect(getMaintenanceCreateFormOptions).not.toHaveBeenCalled();
  });

  it("derives the maintenance branch and capabilities from membership", async () => {
    const response = await load("maintenance", unitId, "&branchId=evil&dataScope=organization");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.options.actor).toEqual({ branchId: "branch-a", dataScope: "branch", personId: "person-a", workflowMode: "coordinator" });
    expect(getMaintenanceCreateFormOptions).toHaveBeenCalledWith("org-a", payload.options.actor, expect.objectContaining({ canAssignCase: true, canCreateCase: true }));
    expect(getPersonSelectOptions).not.toHaveBeenCalled();
    expect(getLeaseBillingFormConfig).not.toHaveBeenCalled();
  });

  it("keeps Super Admin organization options behind the same unit scope check", async () => {
    setMembership(permissions, { isSuperAdmin: true, branchId: undefined });
    const response = await load("maintenance");
    expect(response.status).toBe(200);
    expect((await response.json()).options.actor.dataScope).toBe("organization");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-a");
  });

  it.each([["lease", "bad-id"], ["edit", unitId], ["all", unitId]])("rejects invalid mode or record (%s, %s)", async (mode, id) => {
    expect((await load(mode, id)).status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
    expectNoOptionsRead();
  });

  it("does not read options for an archived unit", async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: unitId, property_id: "property-a", archived_at: "2026-01-01" }, error: null });
    expect((await load()).status).toBe(409);
    expectNoOptionsRead();
  });

  it("passes cancellation to the unit read and skips subsequent options", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await load("lease", unitId, "", controller.signal)).status).toBe(499);
    expect(query.abortSignal.mock.calls[0][0].aborted).toBe(true);
    expectNoOptionsRead();
  });

  it("fails safely if a unit query or directory is unavailable", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "private database details" } });
    const response = await load();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Could not load this form. Try again." });
    expectNoOptionsRead();
    query.maybeSingle.mockResolvedValue({ data: { id: unitId, property_id: "property-a", archived_at: null }, error: null });
    vi.mocked(getLeaseBillingFormConfig).mockRejectedValueOnce(new Error("private details"));
    expect((await load()).status).toBe(503);
  });
});
