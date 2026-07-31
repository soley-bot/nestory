import { describe, expect, it } from "vitest";

import {
  getReportMonthRange,
  getReportScopeValidation,
  parseReportSearchParams,
} from "@/features/reports/reports.filters";

describe("report search params", () => {
  it("defaults invalid report and scope values to Monthly Unit Profit & Loss", () => {
    const query = parseReportSearchParams({
      propertyId: "not-a-real-id",
      report: "whatever",
      status: "archived",
    });

    expect(query).toMatchObject({
      ownerPersonId: "all",
      propertyId: "all",
      report: "unit-profit-loss",
      status: "all",
      unitId: "all",
    });
    expect(query.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("normalizes the retired Unit Performance name to Unit Profit & Loss", () => {
    expect(
      parseReportSearchParams({
        date: "2026-06-25",
        report: "unit-performance",
      }),
    ).toMatchObject({
      month: "2026-06",
      report: "unit-profit-loss",
    });
  });

  it("keeps an explicit valid report and deep-linked unit scope", () => {
    const unitId = "8b3a08d2-0898-4de3-9495-994eaf7a08dc";

    expect(
      parseReportSearchParams({
        report: "management-fees",
        unitId,
      }),
    ).toMatchObject({
      report: "management-fees",
      unitId,
    });
    expect(parseReportSearchParams({ unitId: "not-a-real-id" }).unitId).toBe(
      "all",
    );
  });

  it("keeps an Owner Statement recipient only when it is a real person id", () => {
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

  it("rejects unit scope for Owner Statement with actionable copy", () => {
    expect(
      getReportScopeValidation({
        month: "2026-07",
        ownerPersonId: "all",
        peopleArchiveState: "active",
        peopleView: "relationship",
        propertyId: "all",
        report: "owner-statement",
        status: "all",
        unitId: "8b3a08d2-0898-4de3-9495-994eaf7a08dc",
      }),
    ).toEqual({
      code: "owner_statement_unit_scope",
      message:
        "Owner Statements are property-level reports. Clear the unit filter to continue.",
      status: 400,
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
