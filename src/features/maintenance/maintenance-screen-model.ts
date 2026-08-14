import type { SelectControlOption } from "@/components/ui/select-control";
import type { MaintenanceStatus } from "./maintenance.types";

export const MAINTENANCE_STATUS_OPTIONS: Array<{
  label: string;
  value: MaintenanceStatus;
}> = [
  { label: "Pending", value: "pending" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In progress", value: "in_progress" },
  { label: "Blocked", value: "blocked" },
  { label: "Ready for review", value: "ready_for_review" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

export const MAINTENANCE_PRIORITY_FILTER_OPTIONS: SelectControlOption[] = [
  { label: "All priorities", value: "all" },
  { label: "Urgent", value: "urgent" },
  { label: "High", value: "high" },
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
];

export const MAINTENANCE_STATUS_FILTER_OPTIONS: SelectControlOption[] = [
  { label: "All statuses", value: "all" },
  ...MAINTENANCE_STATUS_OPTIONS,
];

export const MAINTENANCE_ATTENTION_FILTER_OPTIONS: SelectControlOption[] = [
  { label: "Open queue", value: "open" },
  { label: "Work orders", value: "work_orders" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Inspections", value: "inspections" },
  { label: "Due reminders", value: "reminders" },
  { label: "High priority", value: "high_priority" },
  { label: "High cost", value: "high_cost" },
  { label: "Recurring", value: "recurring" },
  { label: "Review completion", value: "review_completion" },
  { label: "All attention", value: "all" },
];

const maintenanceWorkspaceRoutes = [
  { href: "/maintenance", label: "Cases" },
  { href: "/tasks", label: "My work" },
  { href: "/recurring-tasks", label: "Recurring work" },
  { href: "/inspections", label: "Inspections" },
  { href: "/work-orders", label: "Work orders" },
] as const;

export function getMaintenanceWorkspaceNavItems(pathname: string) {
  return maintenanceWorkspaceRoutes.map((item) => ({
    ...item,
    active: pathname === item.href,
  }));
}
