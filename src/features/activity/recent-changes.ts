import type { Json, Database } from "@/types/database";
import type {
  ActivityChangeDetail,
  RecentChange,
  RecentChangeTone,
} from "@/features/activity/activity.types";

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
  document_attached: "Document attached",
  locked: "Period locked",
  receipt_attached: "Receipt attached",
  restored: "Restored",
  restored_from_ledger: "Restored from ledger",
  unlocked: "Period unlocked",
  updated: "Updated",
  updated_from_ledger: "Synced from ledger",
};

export function toRecentChange(log: ActivityLogSnapshot): RecentChange {
  return {
    action: log.action,
    actionLabel: actionLabels[log.action] ?? toReadableAction(log.action),
    createdAt: log.created_at,
    details: getChangeDetails(log),
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

  if (entityType === "ledger_period") {
    return "Period lock";
  }

  return toReadableAction(entityType);
}

function getTone(action: string): RecentChangeTone {
  if (action.includes("archive")) {
    return "warning";
  }

  if (action.includes("restore") || action.includes("unlock")) {
    return "accent";
  }

  if (action.includes("lock")) {
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

function getChangeDetails(log: ActivityLogSnapshot): ActivityChangeDetail[] {
  const nextValues = toRecord(log.new_values);
  const previousValues = toRecord(log.previous_values);
  const keys = new Set([
    ...Object.keys(previousValues),
    ...Object.keys(nextValues),
  ]);

  return Array.from(keys)
    .sort()
    .map((key) => ({
      after: formatJsonValue(nextValues[key]),
      before: formatJsonValue(previousValues[key]),
      field: toReadableAction(key),
    }))
    .filter((detail) => detail.before !== detail.after);
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

function formatJsonValue(value: Json | undefined) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function toReadableAction(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
