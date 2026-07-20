import { toRecentChange } from "@/features/activity/recent-changes";
import {
  buildDocumentPagination,
  parseDocumentSearchParams,
} from "@/features/documents/document.filters";
import type {
  DocumentLinkedRecord,
  DocumentScreenData,
  DocumentSummary,
  DocumentViewQuery,
  LinkedDocument,
} from "@/features/documents/document.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";

type DocumentRow = {
  archived_at: string | null;
  category: string;
  file_name: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  mime_type: string;
  property_id: string | null;
  size_bytes: number;
  storage_path: string;
  task_id: string | null;
  timeline_event_id: string | null;
  unit_id: string | null;
  uploaded_at: string;
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

type LedgerRow = {
  category: string;
  direction: string;
  id: string;
};

type TimelineRow = {
  id: string;
  title: string;
};

type TaskRow = {
  id: string;
  title: string;
};

export async function getDocumentsScreenData(
  organizationId: string,
  viewQuery: DocumentViewQuery = parseDocumentSearchParams({}),
): Promise<DocumentScreenData> {
  const supabase = await createSupabaseServerClient();
  const { from, to } = getRange(viewQuery.page, viewQuery.pageSize);

  const [propertiesResult, unitsResult] = await Promise.all([
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
  ]);

  if (propertiesResult.error) {
    throw new Error(`Could not load document properties: ${propertiesResult.error.message}`);
  }

  if (unitsResult.error) {
    throw new Error(`Could not load document units: ${unitsResult.error.message}`);
  }

  let documentsQuery = supabase
    .from("documents")
    .select(
      "id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at, archived_at, property_id, unit_id, lease_id, ledger_entry_id, task_id, timeline_event_id",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  if (viewQuery.archiveState === "active") {
    documentsQuery = documentsQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    documentsQuery = documentsQuery.not("archived_at", "is", null);
  }

  if (viewQuery.documentId !== "all") {
    documentsQuery = documentsQuery.eq("id", viewQuery.documentId);
  }

  if (viewQuery.propertyId !== "all") {
    documentsQuery = documentsQuery.eq("property_id", viewQuery.propertyId);
  }

  if (viewQuery.unitId !== "all") {
    documentsQuery = documentsQuery.eq("unit_id", viewQuery.unitId);
  }

  if (viewQuery.leaseId !== "all") {
    documentsQuery = documentsQuery.eq("lease_id", viewQuery.leaseId);
  }

  if (viewQuery.taskId !== "all") {
    documentsQuery = documentsQuery.eq("task_id", viewQuery.taskId);
  }

  if (viewQuery.query) {
    const token = viewQuery.query.replace(/[,%()]/g, " ").trim().replace(/\s+/g, "%");
    documentsQuery = documentsQuery.or(`file_name.ilike.%${token}%,category.ilike.%${token}%`);
  }

  const documentsResult = await documentsQuery
    .order("uploaded_at", { ascending: false })
    .range(from, to);

  if (documentsResult.error) {
    throw new Error(`Could not load documents: ${documentsResult.error.message}`);
  }

  const rows = documentsResult.data ?? [];
  const documentIds = rows.map((document) => document.id);
  const leaseIds = rows.flatMap((document) => document.lease_id ?? []);
  const ledgerIds = rows.flatMap((document) => document.ledger_entry_id ?? []);
  const taskIds = rows.flatMap((document) => document.task_id ?? []);
  const timelineIds = rows.flatMap((document) => document.timeline_event_id ?? []);
  const [leases, ledgerEntries, tasks, timelineEvents, activityRows] = await Promise.all([
    getLeasesById(supabase, organizationId, leaseIds),
    getLedgerEntriesById(supabase, organizationId, ledgerIds),
    getTasksById(supabase, organizationId, taskIds),
    getTimelineEventsById(supabase, organizationId, timelineIds),
    getDocumentActivity(supabase, organizationId, documentIds),
  ]);
  const propertiesById = indexById(propertiesResult.data ?? []);
  const unitsById = indexById(unitsResult.data ?? []);
  const leasesById = indexById(leases);
  const ledgerById = indexById(ledgerEntries);
  const tasksById = indexById(tasks);
  const timelineById = indexById(timelineEvents);
  const activityByDocumentId = groupActivityByDocumentId(activityRows);
  const signedUrlsByPath = await getSignedDocumentUrls(rows, supabase);
  const documents = rows.map((document) =>
    toDocumentSummary({
      activity: activityByDocumentId.get(document.id) ?? [],
      document,
      ledgerEntry: document.ledger_entry_id
        ? ledgerById.get(document.ledger_entry_id)
        : undefined,
      lease: document.lease_id ? leasesById.get(document.lease_id) : undefined,
      property: document.property_id
        ? propertiesById.get(document.property_id)
        : undefined,
      signedUrl: signedUrlsByPath.get(document.storage_path),
      task: document.task_id ? tasksById.get(document.task_id) : undefined,
      timelineEvent: document.timeline_event_id
        ? timelineById.get(document.timeline_event_id)
        : undefined,
      unit: document.unit_id ? unitsById.get(document.unit_id) : undefined,
    }),
  );

  return {
    documents,
    pagination: buildDocumentPagination({
      page: viewQuery.page,
      pageSize: viewQuery.pageSize,
      totalCount: documentsResult.count ?? documents.length,
    }),
    propertyOptions: (propertiesResult.data ?? []).map((property) => ({
      id: property.id,
      label: formatPropertyOptionLabel(property),
    })),
    unitOptions: (unitsResult.data ?? []).map((unit) => {
      const property = propertiesById.get(unit.property_id);

      return {
        id: unit.id,
        label: formatUnitOptionLabel({
          propertyCode: property?.code,
          unitNumber: unit.unit_number,
        }),
        propertyId: unit.property_id,
      };
    }),
  };
}

function toDocumentSummary({
  activity,
  document,
  ledgerEntry,
  lease,
  property,
  signedUrl,
  task,
  timelineEvent,
  unit,
}: {
  activity: ReturnType<typeof toRecentChange>[];
  document: DocumentRow;
  ledgerEntry?: LedgerRow;
  lease?: LeaseRow;
  property?: PropertyRow;
  signedUrl?: string;
  task?: TaskRow;
  timelineEvent?: TimelineRow;
  unit?: UnitRow;
}): DocumentSummary {
  const linkedRecords = buildLinkedRecords({
    document,
    ledgerEntry,
    lease,
    property,
    task,
    timelineEvent,
    unit,
  });
  const hrefs = {
    document: `/documents?archiveState=all&documentId=${document.id}`,
    ledger: document.ledger_entry_id
      ? `/ledger?archiveState=all&entryId=${document.ledger_entry_id}`
      : undefined,
    lease: document.lease_id
      ? `/leases?archiveState=all&leaseId=${document.lease_id}`
      : undefined,
    maintenance: document.task_id
      ? `/maintenance?archiveState=all&taskId=${document.task_id}`
      : undefined,
    property: document.property_id ? `/properties/${document.property_id}` : undefined,
    timeline: document.timeline_event_id
      ? `/timeline?archiveState=all&eventId=${document.timeline_event_id}`
      : undefined,
    unit: document.unit_id ? `/units/${document.unit_id}` : undefined,
  };
  const linked = linkedRecords.length > 0;
  const isArchived = Boolean(document.archived_at);
  const linkedDocument: LinkedDocument = {
    category: document.category,
    fileName: document.file_name,
    id: document.id,
    mimeType: document.mime_type,
    sizeBytes: document.size_bytes,
    uploadedAt: document.uploaded_at,
    url: signedUrl,
  };

  return {
    ...linkedDocument,
    activity,
    archivedAt: document.archived_at ?? undefined,
    formValues: {
      category: document.category,
      leaseId: document.lease_id,
      propertyId: document.property_id ?? "",
      taskId: document.task_id,
      unitId: document.unit_id,
    },
    hrefs,
    isArchived,
    linkedRecords,
    nextAction: isArchived
      ? {
          description: "Restore this document if it should return to active evidence.",
          href: hrefs.document,
          label: "Review restore",
          tone: "warning",
        }
      : !linked
        ? {
            description: "Attach this file to a property or unit context.",
            href: hrefs.document,
            label: "Add link",
            tone: "warning",
          }
        : {
            description: "Open the file or review its linked operational record.",
            href: signedUrl ?? hrefs.document,
            label: "Review file",
            tone: "neutral",
          },
    riskIndicators: [
      {
        description: isArchived
          ? "Archived documents are hidden from active evidence lists."
          : "This document appears in active evidence lists.",
        id: "archive",
        label: isArchived ? "Archived" : "Active evidence",
        tone: isArchived ? "warning" : "success",
      },
      {
        description: linked
          ? "This document is connected to at least one operational record."
          : "This document is not connected to a property, unit, lease, ledger, or timeline record.",
        id: "links",
        label: linked ? "Linked" : "Link missing",
        tone: linked ? "success" : "warning",
      },
      {
        description: signedUrl
          ? "A temporary signed URL is available for review."
          : "The file exists in metadata, but a signed URL was not returned.",
        id: "file",
        label: signedUrl ? "File available" : "File unavailable",
        tone: signedUrl ? "success" : "danger",
      },
    ],
    storagePath: document.storage_path,
  };
}

function buildLinkedRecords({
  document,
  ledgerEntry,
  lease,
  property,
  task,
  timelineEvent,
  unit,
}: {
  document: DocumentRow;
  ledgerEntry?: LedgerRow;
  lease?: LeaseRow;
  property?: PropertyRow;
  task?: TaskRow;
  timelineEvent?: TimelineRow;
  unit?: UnitRow;
}): DocumentLinkedRecord[] {
  return [
    property && document.property_id
      ? {
          href: `/properties/${document.property_id}`,
          label: `${property.code} / ${property.name}`,
          type: "Property",
        }
      : null,
    unit && document.unit_id
      ? {
          href: `/units/${document.unit_id}`,
          label: `Unit ${unit.unit_number}`,
          type: "Unit",
        }
      : null,
    lease && document.lease_id
      ? {
          href: `/leases?archiveState=all&leaseId=${document.lease_id}`,
          label: lease.tenant_name,
          type: "Lease",
        }
      : null,
    ledgerEntry && document.ledger_entry_id
      ? {
          href: `/ledger?archiveState=all&entryId=${document.ledger_entry_id}`,
          label: `${ledgerEntry.direction} / ${ledgerEntry.category}`,
          type: "Ledger",
        }
      : null,
    task && document.task_id
      ? {
          href: `/maintenance?archiveState=all&taskId=${document.task_id}`,
          label: task.title,
          type: "Maintenance",
        }
      : null,
    timelineEvent && document.timeline_event_id
      ? {
          href: `/timeline?archiveState=all&eventId=${document.timeline_event_id}`,
          label: timelineEvent.title,
          type: "Timeline",
        }
      : null,
  ].filter((record): record is DocumentLinkedRecord => Boolean(record));
}

async function getSignedDocumentUrls(
  rows: DocumentRow[],
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  if (rows.length === 0) {
    return new Map<string, string>();
  }

  const { data } = await supabase.storage.from("nestory-documents").createSignedUrls(
    rows.map((row) => row.storage_path),
    60 * 60,
  );
  const urlsByPath = new Map<string, string>();

  rows.forEach((row, index) => {
    const signedUrl = data?.[index]?.signedUrl ?? undefined;

    if (signedUrl) {
      urlsByPath.set(row.storage_path, signedUrl);
    }
  });

  return urlsByPath;
}

async function getLeasesById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  ids: string[],
) {
  const uniqueIds = uniqueIdsOrEmpty(ids);

  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("leases")
    .select("id, tenant_name")
    .eq("organization_id", organizationId)
    .in("id", uniqueIds);

  if (result.error) {
    throw new Error(`Could not load document leases: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function getLedgerEntriesById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  ids: string[],
) {
  const uniqueIds = uniqueIdsOrEmpty(ids);

  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("ledger_entries")
    .select("id, category, direction")
    .eq("organization_id", organizationId)
    .in("id", uniqueIds);

  if (result.error) {
    throw new Error(
      `Could not load document ledger entries: ${result.error.message}`,
    );
  }

  return result.data ?? [];
}

async function getTasksById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  ids: string[],
) {
  const uniqueIds = uniqueIdsOrEmpty(ids);

  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("tasks")
    .select("id, title")
    .eq("organization_id", organizationId)
    .in("id", uniqueIds);

  if (result.error) {
    throw new Error(`Could not load document tasks: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function getTimelineEventsById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  ids: string[],
) {
  const uniqueIds = uniqueIdsOrEmpty(ids);

  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("timeline_events")
    .select("id, title")
    .eq("organization_id", organizationId)
    .in("id", uniqueIds);

  if (result.error) {
    throw new Error(
      `Could not load document timeline events: ${result.error.message}`,
    );
  }

  return result.data ?? [];
}

function uniqueIdsOrEmpty(ids: string[]) {
  return [...new Set(ids)];
}

async function getDocumentActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  documentIds: string[],
) {
  if (documentIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("activity_logs")
    .select("id, entity_type, entity_id, action, previous_values, new_values, created_at")
    .eq("organization_id", organizationId)
    .eq("entity_type", "document")
    .in("entity_id", documentIds)
    .order("created_at", { ascending: false })
    .limit(120);

  if (result.error) {
    throw new Error(`Could not load document activity: ${result.error.message}`);
  }

  return result.data ?? [];
}

function groupActivityByDocumentId(rows: Parameters<typeof toRecentChange>[0][]) {
  const grouped = new Map<string, ReturnType<typeof toRecentChange>[]>();

  for (const row of rows) {
    const group = grouped.get(row.entity_id) ?? [];
    group.push(toRecentChange(row));
    grouped.set(row.entity_id, group);
  }

  return grouped;
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function getRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}
