import { describe, expect, it } from "vitest";
import { toRecentChange } from "@/features/activity/recent-changes";

describe("toRecentChange", () => {
  it("shows maintenance reopen instructions in activity history", () => {
    const change = toRecentChange({
      action: "maintenance_task_completion_reopened",
      created_at: "2026-07-13T00:00:00.000Z",
      entity_id: "task-1",
      entity_type: "task",
      id: "activity-1",
      new_values: {
        review_note: "Tighten the fitting before resubmitting.",
        status: "in_progress",
      },
      previous_values: { status: "ready_for_review" },
    });

    expect(change.actionLabel).toBe("Completion returned");
    expect(change.tone).toBe("warning");
    expect(change.details).toContainEqual({
      after: "Tighten the fitting before resubmitting.",
      before: "-",
      field: "Review note",
    });
  });

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

  it("links unit import activity back to the import workflow", () => {
    expect(
      toRecentChange({
        action: "unit_import_committed",
        created_at: "2026-06-17T09:05:00.000Z",
        entity_id: "57575757-5757-4575-8575-575757575757",
        entity_type: "import",
        id: "log-unit-import",
        new_values: {
          created_count: 2,
          import_type: "unit",
          row_count: 3,
          source_row_numbers: [2, 3, 4],
          updated_count: 1,
        },
        previous_values: null,
      }),
    ).toEqual({
      action: "unit_import_committed",
      actionLabel: "Unit import committed",
      createdAt: "2026-06-17T09:05:00.000Z",
      details: [
        {
          after: "2",
          before: "-",
          field: "Created",
        },
        {
          after: "unit",
          before: "-",
          field: "Import type",
        },
        {
          after: "3",
          before: "-",
          field: "Rows",
        },
        {
          after: "[2,3,4]",
          before: "-",
          field: "Source rows",
        },
        {
          after: "1",
          before: "-",
          field: "Updated",
        },
      ],
      entityLabel: "Import",
      href: "/import",
      id: "log-unit-import",
      recordLabel: "Import batch",
      tone: "success",
    });
  });

  it("surfaces unit status changes as status history", () => {
    expect(
      toRecentChange({
        action: "unit_updated",
        created_at: "2026-06-17T09:15:00.000Z",
        entity_id: "56565656-5656-4565-8565-565656565656",
        entity_type: "unit",
        id: "log-unit-status",
        new_values: {
          status: "maintenance",
          unit_number: "04-02",
        },
        previous_values: {
          status: "vacant",
          unit_number: "04-02",
        },
      }),
    ).toMatchObject({
      actionLabel: "Status changed",
      details: [
        {
          after: "maintenance",
          before: "vacant",
          field: "Status",
        },
      ],
      entityLabel: "Unit",
      href: "/units/56565656-5656-4565-8565-565656565656",
      recordLabel: "04-02",
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

  it("labels finance workflow activity and links to the owning module", () => {
    expect(
      toRecentChange({
        action: "payment_recorded",
        created_at: "2026-07-08T09:00:00.000Z",
        entity_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        entity_type: "finance_income_item",
        id: "log-finance-income",
        new_values: {
          amount_received: 500,
          payer_label: "John Smith",
          status: "received",
        },
        previous_values: {
          amount_received: 0,
          status: "open",
        },
      }),
    ).toMatchObject({
      actionLabel: "Payment recorded",
      entityLabel: "Rent & Income",
      href: "/rent-income?query=John+Smith",
      recordLabel: "John Smith",
    });

    expect(
      toRecentChange({
        action: "posted",
        created_at: "2026-07-08T09:05:00.000Z",
        entity_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        entity_type: "finance_expense_item",
        id: "log-finance-expense",
        new_values: {
          expense_type: "maintenance",
          ledger_entry_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      actionLabel: "Posted to ledger",
      entityLabel: "Bills & Expenses",
      href: "/bills-expenses?query=maintenance",
      recordLabel: "maintenance",
    });
  });

  it("labels petty cash activity without inventing a brittle row focus link", () => {
    expect(
      toRecentChange({
        action: "posted_to_ledger",
        created_at: "2026-07-08T09:10:00.000Z",
        entity_id: "abababab-abab-4aba-8aba-abababababab",
        entity_type: "petty_cash_entry",
        id: "log-petty-cash",
        new_values: {
          ledger_entry_id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
          status: "posted",
        },
        previous_values: {
          ledger_entry_id: null,
          status: "cleared",
        },
      }),
    ).toMatchObject({
      actionLabel: "Posted to ledger",
      entityLabel: "Petty Cash",
      href: "/petty-cash",
      recordLabel: "Petty cash row",
      tone: "accent",
    });
  });

  it("preserves lease focus ids with a useful tenant query", () => {
    expect(
      toRecentChange({
        action: "lease_updated",
        created_at: "2026-06-17T10:00:00.000Z",
        entity_id: "77777777-7777-4777-8777-777777777777",
        entity_type: "lease",
        id: "log-7",
        new_values: {
          tenant_name: "John Smith",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      entityLabel: "Lease",
      href: "/leases?archiveState=all&leaseId=77777777-7777-4777-8777-777777777777&query=John+Smith",
      recordLabel: "John Smith",
    });
  });

  it("preserves person focus ids with a useful display-name query", () => {
    expect(
      toRecentChange({
        action: "updated",
        created_at: "2026-06-17T10:30:00.000Z",
        entity_id: "88888888-8888-4888-8888-888888888888",
        entity_type: "person",
        id: "log-8",
        new_values: {
          display_name: "Jane Owner",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      entityLabel: "Person",
      href: "/people/88888888-8888-4888-8888-888888888888",
      recordLabel: "Jane Owner",
    });
  });

  it("preserves document focus ids with a useful file-name query", () => {
    expect(
      toRecentChange({
        action: "document_attached",
        created_at: "2026-06-17T10:45:00.000Z",
        entity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        entity_type: "document",
        id: "log-document",
        new_values: {
          category: "Lease",
          file_name: "signed lease.pdf",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      entityLabel: "Document",
      href: "/documents?archiveState=all&documentId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&query=signed+lease.pdf",
      recordLabel: "signed lease.pdf",
    });
  });

  it("labels document replacement activity", () => {
    expect(
      toRecentChange({
        action: "document_replaced",
        created_at: "2026-06-17T10:48:00.000Z",
        entity_id: "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
        entity_type: "document",
        id: "log-document-replaced",
        new_values: {
          category: "Lease",
          file_name: "renewed lease.pdf",
          mime_type: "application/pdf",
          size_bytes: 2048,
        },
        previous_values: {
          category: "Lease",
          file_name: "old lease.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
        },
      }),
    ).toMatchObject({
      actionLabel: "File replaced",
      details: [
        {
          after: "renewed lease.pdf",
          before: "old lease.pdf",
          field: "File name",
        },
        {
          after: "2048",
          before: "1024",
          field: "File size",
        },
      ],
      entityLabel: "Document",
      href: "/documents?archiveState=all&documentId=bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc&query=renewed+lease.pdf",
      recordLabel: "renewed lease.pdf",
    });
  });

  it("links archived maintenance case activity to the focused case", () => {
    expect(
      toRecentChange({
        action: "archived",
        created_at: "2026-06-17T10:50:00.000Z",
        entity_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        entity_type: "task",
        id: "log-maintenance",
        new_values: {
          title: "Fix AC leak",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      actionLabel: "Archived",
      entityLabel: "Maintenance",
      href: "/maintenance?archiveState=all&query=Fix+AC+leak&taskId=cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      recordLabel: "Fix AC leak",
      tone: "warning",
    });
  });

  it("does not add brittle fallback text queries to focused lease and person links", () => {
    expect(
      toRecentChange({
        action: "lease_updated",
        created_at: "2026-06-17T11:00:00.000Z",
        entity_id: "99999999-9999-4999-8999-999999999999",
        entity_type: "lease",
        id: "log-9",
        new_values: {
          status: "active",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      href: "/leases?archiveState=all&leaseId=99999999-9999-4999-8999-999999999999",
      recordLabel: "Lease",
    });

    expect(
      toRecentChange({
        action: "updated",
        created_at: "2026-06-17T11:30:00.000Z",
        entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        entity_type: "person",
        id: "log-10",
        new_values: {
          primary_phone: "012 345 678",
        },
        previous_values: null,
      }),
    ).toMatchObject({
      href: "/people/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      recordLabel: "Person",
    });
  });

  it("does not expose Petty Cash implementation UUIDs in activity details", () => {
    const change = toRecentChange({
      action: "posted_to_ledger",
      created_at: "2026-07-23T11:30:00.000Z",
      entity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      entity_type: "petty_cash_entry",
      id: "log-petty-cash",
      new_values: {
        account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        accounting_journal_entry_id:
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        counterparty_person_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        custodian_person_id: "12121212-1212-4121-8121-121212121212",
        period_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        status: "posted",
        voided_by: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
      previous_values: null,
    });

    expect(change.details).toEqual([
      {
        after: "posted",
        before: "-",
        field: "Status",
      },
    ]);
  });
});
