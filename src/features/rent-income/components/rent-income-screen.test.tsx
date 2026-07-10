/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RentIncomeScreen } from "./rent-income-screen";
import type { RentIncomeItem } from "../rent-income.types";

afterEach(cleanup);

describe("RentIncomeScreen", () => {
  it("defaults the next receipt to the remaining balance", () => {
    render(
      <RentIncomeScreen
        incomeItems={[partialIncome]}
        leaseOptions={[]}
        pagination={{ from: 1, page: 1, pageSize: 25, to: 1, totalCount: 1, totalPages: 1 }}
        propertyOptions={[{ id: "property-1", label: "HOME / Home" }]}
        summary={{
          openCount: "1",
          overdueCount: "0",
          receivableTotal: { primary: "USD 400.00" },
          receivedTotal: { primary: "USD 100.00" },
          unpostedCount: "1",
        }}
        unitOptions={[]}
        viewQuery={{
          month: "2026-07",
          page: 1,
          pageSize: 25,
          propertyId: "all",
          query: "",
          status: "all",
          unitId: "all",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    expect(
      (document.querySelector('input[name="amountReceived"]') as HTMLInputElement)
        .value,
    ).toBe("400");
  });
});

const partialIncome: RentIncomeItem = {
  amountDue: 500,
  amountDueDisplay: { primary: "USD 500.00" },
  amountReceived: 100,
  amountReceivedDisplay: { primary: "USD 100.00" },
  balanceDisplay: { primary: "USD 400.00" },
  currency: "USD",
  description: "",
  dueDate: "2026-07-01",
  hrefs: { property: "/properties/property-1" },
  id: "income-1",
  incomeType: "rent",
  incomeTypeLabel: "Rent",
  isOverdue: false,
  leaseId: null,
  ledgerEntryId: null,
  nextAction: "Record payment",
  payerLabel: "Tenant",
  propertyCode: "HOME",
  propertyId: "property-1",
  propertyName: "Home",
  receivedDate: "2026-07-01",
  reference: "RENT-500",
  status: "partially_received",
  statusLabel: "Partial",
  unitId: null,
  unitNumber: "No unit",
};
