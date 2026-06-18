import { createSupabaseServerClient } from "@/lib/db/server";
import { toRecentChange } from "@/features/activity/recent-changes";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import {
  DEFAULT_LEDGER_VIEW_QUERY,
  buildLedgerPagination,
} from "@/features/ledger/ledger.filters";
import type {
  LedgerEntry,
  LedgerPeriodLock,
  LedgerPropertyOption,
  LedgerUnitOption,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { CurrencyCode } from "@/lib/money/format";
import {
  getQueryTokens,
  textMatchesToken,
} from "@/lib/query/screen-query";

const ledgerEntrySelect =
  "id, property_id, unit_id, transaction_date, direction, category, amount, currency, description, archived_at";
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
  amount: number;
  archived_at: string | null;
  category: string;
  currency: CurrencyCode;
  description: string | null;
  direction: string;
  id: string;
  property_id: string;
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
    currencySettings,
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
      .select("id, entity_type, action, previous_values, new_values, created_at")
      .eq("organization_id", organizationId)
      .in("entity_type", ["timeline_event", "ledger_entry", "ledger_period"])
      .order("created_at", { ascending: false })
      .limit(6),
    getOrganizationCurrencySettings(organizationId),
  ]);

  if (propertiesResult.error) {
    throw new Error(`Could not load ledger properties: ${propertiesResult.error.message}`);
  }

  if (unitsResult.error) {
    throw new Error(`Could not load ledger units: ${unitsResult.error.message}`);
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
  const searchTokens = getQueryTokens(viewQuery.query);
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
  const { from, to } = getRange(viewQuery.page, viewQuery.pageSize);

  let ledgerQuery = supabase
    .from("ledger_entries")
    .select(ledgerEntrySelect, { count: "exact" })
    .eq("organization_id", organizationId);

  if (viewQuery.archiveState === "active") {
    ledgerQuery = ledgerQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    ledgerQuery = ledgerQuery.not("archived_at", "is", null);
  }

  if (viewQuery.direction !== "all") {
    ledgerQuery = ledgerQuery.eq("direction", viewQuery.direction);
  }

  if (viewQuery.propertyId !== "all") {
    ledgerQuery = ledgerQuery.eq("property_id", viewQuery.propertyId);
  }

  for (const searchGroup of searchGroups) {
    ledgerQuery = ledgerQuery.or(searchGroup);
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
    throw new Error(`Could not load ledger entries: ${ledgerResult.error.message}`);
  }

  const entriesPage = ledgerResult.data ?? [];
  const visibleEntryIds = entriesPage.map((entry) => entry.id);
  const [timelineEvents, documents] = await Promise.all([
    getLinkedTimelineEvents(supabase, organizationId, visibleEntryIds),
    getLinkedLedgerDocuments(supabase, organizationId, visibleEntryIds),
  ]);
  const timelineEventsByLedgerEntryId =
    indexTimelineEventsByLedgerEntryId(timelineEvents);
  const documentsWithUrls = await addSignedDocumentUrls(documents, supabase);
  const documentsByLedgerEntryId = groupDocumentsByLedgerEntryId(documentsWithUrls);
  const entries = entriesPage.map((entry) =>
    toLedgerEntry({
      documents: documentsByLedgerEntryId.get(entry.id) ?? [],
      entry,
      isLocked: isDateLocked(entry.transaction_date, periodLocks),
      property: propertiesById.get(entry.property_id),
      relatedTimelineEvent: timelineEventsByLedgerEntryId.get(entry.id),
      unit: entry.unit_id ? unitsById.get(entry.unit_id) : undefined,
    }),
  );

  return {
    entries,
    pagination: buildLedgerPagination({
      page: viewQuery.page,
      pageSize: viewQuery.pageSize,
      totalCount: ledgerResult.count ?? entries.length,
    }),
    periodLocks,
    propertyOptions: properties.map(
      (property): LedgerPropertyOption => ({
        id: property.id,
        label: `${property.code} - ${property.name}`,
      }),
    ),
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
    currencySettings,
  };
}

function toLedgerEntry({
  documents,
  entry,
  isLocked,
  property,
  relatedTimelineEvent,
  unit,
}: {
  documents: LinkedDocument[];
  entry: LedgerEntryRow;
  isLocked: boolean;
  property?: PropertyRow;
  relatedTimelineEvent?: TimelineEventRow;
  unit?: UnitRow;
}): LedgerEntry {
  return {
    amount: entry.amount,
    archivedAt: entry.archived_at ?? undefined,
    category: entry.category,
    currency: entry.currency,
    description: entry.description ?? "",
    documents,
    direction: entry.direction === "expense" ? "expense" : "income",
    id: entry.id,
    isLocked,
    propertyCode: property?.code ?? "Unknown",
    propertyId: entry.property_id,
    propertyName: property?.name ?? "Unknown property",
    relatedTimelineEvent: relatedTimelineEvent
      ? {
          id: relatedTimelineEvent.id,
          title: relatedTimelineEvent.title,
        }
      : undefined,
    transactionDate: entry.transaction_date,
    unitId: entry.unit_id ?? undefined,
    unitNumber: unit?.unit_number,
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
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
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage
        .from("nestory-documents")
        .createSignedUrl(row.storage_path, 60 * 60);

      return {
        category: row.category,
        fileName: row.file_name,
        id: row.id,
        ledgerEntryId: row.ledger_entry_id ?? undefined,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        uploadedAt: row.uploaded_at,
        url: data?.signedUrl,
      };
    }),
  );
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
      findMatchingIds(properties, token, (property) =>
        `${property.code} ${property.name}`,
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
