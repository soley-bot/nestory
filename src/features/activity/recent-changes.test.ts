import { describe, expect, it } from "vitest";
import { toRecentChange } from "@/features/activity/recent-changes";

describe("toRecentChange", () => {
  it("labels ledger-driven timeline syncs clearly", () => {
    expect(
      toRecentChange({
        action: "updated_from_ledger",
        created_at: "2026-06-16T10:15:00.000Z",
        entity_id: "11111111-1111-4111-8111-111111111111",
        entity_type: "timeline_event",
        id: "log-1",
        new_values: {
          title: "Expense - Maintenance",
        },
        previous_values: null,
      }),
    ).toEqual({
      action: "updated_from_ledger",
      actionLabel: "Synced from ledger",
      createdAt: "2026-06-16T10:15:00.000Z",
      details: [
        {
          after: "Expense - Maintenance",
          before: "-",
          field: "Title",
        },
      ],
      entityLabel: "Timeline",
      href: "/timeline?archiveState=all&eventId=11111111-1111-4111-8111-111111111111&query=Expense+-+Maintenance",
      id: "log-1",
      recordLabel: "Expense - Maintenance",
      tone: "accent",
    });
  });

  it("falls back to ledger category labels for archived entries", () => {
    expect(
      toRecentChange({
        action: "archived",
        created_at: "2026-06-16T11:00:00.000Z",
        entity_id: "22222222-2222-4222-8222-222222222222",
        entity_type: "ledger_entry",
        id: "log-2",
        new_values: {
          archived_at: "2026-06-16T11:00:00.000Z",
        },
        previous_values: {
          category: "Rent",
        },
      }),
    ).toMatchObject({
      actionLabel: "Archived",
      entityLabel: "Ledger",
      href: "/ledger?archiveState=all&entryId=22222222-2222-4222-8222-222222222222&query=Rent",
      recordLabel: "Rent",
      tone: "warning",
    });
  });

  it("uses readable labels for linked timeline archives without title snapshots", () => {
    expect(
      toRecentChange({
        action: "archived_from_ledger",
        created_at: "2026-06-16T12:00:00.000Z",
        entity_id: "33333333-3333-4333-8333-333333333333",
        entity_type: "timeline_event",
        id: "log-3",
        new_values: {
          archived_at: "2026-06-16T12:00:00.000Z",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      actionLabel: "Archived from ledger",
      entityLabel: "Timeline",
      href: "/timeline?archiveState=all&eventId=33333333-3333-4333-8333-333333333333",
      recordLabel: "Timeline event",
      tone: "warning",
    });
  });

  it("hides system IDs and summarizes reference changes", () => {
    expect(
      toRecentChange({
        action: "updated",
        created_at: "2026-06-16T13:00:00.000Z",
        entity_id: "44444444-4444-4444-8444-444444444444",
        entity_type: "ledger_entry",
        id: "log-4",
        new_values: {
          id: "1b02731d-0e8d-4c36-9273-754ba8321c71",
          property_id: "new-property-id",
          timeline_event_id: "linked-timeline-id",
          transaction_date: "2026-06-16",
        },
        previous_values: {
          id: "1b02731d-0e8d-4c36-9273-754ba8321c71",
          property_id: "old-property-id",
          timeline_event_id: null,
          transaction_date: "2026-06-15",
        },
      }).details,
    ).toEqual([
      {
        after: "New selection",
        before: "Previous selection",
        field: "Property",
      },
      {
        after: "Linked",
        before: "Not linked",
        field: "Timeline link",
      },
      {
        after: "16 Jun 2026",
        before: "15 Jun 2026",
        field: "Transaction date",
      },
    ]);
  });

  it("labels unit activity from unit number snapshots", () => {
    expect(
      toRecentChange({
        action: "unit_archived",
        created_at: "2026-06-17T09:00:00.000Z",
        entity_id: "55555555-5555-4555-8555-555555555555",
        entity_type: "unit",
        id: "log-5",
        new_values: {
          archived_at: "2026-06-17T09:00:00.000Z",
          status: "vacant",
          unit_number: "04-02",
        },
        previous_values: {
          archived_at: null,
          status: "vacant",
          unit_number: "04-02",
        },
      }),
    ).toMatchObject({
      actionLabel: "Archived",
      entityLabel: "Unit",
      href: "/units/55555555-5555-4555-8555-555555555555",
      recordLabel: "04-02",
      tone: "warning",
    });
  });

  it("links ledger period activity to the affected month", () => {
    expect(
      toRecentChange({
        action: "locked",
        created_at: "2026-06-17T09:00:00.000Z",
        entity_id: "66666666-6666-4666-8666-666666666666",
        entity_type: "ledger_period",
        id: "log-6",
        new_values: {
          period_start: "2026-06-01",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      actionLabel: "Period locked",
      entityLabel: "Period lock",
      href: "/ledger?dateFrom=2026-06-01&dateTo=2026-06-30",
      tone: "warning",
    });
  });
});
