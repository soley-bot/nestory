import { loadPortfolioSearch } from "@/lib/search/portfolio.server";
import { getMaintenanceCaseCounts } from "./property-detail-counts";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import type { PortfolioSearch } from "@/lib/search/portfolio";
import { matchesSearchText } from "@/lib/search/text";
import { normalizeSearchText } from "@/lib/search/text";
import { createSupabaseServerClient } from "@/lib/db/server";
import { DEFAULT_COMPLETE_READ_MAX_ROWS, readCompleteRows } from "@/lib/db/complete-read";
import { documentDownloadUrl } from "@/lib/uploads/document-download";
import {
  resolveRecentChangeTargets,
  type ActivityTargetQueryClient,
} from "@/features/activity/recent-change-targets";
import {
  buildPropertySummary,
  type PropertyLedgerRecord,
  type PropertyRecord,
  type PropertySummary,
  type PropertyUnitRecord,
} from "@/features/properties/data/property-summary";
import { ACTIVE_UNIT_LEASE_STATUSES } from "@/features/units/data/unit-summary";
import {
  getAssetPhotosForScope,
  getPropertyPhotoThumbnailUrls,
} from "@/features/photos/data/photos";
import {
  buildPropertyDetail,
  type PropertyDetailDocumentRecord,
  type PropertyExpenseEvidenceRecord,
  type PropertyDetailLedgerTotalRecord,
  type PropertyDetailMaintenanceRecord,
  type PropertyDetailLeaseRecord,
  type PropertyDetailUnitRecord,
  type PropertyOwnerHistoryRecord,
} from "@/features/properties/data/property-detail";
import {
  DEFAULT_PROPERTY_SORT,
  parsePropertySearchParams,
} from "@/features/properties/property.filters";
import { getPersonSelectOptions } from "@/features/people/data/person-options";
import type {
  PropertyArchiveState,
  PropertyLeaseStatusFilter,
  PropertyNetStatusFilter,
  PropertyOwnerOption,
  PropertyOwnerStatusFilter,
  PropertyPagination,
  PropertyReviewFilter,
  PropertyStatusValue,
  PropertyViewQuery,
} from "@/features/properties/property.types";

export type { PropertySummary } from "@/features/properties/data/property-summary";
export type { PropertyDetail } from "@/features/properties/data/property-detail";

type ActiveOwnerLink = {
  label: string;
  ownershipPercent: string;
  personId: string;
  startedOn: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type PropertyFilterQuery = ReturnType<typeof buildPropertyBaseQuery>;
type ActiveOwnerRow = {
  id: string;
  ownership_percent: number | null;
  person_id: string;
  property_id: string;
  started_on: string | null;
};
type PropertyLedgerSummaryRow = PropertyLedgerRecord & { id: string; property_id: string | null };
type PropertyCurrentLeaseSummaryRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
};

const propertySelect =
  "id, name, code, property_type, owner, address, status, registered_date, rental_structure, acquisition_date, notes, archived_at, edit_version";
const propertyImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const propertyRelationshipBatchSize = 75;

function buildPropertyBaseQuery(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  return supabase
    .from("properties")
    .select(propertySelect, { count: "exact" })
    .eq("organization_id", organizationId);
}

type PropertyImageRow = {
  id: string;
  property_id: string | null;
  storage_path: string;
};

type PropertySummaryOptions = {
  archiveState?: PropertyArchiveState;
  includeArchived?: boolean;
  ownerStatus?: PropertyOwnerStatusFilter;
  status?: PropertyStatusValue | "all";
};

type PagedPropertyRowsResult = {
  properties: PropertyRecord[];
  totalCount: number;
};

export async function getPropertySummaries(
  organizationId: string,
  options: PropertySummaryOptions = {},
) {
  const supabase = await createSupabaseServerClient();
  const activeOwnerLinks =
    options.ownerStatus === "missing"
      ? await getActiveOwnerLinks(organizationId)
      : null;
  const archiveState =
    options.archiveState ?? (options.includeArchived ? "all" : "active");

  const propertyRows = await readCompleteRows<PropertyRecord>({
    context: "Could not load properties",
    getRowId: (row) => row.id,
    readPage: (from, to) => {
      let query = buildPropertyBaseQuery(supabase, organizationId)
        .order("code", { ascending: true })
        .order("id", { ascending: true });
      if (archiveState === "active") query = query.is("archived_at", null);
      else if (archiveState === "archived") query = query.not("archived_at", "is", null);
      if (options.status && options.status !== "all") {
        query = query.in("status", getStoredPropertyStatusValues(options.status));
      }
      if (activeOwnerLinks?.size && canApplyPropertyOwnerExclusionInUrl(activeOwnerLinks)) {
        query = query.not("id", "in", formatPostgrestInFilter(new Set(activeOwnerLinks.keys())));
      }
      return query.range(from, to);
    },
  });
  const summaries = await loadPropertySummariesForRows({
    organizationId,
    properties: propertyRows,
    supabase,
  });

  if (options.ownerStatus === "missing") {
    return summaries.filter((property) =>
      propertyMatchesOwnerStatusFilter(property, "missing"),
    );
  }

  return summaries;
}

async function loadPropertySummariesForRows({
  organizationId,
  properties,
  supabase,
}: {
  organizationId: string;
  properties: PropertyRecord[];
  supabase: SupabaseServerClient;
}) {
  const propertyIds = new Set(properties.map((property) => property.id));

  if (propertyIds.size === 0) {
    return [];
  }

  // Ownership must be read after the versioned Property rows. Reusing the
  // earlier owner-filter lookup could pair a fresh version with stale owners.
  const ownerLinks = await getActiveOwnerLinks(organizationId, propertyIds);

  const propertyIdList = [...propertyIds];
  const [
    unitRows,
    currentLeaseRows,
    ledgerRows,
    imageRows,
    photoThumbnailUrls,
  ] = await Promise.all([
    queryValueBatches(propertyIdList, (batch, remainingRows) => readCompleteRows<PropertyUnitRecord & { id: string; property_id: string }>({
      maxRows: remainingRows,
      context: "Could not load property units",
      getRowId: (row) => row.id,
      readPage: (from, to) => supabase
        .from("units")
        .select("id, property_id, status", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("property_id", batch)
        .is("archived_at", null)
        .order("id", { ascending: true }).range(from, to),
    })),
    queryValueBatches(propertyIdList, (batch, remainingRows) => readCompleteRows({
      maxRows: remainingRows,
      context: "Could not load current property leases",
      getRowId: (row) => row.id ?? "",
      readPage: (from, to) => supabase
        .from("current_leases")
        .select("id, property_id, unit_id", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("property_id", batch)
        .in("status", [...ACTIVE_UNIT_LEASE_STATUSES])
        .is("archived_at", null)
        .order("id", { ascending: true }).range(from, to),
    })) as Promise<PropertyCurrentLeaseSummaryRow[]>,
    queryValueBatches(propertyIdList, (batch, remainingRows) => readCompleteRows({
      maxRows: remainingRows,
      context: "Could not load ledger totals",
      getRowId: (row) => row.id,
      readPage: (from, to) => supabase
        .from("ledger_entries")
        .select("id, property_id, direction, amount, currency", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("property_id", batch)
        .is("archived_at", null)
        .order("id", { ascending: true }).range(from, to),
    })) as Promise<PropertyLedgerSummaryRow[]>,
    queryValueBatches(propertyIdList, (batch, remainingRows) => readCompleteRows({
      maxRows: remainingRows,
      context: "Could not load property images",
      getRowId: (row) => row.id,
      readPage: (from, to) => supabase
        .from("documents")
        .select("id, property_id, storage_path", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("property_id", batch)
        .is("archived_at", null)
        .in("mime_type", [...propertyImageMimeTypes])
        .order("uploaded_at", { ascending: false })
        .order("id", { ascending: true }).range(from, to),
    })) as Promise<PropertyImageRow[]>,
    getPropertyPhotoThumbnailUrls({
      organizationId,
      propertyIds: propertyIdList,
      supabase,
    }),
  ]);

  const unitsByProperty = groupByProperty(unitRows);
  const currentLeasesByProperty = groupByProperty(currentLeaseRows);
  const ledgerByProperty = groupByProperty(ledgerRows);
  const thumbnailUrls = await getPropertyThumbnailUrls({
    imageRows,
    supabase,
  });

  return properties.map((property): PropertySummary => {
    const units = unitsByProperty.get(property.id) ?? [];
    const currentLeases = currentLeasesByProperty.get(property.id) ?? [];
    const currentLeaseUnitCount = new Set(
      currentLeases.flatMap((lease) =>
        lease.unit_id ? [lease.unit_id] : [],
      ),
    ).size;
    const ledgerEntries = ledgerByProperty.get(property.id) ?? [];

    return buildPropertySummary({
      activeOwner: ownerLinks.get(property.id),
      currentLeaseCount: currentLeases.length,
      currentLeaseUnitCount,
      hasActiveOwnerLink: ownerLinks.has(property.id),
      ledgerEntries,
      property,
      thumbnailUrl:
        photoThumbnailUrls.get(property.id) ?? thumbnailUrls.get(property.id),
      units,
    });
  });
}

async function getPropertyThumbnailUrls({
  imageRows,
  supabase,
}: {
  imageRows: PropertyImageRow[];
  supabase: SupabaseServerClient;
}) {
  const firstImageByProperty = new Map<string, string>();

  for (const row of imageRows) {
    if (row.property_id && !firstImageByProperty.has(row.property_id)) {
      firstImageByProperty.set(row.property_id, row.storage_path);
    }
  }

  if (firstImageByProperty.size === 0) {
    return new Map<string, string>();
  }

  const paths = [...firstImageByProperty.values()];
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
    [...firstImageByProperty].flatMap(([propertyId, path]) => {
      const signedUrl = urlByPath.get(path);
      return signedUrl ? [[propertyId, signedUrl] as const] : [];
    }),
  );
}

export async function getPropertyOwnerOptions(
  organizationId: string,
): Promise<PropertyOwnerOption[]> {
  return getPersonSelectOptions({
    organizationId,
    roles: ["owner"],
  });
}

export async function getPropertiesScreenData(
  organizationId: string,
  viewQuery: PropertyViewQuery = parsePropertySearchParams({}),
) {
  if (canUsePagedPropertyBaseQuery(viewQuery)) {
    return getPagedPropertiesScreenData({
      organizationId,
      viewQuery,
    });
  }

  return getCompletePropertiesScreenData({
    organizationId,
    viewQuery,
  });
}

function canUsePagedPropertyBaseQuery(viewQuery: PropertyViewQuery) {
  return (
    viewQuery.query.trim().length === 0 &&
    viewQuery.leaseStatus === "all" &&
    viewQuery.netStatus === "all" &&
    viewQuery.review === "all" &&
    (viewQuery.sort === "code_asc" ||
      viewQuery.sort === "name_asc" ||
      viewQuery.sort === "status_asc")
  );
}

async function getPagedPropertiesScreenData({
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: PropertyViewQuery;
}) {
  const supabase = await createSupabaseServerClient();
  const activeOwnerLinks =
    viewQuery.ownerStatus === "missing"
      ? await getActiveOwnerLinks(organizationId)
      : undefined;

  if (
    activeOwnerLinks &&
    !canApplyPropertyOwnerExclusionInUrl(activeOwnerLinks)
  ) {
    return getCompletePropertiesScreenData({ organizationId, viewQuery });
  }

  let rowsResult = await getPagedPropertyRows({
    activeOwnerLinks,
    organizationId,
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    supabase,
    viewQuery,
  });
  let pagination = buildPropertyPagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: rowsResult.totalCount,
  });

  if (pagination.page !== viewQuery.page && rowsResult.totalCount > 0) {
    const previousCount = rowsResult.totalCount;
    rowsResult = await getPagedPropertyRows({
      activeOwnerLinks,
      organizationId,
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      supabase,
      viewQuery,
    });
    if (rowsResult.totalCount !== previousCount) {
      throw new Error("Could not load properties: The row count changed while loading. Reload and try again.");
    }
    pagination = buildPropertyPagination({
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      totalCount: rowsResult.totalCount,
    });
  }

  return {
    pagination,
    properties: await loadPropertySummariesForRows({
      organizationId,
      properties: rowsResult.properties,
      supabase,
    }),
  };
}

async function getPagedPropertyRows({
  activeOwnerLinks,
  organizationId,
  page,
  pageSize,
  supabase,
  viewQuery,
}: {
  activeOwnerLinks?: ReadonlyMap<string, ActiveOwnerLink>;
  organizationId: string;
  page: number;
  pageSize: number;
  supabase: SupabaseServerClient;
  viewQuery: PropertyViewQuery;
}): Promise<PagedPropertyRowsResult> {
  const range = getRange(page, pageSize);
  const result = applyPropertyBaseSort(
    applyPropertyBaseFilters(
      buildPropertyBaseQuery(supabase, organizationId),
      viewQuery,
      activeOwnerLinks,
    ),
    viewQuery.sort,
  ).order("id", { ascending: true }).range(range.from, range.to);
  const rowsResult = await result;

  if (rowsResult.error) {
    throw new Error(`Could not load properties: ${rowsResult.error.message}`);
  }

  if (!Array.isArray(rowsResult.data)) {
    throw new Error("Could not load properties: The query returned no row data.");
  }
  const properties = rowsResult.data;
  if (typeof rowsResult.count !== "number" || !Number.isSafeInteger(rowsResult.count) || rowsResult.count < 0 ||
    properties.length !== Math.min(pageSize, Math.max(0, rowsResult.count - range.from))) {
    throw new Error("Could not load properties: The page is incomplete or its exact count is unavailable. Reload and try again.");
  }

  return {
    properties,
    totalCount: rowsResult.count,
  };
}

function applyPropertyBaseFilters(
  query: PropertyFilterQuery,
  viewQuery: PropertyViewQuery,
  activeOwnerLinks?: ReadonlyMap<string, ActiveOwnerLink>,
) {
  let filteredQuery = query;

  if (viewQuery.archiveState === "active") {
    filteredQuery = filteredQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    filteredQuery = filteredQuery.not("archived_at", "is", null);
  }

  if (viewQuery.status !== "all") {
    filteredQuery = filteredQuery.in(
      "status",
      getStoredPropertyStatusValues(viewQuery.status),
    );
  }

  if (
    activeOwnerLinks &&
    activeOwnerLinks.size > 0 &&
    canApplyPropertyOwnerExclusionInUrl(activeOwnerLinks)
  ) {
    filteredQuery = filteredQuery.not(
      "id",
      "in",
      formatPostgrestInFilter(new Set(activeOwnerLinks.keys())),
    );
  }

  return filteredQuery;
}

function canApplyPropertyOwnerExclusionInUrl(
  activeOwnerLinks: ReadonlyMap<string, ActiveOwnerLink>,
) {
  return activeOwnerLinks.size <= propertyRelationshipBatchSize;
}

function applyPropertyBaseSort(
  query: ReturnType<typeof applyPropertyBaseFilters>,
  sort: PropertyViewQuery["sort"],
) {
  if (sort === "name_asc") {
    return query.order("name", { ascending: true }).order("code", {
      ascending: true,
    });
  }

  if (sort === "status_asc") {
    return query.order("status", { ascending: true }).order("code", {
      ascending: true,
    });
  }

  return query.order("code", { ascending: true });
}

async function getCompletePropertiesScreenData({
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: PropertyViewQuery;
}) {
  const properties = await getPropertySummaries(organizationId, {
    archiveState: viewQuery.archiveState,
    ownerStatus: viewQuery.ownerStatus,
    status: viewQuery.status,
  });
  const portfolio = viewQuery.query.trim() ? await loadPortfolioSearch(await createSupabaseServerClient(), organizationId) : undefined;
  const filteredProperties = filterPropertySummaries(properties, viewQuery, portfolio);
  const sortedProperties = sortPropertySummaries(
    filteredProperties,
    viewQuery.sort,
  );
  const pagination = buildPropertyPagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: sortedProperties.length,
  });

  return {
    pagination,
    properties: getPropertyPageSummaries(sortedProperties, pagination),
  };
}

export async function getPropertySummary(
  organizationId: string,
  propertyId: string,
) {
  const supabase = await createSupabaseServerClient();
  const result = await buildPropertyBaseQuery(supabase, organizationId)
    .eq("id", propertyId).is("archived_at", null).maybeSingle();
  if (result.error) throw new Error(`Could not load property: ${result.error.message}`);
  if (!result.data) return null;
  const [property] = await loadPropertySummariesForRows({ organizationId, properties: [result.data], supabase });
  return property;
}

export async function getPropertyDetail(
  organizationId: string,
  propertyId: string,
  { operationalTimezone }: { operationalTimezone?: string } = {},
) {
  const supabase = await createSupabaseServerClient();
  const businessDate = getBusinessDateValue(new Date(), operationalTimezone);
  const detailRecordLimit = 8;
  // Read the version first: a later ownership change then produces a safe
  // conflict, never a fresh version attached to an older owner snapshot.
  const propertyResult = await supabase
    .from("properties")
    .select(propertySelect)
    .eq("organization_id", organizationId)
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyResult.error) {
    throw new Error(`Could not load property: ${propertyResult.error.message}`);
  }
  if (!propertyResult.data) {
    return null;
  }

  const [
    unitRows,
    ownerRowsResult,
    activeLeaseRows,
    propertyDraftLeaseResult,
    timelineResult,
    ledgerRows,
    recentLedgerResult,
    documentsResult,
    expenseEvidenceResult,
    photos,
    maintenanceResult,
    maintenanceCounts,
    activityResult,
  ] = await Promise.all([
    readCompleteRows<PropertyDetailUnitRecord>({
      context: "Could not load property units",
      getRowId: row => row.id,
      readPage: (from, to) => supabase
      .from("units")
      .select(
        "id, unit_number, floor, status, current_rent_amount, current_rent_currency, archived_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("unit_number", { ascending: true })
      .order("id", { ascending: true }).range(from, to),
    }),
    supabase
      .from("property_owners")
      .select(
        "id, person_id, ownership_label, ownership_percent, is_primary, started_on, ended_on, archived_at",
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("started_on", { ascending: false, nullsFirst: false }),
    readCompleteRows<PropertyDetailLeaseRecord>({
      context: "Could not load property leases",
      getRowId: row => row.id,
      readPage: (from, to) => supabase
      .from("current_leases")
      .select(
        "id, unit_id, tenant_name, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency, archived_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .in("status", ["active", "notice_given"])
      .is("archived_at", null)
      .order("lease_end_date", { ascending: true })
      .order("id", { ascending: true }).range(from, to),
    }),
    supabase
      .from("current_leases")
      .select(
        "id, unit_id, tenant_name, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency, archived_at",
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .eq("status", "draft")
      .is("unit_id", null)
      .is("archived_at", null)
      .order("lease_start_date", { ascending: false })
      .limit(1),
    supabase
      .from("timeline_events")
      .select(
        "id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(detailRecordLimit),
    readCompleteRows<PropertyDetailLedgerTotalRecord>({
      context: "Could not load property ledger",
      getRowId: row => row.id,
      readPage: (from, to) => supabase
      .from("ledger_entries")
      .select(
        "id, transaction_date, direction, category, amount, currency",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false }).range(from, to),
    }),
    supabase.from("ledger_entries")
      .select("id, unit_id, transaction_date, direction, category, amount, currency, description")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(detailRecordLimit),
    supabase
      .from("documents")
      .select(
        "id, unit_id, lease_id, ledger_entry_id, task_id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(50),
    supabase
      .from("expense_submissions")
      .select(
        "id, supporting_document_id, source_type, source_id, customer_category, vendor_label, internal_cost_amount, currency, status",
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .not("supporting_document_id", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(50),
    getAssetPhotosForScope({
      organizationId,
      propertyId,
      supabase,
    }),
    supabase
      .from("tasks")
      .select(
        "id, unit_id, title, category, priority, status, due_date, due_time, actual_cost_amount, actual_cost_currency",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
    getMaintenanceCaseCounts({ supabase, organizationId, scopeColumn: "property_id", scopeId: propertyId, businessDate }),
    supabase
      .from("activity_logs")
      .select(
        "id, entity_type, entity_id, action, previous_values, new_values, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("entity_type", "property")
      .eq("entity_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (ownerRowsResult.error) {
    throw new Error(
      `Could not load property owner history: ${ownerRowsResult.error.message}`,
    );
  }

  if (propertyDraftLeaseResult.error) {
    throw new Error(
      `Could not load property draft lease: ${propertyDraftLeaseResult.error.message}`,
    );
  }

  if (timelineResult.error) {
    throw new Error(
      `Could not load property timeline: ${timelineResult.error.message}`,
    );
  }

  if (documentsResult.error) {
    throw new Error(
      `Could not load property documents: ${documentsResult.error.message}`,
    );
  }

  if (recentLedgerResult.error) {
    throw new Error(`Could not load recent property ledger: ${recentLedgerResult.error.message}`);
  }

  if (expenseEvidenceResult.error) {
    throw new Error(
      `Could not load property workflow evidence: ${expenseEvidenceResult.error.message}`,
    );
  }

  if (maintenanceResult.error) {
    throw new Error(
      `Could not load property maintenance cases: ${maintenanceResult.error.message}`,
    );
  }

  if (activityResult.error) {
    throw new Error(
      `Could not load property activity: ${activityResult.error.message}`,
    );
  }

  const ownerRows = ownerRowsResult.data ?? [];
  const ownerNameByPersonId = await getPeopleDisplayNames(
    organizationId,
    new Set(ownerRows.map((owner) => owner.person_id)),
  );
  const ownerHistory = ownerRows.map(
    (owner): PropertyOwnerHistoryRecord => ({
      ...owner,
      person_name: ownerNameByPersonId.get(owner.person_id) ?? "Linked owner",
    }),
  );
  const activeOwner = ownerHistory.find(
    (owner) => owner.is_primary && !owner.archived_at && !owner.ended_on,
  );
  const documents = addPropertyDocumentDownloadUrls(documentsResult.data ?? []);
  const ledgerEntries = ledgerRows;
  const maintenanceCases =
    (maintenanceResult.data ?? []) as PropertyDetailMaintenanceRecord[];
  const activity = await resolveRecentChangeTargets({
    logs: activityResult.data ?? [],
    organizationId,
    supabase: supabase as unknown as ActivityTargetQueryClient,
  });

  return buildPropertyDetail({
    businessDate,
    activeLeases: [
      ...activeLeaseRows,
      ...(propertyDraftLeaseResult.data ?? []),
    ],
    activeOwner: activeOwner
      ? {
          label: activeOwner.person_name,
          personId: activeOwner.person_id,
        }
      : null,
    activity,
    documents,
    expenseEvidence:
      (expenseEvidenceResult.data ?? []) as PropertyExpenseEvidenceRecord[],
    ledgerEntries,
    maintenanceCases,
    ownerHistory,
    photos,
    property: propertyResult.data,
    recentLedgerEntries: recentLedgerResult.data ?? [],
    recentTimelineEvents: timelineResult.data ?? [],
    recordCounts: {
      activeLeases: activeLeaseRows.length,
      documents: documentsResult.count ?? documents.length,
      ledgerEntries: ledgerEntries.length,
      maintenanceCases: maintenanceResult.count ?? maintenanceCases.length,
      ...maintenanceCounts,
      photos: photos.length,
      timelineEvents: timelineResult.count ?? timelineResult.data?.length ?? 0,
    },
    units: unitRows,
  });
}

function addPropertyDocumentDownloadUrls(
  rows: PropertyDetailDocumentRecord[],
): PropertyDetailDocumentRecord[] {
  return rows.map((row) => ({
    ...row,
    url: documentDownloadUrl(row.id),
  }));
}

function groupByProperty<T extends { property_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    if (!row.property_id) continue;
    const group = grouped.get(row.property_id) ?? [];
    group.push(row);
    grouped.set(row.property_id, group);
  }

  return grouped;
}

function filterPropertySummaries(
  properties: PropertySummary[],
  viewQuery: PropertyViewQuery,
  portfolio?: PortfolioSearch,
) {

  return properties.filter((property) => {
    const matchesArchiveState =
      viewQuery.archiveState === "all" ||
      (viewQuery.archiveState === "archived"
        ? property.isArchived
        : !property.isArchived);
    const matchesStatus =
      viewQuery.status === "all" || property.formValues.status === viewQuery.status;
    const matchesOwnerStatus = propertyMatchesOwnerStatusFilter(
      property,
      viewQuery.ownerStatus,
    );
    const matchesNetStatus = propertyMatchesNetStatusFilter(
      property,
      viewQuery.netStatus,
    );
    const matchesLeaseStatus = propertyMatchesLeaseStatusFilter(
      property,
      viewQuery.leaseStatus,
    );
    const matchesReview = propertyMatchesReviewFilter(property, viewQuery.review);
    const haystack = normalizeSearchText([
      property.name,
      property.code,
      property.type,
      property.owner,
      property.address,
      property.status,
    ]
      .join(" "));
    const matchesQuery = portfolio ? portfolio.matchesProperty(viewQuery.query, property.id, [haystack]) : matchesSearchText(viewQuery.query, [haystack]);

    return (
      matchesArchiveState &&
      matchesStatus &&
      matchesOwnerStatus &&
      matchesNetStatus &&
      matchesLeaseStatus &&
      matchesReview &&
      matchesQuery
    );
  });
}

export function propertyMatchesOwnerStatusFilter(
  property: Pick<PropertySummary, "hasActiveOwnerLink">,
  ownerStatus: PropertyOwnerStatusFilter,
) {
  return ownerStatus === "all" || !property.hasActiveOwnerLink;
}

export function propertyMatchesNetStatusFilter(
  property: Pick<PropertySummary, "netIncomeUsd">,
  netStatus: PropertyNetStatusFilter,
) {
  return netStatus === "all" || property.netIncomeUsd < 0;
}

export function propertyMatchesLeaseStatusFilter(
  property: Pick<
    PropertySummary,
    "currentLeaseCount" | "units" | "unitsWithoutCurrentLease"
  >,
  leaseStatus: PropertyLeaseStatusFilter,
) {
  if (leaseStatus === "missing") {
    return property.units > 0
      ? property.unitsWithoutCurrentLease > 0
      : property.currentLeaseCount === 0;
  }

  if (leaseStatus === "current") {
    return property.units > 0
      ? property.unitsWithoutCurrentLease === 0
      : property.currentLeaseCount > 0;
  }

  return true;
}

export function propertyMatchesReviewFilter(
  property: Pick<PropertySummary, "address" | "thumbnailUrl" | "units">,
  review: PropertyReviewFilter,
) {
  if (review === "needs_units") {
    return property.units === 0;
  }

  if (review === "missing_photos") {
    return !property.thumbnailUrl;
  }

  if (review === "missing_address") {
    return property.address === "No address recorded";
  }

  return true;
}

function sortPropertySummaries(
  properties: PropertySummary[],
  sort = DEFAULT_PROPERTY_SORT,
) {
  return [...properties].sort((first, second) => {
    if (sort === "name_asc") {
      return compareStrings(first.name, second.name) || compareStrings(first.code, second.code) || first.id.localeCompare(second.id);
    }

    if (sort === "status_asc") {
      return (
        compareStrings(first.status, second.status) ||
        compareStrings(first.code, second.code) || first.id.localeCompare(second.id)
      );
    }

    if (sort === "net_desc") {
      return (
        second.netIncomeUsd - first.netIncomeUsd ||
        compareStrings(first.code, second.code) || first.id.localeCompare(second.id)
      );
    }

    if (sort === "net_asc") {
      return (
        first.netIncomeUsd - second.netIncomeUsd ||
        compareStrings(first.code, second.code) || first.id.localeCompare(second.id)
      );
    }

    return compareStrings(first.code, second.code) || first.id.localeCompare(second.id);
  });
}

function buildPropertyPagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): PropertyPagination {
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

function getPropertyPageSummaries(
  properties: PropertySummary[],
  pagination: PropertyPagination,
) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return properties.slice(start, pagination.to);
}

function getRange(page: number, pageSize: number) {
  const from = (Math.max(page, 1) - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function getActiveOwnerLinks(
  organizationId: string,
  propertyIds?: ReadonlySet<string>,
) {
  const supabase = await createSupabaseServerClient();
  const ownerRows = propertyIds
    ? await getActiveOwnerRowsForProperties(supabase, organizationId, propertyIds)
    : await getActiveOwnerRows(supabase, organizationId);
  const personIds = new Set(ownerRows.map((owner) => owner.person_id));
  const labelsByPerson = await getPeopleDisplayNames(organizationId, personIds);
  const links = new Map<string, ActiveOwnerLink>();

  for (const owner of ownerRows) {
    links.set(owner.property_id, {
      label: labelsByPerson.get(owner.person_id) ?? "Linked owner",
      ownershipPercent: owner.ownership_percent?.toFixed(3) ?? "",
      personId: owner.person_id,
      startedOn: owner.started_on ?? "",
    });
  }

  return links;
}

async function getActiveOwnerRows(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<ActiveOwnerRow[]> {
  return readCompleteRows({
    context: "Could not load property owner links",
    getRowId: (row) => row.id,
    readPage: (from, to) => supabase
    .from("property_owners")
    .select("id, ownership_percent, person_id, property_id, started_on", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .is("archived_at", null)
    .is("ended_on", null)
    .order("id", { ascending: true }).range(from, to),
  });
}

async function getActiveOwnerRowsForProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: ReadonlySet<string>,
): Promise<ActiveOwnerRow[]> {
  if (propertyIds.size === 0) {
    return [];
  }

  return queryValueBatches([...propertyIds], (batch, remainingRows) => readCompleteRows({
    maxRows: remainingRows,
    context: "Could not load property owner links",
    getRowId: (row) => row.id,
    readPage: (from, to) => supabase
      .from("property_owners")
      .select("id, ownership_percent, person_id, property_id, started_on", { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("is_primary", true)
      .in("property_id", batch)
      .is("archived_at", null)
      .is("ended_on", null)
      .order("id", { ascending: true }).range(from, to),
  }));
}

async function getPeopleDisplayNames(
  organizationId: string,
  personIds: ReadonlySet<string>,
) {
  if (personIds.size === 0) {
    return new Map<string, string>();
  }

  const supabase = await createSupabaseServerClient();
  const people = await queryValueBatches([...personIds], (batch, remainingRows) => readCompleteRows<{ id: string; display_name: string }>({
    maxRows: remainingRows,
    context: "Could not load owner names",
    getRowId: (row) => row.id,
    readPage: (from, to) => supabase
      .from("people")
      .select("id, display_name", { count: "exact" })
      .eq("organization_id", organizationId)
      .in("id", batch)
      .order("id", { ascending: true }).range(from, to),
  }));

  return new Map(people.map((person) => [person.id, person.display_name]));
}

function getStoredPropertyStatusValues(status: PropertyStatusValue) {
  if (status === "under_renovation") {
    return ["under_renovation", "under-renovation", "renovation"];
  }

  return [status];
}

function formatPostgrestInFilter(values: ReadonlySet<string>) {
  return `(${[...values].join(",")})`;
}

async function queryValueBatches<T>(
  values: string[],
  queryBatch: (batch: string[], remainingRows: number) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];

  for (
    let index = 0;
    index < values.length;
    index += propertyRelationshipBatchSize
  ) {
    rows.push(
      ...(await queryBatch(
        values.slice(index, index + propertyRelationshipBatchSize),
        DEFAULT_COMPLETE_READ_MAX_ROWS - rows.length,
      )),
    );
  }

  return rows;
}
