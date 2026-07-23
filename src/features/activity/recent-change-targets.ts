import {
  toRecentChange,
  type ActivityLogSnapshot,
} from "@/features/activity/recent-changes";
import type { RecentChange } from "@/features/activity/activity.types";

type ExactActivityEntityType =
  | "timeline_event"
  | "ledger_entry"
  | "finance_income_item"
  | "finance_expense_item"
  | "petty_cash_entry"
  | "task"
  | "document"
  | "lease"
  | "property"
  | "unit"
  | "person";

type ExactActivityTable =
  | "timeline_events"
  | "ledger_entries"
  | "finance_income_items"
  | "finance_expense_items"
  | "petty_cash_entries"
  | "tasks"
  | "documents"
  | "leases"
  | "properties"
  | "units"
  | "people";

type ActivityTargetQueryResult = {
  data: Array<{ id: string }> | null;
  error: unknown;
};

type ActivityTargetFilterQuery = {
  eq: (column: string, value: string) => ActivityTargetFilterQuery;
  in: (
    column: string,
    values: string[],
  ) => PromiseLike<ActivityTargetQueryResult>;
};

export type ActivityTargetQueryClient = {
  from: (table: string) => {
    select: (columns: string) => ActivityTargetFilterQuery;
  };
};

const exactEntityTables: Record<ExactActivityEntityType, ExactActivityTable> = {
  timeline_event: "timeline_events",
  ledger_entry: "ledger_entries",
  finance_income_item: "finance_income_items",
  finance_expense_item: "finance_expense_items",
  petty_cash_entry: "petty_cash_entries",
  task: "tasks",
  document: "documents",
  lease: "leases",
  property: "properties",
  unit: "units",
  person: "people",
};

const identitySnapshotFields = new Set([
  "category",
  "display_name",
  "entry_kind",
  "expense_type",
  "file_name",
  "income_type",
  "name",
  "payer_label",
  "tenant_name",
  "title",
  "unit_number",
  "vendor_label",
]);

export async function resolveRecentChangeTargets({
  logs,
  organizationId,
  supabase,
}: {
  logs: ActivityLogSnapshot[];
  organizationId: string;
  supabase: ActivityTargetQueryClient;
}): Promise<RecentChange[]> {
  if (logs.length === 0) {
    return [];
  }

  const idsByType = new Map<ExactActivityEntityType, string[]>();
  for (const log of logs) {
    if (!isExactActivityEntityType(log.entity_type) || !isUuid(log.entity_id)) {
      continue;
    }

    idsByType.set(log.entity_type, [
      ...(idsByType.get(log.entity_type) ?? []),
      log.entity_id,
    ]);
  }

  const loaded = await Promise.all(
    [...idsByType].map(async ([entityType, ids]) => {
      const result = await supabase
        .from(exactEntityTables[entityType])
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", [...new Set(ids)]);

      if (result.error) {
        throw new Error("Could not verify recent activity source records.");
      }

      return [
        entityType,
        new Set((result.data ?? []).map((row) => row.id)),
      ] as const;
    }),
  );
  const availableIds = new Map(loaded);

  return logs.map((log) => {
    if (!isExactActivityEntityType(log.entity_type)) {
      return toRecentChange(log);
    }

    if (availableIds.get(log.entity_type)?.has(log.entity_id)) {
      return toRecentChange(log);
    }

    return toUnavailableRecentChange(
      toRecentChange(sanitizeUnavailableActivityLog(log)),
    );
  });
}

function sanitizeUnavailableActivityLog(
  log: ActivityLogSnapshot,
): ActivityLogSnapshot {
  return {
    ...log,
    new_values: sanitizeIdentitySnapshotFields(log.new_values),
    previous_values: sanitizeIdentitySnapshotFields(log.previous_values),
  };
}

function sanitizeIdentitySnapshotFields(
  snapshot: ActivityLogSnapshot["new_values"],
): ActivityLogSnapshot["new_values"] {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") {
    return snapshot;
  }

  return Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => !identitySnapshotFields.has(key)),
  );
}

function toUnavailableRecentChange(change: RecentChange): RecentChange {
  const entityLabel = change.target?.entityLabel ?? change.entityLabel;
  const recordLabel = "Source record unavailable";

  return {
    ...change,
    entityLabel,
    href: undefined,
    recordLabel,
    target: {
      actionLabel: "Source unavailable",
      entityLabel,
      focusMode: "unavailable",
      href: undefined,
      recordLabel,
    },
  };
}

function isExactActivityEntityType(
  value: string,
): value is ExactActivityEntityType {
  return value in exactEntityTables;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
