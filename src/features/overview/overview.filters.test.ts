import { describe, expect, it } from "vitest";
import {
  getOverviewMonthScope,
  parseOverviewSearchParams,
} from "@/features/overview/overview.filters";

describe("parseOverviewSearchParams", () => {
  it("defaults to the current month and Portfolio", () => {
    expect(
      parseOverviewSearchParams(
        {},
        new Date("2026-07-10T00:00:00+07:00"),
      ),
    ).toEqual({
      financeView: "collections",
      lens: "all",
      month: "2026-07",
      propertyId: "all",
      review: "all",
    });
  });

  it.each([
    ["company-pnl", "finance", "collections"],
    ["owner-receivables", "finance", "management-fees"],
    ["ledger", "finance", "transactions"],
    ["property-ranking", "all", "collections"],
  ] as const)("maps legacy %s links", (financeView, lens, expectedView) => {
    expect(
      parseOverviewSearchParams(
        { financeView, lens: "finance" },
        new Date("2026-07-10"),
      ),
    ).toMatchObject({
      financeView: expectedView,
      lens,
    });
  });

  it.each(["constructor", "__proto__"])(
    "rejects inherited object key %s as a finance view",
    (financeView) => {
      expect(
        parseOverviewSearchParams({ financeView }, new Date("2026-07-10")),
      ).toMatchObject({ financeView: "collections" });
    },
  );

  it("normalizes invalid values and builds an exclusive month range", () => {
    expect(
      parseOverviewSearchParams(
        { month: "2026-13", propertyId: "bad" },
        new Date("2026-07-10"),
      ),
    ).toMatchObject({ month: "2026-07", propertyId: "all" });
    expect(getOverviewMonthScope("2026-12")).toEqual({
      before: "2027-01-01",
      from: "2026-12-01",
    });
  });
});
