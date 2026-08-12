import type { MoneyDisplayValue } from "@/lib/money/format";

export type FinanceWorkspaceItemKind =
  | "expense-review"
  | "maintenance-cost-review"
  | "expense-rejected"
  | "expense-awaiting-review"
  | "expense-approved"
  | "rent-exception"
  | "tenant-balance"
  | "owner-balance";

export type FinanceWorkspaceQueueItem = {
  actionLabel: string;
  amountDisplay: MoneyDisplayValue | null;
  contextLabel: string;
  detail: string;
  href: string;
  id: string;
  kind: FinanceWorkspaceItemKind;
  priority: number;
  statusLabel: string;
  submittedByLabel: string | null;
  submittedAt?: string;
  title: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
};

export type FinanceManagerWorkspaceData = {
  queue: FinanceWorkspaceQueueItem[];
  role: "finance_manager";
  totals: {
    awaitingReview: number;
    maintenanceHandoffs: number;
    missingEvidence: number;
    rentExceptions: number;
  };
};

export type FinanceMemberWorkspaceData = {
  primaryAction: {
    href: "/bills-expenses?action=create";
    intent: "record-paid-cost";
    label: "Record paid cost";
  };
  queue: FinanceWorkspaceQueueItem[];
  role: "finance_member";
  totals: {
    approvedRecently: number;
    awaitingReview: number;
    rejected: number;
  };
};

export type FinanceWorkspaceData =
  | FinanceManagerWorkspaceData
  | FinanceMemberWorkspaceData;
