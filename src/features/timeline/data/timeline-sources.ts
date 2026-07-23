import {
  resolveActivityEntityTarget,
  type ActivityEntityType,
} from "@/features/activity/entity-target";
import type { TimelineSourceReference } from "@/features/timeline/timeline.types";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TimelineSourceCandidate =
  | {
      availability: "available";
      entityId: string;
      entityType: ActivityEntityType;
      isArchived: boolean;
      label: string;
    }
  | {
      availability: "unavailable";
      entityType: ActivityEntityType;
      label: string;
      moduleLabel: string;
    };

export type TimelineSourceEventInput = {
  id: string;
  leaseId: string | null;
  ledgerEntryId: string | null;
};

export type TimelineLedgerSourceInput = {
  archivedAt: string | null;
  category: string;
  direction: string;
  id: string;
  sourceId: string | null;
  sourceType: string;
};

export type TimelineLeaseSourceInput = {
  archivedAt: string | null;
  id: string;
  tenantName: string;
};

export type TimelineDocumentSourceInput = {
  archivedAt: string | null;
  fileName: string;
  id: string;
  timelineEventId: string;
};

type TaskSourceRow = {
  archived_at: string | null;
  id: string;
  timeline_event_id: string | null;
  title: string;
};

type IncomeSourceRow = {
  archived_at: string | null;
  id: string;
  income_type: string;
  payer_label: string;
  reference: string | null;
};

type ExpenseSourceRow = {
  archived_at: string | null;
  category: string;
  id: string;
  reference: string | null;
  vendor_label: string;
};

type PettyCashSourceRow = {
  archived_at: string | null;
  category: string;
  description: string;
  id: string;
  supplier: string | null;
};

const SOURCE_ORDER: Partial<Record<ActivityEntityType, number>> = {
  task: 0,
  finance_income_item: 0,
  finance_expense_item: 0,
  petty_cash_entry: 0,
  lease: 1,
  ledger_entry: 2,
  document: 3,
};

export function assembleTimelineSourceReferences(
  candidates: TimelineSourceCandidate[],
): TimelineSourceReference[] {
  const sources = candidates.map((candidate): TimelineSourceReference => {
    if (candidate.availability === "unavailable") {
      return candidate;
    }

    const target = resolveActivityEntityTarget({
      entityId: candidate.entityId,
      entityType: candidate.entityType,
      recordLabel: candidate.label,
    });

    if (!target.href) {
      return {
        availability: "unavailable",
        entityType: candidate.entityType,
        label: "Source record unavailable",
        moduleLabel: target.entityLabel,
      };
    }

    return {
      availability: "available",
      entityId: candidate.entityId,
      entityType: candidate.entityType,
      href: target.href,
      isArchived: candidate.isArchived,
      label: candidate.label,
      moduleLabel: target.entityLabel,
    };
  });

  return [...new Map(sources.map((source) => [sourceKey(source), source])).values()].sort(
    (left, right) =>
      (SOURCE_ORDER[left.entityType] ?? 99) -
      (SOURCE_ORDER[right.entityType] ?? 99),
  );
}

export function countAvailableTimelineSources(
  sources: TimelineSourceReference[],
) {
  return sources.filter((source) => source.availability === "available").length;
}

export async function loadTimelineSourcesByEventId({
  documents,
  events,
  leases,
  ledgerEntries,
  organizationId,
  supabase,
}: {
  documents: TimelineDocumentSourceInput[];
  events: TimelineSourceEventInput[];
  leases: TimelineLeaseSourceInput[];
  ledgerEntries: TimelineLedgerSourceInput[];
  organizationId: string;
  supabase: SupabaseClient<Database>;
}) {
  const eventIds = unique(events.map((event) => event.id));
  const sourceIds = collectSourceIds(ledgerEntries);
  const [tasksResult, incomeResult, expenseResult, pettyCashResult] =
    await Promise.all([
      loadTasks(supabase, organizationId, eventIds),
      loadIncomeItems(supabase, organizationId, sourceIds.finance_income),
      loadExpenseItems(supabase, organizationId, sourceIds.finance_expense),
      loadPettyCashEntries(supabase, organizationId, sourceIds.petty_cash),
    ]);

  const failedResult = [tasksResult, incomeResult, expenseResult, pettyCashResult].find(
    (result) => result.error,
  );
  if (failedResult?.error) {
    throw new Error("Could not load Timeline source records.");
  }

  const tasks = (tasksResult.data ?? []) as TaskSourceRow[];
  const incomeItems = (incomeResult.data ?? []) as IncomeSourceRow[];
  const expenseItems = (expenseResult.data ?? []) as ExpenseSourceRow[];
  const pettyCashEntries = (pettyCashResult.data ?? []) as PettyCashSourceRow[];
  const tasksByEventId = groupBy(tasks, (task) => task.timeline_event_id);
  const tasksById = indexById(tasks);
  const incomeById = indexById(incomeItems);
  const expensesById = indexById(expenseItems);
  const pettyCashById = indexById(pettyCashEntries);
  const ledgerById = indexById(ledgerEntries);
  const leasesById = indexById(leases);
  const documentsByEventId = groupBy(
    documents,
    (document) => document.timelineEventId,
  );

  return new Map(
    events.map((event) => {
      const ledgerEntry = event.ledgerEntryId
        ? ledgerById.get(event.ledgerEntryId)
        : undefined;
      const candidates: TimelineSourceCandidate[] = [
        ...(tasksByEventId.get(event.id) ?? []).map(toTaskCandidate),
      ];

      if (ledgerEntry) {
        const origin = toOperationalOriginCandidate({
          expensesById,
          incomeById,
          ledgerEntry,
          pettyCashById,
          tasksById,
        });
        if (origin) {
          candidates.push(origin);
        }
      }

      const lease = event.leaseId ? leasesById.get(event.leaseId) : undefined;
      if (lease) {
        candidates.push({
          availability: "available",
          entityId: lease.id,
          entityType: "lease",
          isArchived: Boolean(lease.archivedAt),
          label: lease.tenantName,
        });
      }

      if (ledgerEntry) {
        candidates.push({
          availability: "available",
          entityId: ledgerEntry.id,
          entityType: "ledger_entry",
          isArchived: Boolean(ledgerEntry.archivedAt),
          label: `${toTitleCase(ledgerEntry.direction)} · ${ledgerEntry.category}`,
        });
      }

      for (const document of documentsByEventId.get(event.id) ?? []) {
        candidates.push({
          availability: "available",
          entityId: document.id,
          entityType: "document",
          isArchived: Boolean(document.archivedAt),
          label: document.fileName,
        });
      }

      return [event.id, assembleTimelineSourceReferences(candidates)] as const;
    }),
  );
}

function sourceKey(source: TimelineSourceReference) {
  return source.availability === "available"
    ? `${source.entityType}:${source.entityId}`
    : `${source.entityType}:unavailable`;
}

function collectSourceIds(rows: TimelineLedgerSourceInput[]) {
  const ids: Record<"finance_expense" | "finance_income" | "petty_cash", string[]> =
    {
      finance_expense: [],
      finance_income: [],
      petty_cash: [],
    };

  for (const row of rows) {
    if (
      row.sourceId &&
      (row.sourceType === "finance_expense" ||
        row.sourceType === "finance_income" ||
        row.sourceType === "petty_cash")
    ) {
      ids[row.sourceType].push(row.sourceId);
    }
  }

  return {
    finance_expense: unique(ids.finance_expense),
    finance_income: unique(ids.finance_income),
    petty_cash: unique(ids.petty_cash),
  };
}

function loadTasks(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  eventIds: string[],
) {
  if (eventIds.length === 0) {
    return Promise.resolve({ data: [] as TaskSourceRow[], error: null });
  }

  return supabase
    .from("tasks")
    .select("id, timeline_event_id, title, archived_at")
    .eq("organization_id", organizationId)
    .in("timeline_event_id", eventIds);
}

function loadIncomeItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  ids: string[],
) {
  if (ids.length === 0) {
    return Promise.resolve({ data: [] as IncomeSourceRow[], error: null });
  }

  return supabase
    .from("finance_income_items")
    .select("id, income_type, payer_label, reference, archived_at")
    .eq("organization_id", organizationId)
    .in("id", ids);
}

function loadExpenseItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  ids: string[],
) {
  if (ids.length === 0) {
    return Promise.resolve({ data: [] as ExpenseSourceRow[], error: null });
  }

  return supabase
    .from("finance_expense_items")
    .select("id, category, vendor_label, reference, archived_at")
    .eq("organization_id", organizationId)
    .in("id", ids);
}

function loadPettyCashEntries(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  ids: string[],
) {
  if (ids.length === 0) {
    return Promise.resolve({ data: [] as PettyCashSourceRow[], error: null });
  }

  return supabase
    .from("petty_cash_entries")
    .select("id, category, supplier, description, archived_at")
    .eq("organization_id", organizationId)
    .in("id", ids);
}

function toOperationalOriginCandidate({
  expensesById,
  incomeById,
  ledgerEntry,
  pettyCashById,
  tasksById,
}: {
  expensesById: Map<string, ExpenseSourceRow>;
  incomeById: Map<string, IncomeSourceRow>;
  ledgerEntry: TimelineLedgerSourceInput;
  pettyCashById: Map<string, PettyCashSourceRow>;
  tasksById: Map<string, TaskSourceRow>;
}): TimelineSourceCandidate | null {
  if (!ledgerEntry.sourceId || ledgerEntry.sourceType === "manual") {
    return null;
  }

  if (ledgerEntry.sourceType === "finance_income") {
    const row = incomeById.get(ledgerEntry.sourceId);
    return row
      ? {
          availability: "available",
          entityId: row.id,
          entityType: "finance_income_item",
          isArchived: Boolean(row.archived_at),
          label: row.reference
            ? `${row.reference} · ${row.payer_label}`
            : `${toTitleCase(row.income_type)} · ${row.payer_label}`,
        }
      : unavailable("finance_income_item", "Rent & Income");
  }

  if (ledgerEntry.sourceType === "finance_expense") {
    const row = expensesById.get(ledgerEntry.sourceId);
    return row
      ? {
          availability: "available",
          entityId: row.id,
          entityType: "finance_expense_item",
          isArchived: Boolean(row.archived_at),
          label: row.reference
            ? `${row.reference} · ${row.vendor_label}`
            : `${row.category} · ${row.vendor_label}`,
        }
      : unavailable("finance_expense_item", "Bills & Expenses");
  }

  if (ledgerEntry.sourceType === "petty_cash") {
    const row = pettyCashById.get(ledgerEntry.sourceId);
    return row
      ? {
          availability: "available",
          entityId: row.id,
          entityType: "petty_cash_entry",
          isArchived: Boolean(row.archived_at),
          label: row.supplier
            ? `${row.description} · ${row.supplier}`
            : row.description,
        }
      : unavailable("petty_cash_entry", "Petty Cash");
  }

  if (ledgerEntry.sourceType === "maintenance_task") {
    const row = tasksById.get(ledgerEntry.sourceId);
    return row
      ? toTaskCandidate(row)
      : unavailable("task", "Maintenance");
  }

  return null;
}

function toTaskCandidate(row: TaskSourceRow): TimelineSourceCandidate {
  return {
    availability: "available",
    entityId: row.id,
    entityType: "task",
    isArchived: Boolean(row.archived_at),
    label: row.title,
  };
}

function unavailable(
  entityType: ActivityEntityType,
  moduleLabel: string,
): TimelineSourceCandidate {
  return {
    availability: "unavailable",
    entityType,
    label: "Source record unavailable",
    moduleLabel,
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy<T>(
  rows: T[],
  getKey: (row: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = getKey(row);
    if (!key) {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return groups;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function toTitleCase(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
