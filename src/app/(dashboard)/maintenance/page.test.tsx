import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMaintenanceScreenData, requireOperationsManagementContext } = vi.hoisted(() => ({
  getMaintenanceScreenData: vi.fn(),
  requireOperationsManagementContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireOperationsManagementContext,
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
  });

  it("uses manager authority for the case-management surface", async () => {
    requireOperationsManagementContext.mockResolvedValue({
      branchId: "branch-1",
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      personId: "person-1",
      role: "operations_manager",
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
    expect(requireOperationsManagementContext).toHaveBeenCalledOnce();
    expect(getMaintenanceScreenData).toHaveBeenCalledOnce();
  });
});
