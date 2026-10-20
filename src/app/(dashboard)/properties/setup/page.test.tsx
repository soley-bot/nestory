import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivePropertyBranchOptions: vi.fn(),
  getLeaseBillingFormConfig: vi.fn(),
  getPropertySetupData: vi.fn(),
  requirePermission: vi.fn(),
  requireSuperAdminContext: vi.fn(),
}));

vi.mock("@/features/properties/data/property-branches", () => ({
  getActivePropertyBranchOptions: mocks.getActivePropertyBranchOptions,
}));
vi.mock("@/features/leases/data/leases", () => ({
  getLeaseBillingFormConfig: mocks.getLeaseBillingFormConfig,
}));
vi.mock("@/features/property-setup/data/property-setup", () => ({
  getPropertySetupData: mocks.getPropertySetupData,
}));
vi.mock("@/lib/auth/context", () => ({
  requirePermission: mocks.requirePermission,
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));

import PropertySetupPage from "./page";

describe("PropertySetupPage authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLeaseBillingFormConfig.mockResolvedValue({
      companyOptions: [],
      operationalTimezone: "UTC",
      organizationName: "Nestory",
    });
    mocks.getPropertySetupData.mockResolvedValue({
      leases: [],
      owners: [],
      properties: [],
      readiness: null,
      selection: {
        leaseId: null,
        ownerId: null,
        propertyId: null,
        tenantId: null,
        unitId: null,
      },
      tenants: [],
      units: [],
    });
  });

  it("requires both Property visibility and Lease activation", async () => {
    mocks.requirePermission.mockResolvedValue({
      branchId: "branch-1",
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view", "leases.activate"]),
    });

    await PropertySetupPage({ searchParams: Promise.resolve({}) });

    expect(mocks.requirePermission.mock.calls).toEqual([
      ["properties.view"],
      ["leases.activate"],
    ]);
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });

  it.each([
    { isSuperAdmin: false, keys: [], expected: [false, false, false] },
    { isSuperAdmin: false, keys: ["people.write"], expected: [true, false, false] },
    { isSuperAdmin: false, keys: ["properties.write", "leases.prepare"], expected: [false, true, true] },
    { isSuperAdmin: true, keys: ["people.write", "properties.write", "leases.prepare"], expected: [true, true, true] },
  ])("passes exact creation capabilities for $keys (admin=$isSuperAdmin)", async ({ isSuperAdmin, keys, expected }) => {
    mocks.requirePermission.mockResolvedValue({ isSuperAdmin, organizationId: "organization-1", permissionKeys: new Set(["properties.view", "leases.activate", ...keys]) });
    const result = await PropertySetupPage({ searchParams: Promise.resolve({ step: "999", ownerId: "invalid" }) });
    expect([result.props.canCreatePeople, result.props.canCreateProperties, result.props.canPrepareLease]).toEqual(expected);
    expect(result.props.step).toBe(1);
    expect(mocks.getPropertySetupData.mock.calls[0][0].requestedSelection.ownerId).toBeNull();
  });

  it("keeps an ordinary operator on their implicit branch", async () => {
    mocks.requirePermission.mockResolvedValue({
      branchId: "branch-1",
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view", "leases.activate"]),
    });

    const screen = await PropertySetupPage({ searchParams: Promise.resolve({}) });

    expect(mocks.getActivePropertyBranchOptions).not.toHaveBeenCalled();
    expect(screen.props.creationBranchOptions).toBeUndefined();
  });
});
