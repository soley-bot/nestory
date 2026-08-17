/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerScreen } from "@/features/ledger/components/ledger-screen";
import type {
  LedgerEntry,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";

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
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  vi.unstubAllGlobals();
});

describe("LedgerScreen finance workspace contract", () => {
  it("keeps finance rows dense, linked, and available in a deliberate quick view", async () => {
    const user = userEvent.setup();
    const { container } = renderLedger();

    expect(screen.getByRole("heading", { name: "Ledger" })).toBeTruthy();
    expect(screen.getAllByText("All properties · 2 records")).toHaveLength(2);

    expect(
      container.querySelector('[data-slot="workspace-page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="workspace-split-view"]'),
    ).not.toBeNull();
    const summaryStrip = screen.getByText("Visible net").closest("section");
    expect(summaryStrip?.className).not.toContain("overflow-x-auto");
    expect(within(summaryStrip!).queryByText("Clear")).toBeNull();
    const table = screen.getByRole("table");
    expect(table.className).toContain("text-sm");
    expect(table.querySelector("thead")?.className).toContain("text-xs");
    const pagination = screen
      .getByText(
        (_content, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes("Showing") === true,
      )
      .closest("div");
    expect(pagination?.classList.contains("border-t")).toBe(true);
    expect(pagination?.classList.contains("border")).toBe(false);
    expect(pagination?.classList.contains("border-t-0")).toBe(false);
    expect(pagination?.classList.contains("rounded-b-md")).toBe(false);
    expect(pagination?.classList.contains("-mt-px")).toBe(false);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.filter((row) => row.getAttribute("aria-selected") === "true"),
    ).toHaveLength(0);
    expect(
      within(rows[0]!).getByRole("link", { name: "Home" }).getAttribute("href"),
    ).toBe("/properties/property-1/account");
    expect(
      within(rows[0]!).getByRole("button", { name: "Preview Rent" }),
    ).not.toBeNull();
    expect(
      container.querySelectorAll("[data-money-cell='true']").length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Preview Rent" }));
    expect(
      screen.getByRole("dialog", { name: "Rent ledger quick view" }),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close quick view" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("combobox", { name: "Filter by property" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Filter by direction" }),
    ).not.toBeNull();
    expect(screen.queryByText(/select a row/i)).toBeNull();
  });

  it("keeps nested links independent while row keys and Preview state select records", () => {
    renderLedger();

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const secondLink = within(rows[1]!).getByRole("link", { name: "Home" });
    const secondPreview = within(rows[1]!).getByRole("button", {
      name: "Preview Repair",
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
    "keeps source-owned records immutable in the preview at %ipx",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderLedger();
      const preview = screen.getByRole("button", { name: "Preview Rent" });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(
        screen.getByRole("dialog", { name: "Rent ledger quick view" }),
      ).not.toBeNull();
      expect(screen.getByRole("button", { name: "Attach receipt" })).not.toBeNull();
      expect(
        screen.queryByRole("button", { name: "Archive ledger entry" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Edit ledger entry" }),
      ).toBeNull();

      await user.click(screen.getByRole("button", { name: "Close quick view" }));
      expect(document.activeElement).toBe(preview);
    },
  );

  it("presents month locking as a narrow financial control", async () => {
    const user = userEvent.setup();
    renderLedger();
    await user.click(screen.getByRole("button", { name: "Month lock" }));

    expect(
      screen.getByRole("dialog", { name: "Month lock" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close modal" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Close drawer" })).toBeNull();
    const consequence = screen.getByRole("region", {
      name: "Month lock consequence",
    });
    expect(consequence.textContent).toContain("authorized financial mutations");
    expect(document.querySelector('[name="periodStart"]')).not.toBeNull();
    expect(
      (document.querySelector('[name="lockState"]') as HTMLSelectElement).value,
    ).toBe("locked");
  });

  it("lets Finance Manager lock a month without exposing unlock or receipt mutation", async () => {
    const user = userEvent.setup();
    renderLedger(entries, {}, false, true, false);

    expect(screen.getByRole("button", { name: "Month lock" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Month lock" }));
    expect(
      screen.getByRole("region", { name: "Month lock consequence" }).textContent,
    ).toContain("selected month");
    expect(
      (screen.getByRole("textbox", { name: "Reason" }) as HTMLTextAreaElement)
        .required,
    ).toBe(true);
    const state = screen.getByRole("combobox", { name: "State" });
    await user.click(state);
    expect(screen.getByRole("option", { name: "Lock" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Unlock" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    await user.click(screen.getByRole("button", { name: "Preview Rent" }));
    expect(screen.queryByRole("button", { name: "Attach receipt" })).toBeNull();
  });

  it("distinguishes filtered-empty from a true-empty ledger", () => {
    const filtered = renderLedger([], { query: "missing" });
    const filteredState = screen
      .getByText("No matching ledger entries")
      .closest("section")!;
    expect(filteredState.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState)
        .getByRole("link", { name: "Clear filters" })
        .getAttribute("href"),
    ).toBe("/ledger");
    filtered.unmount();

    renderLedger([]);
    const emptyState = screen
      .getByText("No ledger entries yet")
      .closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(within(emptyState).queryByRole("button")).toBeNull();
    expect(emptyState.textContent).toMatch(/no financial transactions have been recorded/i);
  });

  it("keeps Finance roles read-only while preserving ledger inspection", async () => {
    const user = userEvent.setup();
    renderLedger(entries, {}, false);

    expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Month lock" })).toBeNull();
    const financeNav = screen.getByRole("navigation", {
      name: "Finance workspace",
    });
    expect(
      within(financeNav).getByRole("link", { name: "Advanced" }).getAttribute("href"),
    ).toBe("/finance/advanced");

    await user.click(screen.getByRole("button", { name: "Preview Rent" }));
    const inspector = screen.getByRole("dialog", {
      name: "Rent ledger quick view",
    });
    for (const action of [
      "Attach receipt",
      "Edit ledger entry",
      "Archive ledger entry",
    ]) {
      expect(
        within(inspector).queryByRole("button", { name: action }),
      ).toBeNull();
    }
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
  canManageFinance = true,
  canLockFinancialMonth = canManageFinance,
  canUnlockFinancialMonth = canManageFinance,
) {
  return render(
    <LedgerScreen
      canManageFinance={canManageFinance}
      canLockFinancialMonth={canLockFinancialMonth}
      canUnlockFinancialMonth={canUnlockFinancialMonth}
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
    sourceId: `source-${id}`,
    sourceLabel: direction === "income" ? "Rent & Income" : "Bills & Expenses",
    sourceResolved: true,
    sourceType:
      direction === "income" ? "receipt_allocation" : "payment_allocation",
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
