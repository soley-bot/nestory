import type { MaintenanceViewQuery } from "@/features/maintenance/maintenance.types";

export function getMaintenanceReportHref(
  viewQuery: Pick<MaintenanceViewQuery, "month" | "propertyId">,
) {
  const params = new URLSearchParams({
    month: viewQuery.month,
    report: "maintenance-cost",
  });

  if (viewQuery.propertyId !== "all") {
    params.set("propertyId", viewQuery.propertyId);
  }

  return `/reports?${params.toString()}`;
}
