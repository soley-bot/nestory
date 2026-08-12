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
  detail: string;
  href: string;
  id: string;
  kind: FinanceWorkspaceItemKind;
  priority: number;
  statusLabel: string;
  submittedAt?: string;
  title: string;
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
    href: "/bills-expenses";
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
