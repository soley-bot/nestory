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
  | "ready_for_review"
  | "completed"
  | "cancelled";

export type MaintenanceReviewFilter =
  | "all"
  | "open"
  | "overdue"
  | "scheduled"
  | "upcoming"
  | "reminders"
  | "work_orders"
  | "inspections"
  | "high_priority"
  | "high_cost"
  | "recurring"
  | "review_completion"
  | "completed";

export type MaintenanceCasesView =
  | "board"
  | "calendar"
  | "inbox"
  | "list"
  | "templates";

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
  view: MaintenanceCasesView;
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
  assigneePersonId?: string | null;
  branchId?: string | null;
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
  assignee?: string;
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
  assigneeLabel: string;
  assigneePersonId?: string;
  branchId?: string;
  branchLabel: string;
  blockedReason?: string;
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

export type MaintenanceBranchOption = {
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
  pending: number;
  propertyId: string;
  propertyLabel: string;
};

export type MaintenanceUnitStat = {
  completed: number;
  inProgress: number;
  open: number;
  overdue: number;
  pending: number;
  propertyId: string;
  unitId: string;
  unitLabel: string;
};

export type MaintenanceRepeatedIssue = {
  caseCount: number;
  category: string;
  href: string;
  propertyLabel: string;
  scopeLabel: string;
  unitLabel: string;
};

export type MaintenanceReminderNotification = {
  dueLabel: string;
  href: string;
  id: string;
  propertyLabel: string;
  reminderAt: string;
  reminderLabel: string;
  title: string;
  unitLabel: string;
};

export type MaintenanceSummary = {
  actualCostDisplay: MoneyDisplayValue;
  categoryStats: MaintenanceCategoryStat[];
  blocked: number;
  completed: number;
  estimateCostDisplay: MoneyDisplayValue;
  highCost: number;
  highPriority: number;
  inProgress: number;
  open: number;
  overdue: number;
  pending: number;
  propertyStats: MaintenancePropertyStat[];
  recurring: number;
  readyForReview: number;
  reminderDue: number;
  repeatedIssues: MaintenanceRepeatedIssue[];
  scheduled: number;
  total: number;
  upcoming: number;
  unitStats: MaintenanceUnitStat[];
};

export type MaintenanceScreenData = {
  branchOptions: MaintenanceBranchOption[];
  cases: MaintenanceCase[];
  pagination: MaintenancePagination;
  peopleOptions: MaintenancePersonOption[];
  propertyOptions: MaintenancePropertyOption[];
  staffOptions: MaintenancePersonOption[];
  summary: MaintenanceSummary;
  unitOptions: MaintenanceUnitOption[];
};

export type MaintenanceActor = {
  branchId?: string;
  personId?: string;
  role: "admin" | "manager" | "member";
};
