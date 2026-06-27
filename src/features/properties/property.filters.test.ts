import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROPERTY_PAGE_SIZE,
  DEFAULT_PROPERTY_SORT,
  parsePropertySearchParams,
} from "@/features/properties/property.filters";
import {
  propertyMatchesNetStatusFilter,
  propertyMatchesOwnerStatusFilter,
} from "@/features/properties/data/properties";

describe("parsePropertySearchParams", () => {
  it("normalizes default property filters", () => {
    expect(parsePropertySearchParams({})).toEqual({
      archiveState: "active",
      netStatus: "all",
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
        netStatus: "negative",
        page: "2",
        query: "  central  ",
        sort: "net_asc",
        status: "active",
      }),
    ).toMatchObject({
      netStatus: "negative",
      ownerStatus: "missing",
      page: 2,
      query: "central",
      sort: "net_asc",
      status: "active",
    });
  });

  it("falls back for unknown owner-link filters", () => {
    expect(
      parsePropertySearchParams({
        ownerStatus: "assigned",
        netStatus: "positive",
        pageSize: "999",
        sort: "random",
      }),
    ).toMatchObject({
      netStatus: "all",
      ownerStatus: "all",
      pageSize: DEFAULT_PROPERTY_PAGE_SIZE,
      sort: DEFAULT_PROPERTY_SORT,
    });
  });
});

describe("propertyMatchesNetStatusFilter", () => {
  it("matches only properties below zero net income", () => {
    expect(
      propertyMatchesNetStatusFilter({ netIncomeUsd: -1 }, "negative"),
    ).toBe(true);
    expect(
      propertyMatchesNetStatusFilter({ netIncomeUsd: 0 }, "negative"),
    ).toBe(false);
    expect(
      propertyMatchesNetStatusFilter({ netIncomeUsd: 125 }, "all"),
    ).toBe(true);
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
