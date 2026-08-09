import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMaintenanceReminderNotifications: vi.fn(),
  getMaintenanceScreenData: vi.fn(),
  requireOperationsManagementContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireOperationsManagementContext: mocks.requireOperationsManagementContext,
}));
vi.mock("@/features/maintenance/data/maintenance", () => ({
  getMaintenanceReminderNotifications: mocks.getMaintenanceReminderNotifications,
  getMaintenanceScreenData: mocks.getMaintenanceScreenData,
}));
vi.mock("@/features/maintenance/components/maintenance-screen", () => ({
  MaintenanceScreen: () => <div>Manager maintenance route</div>,
}));

import { renderMaintenanceRoute } from "@/features/maintenance/maintenance-route";

describe("manager maintenance routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOperationsManagementContext.mockResolvedValue({
      branchId: "branch-1",
      organizationId: "organization-1",
      personId: "person-1",
      role: "operations_manager",
    });
    mocks.getMaintenanceScreenData.mockResolvedValue({
      branchOptions: [],
      cases: [],
      pagination: {},
      propertyOptions: [],
      staffOptions: [],
      summary: {},
      unitOptions: [],
      vendorOptions: [],
    });
    mocks.getMaintenanceReminderNotifications.mockResolvedValue([]);
  });

  it("requires canManageOperations for recurring, inspections, and work-order surfaces", async () => {
    const html = renderToStaticMarkup(await renderMaintenanceRoute({
      emptyLabel: "No work",
      flowLabel: "Manager queue",
      listLabel: "work",
      recordLabel: "case",
      searchParams: Promise.resolve({}),
      title: "Manager work",
    }));

    expect(html).toContain("Manager maintenance route");
    expect(mocks.requireOperationsManagementContext).toHaveBeenCalledOnce();
  });
});
