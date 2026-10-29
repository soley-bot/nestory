import { readPortfolioLedgerTotals, readPortfolioRegisterPage, trailingTwelveMonthStart } from "@/lib/db/portfolio-readers";
import { getMaintenanceCaseCounts } from "@/features/properties/data/property-detail-counts";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { createSupabaseServerClient } from "@/lib/db/server";
import { withFinancialReadContext } from "@/lib/finance/financial-write-context.server";
import { DEFAULT_COMPLETE_READ_MAX_ROWS, readCompleteRows } from "@/lib/db/complete-read";
import { documentDownloadUrl } from "@/lib/uploads/document-download";
import { isMissingSchemaObjectMessage } from "@/lib/db/schema-errors";
import {
  resolveRecentChangeTargets,
  type ActivityTargetQueryClient,
} from "@/features/activity/recent-change-targets";
import {
  getAssetPhotosForScope,
  getUnitPhotoThumbnailUrls,
} from "@/features/photos/data/photos";
import {
  buildUnitDetail,
  buildUnitSummary,
  selectCurrentLease,
  selectNewestDraftLease,
  type UnitDocumentRecord,
  type UnitLeaseRecord,
  type UnitMaintenanceRecord,
  type UnitPersonRecord,
  type UnitPropertyRecord,
  type UnitRecord,
  type UnitTimelineRecord,
} from "@/features/units/data/unit-summary";
import {
  parseUnitSearchParams,
} from "@/features/units/unit.filters";
import type {
  UnitPagination,
  UnitLeaseStatusFilter,
  UnitOccupancyFilter,
  UnitPropertyOption,
  UnitSummary,
  UnitViewQuery,
} from "@/features/units/unit.types";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";

const unitSelect =
  "id, property_id, unit_number, floor, size_sqm, bedroom_count, bathroom_count, status, current_rent_amount, current_rent_currency, archived_at";
const propertySelect = "id, code, name";
const unitWithPropertySelect = `${unitSelect}, property:properties!units_property_id_fkey(${propertySelect})`;
const leaseSelect =
  "id, unit_id, tenant_name, primary_tenant_person_id, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency";
const timelineContextSelect =
  "id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency";
const recentLedgerSelect =
  "id, unit_id, transaction_date, direction, category, amount, currency, description";
const documentSelect =
  "id, lease_id, ledger_entry_id, task_id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at";
const maintenanceSelect =
  "id, title, category, priority, status, due_date, due_time, actual_cost_amount, actual_cost_currency";
const unitImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const detailRecordLimit = 12;
const unitRelationshipBatchSize = 75;

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type UnitFilterQuery = ReturnType<typeof buildUnitBaseQuery>;
type UnitRowWithProperty = UnitRecord & {
  property: UnitPropertyRecord | UnitPropertyRecord[] | null;
};

function buildUnitBaseQuery(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  return supabase
    .from("units")
    .select(unitWithPropertySelect, { count: "exact" })
    .eq("organization_id", organizationId);
}
type PagedUnitRowsResult = {
  propertiesById: Map<string, UnitPropertyRecord>;
  totalCount: number;
  units: UnitRecord[];
};
type UnitImageRow = {
  id: string;
  storage_path: string;
  unit_id: string | null;
};
type UnitPrimaryOwnerRow = {
  id: string;
  person:
    | { display_name: string }
    | Array<{ display_name: string }>
    | null;
  property_id: string;
};

export async function getUnitsScreenData(
  organizationId: string,
  viewQuery: UnitViewQuery = parseUnitSearchParams({}),
) {
  return withFinancialReadContext(organizationId, async (context) => {
    const result = await readUnitsScreenData(organizationId, viewQuery);
    return {
      ...result,
      financialGeneration: context.generation,
      units: result.units.map((unit) => ({ ...unit, financialGeneration: context.generation })),
    };
  });
}

async function readUnitsScreenData(organizationId: string, viewQuery: UnitViewQuery) {
  const supabase = await createSupabaseServerClient();

  if (canUsePagedUnitBaseQuery(viewQuery)) {
    return getPagedUnitsScreenData({
      organizationId,
      supabase,
      viewQuery,
    });
  }

  return getCompleteUnitsScreenData({
    organizationId,
    supabase,
    viewQuery,
  });
}

export async function getUnitPropertyOptions(
  organizationId: string,
): Promise<UnitPropertyOption[]> {
  const supabase = await createSupabaseServerClient();
  const properties = await readCompleteRows<UnitPropertyRecord>({
    context: "Could not load unit property options",
    getRowId: row => row.id,
    readPage: (from, to) => supabase
    .from("properties")
    .select(propertySelect, { count: "exact" })
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("code", { ascending: true })
    .order("id", { ascending: true }).range(from, to),
  });

  return properties.map((property) => ({
    id: property.id,
    label: formatPropertyOptionLabel(property),
  }));
}

function canUsePagedUnitBaseQuery(viewQuery: UnitViewQuery) {
  return (
    viewQuery.query.trim().length === 0 &&
    viewQuery.occupancy === "all" &&
    viewQuery.leaseStatus === "all" &&
    (viewQuery.sort === "property_asc" ||
      viewQuery.sort === "unit_asc" ||
      viewQuery.sort === "status_asc")
  );
}

async function getPagedUnitsScreenData({
  organizationId,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: UnitViewQuery;
}) {
  let rowsResult = await getPagedUnitRows({
    organizationId,
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    supabase,
    viewQuery,
  });
  let pagination = buildUnitPagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: rowsResult.totalCount,
  });

  if (pagination.page !== viewQuery.page && rowsResult.totalCount > 0) {
    const previousCount = rowsResult.totalCount;
    rowsResult = await getPagedUnitRows({
      organizationId,
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      supabase,
      viewQuery,
    });
    if (rowsResult.totalCount !== previousCount) {
      throw new Error("Could not load units: The row count changed while loading. Reload and try again.");
    }
    pagination = buildUnitPagination({
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      totalCount: rowsResult.totalCount,
    });
  }

  return {
    pagination,
    units: await loadUnitSummariesForRows({
      organizationId,
      propertiesById: rowsResult.propertiesById,
      supabase,
      unitRows: rowsResult.units,
    }),
  };
}

async function getPagedUnitRows({
  organizationId,
  page,
  pageSize,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  page: number;
  pageSize: number;
  supabase: SupabaseServerClient;
  viewQuery: UnitViewQuery;
}): Promise<PagedUnitRowsResult> {
  const range = getRange(page, pageSize);
  let unitsQuery = buildUnitBaseQuery(supabase, organizationId);

  unitsQuery = applyUnitBaseFilters(unitsQuery, viewQuery);
  unitsQuery = applyUnitBaseSort(unitsQuery, viewQuery);

  const unitsResult = await unitsQuery.order("id", { ascending: true }).range(range.from, range.to);

  if (unitsResult.error) {
    throw new Error(`Could not load units: ${unitsResult.error.message}`);
  }

  if (!Array.isArray(unitsResult.data)) {
    throw new Error("Could not load units: The query returned no row data.");
  }
  const rows = unitsResult.data as UnitRowWithProperty[];
  if (typeof unitsResult.count !== "number" || !Number.isSafeInteger(unitsResult.count) || unitsResult.count < 0 ||
    rows.length !== Math.min(pageSize, Math.max(0, unitsResult.count - range.from))) {
    throw new Error("Could not load units: The page is incomplete or its exact count is unavailable. Reload and try again.");
  }
  const { propertiesById, units } = splitUnitRowsAndProperties(rows);

  return {
    propertiesById,
    totalCount: unitsResult.count,
    units,
  };
}

function applyUnitBaseFilters(
  query: UnitFilterQuery,
  viewQuery: UnitViewQuery,
) {
  let filteredQuery = query;

  if (viewQuery.archiveState === "active") {
    filteredQuery = filteredQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    filteredQuery = filteredQuery.not("archived_at", "is", null);
  }

  if (viewQuery.propertyId !== "all") {
    filteredQuery = filteredQuery.eq("property_id", viewQuery.propertyId);
  }

  if (viewQuery.status !== "all") {
    filteredQuery = filteredQuery.eq("status", viewQuery.status);
  }

  return filteredQuery;
}

function applyUnitBaseSort(
  query: ReturnType<typeof applyUnitBaseFilters>,
  viewQuery: UnitViewQuery,
) {
  let sortedQuery = query;

  if (viewQuery.archiveState === "all") {
    sortedQuery = sortedQuery.order("archived_at", {
      ascending: true,
      nullsFirst: true,
    });
  }

  if (viewQuery.sort === "unit_asc") {
    return sortedQuery
      .order("unit_number", { ascending: true })
      .order("property(code)", { ascending: true })
      .order("property(name)", { ascending: true });
  }

  if (viewQuery.sort === "status_asc") {
    return sortedQuery
      .order("status", { ascending: true })
      .order("property(code)", { ascending: true })
      .order("unit_number", { ascending: true });
  }

  return sortedQuery
    .order("property(code)", { ascending: true })
    .order("property(name)", { ascending: true })
    .order("unit_number", { ascending: true });
}

function splitUnitRowsAndProperties(rows: UnitRowWithProperty[]) {
  const propertiesById = new Map<string, UnitPropertyRecord>();
  const units = rows.map((row) => {
    const { property, ...unit } = row;
    const propertyRow = Array.isArray(property) ? property[0] : property;

    if (propertyRow) {
      propertiesById.set(propertyRow.id, propertyRow);
    }

    return unit;
  });

  return { propertiesById, units };
}

async function getCompleteUnitsScreenData({
  organizationId,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: UnitViewQuery;
}) {
  const page = await readPortfolioRegisterPage(supabase, "unit", organizationId, viewQuery, viewQuery.page, viewQuery.pageSize);
  const pagination = buildUnitPagination({ page: viewQuery.page, pageSize: viewQuery.pageSize, totalCount: page.totalCount });
  if (!page.ids.length) return { pagination, units: [] };
  const rows = await readCompleteRows<UnitRowWithProperty>({
    maxRows: viewQuery.pageSize,
    context: "Could not load unit page",
    getRowId: row => row.id,
    readPage: (from, to) => buildUnitBaseQuery(supabase, organizationId).in("id", page.ids).order("id").range(from, to),
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  if (rows.length !== page.ids.length || page.ids.some(id => !byId.has(id))) {
    throw new Error("Could not load unit page: Records changed while loading. Reload and try again.");
  }
  const { units: unitRows, propertiesById } = splitUnitRowsAndProperties(page.ids.map(id => byId.get(id)!));
  return {
    pagination,
    units: await loadUnitSummariesForRows({ organizationId, propertiesById, supabase, unitRows }),
  };
}
async function loadUnitSummariesForRows({
  organizationId,
  propertiesById,
  supabase,
  unitRows,
  matching,
}: {
  organizationId: string;
  propertiesById: Map<string, UnitPropertyRecord>;
  supabase: SupabaseServerClient;
  unitRows: UnitRecord[];
  matching?: { includeTimeline: boolean };
}) {
  const unitIds = new Set(unitRows.map((unit) => unit.id));

  if (unitIds.size === 0) {
    return [];
  }

  const propertyIds = new Set(unitRows.map((unit) => unit.property_id));

  const [
    leaseRows,
    timelineContextRows,
    ledgerTotalRows,
    imageRows,
    photoThumbnailUrls,
    ownerNamesByPropertyId,
  ] =
    await Promise.all([
      getLeaseRowsForUnits(supabase, organizationId, [...unitIds]),
      matching
        ? matching.includeTimeline ? getTimelineContextRowsForUnits(supabase, organizationId, [...unitIds], true) : []
        : getTimelineContextRowsForUnits(supabase, organizationId, [...unitIds]),
      matching ? [] : getLedgerTotalRowsForUnits(supabase, organizationId, [...unitIds]),
      matching ? [] : getImageRowsForUnits(supabase, organizationId, [...unitIds]),
      matching ? new Map<string, string>() : getUnitPhotoThumbnailUrls({
        organizationId,
        supabase,
        unitIds: [...unitIds],
      }),
      getPrimaryOwnerNamesForProperties(
        supabase,
        organizationId,
        [...propertyIds],
      ),
    ]);
  const leasesByUnitId = groupByUnitId(leaseRows);
  const ledgerByUnitId = groupByUnitId(ledgerTotalRows);
  const latestTimelineByUnitId = indexLatestTimelineByUnitId(timelineContextRows);
  const thumbnailUrls = await getUnitThumbnailUrls({
    imageRows,
    supabase,
  });

  return unitRows.map((unit) => {
    const unitLeaseRows = leasesByUnitId.get(unit.id) ?? [];

    return buildUnitSummary({
      activeLease: selectCurrentLease(unitLeaseRows),
      draftLease: selectNewestDraftLease(unitLeaseRows),
      latestTimelineEvent: latestTimelineByUnitId.get(unit.id),
      ledgerEntries: ledgerByUnitId.get(unit.id) ?? [],
      property: propertiesById.get(unit.property_id),
      propertyOwnerName:
        ownerNamesByPropertyId.get(unit.property_id) ?? "No owner",
      thumbnailUrl: photoThumbnailUrls.get(unit.id) ?? thumbnailUrls.get(unit.id),
      unit,
    });
  });
}

async function getPrimaryOwnerNamesForProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
) {
  const rows = await queryUnitIdBatches(propertyIds, (batch, remainingRows) => readCompleteRows({
    maxRows: remainingRows,
    context: "Could not load unit property owners",
    getRowId: row => row.id,
    readPage: (from, to) => supabase
      .from("property_owners")
      .select(
        "id, property_id, person:people!property_owners_person_fk(display_name)",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("is_primary", true)
      .in("property_id", batch)
      .is("archived_at", null)
      .is("ended_on", null)
      .order("id", { ascending: true }).range(from, to),
  })) as UnitPrimaryOwnerRow[];

  return new Map(
    rows.flatMap((row) => {
      const person = Array.isArray(row.person) ? row.person[0] : row.person;
      return person?.display_name
        ? [[row.property_id, person.display_name] as const]
        : [];
    }),
  );
}

export async function getUnitDetail(
  organizationId: string,
  unitId: string,
  { operationalTimezone }: { operationalTimezone?: string } = {},
) {
  return withFinancialReadContext(organizationId, async (context) => {
    const unit = await readUnitDetail(organizationId, unitId, operationalTimezone);
    return unit ? { ...unit, financialGeneration: context.generation } : null;
  });
}

async function readUnitDetail(organizationId: string, unitId: string, operationalTimezone?: string) {
  const supabase = await createSupabaseServerClient();
  const currentDate = new Date();
  const businessDate = getBusinessDateValue(currentDate, operationalTimezone);

  const unitResult = await supabase
    .from("units")
    .select(unitSelect)
    .eq("organization_id", organizationId)
    .eq("id", unitId)
    .maybeSingle();

  if (unitResult.error) {
    throw new Error(`Could not load unit: ${unitResult.error.message}`);
  }

  if (!unitResult.data) {
    return null;
  }

  const unit = unitResult.data;
  const [
    propertyResult,
    leasesResult,
    timelineResult,
    ledgerResult,
    ledgerTotalRows,
    documentsResult,
    photos,
    maintenanceResult,
    maintenanceCounts,
    activityResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .eq("id", unit.property_id)
      .maybeSingle(),
    supabase
      .from("current_leases")
      .select(leaseSelect)
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null)
      .order("lease_start_date", { ascending: false }),
    supabase
      .from("timeline_events")
      .select(timelineContextSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(detailRecordLimit),
    supabase
      .from("ledger_entries")
      .select(recentLedgerSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null)
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(detailRecordLimit),
    readPortfolioLedgerTotals(supabase, organizationId, "unit", [unit.id], trailingTwelveMonthStart(currentDate)),
    supabase
      .from("documents")
      .select(documentSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(detailRecordLimit),
    getAssetPhotosForScope({
      organizationId,
      propertyId: unit.property_id,
      supabase,
      unitId: unit.id,
    }),
    supabase
      .from("tasks")
      .select(maintenanceSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
    getMaintenanceCaseCounts({ supabase, organizationId, scopeColumn: "unit_id", scopeId: unit.id, businessDate }),
    supabase
      .from("activity_logs")
      .select(
        "id, entity_type, entity_id, action, previous_values, new_values, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("entity_type", "unit")
      .eq("entity_id", unit.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (propertyResult.error) {
    throw new Error(`Could not load unit property: ${propertyResult.error.message}`);
  }

  if (leasesResult.error) {
    throw new Error(`Could not load unit leases: ${leasesResult.error.message}`);
  }

  const leaseRows = leasesResult.data ?? [];

  if (timelineResult.error) {
    throw new Error(`Could not load unit timeline events: ${timelineResult.error.message}`);
  }

  if (ledgerResult.error) {
    throw new Error(`Could not load unit ledger entries: ${ledgerResult.error.message}`);
  }

  if (documentsResult.error) {
    throw new Error(`Could not load unit documents: ${documentsResult.error.message}`);
  }

  if (maintenanceResult.error) {
    throw new Error(
      `Could not load unit maintenance cases: ${maintenanceResult.error.message}`,
    );
  }

  if (activityResult.error) {
    throw new Error(`Could not load unit activity: ${activityResult.error.message}`);
  }

  const activeLease = selectCurrentLease(leaseRows);
  const draftLease = selectNewestDraftLease(leaseRows);
  const maintenanceRows = (maintenanceResult.data ?? []) as UnitMaintenanceRecord[];
  const [activity, documents, people] = await Promise.all([
    resolveRecentChangeTargets({
      logs: activityResult.data ?? [],
      organizationId,
      supabase: supabase as unknown as ActivityTargetQueryClient,
    }),
    addDocumentDownloadUrls(documentsResult.data ?? []),
    getActiveLeasePeople(supabase, organizationId, activeLease),
  ]);

  return buildUnitDetail({
    currentDate,
    businessDate,
    activeLease,
    activity,
    counts: {
      documents: documentsResult.count ?? 0,
      ledgerEntries: ledgerResult.count ?? ledgerResult.data?.length ?? 0,
      maintenanceCases:
        maintenanceResult.count ?? maintenanceRows.length,
      ...maintenanceCounts,
      photos: photos.length,
      timelineEvents: timelineResult.count ?? timelineResult.data?.length ?? 0,
    },
    documents,
    draftLease,
    ledgerEntries: ledgerTotalRows,
    maintenanceCases: maintenanceRows,
    people,
    photos,
    property: propertyResult.data ?? undefined,
    recentLedgerEntries: ledgerResult.data ?? [],
    recentTimelineEvents: timelineResult.data ?? [],
    unit,
  });
}

async function getActiveLeasePeople(
  supabase: SupabaseServerClient,
  organizationId: string,
  activeLease?: UnitLeaseRecord,
): Promise<UnitPersonRecord[]> {
  if (!activeLease) {
    return [];
  }

  const personIds = new Set(
    activeLease.primary_tenant_person_id
      ? [activeLease.primary_tenant_person_id]
      : [],
  );
  const partiesResult = await supabase
    .from("lease_parties")
    .select("person_id")
    .eq("organization_id", organizationId)
    .eq("lease_id", activeLease.id)
    .is("archived_at", null);

  if (partiesResult.error) {
    if (!isMissingSchemaObjectMessage(partiesResult.error.message, ["lease_parties"])) {
      throw new Error(
        `Could not load unit tenant links: ${partiesResult.error.message}`,
      );
    }
  } else {
    for (const party of partiesResult.data ?? []) {
      if (party.person_id) {
        personIds.add(party.person_id);
      }
    }
  }

  if (personIds.size === 0) {
    return [];
  }

  const peopleResult = await supabase
    .from("people")
    .select("id, display_name, primary_email, primary_phone")
    .eq("organization_id", organizationId)
    .in("id", [...personIds])
    .is("archived_at", null)
    .order("display_name", { ascending: true });

  if (peopleResult.error) {
    if (isMissingSchemaObjectMessage(peopleResult.error.message, ["people"])) {
      return [];
    }

    throw new Error(`Could not load unit tenant people: ${peopleResult.error.message}`);
  }

  return peopleResult.data ?? [];
}

function addDocumentDownloadUrls(rows: UnitDocumentRecord[]): UnitDocumentRecord[] {
  return rows.map((row) => ({
    ...row,
    url: documentDownloadUrl(row.id),
  }));
}

function groupByUnitId<T extends { unit_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    if (!row.unit_id) {
      continue;
    }

    const group = grouped.get(row.unit_id) ?? [];
    group.push(row);
    grouped.set(row.unit_id, group);
  }

  return grouped;
}

function indexLatestTimelineByUnitId(rows: UnitTimelineRecord[]) {
  const index = new Map<string, UnitTimelineRecord>();

  for (const row of rows) {
    if (row.unit_id && !index.has(row.unit_id)) {
      index.set(row.unit_id, row);
    }
  }

  return index;
}

export function unitMatchesLeaseStatusFilter(
  unit: Pick<UnitSummary, "hasActiveLease">,
  leaseStatus: UnitLeaseStatusFilter,
) {
  return leaseStatus === "all" || !unit.hasActiveLease;
}

export function unitMatchesOccupancyFilter(
  unit: Pick<UnitSummary, "hasActiveLease" | "statusValue">,
  occupancy: UnitOccupancyFilter,
) {
  return occupancy === "all"
    ? true
    : occupancy === "occupied"
      ? unit.hasActiveLease
      : !unit.hasActiveLease;
}

function buildUnitPagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): UnitPagination {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = totalCount === 0 ? 0 : Math.min(safePage * pageSize, totalCount);

  return {
    from,
    page: safePage,
    pageSize,
    to,
    totalCount,
    totalPages,
  };
}

function getRange(page: number, pageSize: number) {
  const from = (Math.max(page, 1) - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

async function getLeaseRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
) {
  const rows = await queryUnitIdBatches(unitIds, (batch, remainingRows) => readCompleteRows<UnitLeaseRecord>({
    maxRows: remainingRows,
    context: "Could not load unit leases",
    getRowId: row => row.id ?? "",
    readPage: (from, to) => supabase
      .from("current_leases")
      .select(leaseSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .in("unit_id", batch)
      .in("status", ["active", "notice_given", "draft"])
      .is("archived_at", null)
      .order("lease_start_date", { ascending: false })
      .order("id", { ascending: true }).range(from, to),
  }));

  return rows;
}

async function getTimelineContextRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
  matching = false,
) {
  const rows = await queryUnitIdBatches(unitIds, (batch, remainingRows) => readCompleteRows<UnitTimelineRecord>({
    maxRows: remainingRows,
    context: "Could not load unit timeline context",
    getRowId: row => row.id,
    readPage: (from, to) => {
      const query = supabase.from("timeline_events");
      const selected = matching
        ? query.select("id, unit_id, event_date, event_type, title", { count: "exact" })
        : query.select(timelineContextSelect, { count: "exact" });
      return selected
        .eq("organization_id", organizationId)
        .in("unit_id", batch)
        .is("archived_at", null)
        .order("event_date", { ascending: false })
        .order("id", { ascending: false }).range(from, to);
    },
  }));

  return rows;
}

async function getLedgerTotalRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
) {
  return readPortfolioLedgerTotals(supabase, organizationId, "unit", unitIds);
}

async function getImageRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
) {
  return queryUnitIdBatches(unitIds, (batch, remainingRows) => readCompleteRows<UnitImageRow>({
    maxRows: remainingRows,
    context: "Could not load unit images",
    getRowId: row => row.id,
    readPage: (from, to) => supabase
      .from("documents")
      .select("id, unit_id, storage_path", { count: "exact" })
      .eq("organization_id", organizationId)
      .in("unit_id", batch)
      .is("archived_at", null)
      .in("mime_type", [...unitImageMimeTypes])
      .order("uploaded_at", { ascending: false })
      .order("id", { ascending: true }).range(from, to),
  }));
}

async function getUnitThumbnailUrls({
  imageRows,
  supabase,
}: {
  imageRows: UnitImageRow[];
  supabase: SupabaseServerClient;
}) {
  const firstImageByUnit = new Map<string, string>();

  for (const row of imageRows) {
    if (row.unit_id && !firstImageByUnit.has(row.unit_id)) {
      firstImageByUnit.set(row.unit_id, row.storage_path);
    }
  }

  if (firstImageByUnit.size === 0) {
    return new Map<string, string>();
  }

  const paths = [...firstImageByUnit.values()];
  const { data } = await supabase.storage
    .from("nestory-documents")
    .createSignedUrls(paths, 60 * 60);
  const urlByPath = new Map<string, string>();

  paths.forEach((path, index) => {
    const signedUrl = data?.[index]?.signedUrl;

    if (signedUrl) {
      urlByPath.set(path, signedUrl);
    }
  });

  return new Map(
    [...firstImageByUnit].flatMap(([unitId, path]) => {
      const signedUrl = urlByPath.get(path);
      return signedUrl ? [[unitId, signedUrl] as const] : [];
    }),
  );
}

async function queryUnitIdBatches<T>(
  unitIds: string[],
  queryBatch: (batch: string[], remainingRows: number) => Promise<T[]>,
) {
  const rows: T[] = [];

  for (const batch of chunkValues(unitIds, unitRelationshipBatchSize)) {
    rows.push(...(await queryBatch(batch, DEFAULT_COMPLETE_READ_MAX_ROWS - rows.length)));
  }

  return rows;
}

export function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
