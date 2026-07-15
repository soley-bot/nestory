import { describe, expect, it } from "vitest";
import {
  getMaintenanceListHref,
  getMaintenanceReportHref,
} from "@/features/maintenance/maintenance.hrefs";
import { getMaintenanceWorkspaceNavItems } from "@/features/maintenance/components/maintenance-screen";
import type { MaintenanceViewQuery } from "@/features/maintenance/maintenance.types";

describe("maintenance screen report links", () => {
  it("opens the maintenance cost report for the current month and property scope", () => {
    expect(
      getMaintenanceReportHref({ month: "2026-06", propertyId: "all" }),
    ).toBe("/reports?month=2026-06&report=maintenance-cost");
    expect(
      getMaintenanceReportHref({
        month: "2026-06",
        propertyId: "8b3a08d2-0898-4de3-9495-994eaf7a08dc",
      }),
    ).toBe(
      "/reports?month=2026-06&report=maintenance-cost&propertyId=8b3a08d2-0898-4de3-9495-994eaf7a08dc",
    );
  });

  it("keeps non-default case views in maintenance list links", () => {
    const viewQuery: MaintenanceViewQuery = {
      archiveState: "active",
      month: "2026-06",
      page: 1,
      pageSize: 25,
      priority: "all",
      propertyId: "all",
      query: "",
      review: "work_orders",
      scope: "focused",
      sort: "due_asc",
      status: "all",
      taskId: "all",
      unitId: "all",
      view: "board",
    };

    expect(getMaintenanceListHref(viewQuery)).toBe(
      "/maintenance?month=2026-06&review=work_orders&view=board",
    );
  });

  it.each([
    ["/maintenance", "Cases"],
    ["/tasks", "My work"],
    ["/recurring-tasks", "Recurring work"],
    ["/inspections", "Inspections"],
    ["/work-orders", "Work orders"],
  ])("maps %s to exactly one local maintenance destination", (pathname, label) => {
    const items = getMaintenanceWorkspaceNavItems(pathname);

    expect(items.filter((item) => item.active)).toHaveLength(1);
    expect(items.find((item) => item.active)?.label).toBe(label);
  });
});
