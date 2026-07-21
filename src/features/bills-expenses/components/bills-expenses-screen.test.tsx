/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsExpensesScreen } from "./bills-expenses-screen";
import type {
  BillsExpenseItem,
  BillsExpensesSummary,
} from "../bills-expenses.types";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/bills-expenses",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BillsExpensesScreen", () => {
  it("submits search independently and resets pagination in the URL", () => {
    navigation.searchParams = new URLSearchParams("page=2&status=approved");
    renderScreen([partialExpense]);

    const search = screen.getByRole("textbox", { name: "Search expenses" });
    fireEvent.change(search, { target: { value: "  vendor  " } });
    fireEvent.submit(search.closest("form")!);

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/bills-expenses?status=approved&query=vendor",
      { scroll: false },
    );
  });

  it("dismisses the filter popover with Escape and returns focus", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen([partialExpense]);
    const filterSurface = container.querySelector<HTMLElement>(
      '[data-filter-surface="bills-expenses"]',
    )!;
    const trigger = within(filterSurface).getByRole("button", {
      name: "Filters",
    });

    await user.click(trigger);
    expect(
      screen.getByRole("combobox", { name: "Expense type" }),
    ).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("combobox", { name: "Expense type" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

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
    const { container } = renderScreen([partialExpense, paidExpense]);

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    const summaryRegion = screen.getByRole("region", { name: "Global expense summary" });
    expect(summaryRegion.className).toContain("overflow-x-auto");
    expect(summaryRegion.getAttribute("tabindex")).toBe("0");
    expect(summaryRegion.textContent).toContain(
      "USD 200.00",
    );
    expect(summaryRegion.textContent).toContain(
      "USD 0.00",
    );

    const filterForm = container.querySelector<HTMLElement>('[data-filter-surface="bills-expenses"]')!;
    expect(
      screen.getByRole("navigation", { name: "Finance workspace" }),
    ).not.toBeNull();
    fireEvent.click(within(filterForm).getByRole("button", { name: "Filters" }));
    for (const name of [
      "Expense date basis",
      "Expense type",
      "Expense status",
      "Property",
      "Unit",
    ]) {
      expect(screen.getByRole("combobox", { name })).not.toBeNull();
    }
    expect(within(filterForm).getByRole("textbox", { name: "Search expenses" })).not.toBeNull();
    expect((filterForm.querySelector('[name="month"]') as HTMLInputElement).value).toBe("2026-07");

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(0);
    expect(within(rows[0]!).getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
      "/properties/property-1",
    );
    expect(
      within(rows[0]!).getByRole("button", { name: "Preview Repair Vendor" }),
    ).not.toBeNull();
    expect(within(rows[1]!).getByText("Paid")).not.toBeNull();
    expect(container.querySelectorAll("[data-money-cell='true']").length).toBeGreaterThan(0);
  });

  it("uses signed paid-basis events for truthful state, amount, and date details", () => {
    renderScreen(
      [paymentEvent, reversalEvent],
      "all",
      { dateBasis: "paid" },
      {
        summary: {
          approvedCount: "9",
          draftCount: "8",
          overdueCount: "7",
          postedTotal: { primary: "USD 25.00" },
          unpostedTotal: { primary: "USD 999.00" },
        },
      },
    );

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Payment")).not.toBeNull();
    expect(within(rows[0]!).getByText("Payment 15 Jul 2026")).not.toBeNull();
    expect(within(rows[1]!).getByText("Reversed")).not.toBeNull();
    expect(within(rows[1]!).getByText("Reversed 16 Jul 2026")).not.toBeNull();

    fireEvent.click(
      within(rows[0]!).getByRole("button", { name: "Preview Repair Vendor" }),
    );
    let inspector = screen.getByRole("dialog", {
      name: "Repair Vendor expense quick view",
    });
    expect(within(inspector).getByText("Payment", { selector: "p" })).not.toBeNull();
    expect(within(inspector).getByText("Payment date")).not.toBeNull();
    expect(within(inspector).getAllByText("USD 75.00")).toHaveLength(1);
    expect(within(inspector).queryByText("Remaining")).toBeNull();

    fireEvent.click(
      within(rows[1]!).getByRole("button", { name: "Preview Repair Vendor" }),
    );
    inspector = screen.getByRole("dialog", {
      name: "Repair Vendor expense quick view",
    });
    expect(within(inspector).getByText("Reversed", { selector: "p" })).not.toBeNull();
    expect(within(inspector).getByText("Reversed date")).not.toBeNull();
    expect(within(inspector).getAllByText("-USD 50.00")).toHaveLength(1);
    expect(within(inspector).queryByText("Remaining")).toBeNull();
  });

  it("retains obligation status logic outside paid-basis event rows", () => {
    const overdueExpense = {
      ...partialExpense,
      id: "expense-overdue",
      isOverdue: true,
      vendorLabel: "Late Vendor",
    } satisfies BillsExpenseItem;
    const draftExpense = {
      ...partialExpense,
      id: "expense-draft",
      status: "draft",
      statusLabel: "Draft",
      vendorLabel: "Draft Vendor",
    } satisfies BillsExpenseItem;
    renderScreen([partialExpense, overdueExpense, draftExpense]);

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Approved")).not.toBeNull();
    expect(within(rows[1]!).getByText("Overdue")).not.toBeNull();
    expect(within(rows[2]!).getByText("Draft")).not.toBeNull();
  });

  it("keeps nested links independent while row keys and Preview state select records", () => {
    const secondExpense = {
      ...partialExpense,
      hrefs: { property: "/properties/property-2" },
      id: "expense-2",
      propertyName: "Lake House",
      vendorLabel: "Lake Vendor",
    } satisfies BillsExpenseItem;
    renderScreen([partialExpense, secondExpense]);

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const secondLink = within(rows[1]!).getByRole("link", { name: "Lake House" });
    const secondPreview = within(rows[1]!).getByRole("button", {
      name: "Preview Lake Vendor",
    });
    expect(rows[0]!.className).toContain("focus-visible:outline");
    expect(secondPreview.getAttribute("aria-pressed")).toBe("false");

    expect(fireEvent.keyDown(secondLink, { key: "Enter" })).toBe(true);
    expect(rows[0]!.getAttribute("aria-selected")).toBe("false");
    expect(rows[1]!.getAttribute("aria-selected")).toBe("false");
    expect(secondPreview.getAttribute("aria-pressed")).toBe("false");

    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]!.getAttribute("aria-selected")).toBe("true");
    expect(secondPreview.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(rows[0]!.getAttribute("aria-selected")).toBe("true");
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
      expect(screen.getByRole("dialog", { name: "Repair Vendor expense quick view" })).not.toBeNull();

      await user.click(screen.getByRole("button", { name: "Record payment" }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Record payment" })).not.toBeNull();
      const consequence = screen.getByRole("region", { name: "Payment consequence" });
      expect(consequence.textContent).toContain("USD 150.00");
      expect(consequence.textContent).toContain("Remaining after paymentUSD 0.00");
      expect(consequence.textContent).toContain(
        "Ledger effectPayment and settlement allocation",
      );
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

  it("keeps exact invoice-basis financial totals when expense type is filtered", () => {
    renderScreen([partialExpense], "maintenance", {}, {
      summary: {
        approvedCount: "3",
        draftCount: "2",
        overdueCount: "1",
        postedTotal: { primary: "USD 450.00" },
        unpostedTotal: { primary: "USD 275.00" },
      },
    });
    const summaryRegion = screen.getByRole("region", { name: "Global expense summary" });
    expect(summaryRegion.textContent).toContain("Approved3");
    expect(summaryRegion.textContent).toContain("Draft2");
    expect(summaryRegion.textContent).toContain("Overdue1");
    expect(summaryRegion.textContent).toContain("USD 450.00");
    expect(summaryRegion.textContent).toContain("USD 275.00");
    expect(screen.queryByRole("region", { name: "Scoped expense summary" })).toBeNull();
  });

  it("shows paid-basis event count and signed net payments without obligation metrics", () => {
    renderScreen(
      [paymentEvent, reversalEvent],
      "maintenance",
      { dateBasis: "paid" },
      {
        summary: {
          approvedCount: "91",
          draftCount: "82",
          overdueCount: "73",
          postedTotal: { primary: "USD 25.00" },
          unpostedTotal: { primary: "USD 999.00" },
        },
        totalCount: 7,
      },
    );

    const summaryRegion = screen.getByRole("region", { name: "Paid expense summary" });
    expect(within(summaryRegion).getByText("Event count")).not.toBeNull();
    expect(within(summaryRegion).getByText("7")).not.toBeNull();
    expect(within(summaryRegion).getByText("Net payments")).not.toBeNull();
    expect(summaryRegion.textContent).toContain("USD 25.00");
    expect(within(summaryRegion).queryByText("Approved")).toBeNull();
    expect(within(summaryRegion).queryByText("Draft")).toBeNull();
    expect(within(summaryRegion).queryByText("Unposted")).toBeNull();
    expect(within(summaryRegion).queryByText("Posted")).toBeNull();
  });
  it("submits and describes only the outstanding expense amount", () => {
    renderScreen([partialExpense]);

    fireEvent.click(screen.getByRole("button", { name: "Preview Repair Vendor" }));
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

const paymentEvent = {
  ...partialExpense,
  amount: 75,
  amountDisplay: { primary: "USD 75.00" },
  amountPaid: 75,
  amountPaidDisplay: { primary: "USD 75.00" },
  id: "payment-1:expense-1",
  isPaymentEvent: true,
  nextAction: "Payment event",
  outstandingAmount: 125,
  outstandingAmountDisplay: { primary: "USD 125.00" },
  paidDate: "2026-07-15",
} satisfies BillsExpenseItem;

const reversalEvent = {
  ...partialExpense,
  amount: -50,
  amountDisplay: { primary: "-USD 50.00" },
  amountPaid: -50,
  amountPaidDisplay: { primary: "-USD 50.00" },
  id: "payment-2:expense-1",
  isPaymentEvent: true,
  nextAction: "Payment reversal",
  outstandingAmount: 250,
  outstandingAmountDisplay: { primary: "USD 250.00" },
  paidDate: "2026-07-16",
} satisfies BillsExpenseItem;

function renderScreen(
  expenseItems: BillsExpenseItem[] = [partialExpense],
  expenseType: "all" | "maintenance" = "all",
  viewQuery: Partial<ComponentProps<typeof BillsExpensesScreen>["viewQuery"]> = {},
  options: {
    summary?: BillsExpensesSummary;
    totalCount?: number;
  } = {},
) {
  const totalCount = options.totalCount ?? expenseItems.length;
  return render(
    <BillsExpensesScreen
      expenseItems={expenseItems}
      pagination={{ from: expenseItems.length ? 1 : 0, page: 1, pageSize: 25, to: expenseItems.length, totalCount, totalPages: totalCount ? 1 : 0 }}
      propertyOptions={[{ id: "property-1", label: "HOME / Home" }]}
      summary={options.summary ?? {
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

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}
