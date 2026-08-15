/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LedgerTable } from "@/features/ledger/components/ledger-table";
import type { LedgerEntry } from "@/features/ledger/ledger.types";

afterEach(cleanup);

describe("LedgerTable", () => {
  it("keeps the desktop table surface flat without losing table interaction", () => {
    const onSelectEntry = vi.fn();
    render(
      <LedgerTable
        entries={[entry]}
        onSelectEntry={onSelectEntry}
        selectedEntryId=""
      />,
    );
    const table = screen.getByRole("table");
    const scrollOwner = table.parentElement;
    const surface = scrollOwner?.parentElement;
    const row = within(table).getAllByRole("row")[1]!;

    expect(surface?.classList.contains("rounded-md")).toBe(false);
    expect(surface?.classList.contains("border")).toBe(false);
    expect(surface?.classList.contains("overflow-hidden")).toBe(true);
    expect(scrollOwner?.classList.contains("overflow-x-auto")).toBe(true);
    expect(scrollOwner?.classList.contains("overflow-auto")).toBe(false);
    expect(scrollOwner?.getAttribute("aria-label")).toBe("Ledger table");
    expect(table.querySelector("thead")?.classList.contains("sticky")).toBe(
      true,
    );
    expect(row.classList.contains("border-t")).toBe(true);
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.getAttribute("aria-selected")).toBe("false");
    expect(
      within(row).getByRole("link", { name: "Home" }).getAttribute("href"),
    ).toBe("/properties/property-1/account");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Date", "Entry", "Property", "Amount", "Preview"]);
    expect(within(row).queryByText("July rent")).toBeNull();
    expect(within(row).queryByText("Rent & Income")).toBeNull();

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelectEntry).toHaveBeenCalledWith(entry.id);
  });

  it("keeps the empty ledger state inside semantic table markup", () => {
    render(
      <LedgerTable entries={[]} onSelectEntry={vi.fn()} selectedEntryId="" />,
    );

    const table = screen.getByRole("table");
    const emptyCell = within(table).getByText(
      "No ledger rows match the current filters.",
    );

    expect(emptyCell.tagName).toBe("TD");
    expect(emptyCell.getAttribute("colspan")).toBe("5");
    expect(emptyCell.closest("tr")?.classList.contains("border-t")).toBe(true);
  });
});

const entry: LedgerEntry = {
  activity: [],
  amount: 1_200,
  category: "Rent",
  currency: "USD",
  description: "July rent",
  direction: "income",
  documents: [],
  hrefs: {
    documents: "/documents?entryId=ledger-1",
    ledger: "/ledger?entryId=ledger-1",
    property: "/properties/property-1",
    reports: "/reports",
    timeline: "/financial-timeline?entryId=ledger-1",
  },
  id: "ledger-1",
  isLocked: false,
  nextAction: {
    description: "Review supporting record",
    href: "/ledger?entryId=ledger-1",
    label: "Review",
    tone: "neutral",
  },
  propertyCode: "HOME",
  propertyId: "property-1",
  propertyName: "Home",
  recordCounts: { activity: 0, documents: 0, timelineEvents: 1 },
  riskIndicators: [],
  sourceId: "allocation-1",
  sourceLabel: "Rent & Income",
  sourceResolved: true,
  sourceType: "receipt_allocation",
  transactionDate: "2026-07-10",
};
