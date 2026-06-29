import { Constants } from "@/types/database";
import { toRecentChange } from "@/features/activity/recent-changes";
import type { LinkedDocument } from "@/features/documents/document.types";
import {
  buildTimelinePagination,
  DEFAULT_TIMELINE_PAGE_SIZE,
  DEFAULT_TIMELINE_SORT,
} from "@/features/timeline/timeline.filters";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelineNextAction,
  TimelinePropertyOption,
  TimelineRecordCounts,
  TimelineRiskIndicator,
  TimelineUnitOption,
  TimelineViewQuery,
} from "@/features/timeline/timeline.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyCode } from "@/lib/money/format";

const DEFAULT_TIMELINE_VIEW_QUERY: TimelineViewQuery = {
  archiveState: "active",
  eventId: null,
  eventType: "all",
  page: 1,
  pageSize: DEFAULT_TIMELINE_PAGE_SIZE,
  propertyId: "all",
  query: "",
  sort: DEFAULT_TIMELINE_SORT,
};

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

type LeaseRow = {
  id: string;
  tenant_name: string;
};

type LedgerEntryRow = {
  amount: number;
  archived_at: string | null;
  category: string;
  currency: CurrencyCode;
  direction: string;
  id: string;
};

type DocumentRow = {
  category: string;
  file_name: string;
  id: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  timeline_event_id: string | null;
  uploaded_at: string;
};

type TimelineEventRow = {
  archived_at: string | null;
  cost_amount: number | null;
  cost_currency: CurrencyCode | null;
  created_by: string | null;
  description: string | null;
  event_date: string;
  event_type: TimelineEventType;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  property_id: string;
  title: string;
  unit_id: string | null;
};

type PeriodLockRow = {
  id: string;
  locked_at: string | null;
  period_start: string;
  reason: string | null;
};

type TimelineDocumentWithLink = LinkedDocument & {
  timelineEventId?: string;
};

type FilterableQuery<TQuery> = {
  eq: (column: string, value: string) => TQuery;
  is: (column: string, value: null) => TQuery;
  not: (column: string, operator: string, value: null) => TQuery;
  or: (filters: string) => TQuery;
};

type SortableQuery<TQuery> = {
  order: (column: string, options?: { ascending?: boolean }) => TQuery;
};

export async function getTimelineScreenData(
  organizationId: string,
  viewQuery: TimelineViewQuery = DEFAULT_TIMELINE_VIEW_QUERY,
) {
  const supabase = await createSupabaseServerClient();

  const fetchEventsPage = (page: number) => {
    const { from, to } = getRange(page, viewQuery.pageSize);
    let query = supabase
      .from("timeline_events")
      .select(
        "id, property_id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency, created_by, archived_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId);

    query = applyTimelineFilters(query, viewQuery);
    query = applyTimelineSort(query, viewQuery.sort);

    return query.range(from, to);
  };

  const [
    firstEventsResult,
    propertiesResult,
    unitsResult,
    periodLocksResult,
    recentActivityResult,
  ] = await Promise.all([
    fetchEventsPage(viewQuery.page),
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

  if (firstEventsResult.error) {
    throw new Error(
      `Could not load timeline events: ${firstEventsResult.error.message}`,
    );
  }

  const totalCount = firstEventsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / viewQuery.pageSize));
  const page = Math.min(Math.max(viewQuery.page, 1), totalPages);
  const eventsResult =
    page === viewQuery.page ? firstEventsResult : await fetchEventsPage(page);

  if (eventsResult.error) {
    throw new Error(
      `Could not load timeline events: ${eventsResult.error.message}`,
    );
  }

  if (propertiesResult.error) {
    throw new Error(
      `Could not load timeline properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(
      `Could not load timeline units: ${unitsResult.error.message}`,
    );
  }

  if (periodLocksResult.error) {
    throw new Error(
      `Could not load timeline period locks: ${periodLocksResult.error.message}`,
    );
  }

  if (recentActivityResult.error) {
    throw new Error(
      `Could not load recent timeline activity: ${recentActivityResult.error.message}`,
    );
  }

  const eventRows = eventsResult.data ?? [];
  const eventIds = eventRows.map((event) => event.id);
  const leaseIds = unique(eventRows.flatMap((event) => event.lease_id ?? []));
  const ledgerEntryIds = unique(
    eventRows.flatMap((event) => event.ledger_entry_id ?? []),
  );

  const [leasesResult, ledgerResult, documentsResult] = await Promise.all([
    leaseIds.length > 0
      ? supabase
          .from("leases")
          .select("id, tenant_name")
          .eq("organization_id", organizationId)
          .in("id", leaseIds)
      : Promise.resolve({ data: [] as LeaseRow[], error: null }),
    ledgerEntryIds.length > 0
      ? supabase
          .from("ledger_entries")
          .select("id, category, direction, amount, currency, archived_at")
          .eq("organization_id", organizationId)
          .in("id", ledgerEntryIds)
      : Promise.resolve({ data: [] as LedgerEntryRow[], error: null }),
    eventIds.length > 0
      ? supabase
          .from("documents")
          .select(
            "id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
          )
          .eq("organization_id", organizationId)
          .in("timeline_event_id", eventIds)
          .is("archived_at", null)
      : Promise.resolve({ data: [] as DocumentRow[], error: null }),
  ]);

  if (leasesResult.error) {
    throw new Error(
      `Could not load timeline leases: ${leasesResult.error.message}`,
    );
  }

  if (ledgerResult.error) {
    throw new Error(
      `Could not load timeline ledger entries: ${ledgerResult.error.message}`,
    );
  }

  if (documentsResult.error) {
    throw new Error(
      `Could not load timeline documents: ${documentsResult.error.message}`,
    );
  }

  const propertiesById = indexById(propertiesResult.data ?? []);
  const unitsById = indexById(unitsResult.data ?? []);
  const leasesById = indexById(leasesResult.data ?? []);
  const ledgerById = indexById(ledgerResult.data ?? []);
  const periodLocks = periodLocksResult.data ?? [];
  const documentsWithUrls = await addSignedDocumentUrls(
    documentsResult.data ?? [],
    supabase,
  );
  const documentsByEventId = groupDocumentsByEventId(documentsWithUrls);
  const activityRows = await getLinkedTimelineActivity(
    supabase,
    organizationId,
    eventIds,
  );
  const activityByEventId = groupActivityByEventId(activityRows);
  const events = eventRows.map((event) =>
    toTimelineEvent({
      activity: activityByEventId.get(event.id) ?? [],
      documents: documentsByEventId.get(event.id) ?? [],
      event,
      isLocked: isTimelineEventLocked(event, periodLocks),
      ledgerEntry: event.ledger_entry_id
        ? ledgerById.get(event.ledger_entry_id)
        : undefined,
      lease: event.lease_id ? leasesById.get(event.lease_id) : undefined,
      property: propertiesById.get(event.property_id),
      unit: event.unit_id ? unitsById.get(event.unit_id) : undefined,
    }),
  );
  return {
    eventTypes: [...Constants.public.Enums.timeline_event_type],
    events,
    pagination: buildTimelinePagination({
      page,
      pageSize: viewQuery.pageSize,
      totalCount,
    }),
    propertyOptions: (propertiesResult.data ?? []).map(
      (property): TimelinePropertyOption => ({
        id: property.id,
        label: `${property.code} - ${property.name}`,
      }),
    ),
    recentChanges: (recentActivityResult.data ?? []).map(toRecentChange),
    unitOptions: (unitsResult.data ?? []).map((unit): TimelineUnitOption => {
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

function toTimelineEvent({
  activity,
  documents,
  event,
  isLocked,
  ledgerEntry,
  lease,
  property,
  unit,
}: {
  activity: ReturnType<typeof toRecentChange>[];
  documents: LinkedDocument[];
  event: TimelineEventRow;
  isLocked: boolean;
  ledgerEntry?: LedgerEntryRow;
  lease?: LeaseRow;
  property?: PropertyRow;
  unit?: UnitRow;
}): TimelineEvent {
  const hrefs = buildTimelineDetailHrefs(event, ledgerEntry, lease);
  const recordCounts: TimelineRecordCounts = {
    activity: activity.length,
    documents: documents.length,
    linkedRecords: Number(Boolean(lease)) + Number(Boolean(ledgerEntry)),
  };

  return {
    activity,
    archivedAt: event.archived_at ?? undefined,
    id: event.id,
    cost: event.cost_amount ?? undefined,
    createdBy: event.created_by ? "Admin" : "System",
    currency: event.cost_currency ?? undefined,
    description: event.description ?? "",
    documents,
    eventDate: event.event_date,
    eventType: event.event_type,
    hasAttachment: documents.length > 0,
    hrefs,
    isLocked,
    propertyCode: property?.code ?? "Unknown",
    propertyId: event.property_id,
    propertyName: property?.name ?? "Unknown property",
    relatedDocument: documents[0]?.fileName,
    relatedLease: lease ? `Lease - ${lease.tenant_name}` : undefined,
    relatedLeaseId: event.lease_id ?? undefined,
    relatedLedgerEntry: ledgerEntry
      ? `${ledgerEntry.direction === "expense" ? "Expense" : "Income"} - ${
          ledgerEntry.category
        }`
      : undefined,
    nextAction: buildTimelineNextAction({
      hrefs,
      isArchived: Boolean(event.archived_at),
      isLocked,
      recordCounts,
      isLedgerLinked: Boolean(event.ledger_entry_id),
    }),
    recordCounts,
    riskIndicators: buildTimelineRiskIndicators({
      event,
      isLocked,
      recordCounts,
    }),
    title: event.title,
    ledgerEntryId: event.ledger_entry_id ?? undefined,
    unitId: event.unit_id ?? undefined,
    unitNumber: unit?.unit_number,
  };
}

function applyTimelineFilters<TQuery extends FilterableQuery<TQuery>>(
  query: TQuery,
  viewQuery: TimelineViewQuery,
) {
  let nextQuery = query;

  if (viewQuery.archiveState === "active") {
    nextQuery = nextQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    nextQuery = nextQuery.not("archived_at", "is", null);
  }

  if (viewQuery.eventId) {
    nextQuery = nextQuery.eq("id", viewQuery.eventId);
  } else {
    if (viewQuery.propertyId !== "all") {
      nextQuery = nextQuery.eq("property_id", viewQuery.propertyId);
    }

    if (viewQuery.unitId && viewQuery.unitId !== "all") {
      nextQuery = nextQuery.eq("unit_id", viewQuery.unitId);
    }

    if (viewQuery.eventType !== "all") {
      nextQuery = nextQuery.eq("event_type", viewQuery.eventType);
    }

    const searchPattern = getSearchPattern(viewQuery.query);

    if (searchPattern) {
      nextQuery = nextQuery.or(
        `title.ilike.${searchPattern},description.ilike.${searchPattern}`,
      );
    }
  }

  return nextQuery;
}

function applyTimelineSort<TQuery extends SortableQuery<TQuery>>(
  query: TQuery,
  sort: TimelineViewQuery["sort"],
) {
  if (sort === "date_asc") {
    return query.order("event_date", { ascending: true }).order("id", {
      ascending: true,
    });
  }

  if (sort === "type_asc") {
    return query.order("event_type", { ascending: true }).order("event_date", {
      ascending: false,
    });
  }

  if (sort === "property_asc") {
    return query.order("property_id", { ascending: true }).order("event_date", {
      ascending: false,
    });
  }

  return query.order("event_date", { ascending: false }).order("id", {
    ascending: false,
  });
}

function getRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

async function addSignedDocumentUrls(
  rows: DocumentRow[],
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<TimelineDocumentWithLink[]> {
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
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    timelineEventId: row.timeline_event_id ?? undefined,
    uploadedAt: row.uploaded_at,
    url: data?.[index]?.signedUrl ?? undefined,
  }));
}

async function getLinkedTimelineActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  eventIds: string[],
) {
  if (eventIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("activity_logs")
    .select(
      "id, entity_type, entity_id, action, previous_values, new_values, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("entity_type", "timeline_event")
    .in("entity_id", eventIds)
    .order("created_at", { ascending: false })
    .limit(120);

  if (result.error) {
    throw new Error(
      `Could not load timeline event activity: ${result.error.message}`,
    );
  }

  return result.data ?? [];
}

function groupDocumentsByEventId(rows: TimelineDocumentWithLink[]) {
  const grouped = new Map<string, LinkedDocument[]>();

  for (const row of rows) {
    if (!row.timelineEventId) {
      continue;
    }

    const group = grouped.get(row.timelineEventId) ?? [];
    group.push(row);
    grouped.set(row.timelineEventId, group);
  }

  return grouped;
}

function groupActivityByEventId(rows: Parameters<typeof toRecentChange>[0][]) {
  const grouped = new Map<string, ReturnType<typeof toRecentChange>[]>();

  for (const row of rows) {
    const group = grouped.get(row.entity_id) ?? [];
    group.push(toRecentChange(row));
    grouped.set(row.entity_id, group);
  }

  return grouped;
}

function buildTimelineDetailHrefs(
  event: TimelineEventRow,
  ledgerEntry?: LedgerEntryRow,
  lease?: LeaseRow,
) {
  return {
    documents: buildHref("/documents", {
      query: event.title,
    }),
    ledger: ledgerEntry
      ? buildHref("/ledger", {
          archiveState: "all",
          entryId: ledgerEntry.id,
          query: ledgerEntry.category,
        })
      : undefined,
    lease: lease
      ? buildHref("/leases", {
          archiveState: "all",
          leaseId: lease.id,
          query: lease.tenant_name,
        })
      : undefined,
    property: `/properties/${event.property_id}`,
    timeline: buildHref("/timeline", {
      archiveState: "all",
      eventId: event.id,
      query: event.title,
    }),
    unit: event.unit_id ? `/units/${event.unit_id}` : undefined,
  };
}

function buildTimelineRiskIndicators({
  event,
  isLocked,
  recordCounts,
}: {
  event: TimelineEventRow;
  isLocked: boolean;
  recordCounts: TimelineRecordCounts;
}): TimelineRiskIndicator[] {
  const isArchived = Boolean(event.archived_at);
  const hasCost = event.cost_amount !== null;

  return [
    {
      description: isLocked
        ? "This event belongs to a locked accounting period."
        : "This event is open for operational correction.",
      id: "lock",
      label: isLocked ? "Period locked" : "Period open",
      tone: isLocked ? "warning" : "success",
    },
    {
      description: isArchived
        ? "Archived events stay available for audit but are hidden from active views."
        : "This event is visible in active timeline views.",
      id: "archive",
      label: isArchived ? "Archived" : "Active timeline",
      tone: isArchived ? "warning" : "success",
    },
    {
      description: event.ledger_entry_id
        ? "Ledger-linked events must be edited from Ledger to keep totals in sync."
        : "This event can be edited directly from Timeline.",
      id: "ledger",
      label: event.ledger_entry_id
        ? "Ledger controlled"
        : "Timeline controlled",
      tone: event.ledger_entry_id ? "accent" : "success",
    },
    {
      description:
        recordCounts.documents > 0
          ? "Supporting documents are attached."
          : "No supporting documents are attached yet.",
      id: "documents",
      label:
        recordCounts.documents > 0 ? "Evidence attached" : "Evidence missing",
      tone: recordCounts.documents > 0 ? "success" : "warning",
    },
    {
      description: hasCost
        ? "Cost context is recorded for reporting."
        : "No direct cost is recorded on this timeline event.",
      id: "cost",
      label: hasCost ? "Cost recorded" : "No direct cost",
      tone: hasCost ? "success" : "neutral",
    },
  ];
}

function buildTimelineNextAction({
  hrefs,
  isArchived,
  isLedgerLinked,
  isLocked,
  recordCounts,
}: {
  hrefs: TimelineEvent["hrefs"];
  isArchived: boolean;
  isLedgerLinked: boolean;
  isLocked: boolean;
  recordCounts: TimelineRecordCounts;
}): TimelineNextAction {
  if (isLocked) {
    return {
      description: "Unlock the accounting period before changing this event.",
      href: hrefs.ledger ?? hrefs.timeline,
      label: "Review lock",
      tone: "warning",
    };
  }

  if (isArchived) {
    return {
      description: "Restore this event if it should return to active history.",
      href: hrefs.timeline,
      label: "Review restore",
      tone: "warning",
    };
  }

  if (isLedgerLinked) {
    return {
      description:
        "Use Ledger for edits so the financial record and history stay aligned.",
      href: hrefs.ledger ?? hrefs.timeline,
      label: "Open ledger",
      tone: "accent",
    };
  }

  if (recordCounts.documents === 0) {
    return {
      description: "Attach supporting evidence for this timeline event.",
      href: hrefs.documents,
      label: "Attach document",
      tone: "warning",
    };
  }

  return {
    description: "Review linked records and supporting history.",
    href: hrefs.timeline,
    label: "Review event",
    tone: "neutral",
  };
}

function buildHref(
  pathname: string,
  params: Record<string, string | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

function isTimelineEventLocked(
  event: TimelineEventRow,
  periodLocks: PeriodLockRow[],
) {
  if (event.cost_amount === null && event.ledger_entry_id === null) {
    return false;
  }

  const periodStart = `${event.event_date.slice(0, 7)}-01`;

  return periodLocks.some(
    (periodLock) =>
      periodLock.period_start === periodStart && Boolean(periodLock.locked_at),
  );
}

function getSearchPattern(value: string) {
  const normalized = value
    .replace(/[,%()]/g, " ")
    .trim()
    .replace(/\s+/g, "%");

  return normalized ? `%${normalized}%` : "";
}

function unique(values: string[]) {
  return [...new Set(values)];
}
