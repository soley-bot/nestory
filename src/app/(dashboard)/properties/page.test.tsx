import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getActivePropertyBranchOptions,
  getPropertiesScreenData,
  getPropertyOwnerOptions,
  getPropertyPortfolioSummary,
  requirePermission,
} = vi.hoisted(() => ({
  getActivePropertyBranchOptions: vi.fn(),
  getPropertiesScreenData: vi.fn(),
  getPropertyOwnerOptions: vi.fn(),
  getPropertyPortfolioSummary: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/properties/data/property-branches", () => ({
  getActivePropertyBranchOptions,
}));
vi.mock("@/features/properties/data/properties", () => ({
  getPropertiesScreenData,
  getPropertyOwnerOptions,
}));
vi.mock("@/features/properties/data/property-portfolio-summary", () => ({
  getPropertyPortfolioSummary,
}));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));

import PropertiesPage from "./page";

describe("PropertiesPage creation scope", () => {
  beforeEach(() => {
    getActivePropertyBranchOptions.mockReset();
    getPropertiesScreenData.mockReset();
    getPropertyOwnerOptions.mockReset();
    getPropertyPortfolioSummary.mockReset();
    requirePermission.mockReset();
    getActivePropertyBranchOptions.mockResolvedValue([
      { id: "branch-a", label: "Central" },
    ]);
    getPropertiesScreenData.mockResolvedValue({
      pagination: { totalCount: 0 },
      properties: [],
    });
    getPropertyOwnerOptions.mockResolvedValue([]);
    getPropertyPortfolioSummary.mockResolvedValue({});
  });

  it("loads active branch choices for Super Admin Property creation", async () => {
    requirePermission.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view", "properties.write"]),
    });

    const screen = await PropertiesPage({ searchParams: Promise.resolve({}) });

    expect(getActivePropertyBranchOptions).toHaveBeenCalledWith("organization-1");
    expect(screen.props.creationBranchOptions).toEqual([
      { id: "branch-a", label: "Central" },
    ]);
  });

  it("does not expose organization branch choices to an ordinary writer", async () => {
    requirePermission.mockResolvedValue({
      branchId: "branch-a",
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view", "properties.write"]),
    });

    const screen = await PropertiesPage({ searchParams: Promise.resolve({}) });

    expect(getActivePropertyBranchOptions).not.toHaveBeenCalled();
    expect(screen.props.creationBranchOptions).toBeUndefined();
  });

  it("exposes guided setup only with Lease activation authority", async () => {
    requirePermission.mockResolvedValue({
      branchId: "branch-a",
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys: new Set([
        "properties.view",
        "properties.write",
        "leases.activate",
      ]),
    });

    const allowed = await PropertiesPage({ searchParams: Promise.resolve({}) });
    expect(allowed.props.canSetUp).toBe(true);

    requirePermission.mockResolvedValue({
      branchId: "branch-a",
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view", "properties.write"]),
    });

    const denied = await PropertiesPage({ searchParams: Promise.resolve({}) });
    expect(denied.props.canSetUp).toBe(false);
  });
});
