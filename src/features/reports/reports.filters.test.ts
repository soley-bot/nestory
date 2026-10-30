import { describe, expect, it, vi } from "vitest";

import {
  buildReportQueryParams,
  buildReportSwitchHref,
  getReportMonthRange,
  parseReportSearchParams,
} from "@/features/reports/reports.filters";

describe("report search params", () => {
  it("resets pages when switching reports while retaining compatible scope and date context", () => {
    const propertyId = "7d699b83-94ec-452b-9a18-bd0e9aac8610";
    const query = parseReportSearchParams({ report: "transactions", propertyId, dateFrom: "2026-09-02", dateTo: "2026-10-28", page: "8", detailPage: "4" });
    const switched = new URL(buildReportSwitchHref(query, "unit-profit-loss"), "https://nestory.invalid");
    expect(switched.pathname).toBe("/reports/unit-profit-loss");
    expect(parseReportSearchParams({ ...Object.fromEntries(switched.searchParams), report: "unit-profit-loss" })).toMatchObject({
      propertyId, month: "2026-09", page: 1, detailPage: 1,
    });
    const unchanged = new URL(buildReportSwitchHref({ ...query, report: "unit-profit-loss" }, "unit-profit-loss"), "https://nestory.invalid");
    expect(unchanged.searchParams.get("page")).toBe("8");
    expect(unchanged.searchParams.get("detailPage")).toBe("4");
  });
  it("round-trips screen pagination and search while omitting them from exports", () => {
    const query = parseReportSearchParams({ report: "unit-profit-loss", month: "2026-10", page: "200", detailPage: "400", scopeQuery: "  Riverside  ", showZeroActivity: "1" });
    expect(query).toMatchObject({ page: 200, detailPage: 400, scopeQuery: "Riverside", showZeroActivity: true });
    const params = buildReportQueryParams(query);
    expect(parseReportSearchParams(Object.fromEntries(params))).toEqual(query);
    expect(buildReportQueryParams(query, { includeScreenState: false }).toString()).toBe("report=unit-profit-loss&month=2026-10");
  });

  it.each(["0", "-1", "1.5", "Infinity", "9007199254740992", "2junk"])("rejects malformed page %s", page => {
    expect(parseReportSearchParams({ page, detailPage: page })).toMatchObject({ page: 1, detailPage: 1 });
  });

  it("defaults to the authorized company month at year-end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T17:00:00Z"));
    try {
      expect(parseReportSearchParams({}, "Asia/Phnom_Penh").month).toBe("2027-01");
      expect(parseReportSearchParams({}, "UTC").month).toBe("2026-12");
      expect(parseReportSearchParams({ month: "2025-12" }, "Asia/Phnom_Penh").month).toBe("2025-12");
    } finally { vi.useRealTimers(); }
  });
  it("defaults invalid report and scope values to Owner activity", () => {
    const query = parseReportSearchParams({
      propertyId: "not-a-real-id",
      report: "whatever",
      status: "archived",
    });

    expect(query).toMatchObject({
      ownerPersonId: "all",
      propertyId: "all",
      report: "monthly-owner-activity",
      status: "all",
      unitId: "all",
    });
    expect(query.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("keeps Unit P&L and its deep-linked unit scope", () => {
    const unitId = "8b3a08d2-0898-4de3-9495-994eaf7a08dc";

    expect(
      parseReportSearchParams({
        report: "unit-profit-loss",
        unitId,
      }),
    ).toMatchObject({
      report: "unit-profit-loss",
      unitId,
    });
    expect(parseReportSearchParams({ unitId: "not-a-real-id" }).unitId).toBe(
      "all",
    );
  });

  it("normalizes the retained owner filter when it is malformed", () => {
    const ownerPersonId = "c304facd-1caa-4f98-9d43-cf44f65ac32f";

    expect(parseReportSearchParams({ ownerPersonId }).ownerPersonId).toBe(
      ownerPersonId,
    );
    const invalid = parseReportSearchParams({
      ownerPersonId: "not-a-real-id",
    });
    expect(invalid.ownerPersonId).toBe("all");
    expect(invalid.ownerPersonIdInvalid).toBe(true);
  });

  it("builds an inclusive calendar-month range", () => {
    expect(getReportMonthRange("2026-02")).toEqual({
      end: "2026-02-28",
      start: "2026-02-01",
    });
    expect(getReportMonthRange("2024-02")).toEqual({
      end: "2024-02-29",
      start: "2024-02-01",
    });
  });
});
