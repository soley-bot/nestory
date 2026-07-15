/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsExpensesScreen } from "./bills-expenses-screen";
import type { BillsExpenseItem } from "../bills-expenses.types";

beforeEach(() => installMatchMedia(1440));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BillsExpensesScreen", () => {
  it("uses the finance workspace anatomy without changing totals or filter values", () => {
    const paidExpense = {
      ...partialExpense,
      amountPaid: 200,
      amountPaidDisplay: { primary: "USD 200.00" },
      id: "expense-2",
      ledgerEntryId: "ledger-2",
      outstandingAmount: 0,
      outstandingAmountDisplay: { primary: "USD 0.00" },
      status: "paid",
      statusLabel: "Paid",
      vendorLabel: "Power Company",
    } satisfies BillsExpenseItem;
    const reversedExpense = {
      ...partialExpense,
      amount: -50,
      amountDisplay: { primary: "-USD 50.00" },
      amountPaid: -50,
      amountPaidDisplay: { primary: "-USD 50.00" },
      id: "payment-reversal:expense-1",
      isPaymentEvent: true,
      nextAction: "Payment reversal",
      outstandingAmount: 0,
      outstandingAmountDisplay: { primary: "USD 0.00" },
      paidDate: "2026-07-15",
      vendorLabel: "Reversed payment",
    } satisfies BillsExpenseItem;
    const { container } = renderScreen([partialExpense, paidExpense, reversedExpense]);

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    const summaryRegion = screen.getByRole("region", { name: "Global expense summary" });
    expect(summaryRegion.className).toContain("overflow-x-auto");
    expect(summaryRegion.textContent).toContain(
      "USD 200.00",
    );
    expect(summaryRegion.textContent).toContain(
      "USD 0.00",
    );

    const filterForm = container.querySelector('form[action="/bills-expenses"]')!;
    expect((filterForm.querySelector('[name="month"]') as HTMLInputElement).value).toBe(
      "2026-07",
    );
    expect((filterForm.querySelector('[name="dateBasis"]') as HTMLSelectElement).value).toBe(
      "invoice",
    );
    expect((filterForm.querySelector('[name="status"]') as HTMLSelectElement).value).toBe(
      "all",
    );
    expect((filterForm.querySelector('[name="propertyId"]') as HTMLSelectElement).value).toBe(
      "all",
    );

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(within(rows[0]!).getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
      "/properties/property-1",
    );
    expect(
      within(rows[0]!).getByRole("button", { name: "Preview Repair Vendor" }),
    ).not.toBeNull();
    expect(within(rows[1]!).getByText("Paid")).not.toBeNull();
    expect(within(rows[2]!).getByText("Reversed")).not.toBeNull();
    expect(container.querySelectorAll("[data-money-cell='true']").length).toBeGreaterThan(0);
  });

  it.each([1024, 390])(
    "opens one deliberate preview drawer at %ipx and preserves the payment payload",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderScreen([partialExpense]);
      const preview = screen.getByRole("button", { name: "Preview Repair Vendor" });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(screen.getByRole("dialog", { name: "Repair Vendor expense inspector" })).not.toBeNull();

      await user.click(screen.getByRole("button", { name: "Record payment" }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Record payment" })).not.toBeNull();
      const consequence = screen.getByRole("region", { name: "Payment consequence" });
      expect(consequence.textContent).toContain("USD 150.00");
      const paymentDialog = screen.getByRole("dialog", { name: "Record payment" });
      expect((paymentDialog.querySelector('input[name="expenseItemId"]') as HTMLInputElement).value).toBe(
        "expense-1",
      );
      expect((paymentDialog.querySelector('input[name="amount"]') as HTMLInputElement).value).toBe(
        "150",
      );
      expect((paymentDialog.querySelector('input[name="propertyId"]') as HTMLInputElement).value).toBe(
        "property-1",
      );

      await user.click(screen.getByRole("button", { name: "Close drawer" }));
      expect(document.activeElement).toBe(preview);
    },
  );

  it("distinguishes filtered-empty and true-empty actions", () => {
    const filtered = renderScreen([], "all", { query: "missing" });
    const filteredState = screen.getByText("No matching expenses").closest("section")!;
    expect(filteredState.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState).getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/bills-expenses");
    filtered.unmount();

    renderScreen([]);
    const emptyState = screen.getByText("No bills or expenses yet").closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(within(emptyState).getByRole("button", { name: "Add bill" })).not.toBeNull();
  });

  it("shows a truthful filtered count instead of global totals for maintenance", () => {
    renderScreen([partialExpense], "maintenance");
    expect(screen.getByText("Maintenance expenses")).toBeTruthy();
    expect(screen.getByText("1 filtered row")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Global expense summary" })).toBeNull();
    expect(screen.getByRole("region", { name: "Scoped expense summary" })).toBeTruthy();
  });
  it("submits and describes only the outstanding expense amount", () => {
    renderScreen([partialExpense]);

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    expect(screen.getByText(/remaining property payment/i).textContent).toContain(
      "USD 150.00",
    );
    expect(
      (document.querySelector('input[name="amount"]') as HTMLInputElement).value,
    ).toBe("150");
  });

  it("does not offer another payment when the outstanding amount is zero", () => {
    renderScreen([{
      ...partialExpense,
      amountPaid: 200,
      amountPaidDisplay: { primary: "USD 200.00" },
      outstandingAmount: 0,
      outstandingAmountDisplay: { primary: "USD 0.00" },
    }]);

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

function renderScreen(
  expenseItems: BillsExpenseItem[] = [partialExpense],
  expenseType: "all" | "maintenance" = "all",
  viewQuery: Partial<ComponentProps<typeof BillsExpensesScreen>["viewQuery"]> = {},
) {
  return render(
    <BillsExpensesScreen
      expenseItems={expenseItems}
      pagination={{ from: expenseItems.length ? 1 : 0, page: 1, pageSize: 25, to: expenseItems.length, totalCount: expenseItems.length, totalPages: expenseItems.length ? 1 : 0 }}
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
      dateBasis: "invoice",
      expenseType,
        month: "2026-07",
        page: 1,
        pageSize: 25,
        propertyId: "all",
      query: "",
      status: "all",
      unitId: "all",
      ...viewQuery,
      }}
    />,
  );
}

function installMatchMedia(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      const minWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);

      return {
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: width >= minWidth,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      };
    }),
  });
}
