import { describe, expect, it } from "vitest";
import { filterLedgerEntries } from "@/features/ledger/ledger.filters";
import type { LedgerEntry } from "@/features/ledger/ledger.types";

const entries: LedgerEntry[] = [
  {
    amount: 850,
    category: "Rent",
    currency: "USD",
    description: "June rent payment",
    documents: [],
    direction: "income",
    id: "rent-1",
    isLocked: false,
    propertyCode: "SR",
    propertyId: "property-1",
    propertyName: "Soley Residence",
    transactionDate: "2026-06-01",
    unitNumber: "A1",
  },
  {
    amount: 120,
    archivedAt: "2026-06-16T09:00:00.000Z",
    category: "Maintenance",
    currency: "USD",
    description: "Air-conditioner service",
    documents: [],
    direction: "expense",
    id: "maintenance-1",
    isLocked: false,
    propertyCode: "NB",
    propertyId: "property-2",
    propertyName: "Nestory Building",
    relatedTimelineEvent: {
      id: "timeline-1",
      title: "Expense - Air-conditioner service",
    },
    transactionDate: "2026-06-04",
  },
];

describe("filterLedgerEntries", () => {
  it("filters by direction and property", () => {
    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        direction: "income",
        propertyId: "property-1",
        query: "",
      }),
    ).toEqual([entries[0]]);
  });

  it("matches query tokens across linked record fields", () => {
    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        direction: "all",
        propertyId: "all",
        query: "service NB",
      }),
    ).toEqual([entries[1]]);
  });

  it("matches linked timeline event titles", () => {
    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        direction: "all",
        propertyId: "all",
        query: "expense air-conditioner",
      }),
    ).toEqual([entries[1]]);
  });

  it("hides archived rows by default and can filter to archive view", () => {
    expect(
      filterLedgerEntries(entries, {
        direction: "all",
        propertyId: "all",
        query: "",
      }),
    ).toEqual([entries[0]]);

    expect(
      filterLedgerEntries(entries, {
        archiveState: "archived",
        direction: "all",
        propertyId: "all",
        query: "",
      }),
    ).toEqual([entries[1]]);
  });
});
