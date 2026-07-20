import { describe, expect, it } from "vitest";
import {
  buildRentIncomePagination,
  getRentIncomeMonthScope,
  parseRentIncomeSearchParams,
} from "@/features/rent-income/rent-income.filters";
import { incomeTypeOptions } from "@/features/rent-income/rent-income.types";

describe("parseRentIncomeSearchParams", () => {
  it("normalizes supported route filters", () => {
    expect(
      parseRentIncomeSearchParams(
        {
          incomeGroup: "management-company",
          incomeType: "late_fee",
          month: "2026-07",
          page: "2",
          pageSize: "100",
          propertyId: "9f4b27bd-5bb5-4d80-a10b-26b5d7b2bd21",
          query: "  deposit  ",
          status: "received",
          unitId: "all",
        },
        new Date("2026-01-15T00:00:00.000Z"),
      ),
    ).toEqual({
      incomeGroup: "management-company",
      incomeType: "late_fee",
      month: "2026-07",
      page: 2,
      pageSize: 100,
      propertyId: "9f4b27bd-5bb5-4d80-a10b-26b5d7b2bd21",
      query: "deposit",
      status: "received",
      unitId: "all",
    });
  });

  it("keeps legacy management-fee URLs working as the management-company group", () => {
    expect(
      parseRentIncomeSearchParams({ incomeScope: "management-fees" }),
    ).toMatchObject({
      incomeGroup: "management-company",
      incomeType: "all",
    });
  });

  it.each(incomeTypeOptions)("accepts the $label income type", ({ value }) => {
    expect(parseRentIncomeSearchParams({ incomeType: value }).incomeType).toBe(
      value,
    );
  });

  it("falls back to the business month and safe defaults", () => {
    expect(
      parseRentIncomeSearchParams(
        {
          month: "July",
          page: "-1",
          pageSize: "999",
          status: "bad",
        },
        new Date("2026-07-06T00:00:00.000Z"),
      ),
    ).toMatchObject({
      incomeGroup: "all",
      incomeType: "all",
      month: "2026-07",
      page: 1,
      pageSize: 50,
      propertyId: "all",
      status: "all",
      unitId: "all",
    });
  });
});

describe("rent income pagination and month scope", () => {
  it("builds a bounded pagination state", () => {
    expect(
      buildRentIncomePagination({ page: 10, pageSize: 25, totalCount: 62 }),
    ).toEqual({
      from: 51,
      page: 3,
      pageSize: 25,
      to: 62,
      totalCount: 62,
      totalPages: 3,
    });
  });

  it("builds the next-month exclusive boundary", () => {
    expect(getRentIncomeMonthScope("2026-12")).toEqual({
      before: "2027-01-01",
      from: "2026-12-01",
    });
  });
});
