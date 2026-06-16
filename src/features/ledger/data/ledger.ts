import { createSupabaseServerClient } from "@/lib/db/server";
import { toRecentChange } from "@/features/activity/recent-changes";
import { buildLedgerSnapshot } from "@/features/ledger/data/ledger-summary";
import type {
  LedgerEntry,
  LedgerPeriodLock,
  LedgerPropertyOption,
  LedgerUnitOption,
} from "@/features/ledger/ledger.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { CurrencyCode } from "@/lib/money/format";

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

export async function getLedgerScreenData(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [
    ledgerResult,
    propertiesResult,
    unitsResult,
    timelineEventsResult,
    documentsResult,
    periodLocksResult,
    recentActivityResult,
  ] =
    await Promise.all([
      supabase
        .from("ledger_entries")
        .select(
          "id, property_id, unit_id, transaction_date, direction, category, amount, currency, description, archived_at",
        )
        .eq("organization_id", organizationId)
        .order("transaction_date", { ascending: false })
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
        .from("timeline_events")
        .select("id, ledger_entry_id, title, archived_at")
        .eq("organization_id", organizationId)
        .not("ledger_entry_id", "is", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select(
          "id, ledger_entry_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
        )
        .eq("organization_id", organizationId)
        .not("ledger_entry_id", "is", null)
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
    ]);

  if (ledgerResult.error) {
    throw new Error(`Could not load ledger entries: ${ledgerResult.error.message}`);
  }

  if (propertiesResult.error) {
    throw new Error(`Could not load ledger properties: ${propertiesResult.error.message}`);
  }

  if (unitsResult.error) {
    throw new Error(`Could not load ledger units: ${unitsResult.error.message}`);
  }

  if (timelineEventsResult.error) {
    throw new Error(
      `Could not load linked ledger timeline events: ${timelineEventsResult.error.message}`,
    );
  }

  if (documentsResult.error) {
    throw new Error(`Could not load ledger documents: ${documentsResult.error.message}`);
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

  const propertiesById = indexById(propertiesResult.data ?? []);
  const unitsById = indexById(unitsResult.data ?? []);
  const periodLocks = toLedgerPeriodLocks(periodLocksResult.data ?? []);
  const timelineEventsByLedgerEntryId = indexTimelineEventsByLedgerEntryId(
    timelineEventsResult.data ?? [],
  );
  const documentsWithUrls = await addSignedDocumentUrls(
    documentsResult.data ?? [],
    supabase,
  );
  const documentsByLedgerEntryId = groupDocumentsByLedgerEntryId(documentsWithUrls);
  const entries = (ledgerResult.data ?? []).map((entry) =>
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
    propertyOptions: (propertiesResult.data ?? []).map(
      (property): LedgerPropertyOption => ({
        id: property.id,
        label: `${property.code} - ${property.name}`,
      }),
    ),
    periodLocks,
    recentChanges: (recentActivityResult.data ?? []).map(toRecentChange),
    snapshot: {
      ...buildLedgerSnapshot(
        (ledgerResult.data ?? []).filter((entry) => entry.archived_at === null),
      ),
      lockedPeriodCount: String(periodLocks.length),
    },
    unitOptions: (unitsResult.data ?? []).map((unit): LedgerUnitOption => {
      const property = propertiesById.get(unit.property_id);

      return {
        id: unit.id,
        label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
        propertyId: unit.property_id,
      };
    }),
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
