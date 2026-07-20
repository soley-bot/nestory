import {
  MAINTENANCE_UPCOMING_WINDOW_DAYS,
  OPERATIONAL_OPEN_MAINTENANCE_STATUSES,
} from "@/features/maintenance/maintenance.constants";
import type {
  MaintenancePriority,
  MaintenanceProgressState,
  MaintenanceStatus,
} from "@/features/maintenance/maintenance.types";

export type MaintenanceTaskFactsInput = {
  dueDate?: string | null;
  priority: string;
  status: string;
};

export type MaintenanceTaskFacts = {
  isBlocked: boolean;
  isHighPriority: boolean;
  isOpen: boolean;
  isOverdue: boolean;
  priority: MaintenancePriority;
  progressState: MaintenanceProgressState;
  status: MaintenanceStatus;
};

export function getMaintenanceTaskFacts(
  input: MaintenanceTaskFactsInput,
  today: string,
): MaintenanceTaskFacts {
  const status = normalizeMaintenanceStatus(input.status);
  const priority = normalizeMaintenancePriority(input.priority);
  const progressState = getMaintenanceProgressState(
    { dueDate: input.dueDate, status },
    today,
  );

  return {
    isBlocked: status === "blocked",
    isHighPriority: priority === "high" || priority === "urgent",
    isOpen: isOpenMaintenanceStatus(status),
    isOverdue: progressState === "overdue",
    priority,
    progressState,
    status,
  };
}

export function isOpenMaintenanceStatus(status: MaintenanceStatus) {
  return OPERATIONAL_OPEN_MAINTENANCE_STATUSES.includes(
    status as (typeof OPERATIONAL_OPEN_MAINTENANCE_STATUSES)[number],
  );
}

export function getMaintenanceProgressState(
  task: { dueDate?: string | null; status: MaintenanceStatus },
  today: string,
): MaintenanceProgressState {
  if (task.status === "completed") return "completed";
  if (task.status === "cancelled") return "cancelled";
  if (!task.dueDate) return task.status === "scheduled" ? "scheduled" : "open";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "due_today";

  return diffDays(today, task.dueDate) <= MAINTENANCE_UPCOMING_WINDOW_DAYS
    ? "upcoming"
    : "scheduled";
}

function normalizeMaintenanceStatus(status: string): MaintenanceStatus {
  const normalized = normalizeStoredValue(status);

  if (
    normalized === "scheduled" ||
    normalized === "in_progress" ||
    normalized === "blocked" ||
    normalized === "ready_for_review" ||
    normalized === "completed" ||
    normalized === "cancelled"
  ) {
    return normalized;
  }

  return "pending";
}

function normalizeMaintenancePriority(priority: string): MaintenancePriority {
  const normalized = normalizeStoredValue(priority);

  if (normalized === "low" || normalized === "high" || normalized === "urgent") {
    return normalized;
  }

  return "normal";
}

function normalizeStoredValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function diffDays(start: string, end: string) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);

  return Math.round((endMs - startMs) / 86_400_000);
}
