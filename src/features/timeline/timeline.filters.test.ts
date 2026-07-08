import { describe, expect, it } from "vitest";
import {
  buildTimelinePagination,
  parseTimelineSearchParams,
} from "@/features/timeline/timeline.filters";

describe("parseTimelineSearchParams", () => {
  it("normalizes missing and invalid URL state", () => {
    expect(
      parseTimelineSearchParams({
        archiveState: "deleted",
        dateFrom: "2026-7-01",
        dateTo: "not-a-date",
        page: "-3",
        pageSize: "999",
        sort: "cost_desc",
        unitId: "not-a-uuid",
      }),
    ).toEqual({
      archiveState: "active",
      dateFrom: null,
      dateTo: null,
      eventId: null,
      eventType: "all",
      page: 1,
      pageSize: 100,
      propertyId: "all",
      query: "",
      sort: "date_desc",
      unitId: "all",
    });
  });

  it("keeps valid filter, date, sort, and pagination state", () => {
    const propertyId = "11111111-1111-4111-8111-111111111111";
    const unitId = "22222222-2222-4222-8222-222222222222";
    const eventId = "33333333-3333-4333-8333-333333333333";

    expect(
      parseTimelineSearchParams({
        archiveState: "all",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        eventId,
        eventType: "Repair",
        page: "3",
        pageSize: "50",
        propertyId,
        query: " northline ",
        sort: "property_asc",
        unitId,
      }),
    ).toEqual({
      archiveState: "all",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      eventId,
      eventType: "Repair",
      page: 3,
      pageSize: 50,
      propertyId,
      query: "northline",
      sort: "property_asc",
      unitId,
    });
  });
});

describe("buildTimelinePagination", () => {
  it("clamps empty and over-large pages", () => {
    expect(
      buildTimelinePagination({ page: 4, pageSize: 25, totalCount: 0 }),
    ).toEqual({
      from: 0,
      page: 1,
      pageSize: 25,
      to: 0,
      totalCount: 0,
      totalPages: 1,
    });

    expect(
      buildTimelinePagination({ page: 3, pageSize: 25, totalCount: 2 }),
    ).toMatchObject({
      from: 1,
      page: 1,
      to: 2,
      totalCount: 2,
      totalPages: 1,
    });
  });
});
