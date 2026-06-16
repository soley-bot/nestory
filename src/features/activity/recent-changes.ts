import type { Json, Database } from "@/types/database";
import type { RecentChange, RecentChangeTone } from "@/features/activity/activity.types";

export type ActivityLogSnapshot = Pick<
  Database["public"]["Tables"]["activity_logs"]["Row"],
  | "action"
  | "created_at"
  | "entity_type"
  | "id"
  | "new_values"
  | "previous_values"
>;

const actionLabels: Record<string, string> = {
  archived: "Archived",
  archived_from_ledger: "Archived from ledger",
  created: "Created",
  created_from_ledger: "Created from ledger",
  created_from_ledger_update: "Recreated from ledger",
  updated: "Updated",
  updated_from_ledger: "Synced from ledger",
};

export function toRecentChange(log: ActivityLogSnapshot): RecentChange {
  return {
    action: log.action,
    actionLabel: actionLabels[log.action] ?? toReadableAction(log.action),
    createdAt: log.created_at,
    entityLabel: getEntityLabel(log.entity_type),
    id: log.id,
    recordLabel: getRecordLabel(log),
    tone: getTone(log.action),
  };
}

function getRecordLabel(log: ActivityLogSnapshot) {
  const nextValues = toRecord(log.new_values);
  const previousValues = toRecord(log.previous_values);
  const label =
    getString(nextValues, "title") ??
    getString(previousValues, "title") ??
    getString(nextValues, "category") ??
    getString(previousValues, "category");

  if (label) {
    return label;
  }

  return log.entity_type === "ledger_entry" ? "Ledger entry" : "Timeline event";
}

function getEntityLabel(entityType: string) {
  if (entityType === "ledger_entry") {
    return "Ledger";
  }

  if (entityType === "timeline_event") {
    return "Timeline";
  }

  return toReadableAction(entityType);
}

function getTone(action: string): RecentChangeTone {
  if (action.includes("archive")) {
    return "warning";
  }

  if (action.includes("create")) {
    return "success";
  }

  if (action.includes("ledger")) {
    return "accent";
  }

  return "neutral";
}

function getString(record: Record<string, Json | undefined>, key: string) {
  const value = record[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
}

function toRecord(value: Json | null): Record<string, Json | undefined> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value;
}

function toReadableAction(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
