import { describe, expect, it } from "vitest";
import { toRecentChange } from "@/features/activity/recent-changes";

describe("toRecentChange", () => {
  it("labels ledger-driven timeline syncs clearly", () => {
    expect(
      toRecentChange({
        action: "updated_from_ledger",
        created_at: "2026-06-16T10:15:00.000Z",
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
      recordLabel: "Rent",
      tone: "warning",
    });
  });

  it("uses readable labels for linked timeline archives without title snapshots", () => {
    expect(
      toRecentChange({
        action: "archived_from_ledger",
        created_at: "2026-06-16T12:00:00.000Z",
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
      recordLabel: "Timeline event",
      tone: "warning",
    });
  });

  it("hides system IDs and summarizes reference changes", () => {
    expect(
      toRecentChange({
        action: "updated",
        created_at: "2026-06-16T13:00:00.000Z",
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
      recordLabel: "04-02",
      tone: "warning",
    });
  });
});
