import { describe, expect, it } from "vitest";

import { buildManagementFeeReport } from "@/features/reports/data/management-fee-report";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

describe("Management Fee Statement", () => {
  it("reports only collected management-company cash by property", () => {
    const report = buildManagementFeeReport({
      generatedAt: "2026-08-01T00:00:00.000Z",
      properties: [
        { code: "P1", id: "property-1", name: "Property One" },
        { code: "P2", id: "property-2", name: "Property Two" },
      ],
      receiptAllocations: [
        receipt({ amount: 100, incomeType: "management_fee" }),
        receipt({
          allocationId: "allocation-2",
          amount: 50,
          incomeItemId: "income-2",
          incomeType: "service_fee",
          receiptId: "receipt-2",
        }),
        receipt({
          allocationId: "allocation-3",
          amount: 999,
          incomeItemId: "income-3",
          incomeType: "rent",
          receiptId: "receipt-3",
        }),
        receipt({
          allocationId: "allocation-4",
          amount: 20,
          incomeItemId: "income-4",
          incomeType: "maintenance_markup",
          receiptId: "receipt-4",
          reversalOfId: "receipt-original",
        }),
      ],
      viewQuery: query(),
    });

    expect(report).toMatchObject({
      exportFilenameBase: "management-fees",
      kind: "management-fees",
      title: "Management Fee Statement",
    });
    expect(report.columns.map(({ label }) => label)).toEqual([
      "Property",
      "Fees collected",
    ]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      cells: {
        collected: "USD 130.00",
        property: "P1 - Property One",
      },
      href: "/rent-income?month=2026-07&propertyId=property-1&incomeScope=management-fees",
      sourceCount: 3,
    });
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Fees collected", "USD 130.00"],
      ["Properties", "1"],
    ]);
  });

  it("returns a clear empty statement when no fee cash was collected", () => {
    const report = buildManagementFeeReport({
      generatedAt: "2026-08-01T00:00:00.000Z",
      properties: [{ code: "P1", id: "property-1", name: "Property One" }],
      receiptAllocations: [
        receipt({ amount: 100, incomeType: "management_fee_earned" }),
      ],
      viewQuery: query(),
    });

    expect(report.rows).toEqual([]);
    expect(report.emptyTitle).toBe("No management fees collected");
    expect(report.summary[0]?.value).toBe("USD 0.00");
  });
});

function query(): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "management-fees",
    status: "all",
    unitId: "all",
  };
}

function receipt({
  allocationId = "allocation-1",
  amount,
  incomeItemId = "income-1",
  incomeType,
  propertyId = "property-1",
  receiptId = "receipt-1",
  reversalOfId = null,
}: {
  allocationId?: string;
  amount: number;
  incomeItemId?: string;
  incomeType: string;
  propertyId?: string;
  receiptId?: string;
  reversalOfId?: string | null;
}) {
  return {
    allocationId,
    amount,
    incomeItemId,
    incomeType,
    propertyId,
    receiptId,
    receivedDate: "2026-07-15",
    reversalOfId,
  };
}
