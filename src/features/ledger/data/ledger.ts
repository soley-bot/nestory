import { createSupabaseServerClient } from "@/lib/db/server";
import { toRecentChange } from "@/features/activity/recent-changes";
import {
  getFinanceCloseMonth,
  getFinanceCloseSummary,
} from "@/features/finance/data/finance-close";
import {
  DEFAULT_LEDGER_VIEW_QUERY,
  buildLedgerPagination,
  getLedgerTransactionDateScope,
} from "@/features/ledger/ledger.filters";
import type {
  LedgerEntry,
  LedgerCloseSummary,
  LedgerNextAction,
  LedgerPeriodLock,
  LedgerPropertyOption,
  LedgerRecordCounts,
  LedgerRiskIndicator,
  LedgerUnitOption,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { CurrencyCode } from "@/lib/money/format";
import { getQueryTokens, textMatchesToken } from "@/lib/query/screen-query";
import { buildHref } from "@/lib/url/href";

const ledgerEntrySelect =
  "id, property_id, unit_id, transaction_date, direction, category, amount, currency, description, source_type, source_id, accounting_journal_entry_id, archived_at";
const maxRelatedSearchIds = 100;

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type UnitRow = {
  id: string;
  property_id: string;
  unit_number: string;
};

type LedgerEntryRow = {
  accounting_journal_entry_id: string | null;
  amount: number;
  archived_at: string | null;
  category: string;
  currency: CurrencyCode;
  description: string | null;
  direction: string;
  id: string;
  property_id: string;
  source_id: string | null;
  source_type: string;
  transaction_date: string;
  unit_id: string | null;
};

type TimelineEventRow = {
  archived_at: string | null;
  id: string;
  ledger_entry_id: string | null;
  title: string;
};

type DocumentRow = {
  category: string;
  file_name: string;
  id: string;
  ledger_entry_id: string | null;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_at: string;
};

type PeriodLockRow = {
  id: string;
  locked_at: string | null;
  period_start: string;
  reason: string | null;
};

type LedgerDocumentWithLink = LinkedDocument & {
  ledgerEntryId?: string;
};

export async function getLedgerScreenData(
  organizationId: string,
  viewQuery: LedgerViewQuery = DEFAULT_LEDGER_VIEW_QUERY,
) {
  const supabase = await createSupabaseServerClient();

  const [
    propertiesResult,
    unitsResult,
    periodLocksResult,
    recentActivityResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, code")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("units")
      .select("id, property_id, unit_number")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("ledger_period_locks")
      .select("id, period_start, locked_at, reason")
      .eq("organization_id", organizationId)
      .not("locked_at", "is", null)
      .order("period_start", { ascending: false })
      .limit(24),
    supabase
      .from("activity_logs")
      .select(
        "id, entity_type, entity_id, action, previous_values, new_values, created_at",
      )
      .eq("organization_id", organizationId)
      .in("entity_type", ["timeline_event", "ledger_entry", "ledger_period"])
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load ledger properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(
      `Could not load ledger units: ${unitsResult.error.message}`,
    );
  }

  if (periodLocksResult.error) {
    throw new Error(
      `Could not load ledger period locks: ${periodLocksResult.error.message}`,
    );
  }

  if (recentActivityResult.error) {
    throw new Error(
      `Could not load recent ledger activity: ${recentActivityResult.error.message}`,
    );
  }

  const properties = propertiesResult.data ?? [];
  const units = unitsResult.data ?? [];
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const periodLocks = toLedgerPeriodLocks(periodLocksResult.data ?? []);
  const searchTokens = viewQuery.entryId ? [] : getQueryTokens(viewQuery.query);
  const relatedLedgerEntryIds =
    searchTokens.length > 0
      ? await getLedgerEntryIdsMatchingTimelineSearch(
          supabase,
          organizationId,
          searchTokens,
        )
      : [];
  const searchGroups = buildLedgerSearchGroups({
    properties,
    propertiesById,
    relatedLedgerEntryIds,
    searchTokens,
    units,
  });
  const page = viewQuery.entryId ? 1 : viewQuery.page;
  const { from, to } = getRange(page, viewQuery.pageSize);

  let ledgerQuery = supabase
    .from("ledger_entries")
    .select(ledgerEntrySelect, { count: "exact" })
    .eq("organization_id", organizationId);

  if (viewQuery.archiveState === "active") {
    ledgerQuery = ledgerQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    ledgerQuery = ledgerQuery.not("archived_at", "is", null);
  }

  if (viewQuery.entryId) {
    ledgerQuery = ledgerQuery.eq("id", viewQuery.entryId);
  } else {
    if (viewQuery.direction !== "all") {
      ledgerQuery = ledgerQuery.eq("direction", viewQuery.direction);
    }

    if (viewQuery.propertyId !== "all") {
      ledgerQuery = ledgerQuery.eq("property_id", viewQuery.propertyId);
    }

    if (viewQuery.unitId !== "all") {
      ledgerQuery = ledgerQuery.eq("unit_id", viewQuery.unitId);
    }

    const dateScope = getLedgerTransactionDateScope(viewQuery);

    if (dateScope.from) {
      ledgerQuery = ledgerQuery.gte("transaction_date", dateScope.from);
    }

    if (dateScope.before) {
      ledgerQuery = ledgerQuery.lt("transaction_date", dateScope.before);
    }

    if (viewQuery.minAmount !== null) {
      ledgerQuery = ledgerQuery.gte("amount", viewQuery.minAmount);
    }

    for (const searchGroup of searchGroups) {
      ledgerQuery = ledgerQuery.or(searchGroup);
    }
  }

  if (viewQuery.sort === "date_asc") {
    ledgerQuery = ledgerQuery
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true });
  } else if (viewQuery.sort === "amount_desc") {
    ledgerQuery = ledgerQuery
      .order("amount", { ascending: false })
      .order("transaction_date", { ascending: false });
  } else if (viewQuery.sort === "amount_asc") {
    ledgerQuery = ledgerQuery
      .order("amount", { ascending: true })
      .order("transaction_date", { ascending: false });
  } else if (viewQuery.sort === "property_asc") {
    ledgerQuery = ledgerQuery
      .order("property_id", { ascending: true })
      .order("transaction_date", { ascending: false });
  } else {
    ledgerQuery = ledgerQuery
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
  }

  const ledgerResult = await ledgerQuery.range(from, to);

  if (ledgerResult.error) {
    throw new Error(
      `Could not load ledger entries: ${ledgerResult.error.message}`,
    );
  }

  const entriesPage = ledgerResult.data ?? [];
  const visibleEntryIds = entriesPage.map((entry) => entry.id);
  const [timelineEvents, documents, activityRows] = await Promise.all([
    getLinkedTimelineEvents(supabase, organizationId, visibleEntryIds),
    getLinkedLedgerDocuments(supabase, organizationId, visibleEntryIds),
    getLinkedLedgerActivity(supabase, organizationId, visibleEntryIds),
  ]);
  const timelineEventsByLedgerEntryId =
    indexTimelineEventsByLedgerEntryId(timelineEvents);
  const documentsWithUrls = await addSignedDocumentUrls(documents, supabase);
  const documentsByLedgerEntryId =
    groupDocumentsByLedgerEntryId(documentsWithUrls);
  const activityByLedgerEntryId = groupActivityByLedgerEntryId(activityRows);
  const entries = entriesPage.map((entry) =>
    toLedgerEntry({
      activity: activityByLedgerEntryId.get(entry.id) ?? [],
      documents: documentsByLedgerEntryId.get(entry.id) ?? [],
      entry,
      isLocked: isDateLocked(entry.transaction_date, periodLocks),
      property: propertiesById.get(entry.property_id),
      relatedTimelineEvent: timelineEventsByLedgerEntryId.get(entry.id),
      unit: entry.unit_id ? unitsById.get(entry.unit_id) : undefined,
    }),
  );
  const closeSummary: LedgerCloseSummary = await getFinanceCloseSummary({
    month: getLedgerCloseMonth(viewQuery),
    organizationId,
  });

  return {
    closeSummary,
    entries,
    pagination: buildLedgerPagination({
      page,
      pageSize: viewQuery.pageSize,
      totalCount: ledgerResult.count ?? entries.length,
    }),
    periodLocks,
    propertyOptions: properties.map((property): LedgerPropertyOption => ({
      id: property.id,
      label: `${property.code} - ${property.name}`,
    })),
    recentChanges: (recentActivityResult.data ?? []).map(toRecentChange),
    unitOptions: units.map((unit): LedgerUnitOption => {
      const property = propertiesById.get(unit.property_id);

      return {
        id: unit.id,
        label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
        propertyId: unit.property_id,
      };
    }),
    viewQuery,
  };
}

function getLedgerCloseMonth(viewQuery: LedgerViewQuery) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(viewQuery.dateFrom)) {
    return viewQuery.dateFrom.slice(0, 7);
  }

  return getFinanceCloseMonth();
}

function toLedgerEntry({
  activity,
  documents,
  entry,
  isLocked,
  property,
  relatedTimelineEvent,
  unit,
}: {
  activity: ReturnType<typeof toRecentChange>[];
  documents: LinkedDocument[];
  entry: LedgerEntryRow;
  isLocked: boolean;
  property?: PropertyRow;
  relatedTimelineEvent?: TimelineEventRow;
  unit?: UnitRow;
}): LedgerEntry {
  const hrefs = buildLedgerDetailHrefs(entry, relatedTimelineEvent);
  const recordCounts: LedgerRecordCounts = {
    activity: activity.length,
    documents: documents.length,
    timelineEvents: relatedTimelineEvent ? 1 : 0,
  };

  return {
    accountingJournalEntryId: entry.accounting_journal_entry_id ?? undefined,
    activity,
    amount: entry.amount,
    archivedAt: entry.archived_at ?? undefined,
    category: entry.category,
    currency: entry.currency,
    description: entry.description ?? "",
    documents,
    direction: entry.direction === "expense" ? "expense" : "income",
    hrefs,
    id: entry.id,
    isLocked,
    nextAction: buildLedgerNextAction({
      hrefs,
      isArchived: Boolean(entry.archived_at),
      isLocked,
      recordCounts,
      relatedTimelineEvent,
    }),
    propertyCode: property?.code ?? "Unknown",
    propertyId: entry.property_id,
    propertyName: property?.name ?? "Unknown property",
    recordCounts,
    relatedTimelineEvent: relatedTimelineEvent
      ? {
          id: relatedTimelineEvent.id,
          title: relatedTimelineEvent.title,
        }
      : undefined,
    riskIndicators: buildLedgerRiskIndicators({
      accountingJournalEntryId: entry.accounting_journal_entry_id,
      isArchived: Boolean(entry.archived_at),
      isLocked,
      recordCounts,
      relatedTimelineEvent,
      unitId: entry.unit_id,
    }),
    sourceId: entry.source_id ?? undefined,
    sourceLabel: formatLedgerSource(entry.source_type),
    sourceType: normalizeLedgerSource(entry.source_type),
    transactionDate: entry.transaction_date,
    unitId: entry.unit_id ?? undefined,
    unitNumber: unit?.unit_number,
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function normalizeLedgerSource(value: string) {
  if (
    value === "finance_income" ||
    value === "finance_expense" ||
    value === "petty_cash" ||
    value === "maintenance_task"
  ) {
    return value;
  }

  return "manual";
}

function formatLedgerSource(value: string) {
  if (value === "finance_income") {
    return "Rent & Income";
  }

  if (value === "finance_expense") {
    return "Bills & Expenses";
  }

  if (value === "petty_cash") {
    return "Petty Cash";
  }

  if (value === "maintenance_task") {
    return "Maintenance";
  }

  return "Manual";
}

function indexTimelineEventsByLedgerEntryId(rows: TimelineEventRow[]) {
  const index = new Map<string, TimelineEventRow>();

  rows.forEach((row) => {
    if (row.ledger_entry_id && !index.has(row.ledger_entry_id)) {
      index.set(row.ledger_entry_id, row);
    }
  });

  return index;
}

async function addSignedDocumentUrls(
  rows: DocumentRow[],
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<LedgerDocumentWithLink[]> {
  if (rows.length === 0) {
    return [];
  }

  const { data } = await supabase.storage
    .from("nestory-documents")
    .createSignedUrls(
      rows.map((row) => row.storage_path),
      60 * 60,
    );

  return rows.map((row, index) => ({
    category: row.category,
    fileName: row.file_name,
    id: row.id,
    ledgerEntryId: row.ledger_entry_id ?? undefined,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    url: data?.[index]?.signedUrl ?? undefined,
  }));
}

function groupDocumentsByLedgerEntryId(rows: LedgerDocumentWithLink[]) {
  const grouped = new Map<string, LinkedDocument[]>();

  for (const row of rows) {
    const ledgerEntryId = row.ledgerEntryId;

    if (!ledgerEntryId) {
      continue;
    }

    const group = grouped.get(ledgerEntryId) ?? [];
    group.push(row);
    grouped.set(ledgerEntryId, group);
  }

  return grouped;
}

function groupActivityByLedgerEntryId(
  rows: Parameters<typeof toRecentChange>[0][],
) {
  const grouped = new Map<string, ReturnType<typeof toRecentChange>[]>();

  for (const row of rows) {
    const group = grouped.get(row.entity_id) ?? [];
    group.push(toRecentChange(row));
    grouped.set(row.entity_id, group);
  }

  return grouped;
}

function buildLedgerDetailHrefs(
  entry: LedgerEntryRow,
  relatedTimelineEvent?: TimelineEventRow,
) {
  return {
    documents: buildHref("/documents", {
      query: entry.category,
    }),
    ledger: buildHref("/ledger", {
      archiveState: "all",
      entryId: entry.id,
      query: entry.category,
    }),
    property: `/properties/${entry.property_id}`,
    reports: "/reports",
    timeline: relatedTimelineEvent
      ? buildHref("/timeline", {
          archiveState: "all",
          eventId: relatedTimelineEvent.id,
          query: relatedTimelineEvent.title,
        })
      : buildHref("/timeline", {
          archiveState: "all",
          propertyId: entry.property_id,
          query: entry.category,
          unitId: entry.unit_id ?? undefined,
        }),
    unit: entry.unit_id ? `/units/${entry.unit_id}` : undefined,
  };
}

function buildLedgerRiskIndicators({
  accountingJournalEntryId,
  isArchived,
  isLocked,
  recordCounts,
  relatedTimelineEvent,
  unitId,
}: {
  accountingJournalEntryId: string | null;
  isArchived: boolean;
  isLocked: boolean;
  recordCounts: LedgerRecordCounts;
  relatedTimelineEvent?: TimelineEventRow;
  unitId: string | null;
}): LedgerRiskIndicator[] {
  return [
    {
      description: accountingJournalEntryId
        ? "A balanced accounting journal is linked to this operational row."
        : "No balanced accounting journal is linked. Month close must remain open until this is repaired.",
      id: "accounting",
      label: accountingJournalEntryId
        ? "Balanced journal linked"
        : "Accounting journal missing",
      tone: accountingJournalEntryId ? "success" : "danger",
    },
    {
      description: isLocked
        ? "The accounting month is locked, so this entry cannot be changed."
        : "The accounting month is open for corrections.",
      id: "lock",
      label: isLocked ? "Period locked" : "Period open",
      tone: isLocked ? "warning" : "success",
    },
    {
      description: isArchived
        ? "Archived entries stay available for audit but are excluded from active totals."
        : "This entry is included in active ledger totals.",
      id: "archive",
      label: isArchived ? "Archived" : "Active totals",
      tone: isArchived ? "warning" : "success",
    },
    {
      description: relatedTimelineEvent
        ? "A timeline event is linked and can show this transaction in history."
        : "No linked timeline event was found. Editing the entry can recreate the sync record.",
      id: "timeline",
      label: relatedTimelineEvent ? "Timeline linked" : "Timeline missing",
      tone: relatedTimelineEvent ? "success" : "warning",
    },
    {
      description:
        recordCounts.documents > 0
          ? "Receipt or invoice evidence is attached."
          : "No receipt or invoice evidence is attached yet.",
      id: "documents",
      label:
        recordCounts.documents > 0 ? "Receipt attached" : "Receipt missing",
      tone: recordCounts.documents > 0 ? "success" : "warning",
    },
    {
      description: unitId
        ? "This entry is scoped to a unit record."
        : "This entry is property-level and not tied to a specific unit.",
      id: "scope",
      label: unitId ? "Unit scoped" : "Property level",
      tone: unitId ? "success" : "neutral",
    },
  ];
}

function buildLedgerNextAction({
  hrefs,
  isArchived,
  isLocked,
  recordCounts,
  relatedTimelineEvent,
}: {
  hrefs: LedgerEntry["hrefs"];
  isArchived: boolean;
  isLocked: boolean;
  recordCounts: LedgerRecordCounts;
  relatedTimelineEvent?: TimelineEventRow;
}): LedgerNextAction {
  if (isLocked) {
    return {
      description:
        "Unlock the accounting period before editing or restoring this entry.",
      href: hrefs.ledger,
      label: "Review lock",
      tone: "warning",
    };
  }

  if (isArchived) {
    return {
      description:
        "Restore this entry if it should return to active ledger totals.",
      href: hrefs.ledger,
      label: "Review restore",
      tone: "warning",
    };
  }

  if (!relatedTimelineEvent) {
    return {
      description:
        "Edit and save this entry to recreate its linked timeline record.",
      href: hrefs.ledger,
      label: "Repair timeline",
      tone: "warning",
    };
  }

  if (recordCounts.documents === 0) {
    return {
      description: "Attach a receipt or invoice so reports have evidence.",
      href: hrefs.documents,
      label: "Attach receipt",
      tone: "warning",
    };
  }

  return {
    description: "Review the synced timeline event and reporting context.",
    href: hrefs.timeline,
    label: "Review timeline",
    tone: "neutral",
  };
}

function toLedgerPeriodLocks(rows: PeriodLockRow[]): LedgerPeriodLock[] {
  return rows.map((row) => ({
    id: row.id,
    lockedAt: row.locked_at ?? undefined,
    periodStart: row.period_start,
    reason: row.reason ?? undefined,
  }));
}

function isDateLocked(date: string, periodLocks: LedgerPeriodLock[]) {
  const periodStart = `${date.slice(0, 7)}-01`;

  return periodLocks.some(
    (periodLock) =>
      periodLock.periodStart === periodStart && Boolean(periodLock.lockedAt),
  );
}

async function getLinkedTimelineEvents(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  ledgerEntryIds: string[],
) {
  if (ledgerEntryIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("timeline_events")
    .select("id, ledger_entry_id, title, archived_at")
    .eq("organization_id", organizationId)
    .in("ledger_entry_id", ledgerEntryIds)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new Error(
      `Could not load linked ledger timeline events: ${result.error.message}`,
    );
  }

  return result.data ?? [];
}

async function getLinkedLedgerDocuments(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  ledgerEntryIds: string[],
) {
  if (ledgerEntryIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("documents")
    .select(
      "id, ledger_entry_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
    )
    .eq("organization_id", organizationId)
    .in("ledger_entry_id", ledgerEntryIds)
    .is("archived_at", null);

  if (result.error) {
    throw new Error(`Could not load ledger documents: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function getLinkedLedgerActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  ledgerEntryIds: string[],
) {
  if (ledgerEntryIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("activity_logs")
    .select(
      "id, entity_type, entity_id, action, previous_values, new_values, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("entity_type", "ledger_entry")
    .in("entity_id", ledgerEntryIds)
    .order("created_at", { ascending: false })
    .limit(120);

  if (result.error) {
    throw new Error(
      `Could not load ledger entry activity: ${result.error.message}`,
    );
  }

  return result.data ?? [];
}

async function getLedgerEntryIdsMatchingTimelineSearch(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  tokens: string[],
) {
  let query = supabase
    .from("timeline_events")
    .select("ledger_entry_id")
    .eq("organization_id", organizationId)
    .not("ledger_entry_id", "is", null);

  for (const token of tokens) {
    query = query.or(`title.ilike.%${token}%,description.ilike.%${token}%`);
  }

  const result = await query.limit(maxRelatedSearchIds);

  if (result.error) {
    throw new Error(
      `Could not search linked ledger timeline events: ${result.error.message}`,
    );
  }

  return Array.from(
    new Set(
      (result.data ?? [])
        .map((row) => row.ledger_entry_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

function buildLedgerSearchGroups({
  properties,
  propertiesById,
  relatedLedgerEntryIds,
  searchTokens,
  units,
}: {
  properties: PropertyRow[];
  propertiesById: Map<string, PropertyRow>;
  relatedLedgerEntryIds: string[];
  searchTokens: string[];
  units: UnitRow[];
}) {
  return searchTokens.map((token) => {
    const conditions = [
      `category.ilike.%${token}%`,
      `description.ilike.%${token}%`,
      `direction.ilike.%${token}%`,
    ];

    addInCondition(
      conditions,
      "property_id",
      findMatchingIds(
        properties,
        token,
        (property) => `${property.code} ${property.name}`,
      ),
    );
    addInCondition(
      conditions,
      "unit_id",
      findMatchingIds(units, token, (unit) => {
        const property = propertiesById.get(unit.property_id);

        return `${property?.code ?? ""} ${property?.name ?? ""} ${unit.unit_number}`;
      }),
    );
    addInCondition(conditions, "id", relatedLedgerEntryIds);

    return conditions.join(",");
  });
}

function addInCondition(conditions: string[], column: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids)).slice(0, maxRelatedSearchIds);

  if (uniqueIds.length > 0) {
    conditions.push(`${column}.in.(${uniqueIds.join(",")})`);
  }
}

function findMatchingIds<T extends { id: string }>(
  rows: T[],
  token: string,
  toText: (row: T) => string,
) {
  return rows
    .filter((row) => textMatchesToken(toText(row), token))
    .map((row) => row.id);
}

function getRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}
