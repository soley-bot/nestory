import type { Json, Database } from "@/types/database";
import type {
  ActivityChangeDetail,
  RecentChange,
  RecentChangeTone,
} from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";

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
  unit_archived: "Archived",
  unit_created: "Created",
  unit_restored: "Restored",
  unit_updated: "Updated",
  unlocked: "Period unlocked",
  updated: "Updated",
  updated_from_ledger: "Synced from ledger",
};

const hiddenDetailFields = new Set([
  "actor_id",
  "archived_by",
  "created_by",
  "id",
  "organization_id",
  "updated_by",
]);

const fieldLabels: Record<string, string> = {
  amount: "Amount",
  archived_at: "Archived",
  category: "Category",
  cost_amount: "Cost",
  cost_currency: "Currency",
  current_rent_amount: "Current rent",
  current_rent_currency: "Currency",
  currency: "Currency",
  description: "Description",
  direction: "Direction",
  document_id: "Document",
  event_date: "Event date",
  event_type: "Event type",
  floor: "Floor",
  lease_id: "Lease",
  ledger_entry_id: "Ledger link",
  property_id: "Property",
  size_sqm: "Size",
  status: "Status",
  timeline_event_id: "Timeline link",
  title: "Title",
  transaction_date: "Transaction date",
  unit_id: "Unit",
  unit_number: "Unit number",
};

const referenceFields = new Set([
  "document_id",
  "lease_id",
  "ledger_entry_id",
  "property_id",
  "timeline_event_id",
  "unit_id",
]);

const linkReferenceFields = new Set([
  "document_id",
  "lease_id",
  "ledger_entry_id",
  "timeline_event_id",
]);

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
    getString(nextValues, "unit_number") ??
    getString(previousValues, "unit_number") ??
    getString(nextValues, "category") ??
    getString(previousValues, "category");

  if (label) {
    return label;
  }

  if (log.entity_type === "ledger_entry") {
    return "Ledger entry";
  }

  if (log.entity_type === "unit") {
    return "Unit";
  }

  return "Timeline event";
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

  if (entityType === "unit") {
    return "Unit";
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
    .filter((key) => !hiddenDetailFields.has(key))
    .sort()
    .map((key) => toChangeDetail(key, previousValues[key], nextValues[key]))
    .filter((detail): detail is ActivityChangeDetail => Boolean(detail));
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

function toChangeDetail(
  key: string,
  beforeValue: Json | undefined,
  afterValue: Json | undefined,
): ActivityChangeDetail | null {
  if (isSameJsonValue(beforeValue, afterValue)) {
    return null;
  }

  if (referenceFields.has(key)) {
    return {
      after: formatReferenceValue(
        key,
        afterValue,
        "after",
        beforeValue,
        afterValue,
      ),
      before: formatReferenceValue(
        key,
        beforeValue,
        "before",
        beforeValue,
        afterValue,
      ),
      field: fieldLabels[key] ?? toReadableAction(key),
    };
  }

  return {
    after: formatJsonValue(key, afterValue),
    before: formatJsonValue(key, beforeValue),
    field: fieldLabels[key] ?? toReadableAction(key),
  };
}

function formatJsonValue(key: string, value: Json | undefined) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" && isDateField(key)) {
    return formatDate(value);
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatReferenceValue(
  key: string,
  value: Json | undefined,
  side: "before" | "after",
  beforeValue: Json | undefined,
  afterValue: Json | undefined,
) {
  const isLink = linkReferenceFields.has(key);

  if (!hasReferenceValue(value)) {
    return isLink ? "Not linked" : "Not set";
  }

  if (
    hasReferenceValue(beforeValue) &&
    hasReferenceValue(afterValue) &&
    !isSameJsonValue(beforeValue, afterValue)
  ) {
    if (isLink) {
      return side === "before" ? "Previous link" : "New link";
    }

    return side === "before" ? "Previous selection" : "New selection";
  }

  return isLink ? "Linked" : "Selected";
}

function hasReferenceValue(value: Json | undefined) {
  return value !== undefined && value !== null && value !== "";
}

function isDateField(key: string) {
  return key.endsWith("_at") || key.endsWith("_date");
}

function isSameJsonValue(left: Json | undefined, right: Json | undefined) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function toReadableAction(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
