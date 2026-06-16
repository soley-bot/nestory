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
});
