import { describe, expect, it, vi } from "vitest";

import {
  buildManagementFeeReport,
  getManagementFeeReport,
} from "@/features/reports/data/management-fee-report";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("Management Fee Statement", () => {
  it("fails closed instead of publishing legacy fee receipt allocations", () => {
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
      exportValidation: {
        code: "management_fee_owner_recognition_unresolved",
        status: 409,
      },
      kind: "management-fees",
      scopeValidation: {
        code: "management_fee_owner_recognition_unresolved",
      },
      title: "Management Fee Statement",
    });
    expect(report.rows).toEqual([]);
    expect(report.summary).toEqual([]);
    expect(report.scopeValidation?.message).toContain(
      "owner-recognition authority",
    );
  });

  it("does not query legacy fee sources when the report is unavailable", async () => {
    const report = await getManagementFeeReport({
      organizationId: "organization-1",
      viewQuery: query(),
    });

    expect(report.rows).toEqual([]);
    expect(report.scopeValidation?.code).toBe(
      "management_fee_owner_recognition_unresolved",
    );
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
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
