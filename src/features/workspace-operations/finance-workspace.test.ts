import { describe, expect, it } from "vitest";

import { buildFinanceWorkspaceData } from "@/features/workspace-operations/finance-workspace";
import type {
  ExpenseSubmissionSummary,
  FinanceOperationsData,
} from "@/features/finance-operations/finance-operations.types";

describe("buildFinanceWorkspaceData", () => {
  it("orders Finance Manager review work before secondary finance exceptions", () => {
    const result = buildFinanceWorkspaceData({
      data: financeData({
        expenseSubmissions: [
          submission({
            id: "general-with-evidence",
            submittedAt: "2026-08-03T08:00:00Z",
          }),
          submission({
            evidence: undefined,
            id: "general-missing-evidence",
            submittedAt: "2026-08-02T08:00:00Z",
          }),
          submission({
            id: "maintenance-handoff",
            maintenanceTask: {
              completedAt: "2026-08-01T06:00:00Z",
              description: "Replace the failed pump.",
              href: "/maintenance?archiveState=all&taskId=task-1",
              status: "completed",
              title: "Garden Court pump replacement",
            },
            sourceId: "task-1",
            sourceType: "maintenance_task",
            submittedAt: "2026-08-01T08:00:00Z",
          }),
        ],
        rentGenerationExceptions: [
          {
            attemptCount: 2,
            billingPeriodStart: "2026-08-01",
            code: "billing_missing",
            id: "rent-exception-1",
            lastAttemptAt: "2026-08-04T08:00:00Z",
            leaseId: "lease-1",
            message: "Billing setup is incomplete.",
            propertyId: "property-1",
          },
        ],
      }),
      role: "finance_manager",
      userId: "finance-manager-user",
    });

    expect(result.role).toBe("finance_manager");
    expect(result.queue.map((item) => item.kind)).toEqual([
      "maintenance-cost-review",
      "expense-review",
      "expense-review",
      "rent-exception",
    ]);
    expect(result.queue.map((item) => item.id)).toEqual([
      "maintenance-handoff",
      "general-missing-evidence",
      "general-with-evidence",
      "rent-exception-1",
    ]);
    expect(result.queue[0]).toMatchObject({
      amountDisplay: { primary: "USD 100.00" },
      contextLabel: "Garden Court · Unit G-01",
      submittedByLabel: "finance.member@nestory.com",
      tone: "warning",
    });
    expect(result.queue[1]).toMatchObject({
      amountDisplay: { primary: "USD 100.00" },
      contextLabel: "Garden Court · Unit G-01",
      submittedByLabel: "finance.member@nestory.com",
      tone: "danger",
    });
    expect(result.totals).toEqual({
      awaitingReview: 3,
      maintenanceHandoffs: 1,
      missingEvidence: 1,
      rentExceptions: 1,
    });
  });

  it("keeps receivables out of the Finance Manager review queue", () => {
    const result = buildFinanceWorkspaceData({
      data: financeData({
        ownerInvoices: [
          {
            balanceDue: 75,
            dueDate: "2026-08-11",
            id: "owner-invoice-1",
            invoiceNumber: "OWN-001",
            ownerLabel: "Sokha Lim",
            ownerPersonId: "owner-1",
            paidByOwner: 0,
            paidFromHeldCash: 0,
            paymentStatus: "unpaid",
            propertyId: "property-1",
            propertyLabel: "Garden Court",
            totalAmount: 75,
          },
        ],
        tenantInvoices: [
          {
            balanceDue: 125,
            billingPeriodStart: "2026-08-01",
            collectedByOwner: 0,
            collectionRoute: "through_ips",
            dueDate: "2026-08-10",
            generationSource: "scheduled",
            id: "tenant-invoice-1",
            invoiceNumber: "TEN-001",
            isProrated: false,
            issueDate: "2026-08-01",
            leaseId: "lease-1",
            lines: [],
            occupantLabels: ["Mina Chen"],
            paidThroughIps: 0,
            paymentStatus: "unpaid",
            propertyId: "property-1",
            propertyLabel: "Garden Court",
            recipientLabel: "Mina Chen",
            settlements: [],
            totalAmount: 125,
            unitId: "unit-1",
            unitLabel: "Unit G-01",
          },
        ],
      }),
      role: "finance_manager",
      userId: "finance-manager-user",
    });

    expect(result.queue).toEqual([]);
  });

  it("shows a Finance Member only their rejected, awaiting, and recent approved submissions", () => {
    const result = buildFinanceWorkspaceData({
      data: financeData({
        expenseSubmissions: [
          submission({
            id: "own-awaiting",
            status: "submitted",
            submittedAt: "2026-08-10T08:00:00Z",
          }),
          submission({
            id: "own-rejected",
            reviewReason: "Receipt total is unreadable.",
            status: "rejected",
            submittedAt: "2026-08-11T08:00:00Z",
          }),
          submission({
            id: "own-approved-recent",
            reviewedAt: "2026-08-09T10:00:00Z",
            status: "approved",
            submittedAt: "2026-07-01T08:00:00Z",
          }),
          submission({
            id: "own-approved-old",
            reviewedAt: "2026-06-02T10:00:00Z",
            status: "approved",
            submittedAt: "2026-06-01T08:00:00Z",
          }),
          submission({
            id: "own-reversed",
            status: "reversed",
            submittedAt: "2026-08-08T08:00:00Z",
          }),
          submission({
            id: "other-user-awaiting",
            status: "submitted",
            submittedAt: "2026-08-12T08:00:00Z",
            submittedByUserId: "other-finance-member",
          }),
        ],
      }),
      now: new Date("2026-08-12T12:00:00Z"),
      role: "finance_member",
      userId: "finance-member-user-1",
    });

    expect(result.role).toBe("finance_member");
    if (result.role !== "finance_member") {
      throw new Error("Expected Finance Member workspace data");
    }
    expect(result.primaryAction).toEqual({
      href: "/bills-expenses?action=create",
      intent: "record-paid-cost",
      label: "Record paid cost",
    });
    expect(result.queue.map((item) => item.kind)).toEqual([
      "expense-rejected",
      "expense-awaiting-review",
      "expense-approved",
    ]);
    expect(result.queue.map((item) => item.id)).toEqual([
      "own-rejected",
      "own-awaiting",
      "own-approved-recent",
    ]);
    expect(result.queue).toMatchObject([
      {
        amountDisplay: { primary: "USD 100.00" },
        contextLabel: "Garden Court · Unit G-01",
        detail: "Receipt total is unreadable.",
        submittedByLabel: "finance.member@nestory.com",
        tone: "danger",
      },
      {
        amountDisplay: { primary: "USD 100.00" },
        contextLabel: "Garden Court · Unit G-01",
        submittedByLabel: "finance.member@nestory.com",
        tone: "warning",
      },
      {
        amountDisplay: { primary: "USD 100.00" },
        contextLabel: "Garden Court · Unit G-01",
        submittedByLabel: "finance.member@nestory.com",
        tone: "success",
      },
    ]);
    expect(result.totals).toEqual({
      approvedRecently: 1,
      awaitingReview: 1,
      rejected: 1,
    });
  });
});

function financeData(
  overrides: Partial<FinanceOperationsData> = {},
): FinanceOperationsData {
  return {
    accountEntries: [],
    expenseSubmissions: [],
    leases: [],
    ownerInvoices: [],
    peopleOptions: [],
    positions: [],
    propertyOptions: [],
    reconciliationSources: [],
    rentGenerationExceptions: [],
    tenantInvoices: [],
    unitOptions: [],
    ...overrides,
  };
}

function submission(
  overrides: Partial<ExpenseSubmissionSummary> = {},
): ExpenseSubmissionSummary {
  return {
    adjustsSubmissionId: null,
    category: "repairs_maintenance",
    customerTotal: 120,
    date: "2026-08-01",
    evidence: {
      documentId: "document-1",
      fileName: "receipt.pdf",
      mimeType: "application/pdf",
      sha256: "a".repeat(64),
      sizeBytes: 128,
    },
    fundingSourceLabel: "OPS-USD · Operating bank account",
    id: "submission-1",
    internalCost: 100,
    internalMarkup: 20,
    propertyId: "property-1",
    propertyLabel: "Garden Court",
    previouslyApproved: null,
    recordedTotal: null,
    reference: "GDN-PUMP-2088",
    responsibility: "owner",
    reviewedAt: null,
    reviewReason: null,
    reversalReason: null,
    sourceId: null,
    sourceType: "general",
    status: "submitted",
    submittedAt: "2026-08-01T08:00:00Z",
    submittedByLabel: "finance.member@nestory.com",
    submittedByUserId: "finance-member-user-1",
    unitId: "unit-1",
    unitLabel: "Unit G-01",
    vendorLabel: "Khmer Home Services",
    ...overrides,
  };
}
