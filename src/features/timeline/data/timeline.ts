import { Constants } from "@/types/database";
import { toRecentChange } from "@/features/activity/recent-changes";
import type { LinkedDocument } from "@/features/documents/document.types";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { createSupabaseServerClient } from "@/lib/db/server";
import { formatMoneyTotals } from "@/lib/money/totals";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelinePropertyOption,
  TimelineSnapshot,
  TimelineUnitOption,
} from "@/features/timeline/timeline.types";

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type UnitRow = {
  id: string;
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
  currency: "USD" | "KHR";
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
  cost_currency: "USD" | "KHR" | null;
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

export async function getTimelineScreenData(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [
    eventsResult,
    propertiesResult,
    unitsResult,
    leasesResult,
    ledgerResult,
    documentsResult,
    periodLocksResult,
    recentActivityResult,
    propertySummaries,
  ] = await Promise.all([
    supabase
      .from("timeline_events")
      .select(
        "id, property_id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency, created_by, archived_at",
      )
      .eq("organization_id", organizationId)
      .order("event_date", { ascending: false })
      .limit(100),
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
      .from("leases")
      .select("id, tenant_name")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("ledger_entries")
      .select("id, category, direction, amount, currency, archived_at")
      .eq("organization_id", organizationId),
    supabase
      .from("documents")
      .select(
        "id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
      )
      .eq("organization_id", organizationId)
      .not("timeline_event_id", "is", null)
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
    getPropertySummaries(organizationId),
  ]);

  if (eventsResult.error) {
    throw new Error(`Could not load timeline events: ${eventsResult.error.message}`);
  }

  if (propertiesResult.error) {
    throw new Error(`Could not load timeline properties: ${propertiesResult.error.message}`);
  }

  if (unitsResult.error) {
    throw new Error(`Could not load timeline units: ${unitsResult.error.message}`);
  }

  if (leasesResult.error) {
    throw new Error(`Could not load timeline leases: ${leasesResult.error.message}`);
  }

  if (ledgerResult.error) {
    throw new Error(`Could not load timeline ledger entries: ${ledgerResult.error.message}`);
  }

  if (documentsResult.error) {
    throw new Error(`Could not load timeline documents: ${documentsResult.error.message}`);
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
  const events = (eventsResult.data ?? []).map((event) =>
    toTimelineEvent({
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
    propertyOptions: (propertiesResult.data ?? []).map(
      (property): TimelinePropertyOption => ({
        id: property.id,
        label: `${property.code} - ${property.name}`,
      }),
    ),
    recentChanges: (recentActivityResult.data ?? []).map(toRecentChange),
    snapshot: buildSnapshot(
      propertySummaries,
      (ledgerResult.data ?? []).filter((entry) => entry.archived_at === null),
      events.filter((event) => !event.archivedAt),
    ),
    unitOptions: (unitsResult.data ?? []).map((unit): TimelineUnitOption => {
      const property = propertiesById.get(unit.property_id);

      return {
        id: unit.id,
        label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
        propertyId: unit.property_id,
      };
    }),
  };
}

function toTimelineEvent({
  documents,
  event,
  isLocked,
  ledgerEntry,
  lease,
  property,
  unit,
}: {
  documents: LinkedDocument[];
  event: TimelineEventRow;
  isLocked: boolean;
  ledgerEntry?: LedgerEntryRow;
  lease?: LeaseRow;
  property?: PropertyRow;
  unit?: UnitRow;
}): TimelineEvent {
  return {
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
    isLocked,
    propertyCode: property?.code ?? "Unknown",
    propertyId: event.property_id,
    propertyName: property?.name ?? "Unknown property",
    relatedDocument: documents[0]?.fileName,
    relatedLease: lease ? `Lease - ${lease.tenant_name}` : undefined,
    relatedLedgerEntry: ledgerEntry
      ? `${ledgerEntry.direction === "expense" ? "Expense" : "Income"} - ${
          ledgerEntry.category
        }`
      : undefined,
    title: event.title,
    ledgerEntryId: event.ledger_entry_id ?? undefined,
    unitId: event.unit_id ?? undefined,
    unitNumber: unit?.unit_number,
  };
}

function buildSnapshot(
  properties: Awaited<ReturnType<typeof getPropertySummaries>>,
  ledgerEntries: LedgerEntryRow[],
  events: TimelineEvent[],
): TimelineSnapshot {
  const unitCount = properties.reduce((total, property) => total + property.units, 0);
  const occupiedUnitCount = properties.reduce(
    (total, property) => total + property.occupiedUnits,
    0,
  );
  const occupancy =
    unitCount > 0 ? `${Math.round((occupiedUnitCount / unitCount) * 100)}%` : "0%";
  const maintenanceEvents = events
    .filter((event) =>
      ["Maintenance", "Repair", "Renovation"].includes(event.eventType),
    )
    .map((event) => ({
      amount: event.cost ?? null,
      currency: event.currency ?? null,
    }));

  return {
    maintenance: formatMoneyTotals(maintenanceEvents),
    netIncome: formatMoneyTotals(ledgerEntries),
    occupancy,
    propertyCount: String(properties.length),
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

async function addSignedDocumentUrls(
  rows: DocumentRow[],
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<TimelineDocumentWithLink[]> {
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage
        .from("nestory-documents")
        .createSignedUrl(row.storage_path, 60 * 60);

      return {
        category: row.category,
        fileName: row.file_name,
        id: row.id,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        timelineEventId: row.timeline_event_id ?? undefined,
        uploadedAt: row.uploaded_at,
        url: data?.signedUrl,
      };
    }),
  );
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
