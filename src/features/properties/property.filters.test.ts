import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROPERTY_PAGE_SIZE,
  DEFAULT_PROPERTY_SORT,
  parsePropertySearchParams,
} from "@/features/properties/property.filters";
import { propertyMatchesOwnerStatusFilter } from "@/features/properties/data/properties";

describe("parsePropertySearchParams", () => {
  it("normalizes default property filters", () => {
    expect(parsePropertySearchParams({})).toEqual({
      archiveState: "active",
      ownerStatus: "all",
      page: 1,
      pageSize: DEFAULT_PROPERTY_PAGE_SIZE,
      query: "",
      sort: DEFAULT_PROPERTY_SORT,
      status: "all",
    });
  });

  it("keeps the missing owner-link filter when present", () => {
    expect(
      parsePropertySearchParams({
        ownerStatus: "missing",
        page: "2",
        query: "  central  ",
        status: "active",
      }),
    ).toMatchObject({
      ownerStatus: "missing",
      page: 2,
      query: "central",
      status: "active",
    });
  });

  it("falls back for unknown owner-link filters", () => {
    expect(
      parsePropertySearchParams({
        ownerStatus: "assigned",
        pageSize: "999",
        sort: "random",
      }),
    ).toMatchObject({
      ownerStatus: "all",
      pageSize: DEFAULT_PROPERTY_PAGE_SIZE,
      sort: DEFAULT_PROPERTY_SORT,
    });
  });
});

describe("propertyMatchesOwnerStatusFilter", () => {
  it("matches only properties without an active owner link", () => {
    expect(
      propertyMatchesOwnerStatusFilter(
        { hasActiveOwnerLink: false },
        "missing",
      ),
    ).toBe(true);
    expect(
      propertyMatchesOwnerStatusFilter(
        { hasActiveOwnerLink: true },
        "missing",
      ),
    ).toBe(false);
  });
});
