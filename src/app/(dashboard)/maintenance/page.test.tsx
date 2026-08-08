import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMaintenanceScreenData, requireOperationsExecutionContext } = vi.hoisted(() => ({
  getMaintenanceScreenData: vi.fn(),
  requireOperationsExecutionContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireOperationsExecutionContext,
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
    requireOperationsExecutionContext.mockReset();
  });

  it("shows a setup-required state for a member without a linked staff profile", async () => {
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      role: "operations_member",
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

    expect(html).toContain("Staff profile link required");
    expect(html).toContain("Ask an administrator to link your login");
    expect(getMaintenanceScreenData).not.toHaveBeenCalled();
  });
});
