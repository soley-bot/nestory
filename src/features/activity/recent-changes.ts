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
  | "entity_id"
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
  lease_created: "Created",
  lease_updated: "Updated",
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
  const recordLabel = getRecordLabel(log);

  return {
    action: log.action,
    actionLabel: actionLabels[log.action] ?? toReadableAction(log.action),
    createdAt: log.created_at,
    details: getChangeDetails(log),
    entityLabel: getEntityLabel(log.entity_type),
    href: getActivityHref(log, recordLabel),
    id: log.id,
    recordLabel,
    tone: getTone(log.action),
  };
}

function getRecordLabel(log: ActivityLogSnapshot) {
  const nextValues = toRecord(log.new_values);
  const previousValues = toRecord(log.previous_values);
  const label =
    getString(nextValues, "title") ??
    getString(previousValues, "title") ??
    getString(nextValues, "tenant_name") ??
    getString(previousValues, "tenant_name") ??
    getString(nextValues, "display_name") ??
    getString(previousValues, "display_name") ??
    getString(nextValues, "name") ??
    getString(previousValues, "name") ??
    getString(nextValues, "unit_number") ??
    getString(previousValues, "unit_number") ??
    getString(nextValues, "category") ??
    getString(previousValues, "category");

  if (label) {
    return label;
  }

  return getFallbackRecordLabel(log.entity_type);
}

function getFallbackRecordLabel(entityType: string) {
  if (entityType === "ledger_entry") {
    return "Ledger entry";
  }

  if (entityType === "ledger_period") {
    return "Period lock";
  }

  if (entityType === "lease") {
    return "Lease";
  }

  if (entityType === "person") {
    return "Person";
  }

  if (entityType === "property") {
    return "Property";
  }

  if (entityType === "timeline_event") {
    return "Timeline event";
  }

  if (entityType === "unit") {
    return "Unit";
  }

  return "Activity record";
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

function getActivityHref(log: ActivityLogSnapshot, recordLabel: string) {
  const entityId = encodeURIComponent(log.entity_id);

  if (log.entity_type === "ledger_entry") {
    return buildModuleHref("/ledger", {
      archiveState: "all",
      entryId: log.entity_id,
      query: getFocusedQuery(recordLabel, "Ledger entry"),
    });
  }

  if (log.entity_type === "timeline_event") {
    return buildModuleHref("/timeline", {
      archiveState: "all",
      eventId: log.entity_id,
      query: getFocusedQuery(recordLabel, "Timeline event"),
    });
  }

  if (log.entity_type === "unit") {
    return `/units/${entityId}`;
  }

  if (log.entity_type === "property") {
    return `/properties/${entityId}`;
  }

  if (log.entity_type === "lease") {
    return buildModuleHref("/leases", {
      archiveState: "all",
      leaseId: log.entity_id,
      query: getFocusedQuery(recordLabel, "Lease"),
    });
  }

  if (log.entity_type === "person") {
    return buildModuleHref("/people", {
      archiveState: "all",
      personId: log.entity_id,
      query: getFocusedQuery(recordLabel, "Person"),
    });
  }

  if (log.entity_type === "ledger_period") {
    const periodStart =
      getString(toRecord(log.new_values), "period_start") ??
      getString(toRecord(log.previous_values), "period_start");

    return periodStart ? getLedgerPeriodHref(periodStart) : "/ledger";
  }

  return `/timeline?query=${encodeURIComponent(recordLabel)}`;
}

function buildModuleHref(pathname: string, values: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}

function getFocusedQuery(recordLabel: string, fallbackLabel: string) {
  return recordLabel === fallbackLabel ? undefined : recordLabel;
}

function getLedgerPeriodHref(periodStart: string) {
  const monthStart = periodStart.slice(0, 10);
  const match = monthStart.match(/^(\d{4})-(\d{2})-01$/);

  if (!match) {
    return "/ledger";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateTo = `${monthStart.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;
  const params = new URLSearchParams({
    dateFrom: monthStart,
    dateTo,
  });

  return `/ledger?${params.toString()}`;
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
