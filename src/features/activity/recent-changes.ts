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
  document_replaced: "File replaced",
  lease_created: "Created",
  lease_updated: "Updated",
  locked: "Period locked",
  maintenance_request_created: "Maintenance request created",
  maintenance_task_created: "Maintenance case created",
  maintenance_task_checklist_item_updated: "Checklist updated",
  maintenance_task_completion_approved: "Completion approved",
  maintenance_task_completion_reopened: "Completion returned",
  maintenance_task_submitted_for_review: "Submitted for review",
  maintenance_task_status_changed: "Maintenance status changed",
  maintenance_task_updated: "Maintenance case updated",
  maintenance_task_work_blocked: "Work blocked",
  maintenance_task_work_resumed: "Work resumed",
  maintenance_task_work_started: "Work started",
  payment_recorded: "Payment recorded",
  posted: "Posted to ledger",
  posted_to_ledger: "Posted to ledger",
  receipt_attached: "Receipt attached",
  restored: "Restored",
  restored_from_ledger: "Restored from ledger",
  unit_import_committed: "Unit import committed",
  unit_archived: "Archived",
  unit_created: "Created",
  unit_restored: "Restored",
  unit_updated: "Updated",
  unlocked: "Period unlocked",
  updated: "Updated",
  updated_from_ledger: "Synced from ledger",
  voided: "Voided",
};

const hiddenDetailFields = new Set([
  "account_id",
  "accounting_journal_entry_id",
  "actor_id",
  "archived_by",
  "created_by",
  "custodian_person_id",
  "id",
  "checklist_item_id",
  "counterparty_person_id",
  "organization_id",
  "period_id",
  "updated_by",
  "voided_by",
]);

const fieldLabels: Record<string, string> = {
  account_id: "Cash account",
  amount: "Amount",
  counterparty_person_id: "Counterparty",
  amount_due: "Amount due",
  amount_received: "Amount received",
  archived_at: "Archived",
  category: "Category",
  checklist_completed: "Checklist completed",
  blocked_reason: "Blocker",
  cost_amount: "Cost",
  cost_currency: "Currency",
  current_rent_amount: "Current rent",
  current_rent_currency: "Currency",
  currency: "Currency",
  description: "Description",
  direction: "Direction",
  document_id: "Document",
  due_date: "Due date",
  due_time: "Due time",
  entry_kind: "Type",
  event_date: "Event date",
  event_type: "Event type",
  expense_type: "Expense type",
  file_name: "File name",
  floor: "Floor",
  created_count: "Created",
  import_type: "Import type",
  income_type: "Income type",
  invoice_date: "Invoice date",
  lease_id: "Lease",
  ledger_entry_id: "Ledger link",
  mime_type: "File type",
  paid_date: "Paid date",
  payer_label: "Payer",
  period_id: "Cash period",
  priority: "Priority",
  property_id: "Property",
  recurrence_frequency: "Recurrence",
  review_note: "Review note",
  reminder_date: "Reminder date",
  reminder_time: "Reminder time",
  row_count: "Rows",
  size_sqm: "Size",
  size_bytes: "File size",
  status: "Status",
  source_row_numbers: "Source rows",
  task_id: "Maintenance case",
  tenant_request_id: "Maintenance request",
  timeline_event_id: "Timeline link",
  title: "Title",
  transaction_date: "Transaction date",
  unit_id: "Unit",
  unit_number: "Unit number",
  updated_count: "Updated",
  vendor_label: "Vendor",
  void_reason: "Void reason",
  voided_at: "Voided at",
  voided_by: "Voided by",
};

const referenceFields = new Set([
  "document_id",
  "lease_id",
  "ledger_entry_id",
  "property_id",
  "task_id",
  "tenant_request_id",
  "timeline_event_id",
  "unit_id",
]);

const linkReferenceFields = new Set([
  "document_id",
  "lease_id",
  "ledger_entry_id",
  "task_id",
  "timeline_event_id",
]);

export function toRecentChange(log: ActivityLogSnapshot): RecentChange {
  const recordLabel = getRecordLabel(log);

  return {
    action: log.action,
    actionLabel: getActionLabel(log),
    createdAt: log.created_at,
    details: getChangeDetails(log),
    entityLabel: getEntityLabel(log.entity_type),
    href: getActivityHref(log, recordLabel),
    id: log.id,
    recordLabel,
    tone: getTone(log.action),
  };
}

function getActionLabel(log: ActivityLogSnapshot) {
  if (log.action === "unit_updated" && hasChangedValue(log, "status")) {
    return "Status changed";
  }

  return actionLabels[log.action] ?? toReadableAction(log.action);
}

function hasChangedValue(log: ActivityLogSnapshot, key: string) {
  const nextValues = toRecord(log.new_values);
  const previousValues = toRecord(log.previous_values);

  return !isSameJsonValue(previousValues[key], nextValues[key]);
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
    getString(nextValues, "file_name") ??
    getString(previousValues, "file_name") ??
    getString(nextValues, "payer_label") ??
    getString(previousValues, "payer_label") ??
    getString(nextValues, "vendor_label") ??
    getString(previousValues, "vendor_label") ??
    getString(nextValues, "income_type") ??
    getString(previousValues, "income_type") ??
    getString(nextValues, "expense_type") ??
    getString(previousValues, "expense_type") ??
    getString(nextValues, "entry_kind") ??
    getString(previousValues, "entry_kind") ??
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

  if (entityType === "finance_income_item") {
    return "Income item";
  }

  if (entityType === "finance_expense_item") {
    return "Expense item";
  }

  if (entityType === "petty_cash_entry") {
    return "Petty cash row";
  }

  if (entityType === "document") {
    return "Document";
  }

  if (entityType === "task") {
    return "Maintenance case";
  }

  if (entityType === "tenant_request") {
    return "Maintenance request";
  }

  if (entityType === "lease") {
    return "Lease";
  }

  if (entityType === "import") {
    return "Import batch";
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

  if (entityType === "task" || entityType === "tenant_request") {
    return "Maintenance";
  }

  if (entityType === "ledger_period") {
    return "Period lock";
  }

  if (entityType === "finance_income_item") {
    return "Rent & Income";
  }

  if (entityType === "finance_expense_item") {
    return "Bills & Expenses";
  }

  if (entityType === "petty_cash_entry") {
    return "Petty Cash";
  }

  if (entityType === "import") {
    return "Import";
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

  if (log.entity_type === "finance_income_item") {
    return buildModuleHref("/rent-income", {
      query: getFocusedQuery(recordLabel, "Income item"),
    });
  }

  if (log.entity_type === "finance_expense_item") {
    return buildModuleHref("/bills-expenses", {
      query: getFocusedQuery(recordLabel, "Expense item"),
    });
  }

  if (log.entity_type === "petty_cash_entry") {
    return "/petty-cash";
  }

  if (log.entity_type === "task") {
    return buildModuleHref("/maintenance", {
      archiveState: "all",
      query: getFocusedQuery(recordLabel, "Maintenance case"),
      taskId: log.entity_id,
    });
  }

  if (log.entity_type === "tenant_request") {
    return buildModuleHref("/maintenance", {
      archiveState: "all",
      query: getFocusedQuery(recordLabel, "Maintenance request"),
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
    return `/people/${log.entity_id}`;
  }

  if (log.entity_type === "document") {
    return buildModuleHref("/documents", {
      archiveState: "all",
      documentId: log.entity_id,
      query: getFocusedQuery(recordLabel, "Document"),
    });
  }

  if (log.entity_type === "import") {
    return "/import";
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
  if (action === "maintenance_task_completion_reopened" || action === "maintenance_task_work_blocked") {
    return "warning";
  }

  if (action === "maintenance_task_completion_approved") {
    return "success";
  }
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

  if (action.includes("import_committed")) {
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
