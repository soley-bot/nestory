import type {
  ExpenseSubmissionSummary,
  FinanceOperationsData,
} from "@/features/finance-operations/finance-operations.types";
import type {
  FinanceManagerWorkspaceData,
  FinanceMemberWorkspaceData,
  FinanceWorkspaceData,
  FinanceWorkspaceQueueItem,
} from "@/features/workspace-operations/finance-workspace.types";
import { formatMoneyDisplay } from "@/lib/money/format";

const RECENT_DECISION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function buildFinanceWorkspaceData(input: {
  data: FinanceOperationsData;
  now?: Date;
  role: "finance_manager" | "finance_member";
  userId: string;
}): FinanceWorkspaceData {
  return input.role === "finance_manager"
    ? buildManagerWorkspace(input.data)
    : buildMemberWorkspace(input.data, input.userId, input.now ?? new Date());
}

function buildManagerWorkspace(
  data: FinanceOperationsData,
): FinanceManagerWorkspaceData {
  const submitted = data.expenseSubmissions.filter(
    (submission) => submission.status === "submitted",
  );
  const propertyLabelById = new Map(
    data.propertyOptions.map((property) => [property.id, property.label]),
  );
  const queue = [
    ...submitted.map(managerExpenseItem),
    ...data.rentGenerationExceptions.map((exception) => ({
      actionLabel: "Review rent",
      amountDisplay: null,
      contextLabel:
        propertyLabelById.get(exception.propertyId) ?? "Property unavailable",
      detail: exception.message,
      href: "/rent-income",
      id: exception.id,
      kind: "rent-exception" as const,
      priority: 40,
      statusLabel: "Needs attention",
      submittedByLabel: null,
      submittedAt: exception.lastAttemptAt,
      title:
        propertyLabelById.get(exception.propertyId) ?? "Rent generation exception",
      tone: "danger" as const,
    })),
    ...data.tenantInvoices
      .filter((invoice) => invoice.balanceDue > 0)
      .map((invoice) => ({
        actionLabel:
          invoice.collectionRoute === "through_ips"
            ? "Record payment"
            : "Confirm collection",
        amountDisplay: formatMoneyDisplay(invoice.balanceDue),
        contextLabel: financeContextLabel(
          invoice.propertyLabel,
          invoice.unitId,
          invoice.unitLabel,
        ),
        detail: `${invoice.propertyLabel} · ${invoice.invoiceNumber}`,
        href: "/rent-income",
        id: invoice.id,
        kind: "tenant-balance" as const,
        priority: 50,
        statusLabel: "Payment due",
        submittedByLabel: null,
        submittedAt: invoice.dueDate,
        title: invoice.recipientLabel,
        tone: "warning" as const,
      })),
    ...data.ownerInvoices
      .filter((invoice) => invoice.balanceDue > 0)
      .map((invoice) => ({
        actionLabel: "Record owner invoice payment",
        amountDisplay: formatMoneyDisplay(invoice.balanceDue),
        contextLabel: invoice.propertyLabel,
        detail: `${invoice.propertyLabel} · ${invoice.invoiceNumber}`,
        href: "/balances",
        id: invoice.id,
        kind: "owner-balance" as const,
        priority: 60,
        statusLabel: "Payment due",
        submittedByLabel: null,
        submittedAt: invoice.dueDate,
        title: invoice.ownerLabel,
        tone: "warning" as const,
      })),
  ].sort(compareManagerItems);

  return {
    queue,
    role: "finance_manager",
    totals: {
      awaitingReview: submitted.length,
      maintenanceHandoffs: submitted.filter(
        (submission) => submission.sourceType === "maintenance_task",
      ).length,
      missingEvidence: submitted.filter((submission) => !submission.evidence)
        .length,
      rentExceptions: data.rentGenerationExceptions.length,
    },
  };
}

function managerExpenseItem(
  submission: ExpenseSubmissionSummary,
): FinanceWorkspaceQueueItem {
  const isMaintenance = submission.sourceType === "maintenance_task";
  const isMissingEvidence = !submission.evidence;

  return {
    actionLabel: "Review paid cost",
    amountDisplay: formatMoneyDisplay(submission.internalCost),
    contextLabel: financeContextLabel(
      submission.propertyLabel,
      submission.unitId,
      submission.unitLabel,
    ),
    detail: `${submission.propertyLabel} · ${submission.vendorLabel}`,
    href: "/bills-expenses",
    id: submission.id,
    kind: isMaintenance ? "maintenance-cost-review" : "expense-review",
    priority: isMaintenance ? 10 : isMissingEvidence ? 20 : 30,
    statusLabel: isMissingEvidence ? "Evidence missing" : "Awaiting approval",
    submittedByLabel: submission.submittedByLabel,
    submittedAt: submission.submittedAt,
    title: isMaintenance
      ? (submission.maintenanceTask?.title ?? "Maintenance cost")
      : submission.vendorLabel,
    tone: isMissingEvidence ? "danger" : "warning",
  };
}

function buildMemberWorkspace(
  data: FinanceOperationsData,
  userId: string,
  now: Date,
): FinanceMemberWorkspaceData {
  const ownSubmissions = data.expenseSubmissions.filter(
    (submission) => submission.submittedByUserId === userId,
  );
  const recentCutoff = now.getTime() - RECENT_DECISION_WINDOW_MS;
  const approvedRecently = ownSubmissions.filter(
    (submission) =>
      submission.status === "approved" &&
      submission.reviewedAt !== null &&
      Date.parse(submission.reviewedAt) >= recentCutoff,
  );
  const rejected = ownSubmissions.filter(
    (submission) => submission.status === "rejected",
  );
  const awaitingReview = ownSubmissions.filter(
    (submission) => submission.status === "submitted",
  );
  const queue = [
    ...rejected.map((submission) => memberExpenseItem(submission, 10)),
    ...awaitingReview.map((submission) => memberExpenseItem(submission, 20)),
    ...approvedRecently.map((submission) => memberExpenseItem(submission, 30)),
  ].sort(compareMemberItems);

  return {
    primaryAction: {
      href: "/bills-expenses",
      intent: "record-paid-cost",
      label: "Record paid cost",
    },
    queue,
    role: "finance_member",
    totals: {
      approvedRecently: approvedRecently.length,
      awaitingReview: awaitingReview.length,
      rejected: rejected.length,
    },
  };
}

function memberExpenseItem(
  submission: ExpenseSubmissionSummary,
  priority: number,
): FinanceWorkspaceQueueItem {
  const kind =
    submission.status === "rejected"
      ? "expense-rejected"
      : submission.status === "approved"
        ? "expense-approved"
        : "expense-awaiting-review";
  const statusLabel =
    submission.status === "rejected"
      ? "Needs correction"
      : submission.status === "approved"
        ? "Approved"
        : "Awaiting review";

  return {
    actionLabel:
      submission.status === "rejected" ? "Correct paid cost" : "View paid cost",
    amountDisplay: formatMoneyDisplay(submission.internalCost),
    contextLabel: financeContextLabel(
      submission.propertyLabel,
      submission.unitId,
      submission.unitLabel,
    ),
    detail:
      submission.status === "rejected"
        ? (submission.reviewReason ?? "Finance requested corrections.")
        : submission.vendorLabel,
    href: "/bills-expenses",
    id: submission.id,
    kind,
    priority,
    statusLabel,
    submittedByLabel: submission.submittedByLabel,
    submittedAt: submission.reviewedAt ?? submission.submittedAt,
    title: submission.vendorLabel,
    tone:
      submission.status === "rejected"
        ? "danger"
        : submission.status === "approved"
          ? "success"
          : "warning",
  };
}

function financeContextLabel(
  propertyLabel: string,
  unitId: string | null,
  unitLabel: string,
) {
  return unitId ? `${propertyLabel} · ${unitLabel}` : propertyLabel;
}

function compareManagerItems(
  first: FinanceWorkspaceQueueItem,
  second: FinanceWorkspaceQueueItem,
) {
  return (
    first.priority - second.priority ||
    compareDates(first.submittedAt, second.submittedAt) ||
    first.id.localeCompare(second.id)
  );
}

function compareMemberItems(
  first: FinanceWorkspaceQueueItem,
  second: FinanceWorkspaceQueueItem,
) {
  return (
    first.priority - second.priority ||
    compareDates(second.submittedAt, first.submittedAt) ||
    first.id.localeCompare(second.id)
  );
}

function compareDates(first?: string, second?: string) {
  return Date.parse(first ?? "") - Date.parse(second ?? "");
}
