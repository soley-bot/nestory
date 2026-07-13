/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BillsExpensesScreen } from "./bills-expenses-screen";
import type { BillsExpenseItem } from "../bills-expenses.types";

afterEach(cleanup);

describe("BillsExpensesScreen", () => {
  it("submits and describes only the outstanding expense amount", () => {
    renderScreen(partialExpense);

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    expect(screen.getByText(/remaining property payment/i).textContent).toContain(
      "USD 150.00",
    );
    expect(
      (document.querySelector('input[name="amount"]') as HTMLInputElement).value,
    ).toBe("150");
  });

  it("does not offer another payment when the outstanding amount is zero", () => {
    renderScreen({
      ...partialExpense,
      amountPaid: 200,
      amountPaidDisplay: { primary: "USD 200.00" },
      outstandingAmount: 0,
      outstandingAmountDisplay: { primary: "USD 0.00" },
    });

    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });
});

const partialExpense = {
  amount: 200,
  amountDisplay: { primary: "USD 200.00" },
  amountPaid: 50,
  amountPaidDisplay: { primary: "USD 50.00" },
  category: "Repair",
  companyLossAmount: 0,
  companyLossDisplay: { primary: "USD 0.00" },
  currency: "USD",
  description: "",
  dueDate: "2026-07-31",
  economicScope: "property_expense",
  economicScopeLabel: "Property expense",
  expenseType: "maintenance",
  expenseTypeLabel: "Maintenance",
  hrefs: { property: "/properties/property-1" },
  id: "expense-1",
  invoiceDate: "2026-07-01",
  isOverdue: false,
  ledgerEntryId: null,
  nextAction: "Record payment",
  outstandingAmount: 150,
  outstandingAmountDisplay: { primary: "USD 150.00" },
  ownerBillStatus: "not_billable",
  ownerBillStatusLabel: "Not billable",
  ownerReceivableDisplay: { primary: "USD 0.00" },
  ownerReimbursableAmount: 0,
  ownerReimbursedAmount: 0,
  paidDate: null,
  propertyCode: "HOME",
  propertyId: "property-1",
  propertyName: "Home",
  reference: "INV-200",
  status: "approved",
  statusLabel: "Approved",
  unitId: null,
  unitNumber: "No unit",
  vendorLabel: "Repair Vendor",
  vendorPersonId: null,
} as BillsExpenseItem;

function renderScreen(item: BillsExpenseItem) {
  render(
    <BillsExpensesScreen
      expenseItems={[item]}
      pagination={{ from: 1, page: 1, pageSize: 25, to: 1, totalCount: 1, totalPages: 1 }}
      propertyOptions={[{ id: "property-1", label: "HOME / Home" }]}
      summary={{
        approvedCount: "1",
        draftCount: "0",
        overdueCount: "0",
        postedTotal: { primary: "USD 0.00" },
        unpostedTotal: { primary: "USD 200.00" },
      }}
      unitOptions={[]}
      vendorOptions={[]}
    viewQuery={{
      expenseType: "all",
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
}
