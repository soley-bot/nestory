import { createSupabaseServerClient } from "@/lib/db/server";
import { isMissingSchemaObjectMessage } from "@/lib/db/schema-errors";
import { toRecentChange } from "@/features/activity/recent-changes";
import {
  ACTIVE_UNIT_LEASE_STATUSES,
  buildUnitDetail,
  buildUnitSummary,
  selectCurrentLease,
  type UnitDocumentRecord,
  type UnitLeaseRecord,
  type UnitMaintenanceRecord,
  type UnitPersonRecord,
  type UnitPropertyRecord,
  type UnitRecord,
  type UnitTimelineRecord,
} from "@/features/units/data/unit-summary";
import {
  DEFAULT_UNIT_SORT,
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

const unitSelect =
  "id, property_id, unit_number, floor, size_sqm, status, current_rent_amount, current_rent_currency, archived_at";
const propertySelect = "id, code, name";
const unitWithPropertySelect = `${unitSelect}, property:properties!units_property_id_fkey(${propertySelect})`;
const leaseSelect =
  "id, unit_id, tenant_name, primary_tenant_person_id, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency";
const timelineContextSelect =
  "id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency";
const ledgerTotalsSelect =
  "id, unit_id, transaction_date, direction, category, amount, currency";
const recentLedgerSelect =
  "id, unit_id, transaction_date, direction, category, amount, currency, description";
const documentSelect =
  "id, lease_id, ledger_entry_id, task_id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at";
const maintenanceSelect =
  "id, title, category, priority, status, due_date, due_time, actual_cost_amount, actual_cost_currency";
const unitImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const listTimelineContextLimit = 1000;
const detailRecordLimit = 12;
const unitRelationshipBatchSize = 75;

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type UnitRowWithProperty = UnitRecord & {
  property: UnitPropertyRecord | UnitPropertyRecord[] | null;
};
type PagedUnitRowsResult = {
  propertiesById: Map<string, UnitPropertyRecord>;
  totalCount: number;
  units: UnitRecord[];
};
type UnitImageRow = {
  storage_path: string;
  unit_id: string | null;
};

export async function getUnitsScreenData(
  organizationId: string,
  viewQuery: UnitViewQuery = parseUnitSearchParams({}),
) {
  const supabase = await createSupabaseServerClient();
  const activeLeaseUnitIds =
    viewQuery.leaseStatus === "missing" || viewQuery.occupancy === "unoccupied"
      ? await getActiveLeaseUnitIds(organizationId)
      : null;

  if (canUsePagedUnitBaseQuery(viewQuery)) {
    return getPagedUnitsScreenData({
      activeLeaseUnitIds,
      organizationId,
      supabase,
      viewQuery,
    });
  }

  return getCompleteUnitsScreenData({
    activeLeaseUnitIds,
    organizationId,
    supabase,
    viewQuery,
  });
}

export async function getUnitPropertyOptions(
  organizationId: string,
): Promise<UnitPropertyOption[]> {
  const supabase = await createSupabaseServerClient();
  const propertiesResult = await supabase
    .from("properties")
    .select(propertySelect)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("code", { ascending: true });

  if (propertiesResult.error) {
    throw new Error(
      `Could not load unit property options: ${propertiesResult.error.message}`,
    );
  }

  return (propertiesResult.data ?? []).map((property) => ({
    id: property.id,
    label: `${property.code} - ${property.name}`,
  }));
}

function canUsePagedUnitBaseQuery(viewQuery: UnitViewQuery) {
  return (
    viewQuery.query.trim().length === 0 &&
    (viewQuery.sort === "property_asc" ||
      viewQuery.sort === "unit_asc" ||
      viewQuery.sort === "status_asc")
  );
}

async function getPagedUnitsScreenData({
  activeLeaseUnitIds,
  organizationId,
  supabase,
  viewQuery,
}: {
  activeLeaseUnitIds: ReadonlySet<string> | null;
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: UnitViewQuery;
}) {
  let rowsResult = await getPagedUnitRows({
    activeLeaseUnitIds,
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
    rowsResult = await getPagedUnitRows({
      activeLeaseUnitIds,
      organizationId,
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      supabase,
      viewQuery,
    });
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
  activeLeaseUnitIds,
  organizationId,
  page,
  pageSize,
  supabase,
  viewQuery,
}: {
  activeLeaseUnitIds: ReadonlySet<string> | null;
  organizationId: string;
  page: number;
  pageSize: number;
  supabase: SupabaseServerClient;
  viewQuery: UnitViewQuery;
}): Promise<PagedUnitRowsResult> {
  const range = getRange(page, pageSize);
  let unitsQuery = supabase
    .from("units")
    .select(unitWithPropertySelect, { count: "exact" })
    .eq("organization_id", organizationId);

  unitsQuery = applyUnitBaseFilters(unitsQuery, viewQuery, activeLeaseUnitIds);
  unitsQuery = applyUnitBaseSort(unitsQuery, viewQuery);

  const unitsResult = await unitsQuery.range(range.from, range.to);

  if (unitsResult.error) {
    throw new Error(`Could not load units: ${unitsResult.error.message}`);
  }

  const rows = (unitsResult.data ?? []) as UnitRowWithProperty[];
  const { propertiesById, units } = splitUnitRowsAndProperties(rows);

  return {
    propertiesById,
    totalCount:
      typeof unitsResult.count === "number" ? unitsResult.count : units.length,
    units,
  };
}

function applyUnitBaseFilters(
  query: Awaited<ReturnType<SupabaseServerClient["from"]>["select"]>,
  viewQuery: UnitViewQuery,
  activeLeaseUnitIds: ReadonlySet<string> | null,
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

  if (viewQuery.occupancy === "unoccupied") {
    filteredQuery = filteredQuery
      .neq("status", "occupied")
      .neq("status", "inactive");
  }

  if (activeLeaseUnitIds && activeLeaseUnitIds.size > 0) {
    filteredQuery = filteredQuery.not(
      "id",
      "in",
      formatPostgrestInFilter(activeLeaseUnitIds),
    );
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
  activeLeaseUnitIds,
  organizationId,
  supabase,
  viewQuery,
}: {
  activeLeaseUnitIds: ReadonlySet<string> | null;
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: UnitViewQuery;
}) {
  let unitsQuery = supabase
    .from("units")
    .select(unitSelect)
    .eq("organization_id", organizationId)
    .order("property_id", { ascending: true })
    .order("unit_number", { ascending: true });

  if (viewQuery.archiveState === "active") {
    unitsQuery = unitsQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    unitsQuery = unitsQuery.not("archived_at", "is", null);
  }

  if (viewQuery.propertyId !== "all") {
    unitsQuery = unitsQuery.eq("property_id", viewQuery.propertyId);
  }

  if (viewQuery.status !== "all") {
    unitsQuery = unitsQuery.eq("status", viewQuery.status);
  }

  if (viewQuery.occupancy === "unoccupied") {
    unitsQuery = unitsQuery
      .neq("status", "occupied")
      .neq("status", "inactive");
  }

  if (activeLeaseUnitIds && activeLeaseUnitIds.size > 0) {
    unitsQuery = unitsQuery.not(
      "id",
      "in",
      formatPostgrestInFilter(activeLeaseUnitIds),
    );
  }

  const unitsResult = await unitsQuery;

  if (unitsResult.error) {
    throw new Error(`Could not load units: ${unitsResult.error.message}`);
  }

  const unitRows = unitsResult.data ?? [];

  if (unitRows.length === 0) {
    return {
      pagination: buildUnitPagination({
        page: viewQuery.page,
        pageSize: viewQuery.pageSize,
        totalCount: 0,
      }),
      units: [],
    };
  }

  const units = (
    await loadUnitSummariesForRows({
      organizationId,
      supabase,
      unitRows,
    })
  ).toSorted(compareUnitSummaries);
  const filteredUnits = filterUnitSummaries(units, viewQuery);
  const sortedUnits = sortUnitSummaries(filteredUnits, viewQuery.sort);
  const pagination = buildUnitPagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: sortedUnits.length,
  });

  return {
    pagination,
    units: getUnitPageSummaries(sortedUnits, pagination),
  };
}

async function loadUnitSummariesForRows({
  organizationId,
  propertiesById,
  supabase,
  unitRows,
}: {
  organizationId: string;
  propertiesById?: Map<string, UnitPropertyRecord>;
  supabase: SupabaseServerClient;
  unitRows: UnitRecord[];
}) {
  const unitIds = new Set(unitRows.map((unit) => unit.id));

  if (unitIds.size === 0) {
    return [];
  }

  const propertyIds = new Set(unitRows.map((unit) => unit.property_id));
  let unitPropertiesById = propertiesById;

  if (!unitPropertiesById) {
    const propertiesResult = await supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .in("id", [...propertyIds])
      .is("archived_at", null);

    if (propertiesResult.error) {
      throw new Error(
        `Could not load unit properties: ${propertiesResult.error.message}`,
      );
    }

    unitPropertiesById = indexById(propertiesResult.data ?? []);
  }

  const [leaseRows, timelineContextRows, ledgerTotalRows, imageRows] =
    await Promise.all([
      getLeaseRowsForUnits(supabase, organizationId, [...unitIds]),
      getTimelineContextRowsForUnits(supabase, organizationId, [...unitIds]),
      getLedgerTotalRowsForUnits(supabase, organizationId, [...unitIds]),
      getImageRowsForUnits(supabase, organizationId, [...unitIds]),
    ]);
  const leasesByUnitId = groupByUnitId(leaseRows);
  const ledgerByUnitId = groupByUnitId(ledgerTotalRows);
  const latestTimelineByUnitId = indexLatestTimelineByUnitId(timelineContextRows);
  const thumbnailUrls = await getUnitThumbnailUrls({
    imageRows,
    supabase,
  });

  return unitRows.map((unit) =>
    buildUnitSummary({
      activeLease: selectCurrentLease(leasesByUnitId.get(unit.id) ?? []),
      latestTimelineEvent: latestTimelineByUnitId.get(unit.id),
      ledgerEntries: ledgerByUnitId.get(unit.id) ?? [],
      property: unitPropertiesById.get(unit.property_id),
      thumbnailUrl: thumbnailUrls.get(unit.id),
      unit,
    }),
  );
}

export async function getUnitDetail(organizationId: string, unitId: string) {
  const supabase = await createSupabaseServerClient();

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
    ledgerTotalsResult,
    documentsResult,
    maintenanceResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .eq("id", unit.property_id)
      .maybeSingle(),
    supabase
      .from("leases")
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
    supabase
      .from("ledger_entries")
      .select(ledgerTotalsSelect)
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null),
    supabase
      .from("documents")
      .select(documentSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(detailRecordLimit),
    supabase
      .from("tasks")
      .select(maintenanceSelect, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("unit_id", unit.id)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
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

  if (ledgerTotalsResult.error) {
    throw new Error(`Could not load unit ledger totals: ${ledgerTotalsResult.error.message}`);
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
  const maintenanceRows = (maintenanceResult.data ?? []) as UnitMaintenanceRecord[];
  const [documents, people] = await Promise.all([
    addSignedDocumentUrls(documentsResult.data ?? [], supabase),
    getActiveLeasePeople(supabase, organizationId, activeLease),
  ]);

  return buildUnitDetail({
    activeLease,
    activity: (activityResult.data ?? []).map(toRecentChange),
    counts: {
      documents: documentsResult.count ?? 0,
      ledgerEntries: ledgerResult.count ?? ledgerResult.data?.length ?? 0,
      maintenanceCases:
        maintenanceResult.count ?? maintenanceRows.length,
      openMaintenanceCases: maintenanceRows.filter(isOpenMaintenanceTask).length,
      overdueMaintenanceCases: maintenanceRows.filter(isOverdueMaintenanceTask).length,
      timelineEvents: timelineResult.count ?? timelineResult.data?.length ?? 0,
    },
    documents,
    ledgerEntries: ledgerTotalsResult.data ?? [],
    maintenanceCases: maintenanceRows,
    people,
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

async function addSignedDocumentUrls(
  rows: UnitDocumentRecord[],
  supabase: SupabaseServerClient,
): Promise<UnitDocumentRecord[]> {
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage
        .from("nestory-documents")
        .createSignedUrl(row.storage_path, 60 * 60);

      return {
        ...row,
        url: data?.signedUrl,
      };
    }),
  );
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
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

function compareUnitSummaries(
  first: ReturnType<typeof buildUnitSummary>,
  second: ReturnType<typeof buildUnitSummary>,
) {
  return (
    Number(first.isArchived) - Number(second.isArchived) ||
    first.propertyCode.localeCompare(second.propertyCode, undefined, {
      numeric: true,
      sensitivity: "base",
    }) ||
    first.propertyName.localeCompare(second.propertyName, undefined, {
      numeric: true,
      sensitivity: "base",
    }) ||
    first.unitNumber.localeCompare(second.unitNumber, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function filterUnitSummaries(units: UnitSummary[], viewQuery: UnitViewQuery) {
  const tokens = viewQuery.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return units.filter((unit) => {
    const matchesProperty =
      viewQuery.propertyId === "all" || unit.propertyId === viewQuery.propertyId;
    const matchesStatus =
      viewQuery.status === "all" || unit.statusValue === viewQuery.status;
    const matchesLeaseStatus = unitMatchesLeaseStatusFilter(
      unit,
      viewQuery.leaseStatus,
    );
    const matchesOccupancy = unitMatchesOccupancyFilter(
      unit,
      viewQuery.occupancy,
    );
    const haystack = [
      unit.unitNumber,
      unit.propertyCode,
      unit.propertyName,
      unit.floorLabel,
      unit.statusLabel,
      unit.leaseLabel,
      unit.latestTimelineEvent?.title ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = tokens.every((token) => haystack.includes(token));

    return (
      matchesProperty &&
      matchesStatus &&
      matchesLeaseStatus &&
      matchesOccupancy &&
      matchesQuery
    );
  });
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
  return (
    occupancy === "all" ||
    (!unit.hasActiveLease &&
      unit.statusValue !== "occupied" &&
      unit.statusValue !== "inactive")
  );
}

function sortUnitSummaries(
  units: UnitSummary[],
  sort: UnitViewQuery["sort"] = DEFAULT_UNIT_SORT,
) {
  return [...units].sort((first, second) => {
    if (sort === "unit_asc") {
      return (
        compareStrings(first.unitNumber, second.unitNumber) ||
        compareStrings(first.propertyCode, second.propertyCode)
      );
    }

    if (sort === "status_asc") {
      return (
        compareStrings(first.statusLabel, second.statusLabel) ||
        compareStrings(first.propertyCode, second.propertyCode) ||
        compareStrings(first.unitNumber, second.unitNumber)
      );
    }

    if (sort === "rent_desc") {
      return (
        second.rentUsd - first.rentUsd ||
        compareStrings(first.propertyCode, second.propertyCode) ||
        compareStrings(first.unitNumber, second.unitNumber)
      );
    }

    if (sort === "net_desc") {
      return (
        second.ledgerNetUsd - first.ledgerNetUsd ||
        compareStrings(first.propertyCode, second.propertyCode) ||
        compareStrings(first.unitNumber, second.unitNumber)
      );
    }

    return compareUnitSummaries(first, second);
  });
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

function getUnitPageSummaries(units: UnitSummary[], pagination: UnitPagination) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return units.slice(start, pagination.to);
}

function getRange(page: number, pageSize: number) {
  const from = (Math.max(page, 1) - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}

async function getLeaseRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
) {
  const rows = await queryUnitIdBatches(unitIds, async (batch) => {
    const result = await supabase
      .from("leases")
      .select(leaseSelect)
      .eq("organization_id", organizationId)
      .in("unit_id", batch)
      .is("archived_at", null)
      .order("lease_start_date", { ascending: false });

    if (result.error) {
      throw new Error(`Could not load unit leases: ${result.error.message}`);
    }

    return result.data ?? [];
  });

  return rows;
}

async function getTimelineContextRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
) {
  const rows = await queryUnitIdBatches(unitIds, async (batch) => {
    const result = await supabase
      .from("timeline_events")
      .select(timelineContextSelect)
      .eq("organization_id", organizationId)
      .in("unit_id", batch)
      .is("archived_at", null)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(listTimelineContextLimit);

    if (result.error) {
      throw new Error(
        `Could not load unit timeline context: ${result.error.message}`,
      );
    }

    return result.data ?? [];
  });

  return rows;
}

async function getLedgerTotalRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
) {
  const rows = await queryUnitIdBatches(unitIds, async (batch) => {
    const result = await supabase
      .from("ledger_entries")
      .select(ledgerTotalsSelect)
      .eq("organization_id", organizationId)
      .in("unit_id", batch)
      .is("archived_at", null);

    if (result.error) {
      throw new Error(`Could not load unit ledger context: ${result.error.message}`);
    }

    return result.data ?? [];
  });

  return rows;
}

async function getImageRowsForUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: string[],
) {
  return queryUnitIdBatches(unitIds, async (batch) => {
    const result = await supabase
      .from("documents")
      .select("unit_id, storage_path")
      .eq("organization_id", organizationId)
      .in("unit_id", batch)
      .is("archived_at", null)
      .in("mime_type", [...unitImageMimeTypes])
      .order("uploaded_at", { ascending: false });

    if (result.error) {
      throw new Error(`Could not load unit images: ${result.error.message}`);
    }

    return (result.data ?? []) as UnitImageRow[];
  });
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
  queryBatch: (batch: string[]) => Promise<T[]>,
) {
  const rows: T[] = [];

  for (const batch of chunkValues(unitIds, unitRelationshipBatchSize)) {
    rows.push(...(await queryBatch(batch)));
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

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isOpenMaintenanceTask(task: UnitMaintenanceRecord) {
  return task.status !== "completed" && task.status !== "cancelled";
}

function isOverdueMaintenanceTask(task: UnitMaintenanceRecord) {
  return (
    isOpenMaintenanceTask(task) &&
    Boolean(task.due_date) &&
    task.due_date! < new Date().toISOString().slice(0, 10)
  );
}

async function getActiveLeaseUnitIds(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("leases")
    .select("unit_id")
    .eq("organization_id", organizationId)
    .in("status", [...ACTIVE_UNIT_LEASE_STATUSES])
    .not("unit_id", "is", null)
    .is("archived_at", null);

  if (result.error) {
    throw new Error(`Could not load active unit lease filters: ${result.error.message}`);
  }

  return new Set(
    (result.data ?? []).flatMap((lease) =>
      lease.unit_id ? [lease.unit_id] : [],
    ),
  );
}

function formatPostgrestInFilter(values: ReadonlySet<string>) {
  return `(${[...values].join(",")})`;
}
