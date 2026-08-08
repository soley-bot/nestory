import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMaintenanceReminderNotifications,
  getMaintenanceScreenData,
  requireOperationsExecutionContext,
} = vi.hoisted(() => ({
  getMaintenanceReminderNotifications: vi.fn(),
  getMaintenanceScreenData: vi.fn(),
  requireOperationsExecutionContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireOperationsExecutionContext,
}));

vi.mock("@/features/maintenance/data/maintenance", () => ({
  getMaintenanceReminderNotifications,
  getMaintenanceScreenData,
}));

vi.mock("@/features/maintenance/components/maintenance-screen", () => ({
  MaintenanceScreen: () => <div>Maintenance queue</div>,
}));

import TasksPage from "@/app/(dashboard)/tasks/page";

describe("TasksPage", () => {
  beforeEach(() => {
    getMaintenanceReminderNotifications.mockReset();
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

    const page = await TasksPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Staff profile link required");
    expect(html).toContain("Ask an administrator to link your login");
    expect(getMaintenanceScreenData).not.toHaveBeenCalled();
    expect(getMaintenanceReminderNotifications).not.toHaveBeenCalled();
  });

  it("loads the assigned queue for a member with a linked staff profile", async () => {
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      personId: "person-1",
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
    getMaintenanceReminderNotifications.mockResolvedValue([]);

    const page = await TasksPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Maintenance queue");
    expect(getMaintenanceScreenData).toHaveBeenCalledWith(
      "organization-1",
      expect.any(Object),
      expect.objectContaining({ personId: "person-1", role: "operations_member" }),
    );
  });
});
