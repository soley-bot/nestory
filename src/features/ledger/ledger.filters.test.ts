import { describe, expect, it } from "vitest";
import {
  buildLedgerPagination,
  buildLedgerSnapshotFromEntries,
  filterLedgerEntries,
  parseLedgerSearchParams,
  sortLedgerEntries,
} from "@/features/ledger/ledger.filters";
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

describe("parseLedgerSearchParams", () => {
  it("normalizes URL state for server-backed ledger views", () => {
    expect(
      parseLedgerSearchParams({
        archiveState: "archived",
        direction: "expense",
        page: "3",
        pageSize: "50",
        propertyId: "11111111-1111-4111-8111-111111111111",
        query: "  roof   repair  ",
        sort: "amount_desc",
      }),
    ).toEqual({
      archiveState: "archived",
      direction: "expense",
      page: 3,
      pageSize: 50,
      propertyId: "11111111-1111-4111-8111-111111111111",
      query: "roof   repair",
      sort: "amount_desc",
    });
  });

  it("falls back when params are invalid", () => {
    expect(
      parseLedgerSearchParams({
        archiveState: "deleted",
        direction: "transfer",
        page: "-1",
        pageSize: "500",
        propertyId: "not-a-uuid",
        sort: "category_desc",
      }),
    ).toMatchObject({
      archiveState: "active",
      direction: "all",
      page: 1,
      pageSize: 50,
      propertyId: "all",
      sort: "date_desc",
    });
  });
});

describe("ledger list helpers", () => {
  it("sorts rows and builds display pagination", () => {
    const sorted = sortLedgerEntries(entries, "amount_desc");
    const pagination = buildLedgerPagination({
      page: 2,
      pageSize: 1,
      totalCount: sorted.length,
    });

    expect(sorted.map((entry) => entry.id)).toEqual(["rent-1", "maintenance-1"]);
    expect(pagination).toMatchObject({
      from: 2,
      page: 2,
      pageSize: 1,
      to: 2,
      totalCount: 2,
      totalPages: 2,
    });
  });

  it("summarizes the filtered rows, not only a visible page", () => {
    const snapshot = buildLedgerSnapshotFromEntries(entries, "2");

    expect(snapshot.entryCount).toBe("2");
    expect(snapshot.totalIncome.primary).toBe("USD 850.00");
    expect(snapshot.totalExpense.primary).toBe("USD 120.00");
    expect(snapshot.lockedPeriodCount).toBe("2");
  });
});
