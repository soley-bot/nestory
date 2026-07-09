import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEDGER_VIEW_QUERY,
  buildLedgerPagination,
  buildLedgerSnapshotFromEntries,
  filterLedgerEntries,
  getLedgerTransactionDateScope,
  parseLedgerSearchParams,
  sortLedgerEntries,
} from "@/features/ledger/ledger.filters";
import {
  getLedgerCreateInitialValues,
  getLedgerReviewContext,
} from "@/features/ledger/components/ledger-screen";
import type { LedgerEntry } from "@/features/ledger/ledger.types";

const entries: LedgerEntry[] = [
  withLedgerDetailContext({
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
    unitId: "unit-a1",
    unitNumber: "A1",
  }),
  withLedgerDetailContext({
    amount: 2400,
    category: "Roof",
    currency: "USD",
    description: "May roof repair",
    documents: [],
    direction: "expense",
    id: "roof-1",
    isLocked: false,
    propertyCode: "SR",
    propertyId: "property-1",
    propertyName: "Soley Residence",
    transactionDate: "2026-05-24",
    unitId: "unit-a2",
    unitNumber: "A2",
  }),
  withLedgerDetailContext({
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
  }),
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

  it("filters by supported unit route state", () => {
    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        direction: "all",
        propertyId: "property-1",
        query: "",
        unitId: "unit-a2",
      }),
    ).toEqual([entries[1]]);
  });

  it("matches query tokens across linked record fields", () => {
    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        direction: "all",
        propertyId: "all",
        query: "service NB",
      }),
    ).toEqual([entries[2]]);
  });

  it("matches linked timeline event titles", () => {
    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        direction: "all",
        propertyId: "all",
        query: "expense air-conditioner",
      }),
    ).toEqual([entries[2]]);
  });

  it("hides archived rows by default and can filter to archive view", () => {
    expect(
      filterLedgerEntries(entries, {
        direction: "all",
        propertyId: "all",
        query: "",
      }),
    ).toEqual([entries[0], entries[1]]);

    expect(
      filterLedgerEntries(entries, {
        archiveState: "archived",
        direction: "all",
        propertyId: "all",
        query: "",
      }),
    ).toEqual([entries[2]]);
  });

  it("filters by current month, explicit date range, and minimum amount", () => {
    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        currentDate: new Date("2026-06-26T12:00:00.000Z"),
        direction: "all",
        period: "current_month",
        propertyId: "all",
        query: "",
      }).map((entry) => entry.id),
    ).toEqual(["rent-1", "maintenance-1"]);

    expect(
      filterLedgerEntries(entries, {
        archiveState: "all",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-31",
        direction: "all",
        minAmount: 1000,
        propertyId: "all",
        query: "",
      }).map((entry) => entry.id),
    ).toEqual(["roof-1"]);
  });
});

function withLedgerDetailContext(
  entry: Omit<
    LedgerEntry,
    | "activity"
    | "hrefs"
    | "nextAction"
    | "recordCounts"
    | "riskIndicators"
    | "sourceId"
    | "sourceLabel"
    | "sourceType"
  >,
): LedgerEntry {
  return {
    ...entry,
    activity: [],
    hrefs: {
      documents: `/documents?query=${encodeURIComponent(entry.category)}`,
      ledger: `/ledger?archiveState=all&entryId=${entry.id}`,
      property: `/properties/${entry.propertyId}`,
      reports: "/reports",
      timeline: entry.relatedTimelineEvent
        ? `/timeline?archiveState=all&eventId=${entry.relatedTimelineEvent.id}`
        : "/timeline",
      unit: entry.unitId ? `/units/${entry.unitId}` : undefined,
    },
    nextAction: {
      description: "Review the synced timeline event and reporting context.",
      href: "/timeline",
      label: "Review timeline",
      tone: "neutral",
    },
    recordCounts: {
      activity: 0,
      documents: entry.documents.length,
      timelineEvents: entry.relatedTimelineEvent ? 1 : 0,
    },
    riskIndicators: [],
    sourceLabel: entry.direction === "income" ? "Rent & Income" : "Manual",
    sourceType: entry.direction === "income" ? "finance_income" : "manual",
  };
}

describe("parseLedgerSearchParams", () => {
  it("normalizes URL state for server-backed ledger views", () => {
    expect(
      parseLedgerSearchParams({
        archiveState: "archived",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-30",
        direction: "expense",
        entryId: "33333333-3333-4333-8333-333333333333",
        minAmount: "500.75",
        page: "3",
        pageSize: "50",
        period: "last_30_days",
        propertyId: "11111111-1111-4111-8111-111111111111",
        query: "  roof   repair  ",
        sort: "amount_desc",
        unitId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      archiveState: "archived",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      direction: "expense",
      entryId: "33333333-3333-4333-8333-333333333333",
      minAmount: 500.75,
      page: 3,
      pageSize: 50,
      period: "last_30_days",
      propertyId: "11111111-1111-4111-8111-111111111111",
      query: "roof   repair",
      sort: "amount_desc",
      unitId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("falls back when params are invalid", () => {
    expect(
      parseLedgerSearchParams({
        archiveState: "deleted",
        dateFrom: "2026-02-31",
        dateTo: "next-week",
        direction: "transfer",
        entryId: "not-a-uuid",
        minAmount: "0",
        page: "-1",
        pageSize: "500",
        period: "last_month",
        propertyId: "not-a-uuid",
        sort: "category_desc",
        unitId: "not-a-uuid",
      }),
    ).toMatchObject({
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
      sort: "date_desc",
      unitId: "all",
    });
  });

  it("builds inclusive ledger date scopes for URLs", () => {
    expect(
      getLedgerTransactionDateScope(
        {
          dateFrom: "",
          dateTo: "",
          period: "last_30_days",
        },
        new Date("2026-06-26T12:00:00.000Z"),
      ),
    ).toEqual({
      before: "2026-06-27",
      from: "2026-05-27",
    });

    expect(
      getLedgerTransactionDateScope(
        {
          dateFrom: "",
          dateTo: "",
          period: "current_month",
        },
        new Date("2026-06-26T12:00:00.000Z"),
      ),
    ).toEqual({
      before: "2026-07-01",
      from: "2026-06-01",
    });

    expect(
      getLedgerTransactionDateScope({
        dateFrom: "2026-06-10",
        dateTo: "2026-06-30",
        period: "all",
      }),
    ).toEqual({
      before: "2026-07-01",
      from: "2026-06-10",
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

    expect(sorted.map((entry) => entry.id)).toEqual([
      "roof-1",
      "rent-1",
      "maintenance-1",
    ]);
    expect(pagination).toMatchObject({
      from: 2,
      page: 2,
      pageSize: 1,
      to: 2,
      totalCount: 3,
      totalPages: 3,
    });
  });

  it("summarizes the filtered rows, not only a visible page", () => {
    const snapshot = buildLedgerSnapshotFromEntries(entries, "2");

    expect(snapshot.entryCount).toBe("3");
    expect(snapshot.totalIncome.primary).toBe("USD 850.00");
    expect(snapshot.totalExpense.primary).toBe("USD 2,520.00");
    expect(snapshot.lockedPeriodCount).toBe("2");
  });
});

describe("ledger create defaults", () => {
  it("carries an expense route into the add-entry drawer", () => {
    expect(
      getLedgerCreateInitialValues(
        { ...DEFAULT_LEDGER_VIEW_QUERY, direction: "expense" },
        [],
        [],
      ),
    ).toEqual({ direction: "expense" });
  });
});

describe("ledger review context", () => {
  it("keeps dashboard large-expense threshold visible in the landing state", () => {
    expect(
      getLedgerReviewContext(
        {
          ...DEFAULT_LEDGER_VIEW_QUERY,
          direction: "expense",
          minAmount: 1000,
          period: "last_30_days",
          sort: "amount_desc",
        },
        {
          hasFocusedEntry: false,
          hasFocusedEntryIntent: false,
        },
      ),
    ).toMatchObject({
      countLabel: "from recent expenses at 1,000 or more",
      description:
        "Dashboard expense review shows expenses from the last 30 days at 1,000 or more.",
    });
  });
});
