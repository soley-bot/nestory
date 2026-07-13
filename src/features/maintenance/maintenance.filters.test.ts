import { describe, expect, it } from "vitest";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";

const propertyId = "11111111-1111-4111-8111-111111111111";
const taskId = "33333333-3333-4333-8333-333333333333";
const unitId = "22222222-2222-4222-8222-222222222222";

describe("parseMaintenanceSearchParams", () => {
  it("preserves the completion review queue and submitted status", () => {
    expect(
      parseMaintenanceSearchParams({
        review: "review_completion",
        status: "ready_for_review",
      }),
    ).toMatchObject({
      review: "review_completion",
      status: "ready_for_review",
    });
  });

  it("parses operational review filters and linked property/unit ids", () => {
    expect(
      parseMaintenanceSearchParams({
        archiveState: "all",
        month: "2026-06",
        page: "2",
        priority: "urgent",
        propertyId,
        query: " leaking sink ",
        review: "overdue",
        scope: "all",
        sort: "cost_desc",
      status: "in_progress",
      taskId,
      unitId,
      view: "board",
    }),
  ).toMatchObject({
      archiveState: "all",
      month: "2026-06",
      page: 2,
      priority: "urgent",
      propertyId,
      query: "leaking sink",
      review: "overdue",
      scope: "all",
      sort: "cost_desc",
      status: "in_progress",
      taskId,
      unitId,
      view: "board",
    });
  });

  it("falls back to active/open filters for unsupported values", () => {
    const parsed = parseMaintenanceSearchParams({
      archiveState: "deleted",
      page: "-4",
      pageSize: "999",
      priority: "critical",
      scope: "focused",
      taskId: "bad-task",
      propertyId: "not-a-uuid",
      review: "everything",
      sort: "random",
      status: "open",
      unitId: "also-nope",
      view: "grid",
    });

    expect(parsed).toMatchObject({
      archiveState: "active",
      page: 1,
      pageSize: 25,
      priority: "all",
      propertyId: "all",
      review: "open",
      scope: "focused",
      sort: "due_asc",
      status: "all",
      taskId: "all",
      unitId: "all",
      view: "inbox",
    });
  });

  it("opens to the actionable maintenance queue by default", () => {
    expect(parseMaintenanceSearchParams({})).toMatchObject({
      priority: "all",
      propertyId: "all",
      review: "open",
      scope: "focused",
      status: "all",
      taskId: "all",
      unitId: "all",
      view: "inbox",
    });
  });

  it("accepts dedicated operations route filters", () => {
    expect(parseMaintenanceSearchParams({ review: "scheduled" }).review).toBe(
      "scheduled",
    );
    expect(parseMaintenanceSearchParams({ review: "work_orders" }).review).toBe(
      "work_orders",
    );
    expect(parseMaintenanceSearchParams({ review: "inspections" }).review).toBe(
      "inspections",
    );
  });

  it("accepts the maintenance cases workspace views", () => {
    expect(parseMaintenanceSearchParams({ view: "list" }).view).toBe("list");
    expect(parseMaintenanceSearchParams({ view: "calendar" }).view).toBe(
      "calendar",
    );
    expect(parseMaintenanceSearchParams({ view: "templates" }).view).toBe(
      "templates",
    );
  });
});
