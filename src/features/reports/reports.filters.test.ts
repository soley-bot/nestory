import { describe, expect, it } from "vitest";
import {
  getReportMonthRange,
  parseReportSearchParams,
} from "@/features/reports/reports.filters";

describe("report search params", () => {
  it("defaults to the occupancy report and keeps invalid filters safe", () => {
    const query = parseReportSearchParams({
      propertyId: "not-a-real-id",
      report: "whatever",
      status: "archived",
    });

    expect(query.report).toBe("occupancy");
    expect(query.propertyId).toBe("all");
    expect(query.status).toBe("all");
    expect(query.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("normalizes profit and loss month input from date params", () => {
    expect(
      parseReportSearchParams({
        date: "2026-06-25",
        report: "profit-loss",
        status: "vacant",
      }),
    ).toEqual({
      month: "2026-06",
      propertyId: "all",
      report: "profit-loss",
      status: "vacant",
    });
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
