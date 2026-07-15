/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerScreen } from "@/features/ledger/components/ledger-screen";
import type { LedgerEntry, LedgerViewQuery } from "@/features/ledger/ledger.types";

const navigation = vi.hoisted(() => ({
  pathname: "/ledger",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LedgerScreen finance workspace contract", () => {
  it("keeps finance rows dense, selected, linked, and docked at 1280+", async () => {
    const user = userEvent.setup();
    const { container } = renderLedger();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    expect(screen.getByText("Month close").closest("section")?.className).toContain(
      "overflow-x-auto",
    );
    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(within(rows[0]!).getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
      "/properties/property-1",
    );
    expect(within(rows[0]!).getByRole("button", { name: "Preview Rent" })).not.toBeNull();
    expect(container.querySelectorAll("[data-money-cell='true']").length).toBeGreaterThan(0);
    expect(screen.getByRole("complementary", { name: "Rent ledger inspector" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("combobox", { name: "Filter by property" })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter by direction" })).not.toBeNull();
    expect(screen.queryByText(/select a row/i)).toBeNull();
  });

  it.each([1024, 390])(
    "opens a deliberate preview at %ipx and replaces it with one consequence drawer",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderLedger();
      const preview = screen.getByRole("button", { name: "Preview Rent" });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(screen.getByRole("dialog", { name: "Rent ledger inspector" })).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Archive ledger entry" }));

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Archive ledger entry" })).not.toBeNull();
      const consequence = screen.getByRole("region", { name: "Archive consequence" });
      expect(consequence.textContent).toContain("active totals");
      expect((document.querySelector('input[name="entryId"]') as HTMLInputElement).value).toBe(
        "ledger-1",
      );

      await user.click(screen.getByRole("button", { name: "Close drawer" }));
      expect(document.activeElement).toBe(preview);
    },
  );

  it("places the period-lock consequence beside the unchanged mutation fields", async () => {
    const user = userEvent.setup();
    renderLedger();
    await user.click(screen.getByRole("button", { name: "Period lock" }));

    const consequence = screen.getByRole("region", { name: "Period lock consequence" });
    expect(consequence.textContent).toContain("historical financial records");
    expect(document.querySelector('[name="periodStart"]')).not.toBeNull();
    expect((document.querySelector('[name="lockState"]') as HTMLSelectElement).value).toBe(
      "locked",
    );
  });

  it("distinguishes filtered-empty from a true-empty ledger", () => {
    const filtered = renderLedger([], { query: "missing" });
    const filteredState = screen.getByText("No matching ledger entries").closest("section")!;
    expect(filteredState.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState).getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/ledger");
    filtered.unmount();

    renderLedger([]);
    const emptyState = screen.getByText("No ledger entries yet").closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(within(emptyState).getByRole("button", { name: "Add entry" })).not.toBeNull();
  });
});

const defaultViewQuery: LedgerViewQuery = {
  archiveState: "active",
  dateFrom: "",
  dateTo: "",
  direction: "all",
  entryId: null,
  minAmount: null,
  page: 1,
  pageSize: 50,
  period: "all",
  propertyId: "all",
  query: "",
  sort: "date_desc",
  unitId: "all",
};

const entries = [
  makeEntry("ledger-1", "Rent", "income", 1200),
  makeEntry("ledger-2", "Repair", "expense", 250),
];

function renderLedger(
  nextEntries: LedgerEntry[] = entries,
  query: Partial<LedgerViewQuery> = {},
) {
  return render(
    <LedgerScreen
      closeSummary={{
        accountingUnlinkedCount: "0",
        accountingUnlinkedHref: "/ledger",
        billsReadyHref: "/bills-expenses",
        billsReadyToPost: "0",
        incomeReadyHref: "/rent-income",
        incomeReadyToPost: "0",
        month: "2026-07",
        monthLabel: "July 2026",
        pettyCashReadyHref: "/petty-cash",
        pettyCashReadyToPost: "0",
      }}
      entries={nextEntries}
      pagination={{
        from: nextEntries.length ? 1 : 0,
        page: 1,
        pageSize: 50,
        to: nextEntries.length,
        totalCount: nextEntries.length,
        totalPages: nextEntries.length ? 1 : 0,
      }}
      periodLocks={[]}
      propertyOptions={[{ id: "property-1", label: "HOME / Home" }]}
      recentChanges={[]}
      unitOptions={[]}
      viewQuery={{ ...defaultViewQuery, ...query }}
    />,
  );
}

function makeEntry(
  id: string,
  category: string,
  direction: LedgerEntry["direction"],
  amount: number,
): LedgerEntry {
  return {
    accountingJournalEntryId: `journal-${id}`,
    activity: [],
    amount,
    category,
    currency: "USD",
    description: `${category} detail`,
    direction,
    documents: [],
    hrefs: {
      documents: `/documents?entryId=${id}`,
      ledger: `/ledger?entryId=${id}`,
      property: "/properties/property-1",
      reports: "/reports",
      timeline: `/financial-timeline?entryId=${id}`,
    },
    id,
    isLocked: false,
    nextAction: {
      description: "Review supporting record",
      href: `/ledger?entryId=${id}`,
      label: "Review",
      tone: "neutral",
    },
    propertyCode: "HOME",
    propertyId: "property-1",
    propertyName: "Home",
    recordCounts: { activity: 0, documents: 0, timelineEvents: 1 },
    riskIndicators: [],
    sourceLabel: direction === "income" ? "Rent & Income" : "Bills & Expenses",
    sourceType: direction === "income" ? "finance_income" : "finance_expense",
    transactionDate: "2026-07-10",
  };
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
