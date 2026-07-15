import { describe, expect, it } from "vitest";
import {
  getReportMonthRange,
  getReportScopeValidation,
  parseReportSearchParams,
} from "@/features/reports/reports.filters";

describe("report search params", () => {
  it("defaults to the rent roll and keeps invalid filters safe", () => {
    const query = parseReportSearchParams({
      propertyId: "not-a-real-id",
      report: "whatever",
      status: "archived",
    });

    expect(query.report).toBe("rent-roll");
    expect(query.propertyId).toBe("all");
    expect(query.status).toBe("all");
    expect(query.unitId).toBe("all");
    expect(query.ownerPersonId).toBe("all");
    expect(query.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("normalizes income and expense month input from date params", () => {
    expect(
      parseReportSearchParams({
        date: "2026-06-25",
        report: "income-expense",
        status: "vacant",
      }),
    ).toEqual({
      month: "2026-06",
      ownerPersonId: "all",
      propertyId: "all",
      report: "income-expense",
      status: "vacant",
      unitId: "all",
    });
  });

  it("keeps a safe unit filter for deep-linked unit reports", () => {
    expect(
      parseReportSearchParams({
        unitId: "8b3a08d2-0898-4de3-9495-994eaf7a08dc",
      }).unitId,
    ).toBe("8b3a08d2-0898-4de3-9495-994eaf7a08dc");
    expect(parseReportSearchParams({ unitId: "not-a-real-id" }).unitId).toBe(
      "all",
    );
  });

  it("keeps old report aliases pointing at trusted report contracts", () => {
    expect(parseReportSearchParams({ report: "occupancy" }).report).toBe(
      "vacancy-risk",
    );
    expect(parseReportSearchParams({ report: "profit-loss" }).report).toBe(
      "income-expense",
    );
  });

  it("keeps an explicit all-status report filter", () => {
    expect(parseReportSearchParams({ status: "all" }).status).toBe("all");
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
