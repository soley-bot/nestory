import { describe, expect, it } from "vitest";
import {
  getLeaseEndDateScope,
  parseLeaseSearchParams,
} from "@/features/leases/lease.filters";

describe("parseLeaseSearchParams", () => {
  it("normalizes URL state for server-backed lease views", () => {
    expect(
      parseLeaseSearchParams({
        archiveState: "all",
        endMonth: "2026-08",
        endsWithin: "60d",
        leaseId: "33333333-3333-4333-8333-333333333333",
        page: "2",
        pageSize: "100",
        propertyId: "11111111-1111-4111-8111-111111111111",
        query: "  unit   a1  ",
        sort: "end_asc",
        status: "current",
        unitId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      archiveState: "all",
      endMonth: "2026-08",
      endsWithinDays: 60,
      leaseId: "33333333-3333-4333-8333-333333333333",
      page: 2,
      pageSize: 100,
      propertyId: "11111111-1111-4111-8111-111111111111",
      query: "unit   a1",
      sort: "end_asc",
      status: "current",
      unitId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("falls back when lease scoped params are invalid", () => {
    expect(
      parseLeaseSearchParams({
        archiveState: "deleted",
        endMonth: "2026-13",
        endsWithin: "sixty-days",
        leaseId: "not-a-uuid",
        page: "0",
        pageSize: "500",
        propertyId: "not-a-uuid",
        sort: "created_desc",
        status: "expired",
        unitId: "not-a-uuid",
      }),
    ).toEqual({
      archiveState: "active",
      endMonth: "",
      endsWithinDays: null,
      leaseId: null,
      page: 1,
      pageSize: 50,
      propertyId: "all",
      query: "",
      sort: "start_desc",
      status: "all",
      unitId: "all",
    });
  });
});

describe("getLeaseEndDateScope", () => {
  it("builds an inclusive endsWithin date window from the business date", () => {
    expect(
      getLeaseEndDateScope(
        {
          endMonth: "",
          endsWithinDays: 60,
        },
        new Date("2026-06-26T12:00:00.000Z"),
      ),
    ).toEqual({
      before: "2026-08-26",
      from: "2026-06-26",
    });
  });

  it("builds a month scope and intersects with endsWithin when both exist", () => {
    expect(
      getLeaseEndDateScope(
        {
          endMonth: "2026-08",
          endsWithinDays: 60,
        },
        new Date("2026-06-26T12:00:00.000Z"),
      ),
    ).toEqual({
      before: "2026-08-26",
      from: "2026-08-01",
    });
  });
});
