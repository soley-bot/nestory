import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMaintenanceCapabilities,
  getMaintenanceScreenData,
  getPersonSelectOptions,
  getPropertySummaries,
  getUnitDetail,
  requirePermission,
} = vi.hoisted(() => ({
  getMaintenanceCapabilities: vi.fn(),
  getMaintenanceScreenData: vi.fn(),
  getPersonSelectOptions: vi.fn(),
  getPropertySummaries: vi.fn(),
  getUnitDetail: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/features/maintenance/maintenance.capabilities", () => ({
  getMaintenanceCapabilities,
}));
vi.mock("@/features/maintenance/data/maintenance", () => ({
  getMaintenanceScreenData,
}));
vi.mock("@/features/people/data/person-options", () => ({
  getPersonSelectOptions,
}));
vi.mock("@/features/properties/data/properties", () => ({
  getPropertySummaries,
}));
vi.mock("@/features/units/data/units", () => ({ getUnitDetail }));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));

import UnitNotFound from "./not-found";
import UnitPage from "./page";

describe("UnitPage authority", () => {
  beforeEach(() => {
    getMaintenanceCapabilities.mockReset();
    getMaintenanceScreenData.mockReset();
    getPersonSelectOptions.mockReset();
    getPropertySummaries.mockReset();
    getUnitDetail.mockReset();
    requirePermission.mockReset();
    getMaintenanceCapabilities.mockReturnValue({ canRecordActualCost: false });
    getMaintenanceScreenData.mockResolvedValue({
      branchOptions: [],
      propertyOptions: [],
      staffOptions: [],
      unitOptions: [],
      vendorOptions: [],
    });
    getPersonSelectOptions.mockResolvedValue([]);
    getPropertySummaries.mockResolvedValue([]);
  });

  it("uses properties.view and keeps an ordinary Unit actor in its exact branch", async () => {
    const permissionKeys = new Set([
      "properties.view",
      "properties.write",
      "properties.archive",
    ]);
    requirePermission.mockResolvedValue({
      branchId: "branch-a",
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys,
      personId: "person-a",
    });
    getUnitDetail.mockResolvedValue({ id: "unit-a", propertyId: "property-a" });

    const screen = await UnitPage({
      params: Promise.resolve({ unitId: "unit-a" }),
      searchParams: Promise.resolve({}),
    });

    expect(requirePermission).toHaveBeenCalledWith("properties.view");
    expect(getUnitDetail).toHaveBeenCalledWith("organization-1", "unit-a");
    expect(screen.props.canArchive).toBe(true);
    expect(screen.props.canWrite).toBe(true);
    expect(screen.props.maintenanceFormOptions.actor).toEqual({
      branchId: "branch-a",
      dataScope: "branch",
      personId: "person-a",
      workflowMode: "coordinator",
    });
  });

  it("fails a guessed or cross-branch Unit through the RLS-protected loader", async () => {
    requirePermission.mockResolvedValue({
      branchId: "branch-a",
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view"]),
    });
    getUnitDetail.mockResolvedValue(null);

    const screen = await UnitPage({
      params: Promise.resolve({ unitId: "unit-outside-branch" }),
      searchParams: Promise.resolve({}),
    });

    expect(screen.type).toBe(UnitNotFound);
    expect(getMaintenanceScreenData).not.toHaveBeenCalled();
  });
});
