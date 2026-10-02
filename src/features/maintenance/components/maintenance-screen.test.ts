import { describe, expect, it } from "vitest";
import { buildMaintenanceTabHref, getMaintenanceListHref } from "@/features/maintenance/maintenance.hrefs";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import {
  getMaintenanceWorkspaceNavItems,
  MAINTENANCE_ATTENTION_FILTER_OPTIONS,
  MAINTENANCE_PRIORITY_FILTER_OPTIONS,
  MAINTENANCE_STATUS_FILTER_OPTIONS,
} from "@/features/maintenance/maintenance-screen-model";
import type { MaintenanceViewQuery } from "@/features/maintenance/maintenance.types";

describe("maintenance screen report links", () => {
  it.each(["/tasks", "/recurring-tasks", "/inspections", "/work-orders"])(
    "preserves explicit Open on %s instead of restoring its route preset", (pathname) => {
      const href = buildMaintenanceTabHref(pathname, new URLSearchParams("review=all&page=4&status=completed"), "open");
      const params = new URL(href, "https://fixture.test").searchParams;
      expect(params.get("review")).toBe("open");
      expect(params.has("page")).toBe(false);
      expect(params.has("status")).toBe(false);
    },
  );

  it.each(["board", "calendar", "templates"])("preserves explicit Open in %s links", (view) => {
    const query = parseMaintenanceSearchParams({ view, review: "open" });
    for (const href of [getMaintenanceListHref(query), buildMaintenanceTabHref("/maintenance", new URLSearchParams({ view }), "open")]) {
      expect(new URL(href, "https://fixture.test").searchParams.get("review")).toBe("open");
    }
  });

  it("preserves an explicit Open and status intersection in list links", () => {
    const params = new URL(getMaintenanceListHref(parseMaintenanceSearchParams({ review: "open", status: "blocked" })), "https://fixture.test").searchParams;
    expect(params.get("review")).toBe("open");
    expect(parseMaintenanceSearchParams(Object.fromEntries(params))).toMatchObject({ review: "open", status: "blocked" });
  });

  it("keeps canonical aggregate vocabulary and filter option order", () => {
    expect(MAINTENANCE_PRIORITY_FILTER_OPTIONS.map((option) => option.label)).toEqual([
      "All priorities",
      "Urgent",
      "High",
      "Normal",
      "Low",
    ]);
    expect(MAINTENANCE_STATUS_FILTER_OPTIONS.map((option) => option.label)).toEqual([
      "All statuses",
      "Pending",
      "Scheduled",
      "In progress",
      "Blocked",
      "Ready for review",
      "Completed",
      "Cancelled",
    ]);
    expect(MAINTENANCE_ATTENTION_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      "open",
      "work_orders",
      "scheduled",
      "inspections",
      "reminders",
      "high_priority",
      "high_cost",
      "recurring",
      "review_completion",
      "all",
    ]);
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
