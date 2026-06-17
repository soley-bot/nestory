import { describe, expect, it } from "vitest";
import {
  filterTimelineEvents,
  paginateTimelineEvents,
  parseTimelineSearchParams,
  sortTimelineEvents,
} from "@/features/timeline/timeline.filters";
import type { TimelineEvent } from "@/features/timeline/timeline.types";

const events: TimelineEvent[] = [
  {
    createdBy: "Admin",
    description: "Bathroom work completed",
    documents: [],
    eventDate: "2026-06-12",
    eventType: "Renovation",
    hasAttachment: true,
    id: "event-1",
    isLocked: false,
    propertyCode: "CTR",
    propertyId: "property-1",
    propertyName: "Central Residence",
    title: "Renovation completed",
    unitNumber: "12B",
  },
  {
    archivedAt: "2026-06-16T09:00:00.000Z",
    createdBy: "Admin",
    description: "Lease renewal discussion",
    documents: [],
    eventDate: "2026-05-31",
    eventType: "Rent Increase",
    hasAttachment: false,
    id: "event-2",
    isLocked: false,
    propertyCode: "NTH",
    propertyId: "property-2",
    propertyName: "Northline Mixed Use",
    relatedLedgerEntry: "Income - Rent",
    title: "Rent review",
    unitNumber: "04C",
  },
];

describe("filterTimelineEvents", () => {
  it("filters by property and event type", () => {
    expect(
      filterTimelineEvents(events, {
        archiveState: "all",
        eventType: "Renovation",
        propertyId: "property-1",
        query: "",
      }),
    ).toEqual([events[0]]);
  });

  it("searches across property, unit, title, and description fields", () => {
    expect(
      filterTimelineEvents(events, {
        archiveState: "all",
        eventType: "all",
        propertyId: "all",
        query: "04c renewal",
      }),
    ).toEqual([events[1]]);
  });

  it("matches linked ledger labels", () => {
    expect(
      filterTimelineEvents(events, {
        archiveState: "all",
        eventType: "all",
        propertyId: "all",
        query: "income rent",
      }),
    ).toEqual([events[1]]);
  });

  it("hides archived rows by default and can filter to archive view", () => {
    expect(
      filterTimelineEvents(events, {
        eventType: "all",
        propertyId: "all",
        query: "",
      }),
    ).toEqual([events[0]]);

    expect(
      filterTimelineEvents(events, {
        archiveState: "archived",
        eventType: "all",
        propertyId: "all",
        query: "",
      }),
    ).toEqual([events[1]]);
  });
});

describe("parseTimelineSearchParams", () => {
  it("normalizes missing and invalid URL state", () => {
    expect(
      parseTimelineSearchParams({
        archiveState: "deleted",
        page: "-3",
        pageSize: "999",
        sort: "cost_desc",
      }),
    ).toEqual({
      archiveState: "active",
      eventType: "all",
      page: 1,
      pageSize: 100,
      propertyId: "all",
      query: "",
      sort: "date_desc",
      unitId: "all",
    });
  });

  it("keeps valid filter, sort, and pagination state", () => {
    const propertyId = "11111111-1111-4111-8111-111111111111";

    expect(
      parseTimelineSearchParams({
        archiveState: "all",
        eventType: "Repair",
        page: "3",
        pageSize: "50",
        propertyId,
        query: " northline ",
        sort: "property_asc",
      }),
    ).toEqual({
      archiveState: "all",
      eventType: "Repair",
      page: 3,
      pageSize: 50,
      propertyId,
      query: "northline",
      sort: "property_asc",
      unitId: "all",
    });
  });
});

describe("sortTimelineEvents", () => {
  it("sorts by ascending date", () => {
    expect(sortTimelineEvents(events, "date_asc").map((event) => event.id)).toEqual([
      "event-2",
      "event-1",
    ]);
  });
});

describe("paginateTimelineEvents", () => {
  it("clamps empty and over-large pages", () => {
    expect(paginateTimelineEvents([], { page: 4, pageSize: 25 }).pagination).toEqual({
      from: 0,
      page: 1,
      pageSize: 25,
      to: 0,
      totalCount: 0,
      totalPages: 1,
    });

    expect(
      paginateTimelineEvents(events, { page: 3, pageSize: 25 }).pagination,
    ).toMatchObject({
      from: 1,
      page: 1,
      to: 2,
      totalCount: 2,
      totalPages: 1,
    });
  });
});
