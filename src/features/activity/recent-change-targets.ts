import {
  toRecentChange,
  type ActivityLogSnapshot,
} from "@/features/activity/recent-changes";
import type { RecentChange } from "@/features/activity/activity.types";
import { buildTimelineEventHref, timelineScopeIncludesEvent } from "@/features/timeline/timeline-navigation";
import type { TimelineScope } from "@/features/timeline/timeline.types";

type ExactActivityEntityType =
  | "timeline_event"
  | "ledger_entry"
  | "finance_income_item"
  | "finance_expense_item"
  | "petty_cash_entry"
  | "task"
  | "tenant_request"
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
  | "tenant_requests"
  | "documents"
  | "leases"
  | "properties"
  | "units"
  | "people";

type ActivityTargetRow = {
  id: string;
  event_type?: string;
  cost_amount?: number | null;
  ledger_entry_id?: string | null;
};

type ActivityTargetQueryResult = {
  data: ActivityTargetRow[] | null;
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
  tenant_request: "tenant_requests",
  document: "documents",
  lease: "leases",
  property: "properties",
  unit: "units",
  person: "people",
};

export async function resolveRecentChangeTargets({
  logs,
  organizationId,
  supabase,
  timelineScopes = ["global"],
}: {
  logs: ActivityLogSnapshot[];
  organizationId: string;
  supabase: ActivityTargetQueryClient;
  timelineScopes?: readonly TimelineScope[];
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
        .select(entityType === "timeline_event"
          ? "id, event_type, cost_amount, ledger_entry_id"
          : "id")
        .eq("organization_id", organizationId)
        .in("id", [...new Set(ids)]);

      if (result.error) {
        throw new Error("Could not verify recent activity source records.");
      }

      return [
        entityType,
        new Map((result.data ?? []).map((row) => [row.id, row])),
      ] as const;
    }),
  );
  const availableIds = new Map(loaded);

  return logs.map((log) => {
    if (!isExactActivityEntityType(log.entity_type)) {
      return toRecentChange(log);
    }

    const source = availableIds.get(log.entity_type)?.get(log.entity_id);
    if (source) {
      const change = toRecentChange(log);
      if (log.entity_type === "timeline_event" && change.target?.focusMode === "exact") {
        const timelineScope = timelineScopes.find((scope) => timelineScopeIncludesEvent(scope, source));
        if (!timelineScope) return toUnavailableRecentChange(change);
        const href = buildTimelineEventHref(timelineScope, log.entity_id);
        return { ...change, href, target: { ...change.target, href } };
      }
      return change;
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
    // A hidden source can contain sensitive amounts and free text as well as labels.
    new_values: null,
    previous_values: null,
  };
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
