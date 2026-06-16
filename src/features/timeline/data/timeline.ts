import { Constants } from "@/types/database";
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
  category: string;
  currency: "USD" | "KHR";
  direction: string;
  id: string;
};

type DocumentRow = {
  file_name: string;
  timeline_event_id: string | null;
};

type TimelineEventRow = {
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

export async function getTimelineScreenData(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [
    eventsResult,
    propertiesResult,
    unitsResult,
    leasesResult,
    ledgerResult,
    documentsResult,
    propertySummaries,
  ] = await Promise.all([
    supabase
      .from("timeline_events")
      .select(
        "id, property_id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency, created_by",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
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
      .select("id, category, direction, amount, currency")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("documents")
      .select("timeline_event_id, file_name")
      .eq("organization_id", organizationId)
      .not("timeline_event_id", "is", null)
      .is("archived_at", null),
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

  const propertiesById = indexById(propertiesResult.data ?? []);
  const unitsById = indexById(unitsResult.data ?? []);
  const leasesById = indexById(leasesResult.data ?? []);
  const ledgerById = indexById(ledgerResult.data ?? []);
  const documentsByEventId = groupDocumentsByEventId(documentsResult.data ?? []);
  const events = (eventsResult.data ?? []).map((event) =>
    toTimelineEvent({
      documents: documentsByEventId.get(event.id) ?? [],
      event,
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
    snapshot: buildSnapshot(propertySummaries, ledgerResult.data ?? [], events),
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
  ledgerEntry,
  lease,
  property,
  unit,
}: {
  documents: DocumentRow[];
  event: TimelineEventRow;
  ledgerEntry?: LedgerEntryRow;
  lease?: LeaseRow;
  property?: PropertyRow;
  unit?: UnitRow;
}): TimelineEvent {
  return {
    id: event.id,
    cost: event.cost_amount ?? undefined,
    createdBy: event.created_by ? "Admin" : "System",
    currency: event.cost_currency ?? undefined,
    description: event.description ?? "No description recorded.",
    eventDate: event.event_date,
    eventType: event.event_type,
    hasAttachment: documents.length > 0,
    propertyCode: property?.code ?? "Unknown",
    propertyId: event.property_id,
    propertyName: property?.name ?? "Unknown property",
    relatedDocument: documents[0]?.file_name,
    relatedLease: lease ? `Lease - ${lease.tenant_name}` : undefined,
    relatedLedgerEntry: ledgerEntry
      ? `${ledgerEntry.direction === "expense" ? "Expense" : "Income"} - ${
          ledgerEntry.category
        }`
      : undefined,
    title: event.title,
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

function groupDocumentsByEventId(rows: DocumentRow[]) {
  const grouped = new Map<string, DocumentRow[]>();

  for (const row of rows) {
    if (!row.timeline_event_id) {
      continue;
    }

    const group = grouped.get(row.timeline_event_id) ?? [];
    group.push(row);
    grouped.set(row.timeline_event_id, group);
  }

  return grouped;
}
