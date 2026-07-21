/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentIncomeScreen } from "./rent-income-screen";
import { incomeTypeOptions, type RentIncomeItem } from "../rent-income.types";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/rent-income",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

describe("RentIncomeScreen", () => {
  it("submits search independently and resets pagination in the URL", () => {
    navigation.searchParams = new URLSearchParams("page=3&status=open");
    renderIncome("all");

    const search = screen.getByRole("textbox", { name: "Search income" });
    fireEvent.change(search, { target: { value: "  tenant  " } });
    fireEvent.submit(search.closest("form")!);

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/rent-income?status=open&query=tenant",
      { scroll: false },
    );
  });

  it("dismisses the filter popover with Escape and returns focus", async () => {
    const user = userEvent.setup();
    const { container } = renderIncome("all");
    const filterSurface = container.querySelector<HTMLElement>(
      '[data-filter-surface="rent-income"]',
    )!;
    const trigger = within(filterSurface).getByRole("button", {
      name: "Filters",
    });

    await user.click(trigger);
    expect(
      screen.getByRole("combobox", { name: "Income type" }),
    ).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("combobox", { name: "Income type" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the finance workspace anatomy without changing totals or filter values", () => {
    const postedIncome = {
      ...partialIncome,
      amountDue: 750,
      amountDueDisplay: { primary: "USD 750.00" },
      amountReceived: 750,
      amountReceivedDisplay: { primary: "USD 750.00" },
      balanceDisplay: { primary: "USD 0.00" },
      id: "income-2",
      ledgerEntryId: "ledger-2",
      payerLabel: "Jordan Tenant",
      status: "posted",
      statusLabel: "Posted",
    } satisfies RentIncomeItem;
    const { container } = renderIncome("all", [partialIncome, postedIncome]);

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    const summaryRegion = screen.getByRole("region", { name: "Global income summary" });
    expect(summaryRegion.className).toContain("overflow-x-auto");
    expect(summaryRegion.getAttribute("tabindex")).toBe("0");
    expect(summaryRegion.textContent).toContain(
      "USD 400.00",
    );
    expect(summaryRegion.textContent).toContain(
      "USD 100.00",
    );

    const filterForm = container.querySelector<HTMLElement>('[data-filter-surface="rent-income"]')!;
    expect(
      screen.getByRole("navigation", { name: "Finance workspace" }),
    ).not.toBeNull();
    fireEvent.click(within(filterForm).getByRole("button", { name: "Filters" }));
    for (const name of ["Income group", "Income type", "Income status", "Property", "Unit"]) {
      expect(screen.getByRole("combobox", { name })).not.toBeNull();
    }
    expect(within(filterForm).getByRole("textbox", { name: "Search income" })).not.toBeNull();
    expect((filterForm.querySelector('[name="month"]') as HTMLInputElement).value).toBe("2026-07");

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(0);
    expect(within(rows[0]!).getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
      "/properties/property-1",
    );
    expect(within(rows[0]!).getByRole("button", { name: "Preview Tenant" })).not.toBeNull();
    expect(within(rows[1]!).getByText("Posted")).not.toBeNull();
    expect(container.querySelectorAll("[data-money-cell='true']").length).toBeGreaterThan(0);
  });

  it("offers every supported income type plus the all-types choice", async () => {
    const user = userEvent.setup();
    renderIncome("all");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Income type" }));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All income types",
      ...incomeTypeOptions.map((option) => option.label),
    ]);
  });

  it("writes income type to the URL and resets pagination", async () => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams("page=4&status=open");
    renderIncome("all", [partialIncome], { status: "open" });

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Income type" }));
    await user.click(screen.getByRole("option", { name: "Late fee" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/rent-income?status=open&incomeType=late_fee",
      { scroll: false },
    );
  });

  it("replaces the legacy management-fee URL with the canonical income group", async () => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams(
      "page=2&incomeScope=management-fees&status=open",
    );
    renderIncome("management-company", [partialIncome], { status: "open" });

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Income group" }));
    await user.click(screen.getByRole("option", { name: "All income" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/rent-income?status=open",
      { scroll: false },
    );
  });

  it("counts group and type independently and provides a full reset", () => {
    renderIncome("management-company", [partialIncome], {
      incomeType: "management_fee",
      status: "open",
    });

    expect(screen.getByRole("button", { name: "Filters (3)" })).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Reset income filters" }).getAttribute("href"),
    ).toBe("/rent-income");
  });

  it("keeps nested links independent while row keys and Preview state select records", () => {
    const secondIncome = {
      ...partialIncome,
      hrefs: { property: "/properties/property-2" },
      id: "income-2",
      payerLabel: "Jordan Tenant",
      propertyName: "Lake House",
    } satisfies RentIncomeItem;
    renderIncome("all", [partialIncome, secondIncome]);

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const secondLink = within(rows[1]!).getByRole("link", { name: "Lake House" });
    const secondPreview = within(rows[1]!).getByRole("button", {
      name: "Preview Jordan Tenant",
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
    "opens one deliberate preview drawer at %ipx and returns focus after a cash action",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderIncome("all");
      const preview = screen.getByRole("button", { name: "Preview Tenant" });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Tenant income quick view" })).not.toBeNull();

      await user.click(screen.getByRole("button", { name: "Record payment" }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Record received money" })).not.toBeNull();
      const consequence = screen.getByRole("region", { name: "Receipt consequence" });
      expect(consequence.textContent).toContain("USD 400.00");
      expect(within(consequence).getByText("Current balance")).not.toBeNull();
      expect(within(consequence).queryByText("Remaining")).toBeNull();
      expect(
        (document.querySelector('input[name="incomeItemId"]') as HTMLInputElement).value,
      ).toBe("income-1");
      expect(
        (document.querySelector('input[name="amountReceived"]') as HTMLInputElement).value,
      ).toBe("400");

      await user.click(screen.getByRole("button", { name: "Close drawer" }));
      expect(document.activeElement).toBe(preview);
    },
  );

  it("distinguishes filtered-empty and true-empty actions", () => {
    const filtered = renderIncome("all", [], { query: "missing" });
    const filteredState = screen.getByText("No matching income").closest("section")!;
    expect(filteredState.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState).getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/rent-income");
    filtered.unmount();

    renderIncome("all", []);
    const emptyState = screen.getByText("No income yet").closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(within(emptyState).getByRole("button", { name: "Add income" })).not.toBeNull();
  });

  it("shows a truthful filtered count instead of global money summaries for management-company income", () => {
    renderIncome("management-company");
    expect(screen.getAllByText("Management-company income").length).toBeGreaterThan(0);
    expect(screen.getByText("1 filtered row")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Global income summary" })).toBeNull();
    expect(screen.getByRole("region", { name: "Scoped income summary" })).toBeTruthy();
  });

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
          incomeGroup: "all",
          incomeType: "all",
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

    fireEvent.click(screen.getByRole("button", { name: "Preview Tenant" }));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    expect(
      (document.querySelector('input[name="amountReceived"]') as HTMLInputElement)
        .value,
    ).toBe("400");
  });

  it("states the official ledger effect before posting received income", () => {
    renderIncome("all");

    fireEvent.click(screen.getByRole("button", { name: "Preview Tenant" }));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    const consequence = screen.getByRole("region", {
      name: "Posting consequence",
    });
    expect(consequence.textContent).toContain(
      "ResultOfficial income ledger entry",
    );
  });
});

function renderIncome(
  incomeGroup: "all" | "management-company",
  incomeItems: RentIncomeItem[] = [partialIncome],
  viewQuery: Partial<ComponentProps<typeof RentIncomeScreen>["viewQuery"]> = {},
) {
  return render(<RentIncomeScreen incomeItems={incomeItems} leaseOptions={[]} pagination={{ from: incomeItems.length ? 1 : 0, page: 1, pageSize: 25, to: incomeItems.length, totalCount: incomeItems.length, totalPages: incomeItems.length ? 1 : 0 }} propertyOptions={[{ id: "property-1", label: "HOME / Home" }]} summary={{ openCount: "1", overdueCount: "0", receivableTotal: { primary: "USD 400.00" }, receivedTotal: { primary: "USD 100.00" }, unpostedCount: "1" }} unitOptions={[]} viewQuery={{ incomeGroup, incomeType: "all", month: "2026-07", page: 1, pageSize: 25, propertyId: "all", query: "", status: "all", unitId: "all", ...viewQuery }} />);
}

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
