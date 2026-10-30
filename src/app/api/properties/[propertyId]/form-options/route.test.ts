import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { getLeaseBillingFormConfig } from "@/features/leases/data/leases";
import { getPersonSelectOptions } from "@/features/people/data/person-options";
import { getPropertyOwnerOptions } from "@/features/properties/data/properties";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/features/leases/data/leases", () => ({ getLeaseBillingFormConfig: vi.fn() }));
vi.mock("@/features/people/data/person-options", () => ({ getPersonSelectOptions: vi.fn() }));
vi.mock("@/features/properties/data/properties", () => ({ getPropertyOwnerOptions: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getWorkspaceMembershipForUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

const propertyId = "10000000-0000-4000-8000-000000000001";
const property = { id: propertyId, archived_at: null, rental_structure: "single_space" };
const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
const client = { from: vi.fn(() => query) };
const billingFormConfig = { companyOptions: [], operationalTimezone: "UTC", organizationName: "Synthetic" };

function membership(keys = ["properties.view", "properties.write", "leases.prepare"]) {
  vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue({ organizationId: "org", permissionKeys: new Set(keys) } as never);
}
function load(mode = "edit", id = propertyId, signal?: AbortSignal) {
  return GET(new Request(`http://localhost/api/properties/${id}/form-options?mode=${mode}&organizationId=evil`, { signal }), { params: Promise.resolve({ propertyId: id }) });
}
function noOptions() {
  expect(getPropertyOwnerOptions).not.toHaveBeenCalled();
  expect(getPersonSelectOptions).not.toHaveBeenCalled();
  expect(getLeaseBillingFormConfig).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user" });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
  membership();
  query.maybeSingle.mockResolvedValue({ data: property, error: null });
  vi.mocked(getPropertyOwnerOptions).mockResolvedValue([]);
  vi.mocked(getPersonSelectOptions).mockResolvedValue([]);
  vi.mocked(getLeaseBillingFormConfig).mockResolvedValue(billingFormConfig);
});

describe("property form options authority", () => {
  it("requires sign-in before property or directory reads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await load()).status).toBe(401);
    expect(client.from).not.toHaveBeenCalled();
    noOptions();
  });
  it.each([["edit", ["properties.view"]], ["edit", ["properties.write"]], ["lease", ["properties.view"]], ["lease", ["leases.prepare"]]])("requires view and %s capability", async (mode, keys) => {
    membership(keys);
    expect((await load(mode)).status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
    noOptions();
  });
  it("rejects missing membership", async () => {
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(null);
    expect((await load()).status).toBe(403);
    noOptions();
  });
  it.each(["edit", "lease"])("requires the RLS-visible property before %s directories", async mode => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await load(mode)).status).toBe(404);
    expect(query.eq.mock.calls).toEqual([["organization_id", "org"], ["id", propertyId]]);
    noOptions();
  });
  it.each(["edit", "lease"])("returns only requested %s options from membership scope", async mode => {
    const response = await load(mode);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ mode, propertyId, options: mode === "edit" ? { owners: [] } : { tenants: [], billingFormConfig } });
    expect(query.eq.mock.calls).toEqual([["organization_id", "org"], ["id", propertyId]]);
    if (mode === "edit") {
      expect(getPropertyOwnerOptions).not.toHaveBeenCalled();
      expect(getPersonSelectOptions).not.toHaveBeenCalled();
      expect(getLeaseBillingFormConfig).not.toHaveBeenCalled();
    } else {
      expect(getPersonSelectOptions).not.toHaveBeenCalled();
      expect(getLeaseBillingFormConfig).toHaveBeenCalledExactlyOnceWith("org");
      expect(getPropertyOwnerOptions).not.toHaveBeenCalled();
    }
  });
  it.each([["edit", "bad-id"], ["unknown", propertyId]])("rejects invalid inputs", async (mode, id) => {
    expect((await load(mode, id)).status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
    noOptions();
  });
  it.each(["edit", "lease"])("rejects archived properties for %s", async mode => {
    query.maybeSingle.mockResolvedValue({ data: { ...property, archived_at: "2026-01-01" }, error: null });
    expect((await load(mode)).status).toBe(409);
    noOptions();
  });
  it("requires a whole-property rental before loading a whole-property lease form", async () => {
    query.maybeSingle.mockResolvedValue({ data: { ...property, rental_structure: "multi_unit" }, error: null });
    expect((await load("lease")).status).toBe(409);
    noOptions();
  });
  it("cancels before directory reads", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await load("edit", propertyId, controller.signal)).status).toBe(499);
    expect(query.abortSignal.mock.calls[0][0].aborted).toBe(true);
    noOptions();
  });
  it("hides query and directory failure details", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "private" } });
    const response = await load();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Could not load this form. Try again." });
    noOptions();
    query.maybeSingle.mockResolvedValue({ data: property, error: null });
    vi.mocked(getLeaseBillingFormConfig).mockRejectedValueOnce(new Error("private"));
    expect((await load("lease")).status).toBe(503);
  });
});
