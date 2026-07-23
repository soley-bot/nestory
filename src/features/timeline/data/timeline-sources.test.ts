import { describe, expect, it } from "vitest";
import {
  assembleTimelineSourceReferences,
  countAvailableTimelineSources,
  loadTimelineSourcesByEventId,
  type TimelineSourceCandidate,
} from "@/features/timeline/data/timeline-sources";

const ids = {
  document: "11111111-1111-4111-8111-111111111111",
  expense: "22222222-2222-4222-8222-222222222222",
  income: "33333333-3333-4333-8333-333333333333",
  lease: "44444444-4444-4444-8444-444444444444",
  ledger: "55555555-5555-4555-8555-555555555555",
  pettyCash: "66666666-6666-4666-8666-666666666666",
  task: "77777777-7777-4777-8777-777777777777",
};

describe("assembleTimelineSourceReferences", () => {
  it("orders the operational origin before lease, ledger, and documents", () => {
    const sources = assembleTimelineSourceReferences([
      candidate("document", ids.document, "Inspection.pdf"),
      candidate("ledger_entry", ids.ledger, "Expense - Repairs"),
      candidate("lease", ids.lease, "John Smith / Unit 3B"),
      candidate("task", ids.task, "Leaking pipe"),
    ]);

    expect(sources.map((source) => source.entityType)).toEqual([
      "task",
      "lease",
      "ledger_entry",
      "document",
    ]);
    expect(
      sources.map((source) =>
        source.availability === "available" ? source.href : undefined,
      ),
    ).toEqual([
      `/maintenance?archiveState=all&taskId=${ids.task}`,
      `/leases?archiveState=all&leaseId=${ids.lease}`,
      `/ledger?archiveState=all&entryId=${ids.ledger}`,
      `/documents?archiveState=all&documentId=${ids.document}`,
    ]);
  });

  it("deduplicates identical source records", () => {
    const source = candidate("finance_income_item", ids.income, "July rent");

    expect(assembleTimelineSourceReferences([source, source])).toHaveLength(1);
  });

  it("keeps archived source status", () => {
    expect(
      assembleTimelineSourceReferences([
        { ...candidate("finance_expense_item", ids.expense, "Valve"), isArchived: true },
      ]),
    ).toMatchObject([{ isArchived: true }]);
  });

  it("keeps a controlled unavailable origin without exposing an id or href", () => {
    expect(
      assembleTimelineSourceReferences([
        {
          availability: "unavailable",
          entityType: "petty_cash_entry",
          label: "Source record unavailable",
          moduleLabel: "Petty Cash",
        },
      ]),
    ).toEqual([
      {
        availability: "unavailable",
        entityType: "petty_cash_entry",
        label: "Source record unavailable",
        moduleLabel: "Petty Cash",
      },
    ]);
  });

  it("does not invent an operational origin for a manual ledger entry", () => {
    expect(
      assembleTimelineSourceReferences([
        candidate("ledger_entry", ids.ledger, "Manual adjustment"),
      ]).map((source) => source.entityType),
    ).toEqual(["ledger_entry"]);
  });

  it("counts only resolved source records", () => {
    const sources = assembleTimelineSourceReferences([
      candidate("ledger_entry", ids.ledger, "Manual adjustment"),
      {
        availability: "unavailable",
        entityType: "petty_cash_entry",
        label: "Source record unavailable",
        moduleLabel: "Petty Cash",
      },
    ]);

    expect(countAvailableTimelineSources(sources)).toBe(1);
  });
});

describe("loadTimelineSourcesByEventId", () => {
  it("loads each needed source table once for the whole event page and scopes every query", async () => {
    const organizationId = "88888888-8888-4888-8888-888888888888";
    const eventA = "99999999-9999-4999-8999-999999999991";
    const eventB = "99999999-9999-4999-8999-999999999992";
    const ledgerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const ledgerB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    const incomeA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
    const incomeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
    const queryCalls: QueryCall[] = [];
    const supabase = createSupabaseStub(
      {
        finance_income_items: [
          {
            archived_at: null,
            id: incomeA,
            income_type: "rent",
            payer_label: "John Smith",
            reference: "JUL-RENT",
          },
          {
            archived_at: null,
            id: incomeB,
            income_type: "rent",
            payer_label: "Jane Doe",
            reference: null,
          },
        ],
        tasks: [
          {
            archived_at: null,
            id: ids.task,
            timeline_event_id: eventA,
            title: "Leaking pipe",
          },
        ],
      },
      queryCalls,
    );

    const sources = await loadTimelineSourcesByEventId({
      documents: [],
      events: [
        { id: eventA, leaseId: null, ledgerEntryId: ledgerA },
        { id: eventB, leaseId: null, ledgerEntryId: ledgerB },
      ],
      leases: [],
      ledgerEntries: [
        {
          archivedAt: null,
          category: "Rent",
          direction: "income",
          id: ledgerA,
          sourceId: incomeA,
          sourceType: "finance_income",
        },
        {
          archivedAt: null,
          category: "Rent",
          direction: "income",
          id: ledgerB,
          sourceId: incomeB,
          sourceType: "finance_income",
        },
      ],
      organizationId,
      supabase: supabase as never,
    });

    expect(queryCalls.map((call) => call.table)).toEqual([
      "tasks",
      "finance_income_items",
    ]);
    expect(queryCalls.every((call) => call.organizationId === organizationId)).toBe(
      true,
    );
    expect(sources.get(eventA)?.map((source) => source.entityType)).toEqual([
      "task",
      "finance_income_item",
      "ledger_entry",
    ]);
    expect(sources.get(eventB)?.map((source) => source.entityType)).toEqual([
      "finance_income_item",
      "ledger_entry",
    ]);
  });

  it("returns an unavailable origin when an authoritative ledger source cannot be resolved", async () => {
    const eventId = "99999999-9999-4999-8999-999999999993";
    const ledgerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
    const sources = await loadTimelineSourcesByEventId({
      documents: [],
      events: [{ id: eventId, leaseId: null, ledgerEntryId: ledgerId }],
      leases: [],
      ledgerEntries: [
        {
          archivedAt: null,
          category: "Petty Cash",
          direction: "expense",
          id: ledgerId,
          sourceId: ids.pettyCash,
          sourceType: "petty_cash",
        },
      ],
      organizationId: "88888888-8888-4888-8888-888888888888",
      supabase: createSupabaseStub(
        { petty_cash_entries: [], tasks: [] },
        [],
      ) as never,
    });

    expect(sources.get(eventId)?.[0]).toEqual({
      availability: "unavailable",
      entityType: "petty_cash_entry",
      label: "Source record unavailable",
      moduleLabel: "Petty Cash",
    });
  });
});

function candidate(
  entityType: AvailableTimelineSourceCandidate["entityType"],
  entityId: string,
  label: string,
): AvailableTimelineSourceCandidate {
  return {
    availability: "available",
    entityId,
    entityType,
    isArchived: false,
    label,
  };
}

type AvailableTimelineSourceCandidate = Extract<
  TimelineSourceCandidate,
  { availability: "available" }
>;

type QueryCall = {
  organizationId?: string;
  table: string;
};

function createSupabaseStub(
  results: Record<string, unknown[]>,
  calls: QueryCall[],
) {
  return {
    from(table: string) {
      const call: QueryCall = { table };
      calls.push(call);
      const query = {
        eq(column: string, value: string) {
          if (column === "organization_id") {
            call.organizationId = value;
          }
          return query;
        },
        in() {
          return Promise.resolve({ data: results[table] ?? [], error: null });
        },
        select() {
          return query;
        },
      };

      return query;
    },
  };
}
