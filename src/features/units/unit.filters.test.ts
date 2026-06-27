import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNIT_ARCHIVE_STATE,
  DEFAULT_UNIT_PAGE_SIZE,
  DEFAULT_UNIT_SORT,
  parseUnitSearchParams,
} from "@/features/units/unit.filters";
import {
  unitMatchesLeaseStatusFilter,
  unitMatchesOccupancyFilter,
} from "@/features/units/data/units";

describe("parseUnitSearchParams", () => {
  it("normalizes default unit filters", () => {
    expect(parseUnitSearchParams({})).toEqual({
      archiveState: DEFAULT_UNIT_ARCHIVE_STATE,
      leaseStatus: "all",
      occupancy: "all",
      page: 1,
      pageSize: DEFAULT_UNIT_PAGE_SIZE,
      propertyId: "all",
      query: "",
      sort: DEFAULT_UNIT_SORT,
      status: "all",
    });
  });

  it("keeps the missing active lease filter when present", () => {
    expect(
      parseUnitSearchParams({
        leaseStatus: "missing",
        occupancy: "unoccupied",
        page: "4",
        query: "  12A  ",
        status: "vacant",
      }),
    ).toMatchObject({
      leaseStatus: "missing",
      occupancy: "unoccupied",
      page: 4,
      query: "12A",
      status: "vacant",
    });
  });

  it("falls back for unknown lease-link filters", () => {
    expect(
      parseUnitSearchParams({
        leaseStatus: "active",
        occupancy: "leased",
        pageSize: "999",
        sort: "random",
      }),
    ).toMatchObject({
      leaseStatus: "all",
      occupancy: "all",
      pageSize: DEFAULT_UNIT_PAGE_SIZE,
      sort: DEFAULT_UNIT_SORT,
    });
  });
});

describe("unitMatchesOccupancyFilter", () => {
  it("matches units that are not occupied or actively leased", () => {
    expect(
      unitMatchesOccupancyFilter(
        { hasActiveLease: false, statusValue: "vacant" },
        "unoccupied",
      ),
    ).toBe(true);
    expect(
      unitMatchesOccupancyFilter(
        { hasActiveLease: false, statusValue: "maintenance" },
        "unoccupied",
      ),
    ).toBe(true);
    expect(
      unitMatchesOccupancyFilter(
        { hasActiveLease: false, statusValue: "occupied" },
        "unoccupied",
      ),
    ).toBe(false);
    expect(
      unitMatchesOccupancyFilter(
        { hasActiveLease: true, statusValue: "vacant" },
        "unoccupied",
      ),
    ).toBe(false);
    expect(
      unitMatchesOccupancyFilter(
        { hasActiveLease: false, statusValue: "inactive" },
        "unoccupied",
      ),
    ).toBe(false);
  });
});

describe("unitMatchesLeaseStatusFilter", () => {
  it("matches only units without an active lease", () => {
    expect(
      unitMatchesLeaseStatusFilter({ hasActiveLease: false }, "missing"),
    ).toBe(true);
    expect(
      unitMatchesLeaseStatusFilter({ hasActiveLease: true }, "missing"),
    ).toBe(false);
  });
});
