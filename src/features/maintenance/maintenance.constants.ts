export const HIGH_COST_AMOUNT = 1_000;
export const MAINTENANCE_UPCOMING_WINDOW_DAYS = 7;

export const OPERATIONAL_OPEN_MAINTENANCE_STATUSES = [
  "pending",
  "scheduled",
  "in_progress",
  "blocked",
  "ready_for_review",
] as const;

export const ASSIGNEE_ACTIONABLE_MAINTENANCE_STATUSES = [
  "pending",
  "scheduled",
  "in_progress",
  "blocked",
] as const;

export const REMINDER_ACTIONABLE_MAINTENANCE_STATUSES = [
  "pending",
  "scheduled",
  "in_progress",
  "blocked",
] as const;

export const TERMINAL_MAINTENANCE_STATUSES = ["completed", "cancelled"] as const;
