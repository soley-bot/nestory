import type {
  ExpenseSubmissionSummary,
  TenantInvoiceSummary,
} from "./finance-operations.types";

export type FinanceStatusTone = "danger" | "neutral" | "success" | "warning";

export function formatEvidenceSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} bytes`;
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

export function maintenanceStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function categoryLabel(category: string) {
  return category === "repairs_maintenance"
    ? "Repairs and Maintenance"
    : category.charAt(0).toUpperCase() + category.slice(1);
}

export function expenseStatusPresentation(
  status: ExpenseSubmissionSummary["status"],
): { label: string; tone: FinanceStatusTone } {
  const label =
    status === "submitted"
      ? "Awaiting approval"
      : status.charAt(0).toUpperCase() + status.slice(1);
  const tone =
    status === "approved"
      ? "success"
      : status === "rejected"
        ? "danger"
        : status === "reversed"
          ? "neutral"
          : "warning";

  return { label, tone };
}

export function getInvoiceStatusPresentation({
  businessDate,
  dueDate,
  settlements = [],
  status,
}: {
  businessDate: string;
  dueDate?: string;
  settlements?: Array<Pick<TenantInvoiceSummary["settlements"][number], "date" | "isReversed">>;
  status: string;
}): { label: string; tone: FinanceStatusTone } {
  const activeSettlementDates = settlements
    .filter((settlement) => !settlement.isReversed)
    .map((settlement) => settlement.date)
    .sort();
  const paidLate =
    status === "paid" &&
    dueDate !== undefined &&
    activeSettlementDates.at(-1) !== undefined &&
    activeSettlementDates.at(-1)! > dueDate;
  const overdue =
    (status === "unpaid" || status === "partly_paid") &&
    dueDate !== undefined &&
    dueDate < businessDate;
  const label = paidLate
    ? "Paid late"
    : overdue && status === "partly_paid"
      ? "Partly paid · overdue"
      : overdue
        ? "Overdue"
        : status === "partly_paid"
          ? "Partly paid"
          : status === "paid"
            ? "Paid"
            : status === "voided"
              ? "Voided"
              : "Unpaid";
  const tone =
    status === "paid"
      ? "success"
      : status === "partly_paid"
        ? "warning"
        : status === "voided"
          ? "neutral"
          : "danger";

  return { label, tone };
}

export function getRentGenerationLabel(
  source: TenantInvoiceSummary["generationSource"],
) {
  if (source === "manual_recovery") return "Recovered manually";
  if (source === "lease_rules_v1") return "Generated from lease rules";
  if (source === "scheduled" || source === "activation_catch_up") {
    return "Generated automatically";
  }
  return "Existing invoice";
}
