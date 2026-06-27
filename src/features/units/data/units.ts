import { createSupabaseServerClient } from "@/lib/db/server";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import {
  ACTIVE_UNIT_LEASE_STATUSES,
  buildUnitDetail,
  buildUnitSummary,
  selectCurrentLease,
  type UnitDocumentRecord,
  type UnitLeaseRecord,
  type UnitPersonRecord,
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
  UnitSummary,
  UnitViewQuery,
} from "@/features/units/unit.types";

const unitSelect =
  "id, property_id, unit_number, floor, size_sqm, status, current_rent_amount, current_rent_currency, archived_at";
const propertySelect = "id, code, name";
const leaseSelect =
  "id, unit_id, tenant_name, primary_tenant_person_id, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency";
const timelineContextSelect =
  "id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency";
const ledgerTotalsSelect =
  "id, unit_id, transaction_date, direction, category, amount, currency";
const recentLedgerSelect =
  "id, unit_id, transaction_date, direction, category, amount, currency, description";
const documentSelect =
  "id, lease_id, ledger_entry_id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at";
const listTimelineContextLimit = 1000;
const detailRecordLimit = 12;
const unitRelationshipBatchSize = 75;

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getUnitsScreenData(
  organizationId: string,
  viewQuery: UnitViewQuery = parseUnitSearchParams({}),
) {
  const supabase = await createSupabaseServerClient();
  const activeLeaseUnitIds =
    viewQuery.leaseStatus === "missing" || viewQuery.occupancy === "unoccupied"
      ? await getActiveLeaseUnitIds(organizationId)
      : null;
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
  const unitIds = new Set(unitRows.map((unit) => unit.id));
  const propertyIds = new Set(unitRows.map((unit) => unit.property_id));

  if (unitIds.size === 0) {
    return {
      pagination: buildUnitPagination({
        page: viewQuery.page,
        pageSize: viewQuery.pageSize,
        totalCount: 0,
      }),
      units: [],
    };
  }

  const [
    propertiesResult,
    leaseRows,
    timelineContextRows,
    ledgerTotalRows,
    currencySettings,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .in("id", [...propertyIds])
      .is("archived_at", null),
    getLeaseRowsForUnits(supabase, organizationId, [...unitIds]),
    getTimelineContextRowsForUnits(supabase, organizationId, [...unitIds]),
    getLedgerTotalRowsForUnits(supabase, organizationId, [...unitIds]),
    getOrganizationCurrencySettings(organizationId),
  ]);

  if (propertiesResult.error) {
    throw new Error(`Could not load unit properties: ${propertiesResult.error.message}`);
  }

  const propertiesById = indexById(propertiesResult.data ?? []);
  const leasesByUnitId = groupByUnitId(leaseRows);
  const ledgerByUnitId = groupByUnitId(ledgerTotalRows);
  const latestTimelineByUnitId = indexLatestTimelineByUnitId(timelineContextRows);
  const units = unitRows
    .map((unit) =>
      buildUnitSummary({
        activeLease: selectCurrentLease(leasesByUnitId.get(unit.id) ?? []),
        currencySettings,
        latestTimelineEvent: latestTimelineByUnitId.get(unit.id),
        ledgerEntries: ledgerByUnitId.get(unit.id) ?? [],
        property: propertiesById.get(unit.property_id),
        unit,
      }),
    )
    .toSorted(compareUnitSummaries);
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
  ]);

  if (propertyResult.error) {
    throw new Error(`Could not load unit property: ${propertyResult.error.message}`);
  }

  if (leasesResult.error) {
    throw new Error(`Could not load unit leases: ${leasesResult.error.message}`);
  }

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

  const activeLease = selectCurrentLease(leasesResult.data ?? []);
  const [currencySettings, documents, people] = await Promise.all([
    getOrganizationCurrencySettings(organizationId),
    addSignedDocumentUrls(documentsResult.data ?? [], supabase),
    getActiveLeasePeople(supabase, organizationId, activeLease),
  ]);

  return buildUnitDetail({
    activeLease,
    counts: {
      documents: documentsResult.count ?? 0,
      ledgerEntries: ledgerResult.count ?? ledgerResult.data?.length ?? 0,
      timelineEvents: timelineResult.count ?? timelineResult.data?.length ?? 0,
    },
    currencySettings,
    documents,
    ledgerEntries: ledgerTotalsResult.data ?? [],
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
    throw new Error(
      `Could not load unit tenant links: ${partiesResult.error.message}`,
    );
  }

  for (const party of partiesResult.data ?? []) {
    if (party.person_id) {
      personIds.add(party.person_id);
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
