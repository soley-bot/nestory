import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivePropertyBranchOptions: vi.fn(),
  getPropertySetupData: vi.fn(),
  requirePermission: vi.fn(),
  requireSuperAdminContext: vi.fn(),
}));

vi.mock("@/features/properties/data/property-branches", () => ({
  getActivePropertyBranchOptions: mocks.getActivePropertyBranchOptions,
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
