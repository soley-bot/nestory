import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMaintenanceScreenData, requireOperationsManagementContext, requirePermission } = vi.hoisted(() => ({
  getMaintenanceScreenData: vi.fn(),
  requireOperationsManagementContext: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireOperationsManagementContext,
  requirePermission,
}));

vi.mock("@/features/maintenance/data/maintenance", () => ({
  getMaintenanceScreenData,
}));

vi.mock("@/features/maintenance/components/maintenance-screen", () => ({
  MaintenanceScreen: () => <div>Maintenance cases</div>,
}));

import MaintenancePage from "@/app/(dashboard)/maintenance/page";

describe("MaintenancePage", () => {
  beforeEach(() => {
    getMaintenanceScreenData.mockReset();
    requireOperationsManagementContext.mockReset();
    requirePermission.mockReset();
  });

  it("allows branch-scoped maintenance readers onto the cases surface", async () => {
    requirePermission.mockResolvedValue({
      branchId: "branch-1",
      isSuperAdmin: false,
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      permissionKeys: new Set([
        "maintenance.view",
      ]),
      personId: "person-1",
      role: "custom",
      userId: "user-1",
    });
    getMaintenanceScreenData.mockResolvedValue({
      branchOptions: [],
      cases: [],
      pagination: {},
      propertyOptions: [],
      staffOptions: [],
      summary: {},
      unitOptions: [],
      vendorOptions: [],
    });

    const page = await MaintenancePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Maintenance cases");
    expect(requirePermission).toHaveBeenCalledWith("maintenance.view");
    expect(requireOperationsManagementContext).not.toHaveBeenCalled();
    expect(getMaintenanceScreenData).toHaveBeenCalledOnce();
  });
});
