import { describe, expect, it } from "vitest";
import { filterLedgerEntries } from "@/features/ledger/ledger.filters";
import type { LedgerEntry } from "@/features/ledger/ledger.types";

const entries: LedgerEntry[] = [
  {
    amount: 850,
    category: "Rent",
    currency: "USD",
    description: "June rent payment",
    direction: "income",
    id: "rent-1",
    propertyCode: "SR",
    propertyId: "property-1",
    propertyName: "Soley Residence",
    transactionDate: "2026-06-01",
    unitNumber: "A1",
  },
  {
    amount: 120,
    category: "Maintenance",
    currency: "USD",
    description: "Air-conditioner service",
    direction: "expense",
    id: "maintenance-1",
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
        direction: "income",
        propertyId: "property-1",
        query: "",
      }),
    ).toEqual([entries[0]]);
  });

  it("matches query tokens across linked record fields", () => {
    expect(
      filterLedgerEntries(entries, {
        direction: "all",
        propertyId: "all",
        query: "service NB",
      }),
    ).toEqual([entries[1]]);
  });

  it("matches linked timeline event titles", () => {
    expect(
      filterLedgerEntries(entries, {
        direction: "all",
        propertyId: "all",
        query: "expense air-conditioner",
      }),
    ).toEqual([entries[1]]);
  });
});
