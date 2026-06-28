import type { RecentChange } from "@/features/activity/activity.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { MoneyDisplayValue } from "@/lib/money/format";

export type MaintenanceArchiveState = "active" | "archived" | "all";

export type MaintenancePriority = "low" | "normal" | "high" | "urgent";

export type MaintenanceStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type MaintenanceReviewFilter =
  | "all"
  | "open"
  | "overdue"
  | "upcoming"
  | "reminders"
  | "high_priority"
  | "high_cost"
  | "recurring"
  | "completed";

export type MaintenanceScope = "focused" | "all";

export type MaintenanceProgressState =
  | "cancelled"
  | "completed"
  | "due_today"
  | "overdue"
  | "open"
  | "scheduled"
  | "upcoming";

export type MaintenanceBadgeTone =
  | "accent"
  | "danger"
  | "neutral"
  | "success"
  | "warning";

export type MaintenanceRecurrenceFrequency =
  | "annual"
  | "monthly"
  | "none"
  | "quarterly"
  | "semi_annual"
  | "weekly";

export type MaintenanceSortKey = "due_asc" | "priority_desc" | "cost_desc" | "created_desc";

export type MaintenanceViewQuery = {
  archiveState: MaintenanceArchiveState;
  month: string;
  page: number;
  pageSize: number;
  priority: MaintenancePriority | "all";
  propertyId: string;
  query: string;
  review: MaintenanceReviewFilter;
  scope: MaintenanceScope;
  sort: MaintenanceSortKey;
  status: MaintenanceStatus | "all";
  taskId: string;
  unitId: string;
};

export type MaintenanceChecklistItem = {
  completed: boolean;
  id: string;
  label: string;
};

export type MaintenanceLinkedDocument = LinkedDocument & {
  href: string;
};

export type MaintenanceFormValues = {
  actualCostAmount?: number | null;
  category: string;
  checklistText: string;
  costEstimateAmount?: number | null;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority: MaintenancePriority;
  propertyId: string;
  recurrenceFrequency: MaintenanceRecurrenceFrequency;
  reminderDate?: string | null;
  reminderTime?: string | null;
  status: MaintenanceStatus;
  title: string;
  unitId?: string | null;
  vendorPersonId?: string | null;
};

export type MaintenanceCaseHrefs = {
  documents: string;
  documentUpload: string;
  ledger?: string;
  property: string;
  task: string;
  timeline?: string;
  unit?: string;
  vendor?: string;
};

export type MaintenanceCase = {
  activity: RecentChange[];
  actualCostAmount: number;
  actualCostDisplay?: MoneyDisplayValue;
  actualCostLabel: string;
  archivedAt?: string;
  category: string;
  checklist: MaintenanceChecklistItem[];
  checklistDoneCount: number;
  checklistTotalCount: number;
  costEstimateAmount: number;
  costEstimateDisplay?: MoneyDisplayValue;
  costEstimateLabel: string;
  createdAt: string;
  description: string;
  documents: MaintenanceLinkedDocument[];
  dueDate?: string;
  dueLabel: string;
  dueTime?: string;
  formValues: MaintenanceFormValues;
  hrefs: MaintenanceCaseHrefs;
  id: string;
  isArchived: boolean;
  isHighCost: boolean;
  isOpen: boolean;
  isOverdue: boolean;
  isReminderDue: boolean;
  isUpcoming: boolean;
  ledgerEntryId?: string;
  priority: MaintenancePriority;
  priorityLabel: string;
  priorityTone: MaintenanceBadgeTone;
  progressLabel: string;
  progressState: MaintenanceProgressState;
  progressTone: MaintenanceBadgeTone;
  propertyId: string;
  propertyLabel: string;
  recurrenceFrequency: MaintenanceRecurrenceFrequency;
  recurrenceLabel: string;
  reminderDate?: string;
  reminderLabel: string;
  reminderTime?: string;
  requestId: string;
  status: MaintenanceStatus;
  statusLabel: string;
  statusTone: MaintenanceBadgeTone;
  timelineEventId?: string;
  title: string;
  unitId?: string;
  unitLabel: string;
  vendorLabel: string;
  vendorPersonId?: string;
};

export type MaintenancePagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type MaintenancePropertyOption = {
  id: string;
  label: string;
};

export type MaintenanceUnitOption = {
  id: string;
  label: string;
  propertyId: string;
};

export type MaintenancePersonOption = {
  id: string;
  label: string;
};

export type MaintenanceMetric = {
  detail: string;
  label: string;
  tone: MaintenanceBadgeTone;
  value: string;
};

export type MaintenanceCategoryStat = {
  caseCount: number;
  category: string;
  percentLabel: string;
};

export type MaintenancePropertyStat = {
  completed: number;
  inProgress: number;
  open: number;
  overdue: number;
  propertyId: string;
  propertyLabel: string;
};

export type MaintenanceRepeatedIssue = {
  caseCount: number;
  category: string;
  href: string;
  propertyLabel: string;
  unitLabel: string;
};

export type MaintenanceSummary = {
  actualCostDisplay: MoneyDisplayValue;
  categoryStats: MaintenanceCategoryStat[];
  completed: number;
  estimateCostDisplay: MoneyDisplayValue;
  highCost: number;
  highPriority: number;
  inProgress: number;
  open: number;
  overdue: number;
  propertyStats: MaintenancePropertyStat[];
  recurring: number;
  reminderDue: number;
  repeatedIssues: MaintenanceRepeatedIssue[];
  total: number;
  upcoming: number;
};

export type MaintenanceScreenData = {
  cases: MaintenanceCase[];
  pagination: MaintenancePagination;
  peopleOptions: MaintenancePersonOption[];
  propertyOptions: MaintenancePropertyOption[];
  summary: MaintenanceSummary;
  unitOptions: MaintenanceUnitOption[];
};
