import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMaintenanceScreenData, requireWorkspaceContext } = vi.hoisted(() => ({
  getMaintenanceScreenData: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireWorkspaceContext,
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
    requireWorkspaceContext.mockReset();
  });

  it("shows a setup-required state for a member without a linked staff profile", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      role: "member",
      userId: "user-1",
    });
    getMaintenanceScreenData.mockResolvedValue({
      branchOptions: [],
      cases: [],
      pagination: {},
      peopleOptions: [],
      propertyOptions: [],
      staffOptions: [],
      summary: {},
      unitOptions: [],
    });

    const page = await MaintenancePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Staff profile link required");
    expect(html).toContain("Ask an administrator to link your login");
    expect(getMaintenanceScreenData).not.toHaveBeenCalled();
  });
});
