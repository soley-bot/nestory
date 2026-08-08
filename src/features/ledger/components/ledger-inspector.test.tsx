/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LedgerInspector } from "@/features/ledger/components/ledger-inspector";
import type { LedgerEntry } from "@/features/ledger/ledger.types";

afterEach(() => {
  cleanup();
});

describe("LedgerInspector managed receipt projections", () => {
  it("keeps receipt evidence visible without forbidden lifecycle actions", () => {
    const entry = receiptProjection();
    const callbacks = {
      onAttachReceipt: vi.fn(),
    };

    const view = render(<LedgerInspector entry={entry} {...callbacks} />);

    expect(screen.getByText("Rent & Income")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Attach receipt" })).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit ledger entry" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Archive ledger entry" }),
    ).toBeNull();
    expect(screen.queryByText(/accounting|journal/i)).toBeNull();
    expect(screen.getByText("Source linked")).not.toBeNull();

    view.rerender(
      <LedgerInspector
        entry={{ ...entry, archivedAt: "2026-07-11T00:00:00.000Z" }}
        {...callbacks}
      />,
    );

    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
});

function receiptProjection(): LedgerEntry {
  return {
    activity: [],
    amount: -100,
    category: "Rent receipt reversal",
    currency: "USD",
    description: "Returned tenant receipt",
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
      description: "Review the source receipt.",
      href: "/rent-income",
      label: "Review receipt",
      tone: "neutral",
    },
    propertyCode: "HOME",
    propertyId: "property-1",
    propertyName: "Home",
    recordCounts: { activity: 0, documents: 0, timelineEvents: 0 },
    riskIndicators: [],
    sourceId: "allocation-1",
    reversalOfLedgerEntryId: "ledger-original",
    sourceLabel: "Rent & Income",
    sourceType: "receipt_allocation",
    transactionDate: "2026-07-10",
  };
}
