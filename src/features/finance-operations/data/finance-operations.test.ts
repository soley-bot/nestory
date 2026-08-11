import { describe, expect, it, vi } from "vitest";
import {
  fetchAllActionableRows,
  mergeRowsById,
  toExpenseSubmissionSummary,
} from "@/features/finance-operations/data/finance-operations";
import type { Database } from "@/types/database";

describe("fetchAllActionableRows", () => {
  it("keeps actionable rows reachable beyond the old 250-row cap", async () => {
    const source = Array.from({ length: 620 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));

    await expect(fetchAllActionableRows(fetchPage, 250)).resolves.toEqual({
      data: source,
      error: null,
    });
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 500, 749);
  });
});

describe("mergeRowsById", () => {
  it("keeps an older actionable invoice beyond a newer 250-row history window", () => {
    const history = Array.from({ length: 250 }, (_, index) => ({
      id: `other-property-${index}`,
      propertyId: "property-2",
    }));
    const olderOpenInvoice = {
      id: "older-open-invoice",
      propertyId: "property-1",
    };

    const merged = mergeRowsById([olderOpenInvoice], history);

    expect(merged).toHaveLength(251);
    expect(merged).toContainEqual(olderOpenInvoice);
  });

  it("deduplicates actionable invoices already present in recent history", () => {
    expect(
      mergeRowsById(
        [{ id: "invoice-1", status: "open" }],
        [{ id: "invoice-1", status: "history" }],
      ),
    ).toEqual([{ id: "invoice-1", status: "open" }]);
  });
});

describe("toExpenseSubmissionSummary", () => {
  it("keeps a submitted expense visible after its label records are archived", () => {
    const submission = {
      adjusts_submission_id: null,
      customer_category: "maintenance",
      customer_total_amount: 125,
      expense_date: "2026-08-08",
      id: "submission-1",
      internal_cost_amount: 100,
      internal_markup_amount: 25,
      previously_approved_amount: null,
      property_id: "property-1",
      reconciliation_source_id: "source-1",
      recorded_total_amount: 100,
      reference: "Receipt 123",
      responsibility: "owner",
      review_reason: null,
      reversal_reason: null,
      source_id: "task-1",
      source_type: "maintenance_task",
      status: "submitted",
      submitted_at: "2026-08-08T08:00:00Z",
      unit_id: "unit-1",
      vendor_label: "Archived Vendor",
    } as Database["public"]["Tables"]["expense_submissions"]["Row"];

    const summary = toExpenseSubmissionSummary(
      submission,
      new Map([
        [
          "property-1",
          {
            archived_at: "2026-08-08T09:00:00Z",
            code: "P-001",
            id: "property-1",
            name: "Archived Property",
          },
        ],
      ]),
      new Map([
        [
          "unit-1",
          {
            archived_at: "2026-08-08T09:00:00Z",
            id: "unit-1",
            property_id: "property-1",
            unit_number: "A-01",
          },
        ],
      ]),
      new Map([["source-1", "BANK · Archived operating account"]]),
      new Map([
        [
          "submission-1",
          {
            documentId: "document-1",
            fileName: "receipt.pdf",
            mimeType: "application/pdf",
            sha256:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            sizeBytes: 128,
          },
        ],
      ]),
      new Map([
        [
          "task-1",
          {
            completed_at: "2026-08-08T07:30:00Z",
            description: "Replace the failed pump and verify pressure.",
            id: "task-1",
            status: "completed",
            title: "Garden Court pump replacement",
          },
        ],
      ]),
    );

    expect(summary).toMatchObject({
      fundingSourceLabel: "BANK · Archived operating account",
      id: "submission-1",
      maintenanceTask: {
        completedAt: "2026-08-08T07:30:00Z",
        description: "Replace the failed pump and verify pressure.",
        href: "/maintenance?archiveState=all&taskId=task-1",
        status: "completed",
        title: "Garden Court pump replacement",
      },
      evidence: {
        sha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sizeBytes: 128,
      },
      status: "submitted",
    });
    expect(summary.propertyLabel).toContain("Archived Property");
    expect(summary.unitLabel).toContain("A-01");
  });

  it("uses stable fallbacks instead of dropping rows with unavailable labels", () => {
    const submission = {
      adjusts_submission_id: null,
      customer_category: "other",
      customer_total_amount: 10,
      expense_date: "2026-08-08",
      id: "submission-2",
      internal_cost_amount: 10,
      internal_markup_amount: 0,
      previously_approved_amount: null,
      property_id: "missing-property",
      reconciliation_source_id: null,
      recorded_total_amount: null,
      reference: "Manual evidence",
      responsibility: "owner",
      review_reason: null,
      reversal_reason: null,
      source_id: null,
      source_type: "general",
      status: "rejected",
      submitted_at: "2026-08-08T08:00:00Z",
      unit_id: "missing-unit",
      vendor_label: "Vendor",
    } as Database["public"]["Tables"]["expense_submissions"]["Row"];

    expect(
      toExpenseSubmissionSummary(
        submission,
        new Map(),
        new Map(),
        new Map(),
        new Map(),
      ),
    ).toMatchObject({
      propertyLabel: "Property unavailable",
      unitLabel: "Unit unavailable",
    });
  });
});
