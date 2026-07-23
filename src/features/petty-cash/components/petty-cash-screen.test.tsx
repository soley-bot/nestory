/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PettyCashScreen } from "@/features/petty-cash/components/petty-cash-screen";
import type {
  PettyCashAccount,
  PettyCashEntry,
  PettyCashPeriod,
  PettyCashSummary,
} from "@/features/petty-cash/petty-cash.types";
import type { PersonSelectOption } from "@/features/people/person-select";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

beforeEach(() => {
  navigation.replace.mockReset();
  installMatchMedia(1440);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PettyCashScreen finance workspace contract", () => {
  it("keeps register totals, cash states, links, currency columns, and deliberate quick views", () => {
    const { container } = renderPettyCash();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    const summaryRegion = screen.getByRole("region", { name: "Petty cash summary" });
    expect(summaryRegion.className).toContain("overflow-x-auto");
    expect(summaryRegion.getAttribute("tabindex")).toBe("0");
    expect(summaryRegion.textContent).toContain(
      "USD 500.00",
    );
    expect(summaryRegion.textContent).toContain(
      "USD 410.00",
    );

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(0);
    expect(within(rows[0]!).getByRole("link", { name: "HOME" }).getAttribute("href")).toBe(
      "/properties/property-1",
    );
    expect(within(rows[0]!).getByRole("button", { name: "Preview Cleaning" })).not.toBeNull();
    expect(within(rows[0]!).getByText("Cleared")).not.toBeNull();
    expect(within(rows[1]!).getByText("Posted")).not.toBeNull();
    expect(container.querySelectorAll("[data-money-cell='true']").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Preview Cleaning" }));
    expect(screen.getByRole("dialog", { name: "Cleaning cash quick view" })).not.toBeNull();
    expect(screen.queryByText(/select a row/i)).toBeNull();
  });

  it("keeps nested links independent while row keys and Preview state select records", () => {
    const secondEntry = {
      ...entries[1]!,
      propertyCode: "LAKE",
      propertyId: "property-2",
    } satisfies PettyCashEntry;
    renderPettyCash({ entries: [entries[0]!, secondEntry] });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const secondLink = within(rows[1]!).getByRole("link", { name: "LAKE" });
    const secondPreview = within(rows[1]!).getByRole("button", {
      name: "Preview Supplies",
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
    "opens one preview at %ipx and preserves the ledger-post payload and focus",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderPettyCash();
      const preview = screen.getByRole("button", { name: "Preview Cleaning" });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(screen.getByRole("dialog", { name: "Cleaning cash quick view" })).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Post to ledger" }));

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Post to ledger" })).not.toBeNull();
      const consequence = screen.getByRole("region", { name: "Posting consequence" });
      expect(consequence.textContent).toContain("USD 90.00");
      expect(consequence.textContent).toContain("one ledger expense");
      expect(consequence.textContent).toContain(
        "ResultLedger expense and linked timeline event",
      );
      expect((document.querySelector('input[name="entryId"]') as HTMLInputElement).value).toBe(
        "cash-1",
      );

      await user.click(screen.getByRole("button", { name: "Close drawer" }));
      expect(document.activeElement).toBe(preview);
    },
  );

  it("places reconciliation consequences beside the unchanged rollover payload", async () => {
    const user = userEvent.setup();
    renderPettyCash();
    await user.click(screen.getByRole("button", { name: "Open next month" }));

    const consequence = screen.getByRole("region", { name: "Reconciliation consequence" });
    expect(consequence.textContent).toContain("USD 410.00");
    expect((document.querySelector('input[name="accountId"]') as HTMLInputElement).value).toBe(
      "account-1",
    );
    expect((document.querySelector('input[name="periodId"]') as HTMLInputElement).value).toBe(
      "period-1",
    );
  });

  it("shows a true-empty action only when petty cash is available", () => {
    const available = renderPettyCash({ accounts: [], entries: [], period: null, selectedAccount: undefined });
    const emptyState = screen.getByText("No petty cash account yet").closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(within(emptyState).getByRole("button", { name: "Add account" })).not.toBeNull();
    available.unmount();

    renderPettyCash({
      accounts: [],
      entries: [],
      period: null,
      schemaStatus: { isReady: false, message: "Petty cash tables are unavailable." },
      selectedAccount: undefined,
    });
    const blockedState = screen.getByText("Petty cash unavailable").closest("section")!;
    expect(blockedState.getAttribute("data-kind")).toBe("permission");
    expect(screen.queryByRole("button", { name: "Add account" })).toBeNull();
  });

  it("searches account number, name, and custodian while keeping selection URL-backed", async () => {
    const user = userEvent.setup();
    const fieldAccount = {
      ...account,
      accountNumber: "PM-FIELD-02",
      custodianName: "Mina Ops",
      id: "account-2",
      name: "Field cash",
    };
    renderPettyCash({ accounts: [account, fieldAccount] });

    await user.click(
      screen.getByRole("button", { name: "Petty cash account" }),
    );
    const search = screen.getByRole("combobox", {
      name: "Search Petty cash account",
    });
    await user.type(search, "Mina");
    expect(screen.getByRole("option", { name: /PM-FIELD-02/ })).not.toBeNull();
    await user.keyboard("{Enter}");

    expect(navigation.replace).toHaveBeenCalledWith(
      "/petty-cash?accountId=account-2",
    );
  });

  it("uses one shared correction surface and keeps voiding explicit", async () => {
    const user = userEvent.setup();
    renderPettyCash();

    await user.click(screen.getByRole("button", { name: "Preview Cleaning" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("dialog", { name: "Edit petty cash row" }),
    ).not.toBeNull();
    expect(
      (document.querySelector('input[name="entryId"]') as HTMLInputElement).value,
    ).toBe("cash-1");
    expect(
      (document.querySelector('input[name="category"]') as HTMLInputElement).value,
    ).toBe("Cleaning");

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    await user.click(screen.getByRole("button", { name: "Preview Cleaning" }));
    await user.click(screen.getByRole("button", { name: "Void" }));
    expect(screen.getByRole("region", { name: "Void consequence" }).textContent).toContain(
      "Zero after voiding",
    );
    expect(
      screen.getByRole("textbox", { name: "Void reason" }).getAttribute("required"),
    ).not.toBeNull();
  });

  it("does not expose rollover or row mutations for an inactive account", async () => {
    const user = userEvent.setup();
    const inactiveAccount = {
      ...account,
      status: "inactive",
    } satisfies PettyCashAccount;
    renderPettyCash({
      accounts: [inactiveAccount],
      selectedAccount: inactiveAccount,
    });

    expect(screen.queryByRole("button", { name: "Open next month" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add cash row" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Preview Cleaning" }));
    expect(screen.queryByRole("button", { name: "Post to ledger" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
  });

  it("links a prioritized Person or exposes one explicit external-party path", async () => {
    const user = userEvent.setup();
    const vendor = {
      archived: false,
      description: "Vendor / vendor@example.test",
      id: "vendor-1",
      label: "Acme Repairs",
      roles: ["vendor"],
    } satisfies PersonSelectOption;
    renderPettyCash({ counterpartyOptions: [vendor] });

    await user.click(screen.getByRole("button", { name: "Add cash row" }));
    const counterparty = screen.getByRole("combobox", {
      name: "Petty cash recipient",
    });
    await user.type(counterparty, "Acme");
    await user.click(screen.getByRole("option", { name: /Acme Repairs/ }));
    expect(
      (
        document.querySelector(
          'input[name="counterpartyPersonId"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("vendor-1");
    expect(
      (document.querySelector('input[name="counterpartyMode"]') as HTMLInputElement)
        .value,
    ).toBe("linked");

    await user.click(counterparty);
    await user.clear(counterparty);
    await user.type(counterparty, "External party");
    await user.click(screen.getByRole("option", { name: /External party/ }));
    expect(
      screen.getByRole("textbox", { name: "External party name" }),
    ).not.toBeNull();
  });
});

const account: PettyCashAccount = {
  accountNumber: "PM-CASH-01",
  currency: "USD",
  floatAmount: 500,
  id: "account-1",
  name: "Office cash",
  status: "active",
};

const period: PettyCashPeriod = {
  advanceAmount: 500,
  id: "period-1",
  openingBalanceAmount: 500,
  periodStart: "2026-07-01",
  status: "open",
};

const summary: PettyCashSummary = {
  balance: { primary: "USD 410.00" },
  cashIn: { primary: "USD 0.00" },
  cashOut: { primary: "USD 90.00" },
  openingFloat: { primary: "USD 500.00" },
  postedCount: "1",
  readyToPostCount: "1",
  receiptMissingCount: "0",
  voidCount: "0",
};

const entries: PettyCashEntry[] = [
  makeEntry("cash-1", "Cleaning", "cleared", 90, 410),
  { ...makeEntry("cash-2", "Supplies", "posted", 20, 390), ledgerEntryId: "ledger-2" },
];

function renderPettyCash({
  accounts = [account],
  counterpartyOptions = [],
  entries: nextEntries = entries,
  period: nextPeriod = period,
  schemaStatus = { isReady: true },
  selectedAccount = account,
}: {
  accounts?: PettyCashAccount[];
  counterpartyOptions?: PersonSelectOption[];
  entries?: PettyCashEntry[];
  period?: PettyCashPeriod | null;
  schemaStatus?: { isReady: boolean; message?: string };
  selectedAccount?: PettyCashAccount;
} = {}) {
  return render(
    <PettyCashScreen
      accounts={accounts}
      counterpartyOptions={counterpartyOptions}
      entries={nextEntries}
      period={nextPeriod}
      propertyOptions={[{ id: "property-1", label: "HOME / Home" }]}
      schemaStatus={schemaStatus}
      selectedAccount={selectedAccount}
      summary={summary}
      staffOptions={[]}
      unitOptions={[]}
    />,
  );
}

function makeEntry(
  id: string,
  category: string,
  status: PettyCashEntry["status"],
  outAmount: number,
  balanceAfter: number,
): PettyCashEntry {
  return {
    balanceAfter,
    category,
    clearDate: "2026-07-10",
    companyLossAmount: 0,
    createdAt: "2026-07-10T00:00:00.000Z",
    currency: "USD",
    description: `${category} expense`,
    economicScope: "property_expense",
    economicScopeLabel: "Property expense",
    entryKind: "expense",
    id,
    inAmount: 0,
    invoiceDate: "2026-07-10",
    outAmount,
    ownerBillStatus: "not_billable",
    ownerBillStatusLabel: "Not billable",
    ownerReceivable: { primary: "USD 0.00" },
    ownerReceivableAmount: 0,
    ownerReimbursableAmount: 0,
    ownerReimbursedAmount: 0,
    propertyCode: "HOME",
    propertyId: "property-1",
    propertyName: "Home",
    receiptReference: `R-${id}`,
    status,
    supplier: "Local vendor",
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
