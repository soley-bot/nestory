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
    requirePermission.mockResolvedValue({
      branchId: "branch-1", isSuperAdmin: false, organizationId: "organization-1",
      permissionKeys: new Set(["maintenance.view"]), personId: "person-1", role: "custom",
    });
    getMaintenanceScreenData.mockResolvedValue({
      branchOptions: [], cases: [], pagination: {}, propertyOptions: [], staffOptions: [],
      summary: {}, unitOptions: [], vendorOptions: [],
    });
  });

  it.each(["list", "board", "calendar", "templates"])("preserves explicit All and Open on the %s view", async (view) => {
    for (const review of ["all", "open"]) {
      await MaintenancePage({ searchParams: Promise.resolve({ view, review }) });
      expect(getMaintenanceScreenData).toHaveBeenLastCalledWith(
        "organization-1", expect.objectContaining({ view, review }), expect.any(Object),
        expect.any(Object), { includeQueueCounts: true },
      );
    }
  });

  it.each([
    ["list", "open", 10], ["board", "work_orders", 10],
    ["calendar", "scheduled", 100], ["templates", "recurring", 10],
  ])("preserves the implicit %s preset", async (view, review, pageSize) => {
    await MaintenancePage({ searchParams: Promise.resolve({ view }) });
    expect(getMaintenanceScreenData).toHaveBeenLastCalledWith(
      "organization-1", expect.objectContaining({ view, review, pageSize }), expect.any(Object),
      expect.any(Object), { includeQueueCounts: true },
    );
  });

  it("preserves a status-only Completed destination", async () => {
    await MaintenancePage({ searchParams: Promise.resolve({ status: "completed" }) });
    expect(getMaintenanceScreenData).toHaveBeenCalledWith(
      "organization-1", expect.objectContaining({ review: "all", status: "completed", view: "list" }),
      expect.any(Object), expect.any(Object), { includeQueueCounts: true },
    );
  });

  it.each(["unsupported", "", []])("keeps the view preset for an invalid review (%s)", async (review) => {
    await MaintenancePage({ searchParams: Promise.resolve({ view: "board", review }) });
    expect(getMaintenanceScreenData).toHaveBeenCalledWith(
      "organization-1", expect.objectContaining({ review: "work_orders" }), expect.any(Object),
      expect.any(Object), { includeQueueCounts: true },
    );
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
    expect(getMaintenanceScreenData).toHaveBeenCalledWith(
      "organization-1",
      expect.any(Object),
      expect.objectContaining({ dataScope: "branch", workflowMode: "coordinator" }),
      expect.objectContaining({ canAssignCase: false }),
      { includeQueueCounts: true },
    );
  });
});
