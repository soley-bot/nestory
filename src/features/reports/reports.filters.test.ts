import { describe, expect, it } from "vitest";

import {
  getReportMonthRange,
  parseReportSearchParams,
} from "@/features/reports/reports.filters";

describe("report search params", () => {
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
