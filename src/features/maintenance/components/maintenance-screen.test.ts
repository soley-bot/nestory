import { describe, expect, it } from "vitest";
import { getMaintenanceReportHref } from "@/features/maintenance/components/maintenance-screen";

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
});
