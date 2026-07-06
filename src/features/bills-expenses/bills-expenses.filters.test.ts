import { describe, expect, it } from "vitest";
import {
  buildBillsExpensesPagination,
  getBillsExpensesMonthScope,
  parseBillsExpensesSearchParams,
} from "@/features/bills-expenses/bills-expenses.filters";

describe("parseBillsExpensesSearchParams", () => {
  it("normalizes supported route filters", () => {
    expect(
      parseBillsExpensesSearchParams(
        {
          month: "2026-07",
          page: "3",
          pageSize: "25",
          propertyId: "9f4b27bd-5bb5-4d80-a10b-26b5d7b2bd21",
          query: "  roof  ",
          status: "approved",
          unitId: "all",
        },
        new Date("2026-01-15T00:00:00.000Z"),
      ),
    ).toEqual({
      month: "2026-07",
      page: 3,
      pageSize: 25,
      propertyId: "9f4b27bd-5bb5-4d80-a10b-26b5d7b2bd21",
      query: "roof",
      status: "approved",
      unitId: "all",
    });
  });

  it("falls back to the business month and safe defaults", () => {
    expect(
      parseBillsExpensesSearchParams(
        {
          month: "bad",
          page: "0",
          pageSize: "5",
          status: "missing",
        },
        new Date("2026-07-06T00:00:00.000Z"),
      ),
    ).toMatchObject({
      month: "2026-07",
      page: 1,
      pageSize: 50,
      propertyId: "all",
      status: "all",
      unitId: "all",
    });
  });
});

describe("bills and expenses pagination and month scope", () => {
  it("builds an empty pagination state", () => {
    expect(
      buildBillsExpensesPagination({ page: 2, pageSize: 50, totalCount: 0 }),
    ).toEqual({
      from: 0,
      page: 1,
      pageSize: 50,
      to: 0,
      totalCount: 0,
      totalPages: 1,
    });
  });

  it("builds the next-month exclusive boundary", () => {
    expect(getBillsExpensesMonthScope("2026-12")).toEqual({
      before: "2027-01-01",
      from: "2026-12-01",
    });
  });
});
