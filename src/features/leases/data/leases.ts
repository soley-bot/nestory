import { createSupabaseServerClient } from "@/lib/db/server";
import { isMissingSchemaObjectMessage } from "@/lib/db/schema-errors";
import { toRecentChange } from "@/features/activity/recent-changes";
import type { CurrencyCode } from "@/lib/money/format";
import {
  getLeaseEndDateScope,
  parseLeaseSearchParams,
} from "@/features/leases/lease.filters";
import {
  buildLeaseSummary,
  type LeaseDepositRow,
  type LeaseDocumentRow,
  type LeaseOccupancyRow,
  type LeasePartyRow,
  type LeasePropertyRow,
  type LeaseRow,
  type LeaseTermRow,
  type LeaseTimelineRow,
  type LeaseUnitRow,
} from "@/features/leases/data/lease-summary";
import type {
  LeasePagination,
  LeasePropertyOption,
  LeaseSummary,
  LeaseTenantOption,
  LeaseUnitOption,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

const leaseSelect =
  "id, property_id, unit_id, tenant_name, primary_tenant_person_id, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency, deposit_amount, deposit_currency, status, archived_at";
const propertySelect = "id, code, name, archived_at";
const unitSelect = "id, property_id, unit_number, floor, status, archived_at";
const tenantSelect = "id, display_name, primary_email, primary_phone";
type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;
type OptionalLeaseBackboneResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};
const RENT_SORT_CURRENCIES: CurrencyCode[] = ["USD"];

export async function getLeasesScreenData(
  organizationId: string,
  viewQuery: LeaseViewQuery = parseLeaseSearchParams({}),
) {
  const supabase = await createSupabaseServerClient();
  const [propertiesResult, unitsResult, tenantsResult] = await Promise.all([
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .order("code", { ascending: true }),
    supabase
      .from("units")
      .select(unitSelect)
      .eq("organization_id", organizationId)
      .order("unit_number", { ascending: true }),
    supabase
      .from("people")
      .select(tenantSelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("display_name", { ascending: true }),
  ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load lease properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(`Could not load lease units: ${unitsResult.error.message}`);
  }

  if (tenantsResult.error) {
    throw new Error(
      `Could not load lease tenant people: ${tenantsResult.error.message}`,
    );
  }

  const properties = (propertiesResult.data ?? []) as Array<
    LeasePropertyRow & { archived_at: string | null }
  >;
  const units = (unitsResult.data ?? []) as Array<
    LeaseUnitRow & { archived_at: string | null }
  >;
  const tenantOptions = toTenantOptions(tenantsResult.data ?? []);
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const buildLeasesQuery = ({
    count,
    currency,
    head = false,
    sort = viewQuery.sort,
  }: {
    count?: "exact";
    currency?: CurrencyCode;
    head?: boolean;
    sort?: LeaseViewQuery["sort"] | "none";
  } = {}) => {
    const selectOptions: { count?: "exact"; head?: boolean } = {};

    if (count) {
      selectOptions.count = count;
    }

    if (head) {
      selectOptions.head = true;
    }

    let leasesQuery = supabase
      .from("leases")
      .select(leaseSelect, selectOptions)
      .eq("organization_id", organizationId);

    if (viewQuery.archiveState === "active") {
      leasesQuery = leasesQuery.is("archived_at", null);
    } else if (viewQuery.archiveState === "archived") {
      leasesQuery = leasesQuery.not("archived_at", "is", null);
    }

    if (viewQuery.leaseId) {
      leasesQuery = leasesQuery.eq("id", viewQuery.leaseId);
    } else {
      if (viewQuery.propertyId !== "all") {
        leasesQuery = leasesQuery.eq("property_id", viewQuery.propertyId);
      }

      if (viewQuery.unitId !== "all") {
        leasesQuery = leasesQuery.eq("unit_id", viewQuery.unitId);
      }

      if (viewQuery.status === "current") {
        leasesQuery = leasesQuery.in("status", ["active", "notice_given"]);
      } else if (viewQuery.status !== "all") {
        leasesQuery = leasesQuery.eq("status", viewQuery.status);
      }

      if (viewQuery.tenantStatus === "missing") {
        leasesQuery = leasesQuery.is("primary_tenant_person_id", null);
      }

      const endDateScope = getLeaseEndDateScope(viewQuery);

      if (endDateScope.from) {
        leasesQuery = leasesQuery.gte("lease_end_date", endDateScope.from);
      }

      if (endDateScope.before) {
        leasesQuery = leasesQuery.lt("lease_end_date", endDateScope.before);
      }
    }

    if (currency) {
      leasesQuery = leasesQuery.eq("monthly_rent_currency", currency);
    }

    if (!viewQuery.leaseId) {
      for (const filter of buildLeaseSearchFilters(viewQuery, {
        properties,
        units,
        propertiesById,
      })) {
        leasesQuery = leasesQuery.or(filter);
      }
    }

    if (sort === "none") {
      return leasesQuery;
    }

    if (viewQuery.archiveState === "all" && sort !== "rent_desc") {
      leasesQuery = leasesQuery.order("archived_at", {
        ascending: true,
        nullsFirst: true,
      });
    }

    if (sort === "end_asc") {
      return leasesQuery
        .order("lease_end_date", { ascending: true })
        .order("tenant_name", { ascending: true });
    }

    if (sort === "tenant_asc") {
      return leasesQuery
        .order("tenant_name", { ascending: true })
        .order("lease_start_date", { ascending: false });
    }

    if (sort === "rent_desc") {
      return leasesQuery
        .order("monthly_rent_amount", { ascending: false })
        .order("tenant_name", { ascending: true });
    }

    return leasesQuery
      .order("lease_start_date", { ascending: false })
      .order("tenant_name", { ascending: true });
  };

  const toLeaseSummaries = (rows: LeaseRow[]) =>
    rows.map((lease) =>
      buildLeaseSummary({
        lease,
        property: propertiesById.get(lease.property_id),
        unit: lease.unit_id ? unitsById.get(lease.unit_id) : undefined,
      }),
    );

  if (viewQuery.sort === "rent_desc") {
    const countResult = await buildLeasesQuery({
      count: "exact",
      head: true,
      sort: "none",
    });

    if (countResult.error) {
      throw new Error(`Could not load leases: ${countResult.error.message}`);
    }

    const pagination = buildLeasePagination({
      page: viewQuery.page,
      pageSize: viewQuery.pageSize,
      totalCount: countResult.count ?? 0,
    });

    if (pagination.totalCount === 0) {
      return {
        leases: [],
        pagination,
        propertyOptions: toPropertyOptions(properties),
        tenantOptions,
        unitOptions: toUnitOptions(units, propertiesById),
      };
    }

    const rentWindowSize = pagination.page * pagination.pageSize;
    const rentResults = await Promise.all(
      RENT_SORT_CURRENCIES.map((currency) =>
        buildLeasesQuery({ currency, sort: "rent_desc" }).range(
          0,
          rentWindowSize - 1,
        ),
      ),
    );

    for (const result of rentResults) {
      if (result.error) {
        throw new Error(`Could not load leases: ${result.error.message}`);
      }
    }

    const sortedLeases = sortLeaseSummaries(
      toLeaseSummaries(
        rentResults.flatMap((result) => (result.data ?? []) as LeaseRow[]),
      ),
      "rent_desc",
    );
    const visibleLeases = getLeasePageSummaries(sortedLeases, pagination);

    return {
      leases: await enrichLeaseSummaries({
        focusedLeaseId: viewQuery.leaseId,
        leases: visibleLeases,
        organizationId,
        propertiesById,
        supabase,
        unitsById,
      }),
      pagination,
      propertyOptions: toPropertyOptions(properties),
      tenantOptions,
      unitOptions: toUnitOptions(units, propertiesById),
    };
  }

  let range = getRange(viewQuery.page, viewQuery.pageSize);
  let leasesResult = await buildLeasesQuery({ count: "exact" }).range(
    range.from,
    range.to,
  );

  if (leasesResult.error) {
    throw new Error(`Could not load leases: ${leasesResult.error.message}`);
  }

  let pagination = buildLeasePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: leasesResult.count ?? leasesResult.data?.length ?? 0,
  });

  if (pagination.page !== viewQuery.page) {
    range = getRange(pagination.page, viewQuery.pageSize);
    leasesResult = await buildLeasesQuery({ count: "exact" }).range(
      range.from,
      range.to,
    );

    if (leasesResult.error) {
      throw new Error(`Could not load leases: ${leasesResult.error.message}`);
    }

    pagination = buildLeasePagination({
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      totalCount: leasesResult.count ?? leasesResult.data?.length ?? 0,
    });
  }

  const leases = toLeaseSummaries((leasesResult.data ?? []) as LeaseRow[]);

  return {
    leases: await enrichLeaseSummaries({
      focusedLeaseId: viewQuery.leaseId,
      leases,
      organizationId,
      propertiesById,
      supabase,
      unitsById,
    }),
    pagination,
    propertyOptions: toPropertyOptions(properties),
    tenantOptions,
    unitOptions: toUnitOptions(units, propertiesById),
  };
}

async function enrichLeaseSummaries({
  focusedLeaseId,
  leases,
  organizationId,
  propertiesById,
  supabase,
  unitsById,
}: {
  focusedLeaseId: string | null;
  leases: LeaseSummary[];
  organizationId: string;
  propertiesById: Map<string, LeasePropertyRow>;
  supabase: SupabaseServerClient;
  unitsById: Map<string, LeaseUnitRow>;
}) {
  if (leases.length === 0) {
    return leases;
  }

  const detailLease =
    leases.find((lease) => lease.id === focusedLeaseId) ?? leases[0];
  const detailLeaseIds = [detailLease.id];
  const unitIds = new Set(detailLease.unitId ? [detailLease.unitId] : []);
  const propertyIds = new Set([detailLease.propertyId]);
  const [
    partiesResult,
    termsResult,
    occupanciesResult,
    depositsResult,
    documentsResult,
    timelineResult,
    activityResult,
    ledgerResult,
  ] = await Promise.all([
    supabase
      .from("lease_parties")
      .select(
        "id, lease_id, person_id, party_role, is_primary, started_on, ended_on, archived_at",
      )
      .eq("organization_id", organizationId)
      .in("lease_id", detailLeaseIds)
      .order("is_primary", { ascending: false })
      .order("party_role", { ascending: true }),
    supabase
      .from("lease_terms")
      .select(
        "id, lease_id, term_sequence, start_date, end_date, rent_amount, rent_currency, status, archived_at",
      )
      .eq("organization_id", organizationId)
      .in("lease_id", detailLeaseIds)
      .order("term_sequence", { ascending: false }),
    supabase
      .from("lease_occupancies")
      .select(
        "id, lease_id, unit_id, status, scheduled_move_in_date, actual_move_in_date, scheduled_move_out_date, actual_move_out_date, archived_at",
      )
      .eq("organization_id", organizationId)
      .in("lease_id", detailLeaseIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("lease_deposits")
      .select(
        "id, lease_id, deposit_type, amount, currency, status, archived_at",
      )
      .eq("organization_id", organizationId)
      .in("lease_id", detailLeaseIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("documents")
      .select(
        "id, lease_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
      )
      .eq("organization_id", organizationId)
      .in("lease_id", detailLeaseIds)
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("timeline_events")
      .select("id, lease_id, event_date, event_type, title")
      .eq("organization_id", organizationId)
      .in("lease_id", detailLeaseIds)
      .is("archived_at", null)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("activity_logs")
      .select(
        "id, entity_type, entity_id, action, previous_values, new_values, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("entity_type", "lease")
      .in("entity_id", detailLeaseIds)
      .order("created_at", { ascending: false }),
    buildLeaseLedgerQuery(supabase, organizationId, propertyIds, unitIds),
  ]);

  const partyData = getOptionalLeaseBackboneRows(
    partiesResult,
    "lease parties",
    "lease_parties",
  );
  const termData = getOptionalLeaseBackboneRows(
    termsResult,
    "lease terms",
    "lease_terms",
  );
  const occupancyData = getOptionalLeaseBackboneRows(
    occupanciesResult,
    "lease occupancies",
    "lease_occupancies",
  );
  const depositData = getOptionalLeaseBackboneRows(
    depositsResult,
    "lease deposits",
    "lease_deposits",
  );
  const depositIds = (depositData as LeaseDepositRow[]).map((deposit) => deposit.id);
  const depositEventsResult = depositIds.length
    ? await supabase.from("lease_deposit_events").select("id, lease_deposit_id, event_type, event_date, amount, currency, reference, reversal_of_id").eq("organization_id", organizationId).in("lease_deposit_id", depositIds).order("event_date", { ascending: false })
    : { data: [], error: null };
  if (depositEventsResult.error) throw new Error(`Could not load lease deposit events: ${depositEventsResult.error.message}`);
  const eventsByDepositId = new Map<string, Array<{ id: string; event_type: string; event_date: string; amount: number; currency: CurrencyCode; reference: string | null; reversal_of_id: string | null }>>();
  for (const event of depositEventsResult.data ?? []) {
    const rows = eventsByDepositId.get(event.lease_deposit_id) ?? [];
    rows.push(event as typeof rows[number]); eventsByDepositId.set(event.lease_deposit_id, rows);
  }
  for (const deposit of depositData as LeaseDepositRow[]) deposit.events = eventsByDepositId.get(deposit.id) ?? [];

  if (documentsResult.error) {
    throw new Error(
      `Could not load lease documents: ${documentsResult.error.message}`,
    );
  }

  if (timelineResult.error) {
    throw new Error(
      `Could not load lease timeline: ${timelineResult.error.message}`,
    );
  }

  if (activityResult.error) {
    throw new Error(
      `Could not load lease activity: ${activityResult.error.message}`,
    );
  }

  if (ledgerResult.error) {
    throw new Error(
      `Could not load lease ledger context: ${ledgerResult.error.message}`,
    );
  }

  const partyRows = await addLeasePartyPeople(
    partyData,
    organizationId,
    supabase,
  );
  const documents = await addSignedDocumentUrls(
    documentsResult.data ?? [],
    supabase,
  );
  const partiesByLeaseId = groupByLeaseId(partyRows);
  const termsByLeaseId = groupByLeaseId(termData as LeaseTermRow[]);
  const occupanciesByLeaseId = groupByLeaseId(
    occupancyData as LeaseOccupancyRow[],
  );
  const depositsByLeaseId = groupByLeaseId(depositData as LeaseDepositRow[]);
  const documentsByLeaseId = groupByLeaseId(documents);
  const timelineByLeaseId = groupByLeaseId(
    (timelineResult.data ?? []) as LeaseTimelineRow[],
  );
  const activityByLeaseId = groupActivityByLeaseId(activityResult.data ?? []);
  const ledgerRows = ledgerResult.data ?? [];

  return leases.map((lease) => {
    if (lease.id !== detailLease.id) {
      return lease;
    }

    const leaseRow = summaryToLeaseRow(lease);

    return buildLeaseSummary({
      activity: activityByLeaseId.get(lease.id) ?? [],
      documents: documentsByLeaseId.get(lease.id) ?? [],
      ledgerEntryCount: countRelatedLedgerRows(lease, ledgerRows),
      lease: leaseRow,
      occupancies: occupanciesByLeaseId.get(lease.id) ?? [],
      parties: partiesByLeaseId.get(lease.id) ?? [],
      property: propertiesById.get(lease.propertyId),
      terms: termsByLeaseId.get(lease.id) ?? [],
      deposits: depositsByLeaseId.get(lease.id) ?? [],
      timelineEvents: timelineByLeaseId.get(lease.id) ?? [],
      unit: lease.unitId ? unitsById.get(lease.unitId) : undefined,
    });
  });
}

export function getOptionalLeaseBackboneRows<T>(
  result: OptionalLeaseBackboneResult<T>,
  label: string,
  schemaObject: string,
) {
  if (!result.error) {
    return result.data ?? [];
  }

  if (isMissingSchemaObjectMessage(result.error.message, [schemaObject])) {
    return [];
  }

  throw new Error(`Could not load ${label}: ${result.error.message}`);
}

function buildLeaseLedgerQuery(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: ReadonlySet<string>,
  unitIds: ReadonlySet<string>,
) {
  let query = supabase
    .from("ledger_entries")
    .select("id, property_id, unit_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (unitIds.size > 0) {
    query = query.in("unit_id", [...unitIds]);
  } else {
    query = query.in("property_id", [...propertyIds]);
  }

  return query;
}

async function addLeasePartyPeople(
  rows: Array<{
    archived_at: string | null;
    ended_on: string | null;
    id: string;
    is_primary: boolean;
    lease_id: string;
    party_role: string;
    person_id: string;
  }>,
  organizationId: string,
  supabase: SupabaseServerClient,
): Promise<LeasePartyRow[]> {
  const personIds = new Set(rows.map((row) => row.person_id));

  if (personIds.size === 0) {
    return rows;
  }

  const peopleResult = await supabase
    .from("people")
    .select("id, display_name, primary_email, primary_phone")
    .eq("organization_id", organizationId)
    .in("id", [...personIds]);

  if (peopleResult.error) {
    if (isMissingSchemaObjectMessage(peopleResult.error.message, ["people"])) {
      return rows.map((row) => ({
        ...row,
        person_name: "Linked person",
        primary_email: null,
        primary_phone: null,
      }));
    }

    throw new Error(
      `Could not load lease party people: ${peopleResult.error.message}`,
    );
  }

  const peopleById = new Map(
    (peopleResult.data ?? []).map((person) => [person.id, person]),
  );

  return rows.map((row) => {
    const person = peopleById.get(row.person_id);

    return {
      ...row,
      person_name: person?.display_name ?? "Linked person",
      primary_email: person?.primary_email ?? null,
      primary_phone: person?.primary_phone ?? null,
    };
  });
}

async function addSignedDocumentUrls(
  rows: Array<LeaseDocumentRow & { storage_path: string }>,
  supabase: SupabaseServerClient,
): Promise<LeaseDocumentRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage
        .from("nestory-documents")
        .createSignedUrl(row.storage_path, 60 * 60);

      return {
        category: row.category,
        file_name: row.file_name,
        id: row.id,
        lease_id: row.lease_id,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        uploaded_at: row.uploaded_at,
        url: data?.signedUrl,
      };
    }),
  );
}

function groupByLeaseId<T extends { lease_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    if (!row.lease_id) {
      continue;
    }

    const group = grouped.get(row.lease_id) ?? [];
    group.push(row);
    grouped.set(row.lease_id, group);
  }

  return grouped;
}

function groupActivityByLeaseId(
  rows: Array<Parameters<typeof toRecentChange>[0]>,
) {
  const grouped = new Map<string, ReturnType<typeof toRecentChange>[]>();

  for (const row of rows) {
    const group = grouped.get(row.entity_id) ?? [];
    group.push(toRecentChange(row));
    grouped.set(row.entity_id, group);
  }

  return grouped;
}

function countRelatedLedgerRows(
  lease: LeaseSummary,
  rows: Array<{ property_id: string; unit_id: string | null }>,
) {
  return rows.filter((row) =>
    lease.unitId
      ? row.unit_id === lease.unitId
      : row.property_id === lease.propertyId && !row.unit_id,
  ).length;
}

function summaryToLeaseRow(lease: LeaseSummary): LeaseRow {
  return {
    archived_at: lease.isArchived ? "archived" : null,
    deposit_amount: lease.formValues.depositAmount ?? null,
    deposit_currency: lease.formValues.depositCurrency ?? null,
    id: lease.id,
    lease_end_date: lease.formValues.leaseEndDate,
    lease_start_date: lease.formValues.leaseStartDate,
    monthly_rent_amount: lease.formValues.monthlyRentAmount,
    monthly_rent_currency: lease.formValues.monthlyRentCurrency,
    primary_tenant_person_id: lease.formValues.tenantPersonId || null,
    property_id: lease.propertyId,
    status: lease.statusValue,
    tenant_name: lease.tenantName,
    unit_id: lease.unitId,
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function toPropertyOptions(
  properties: Array<LeasePropertyRow & { archived_at?: string | null }>,
): LeasePropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: `${property.code} - ${property.name}${
      property.archived_at ? " (archived)" : ""
    }`,
  }));
}

function toUnitOptions(
  units: Array<LeaseUnitRow & { archived_at?: string | null }>,
  propertiesById: Map<string, LeasePropertyRow>,
): LeaseUnitOption[] {
  return units.map((unit) => {
    const property = propertiesById.get(unit.property_id);
    const propertyCode = property?.code ?? "Property";

    return {
      id: unit.id,
      label: `${propertyCode} / Unit ${unit.unit_number}${
        unit.archived_at ? " (archived)" : ""
      }`,
      propertyId: unit.property_id,
    };
  });
}

function toTenantOptions(
  people: Array<{
    id: string;
    display_name: string;
    primary_email: string | null;
    primary_phone: string | null;
  }>,
): LeaseTenantOption[] {
  return people.map((person) => ({
    id: person.id,
    label: person.display_name,
  }));
}

function buildLeaseSearchFilters(
  viewQuery: LeaseViewQuery,
  {
    properties,
    propertiesById,
    units,
  }: {
    properties: LeasePropertyRow[];
    propertiesById: Map<string, LeasePropertyRow>;
    units: LeaseUnitRow[];
  },
) {
  return getLeaseSearchTokens(viewQuery.query).map((token) => {
    const conditions = [
      `tenant_name.ilike.*${token}*`,
      `status.ilike.*${token}*`,
    ];
    const amountToken = parseSearchAmountToken(token);
    const currencyToken = parseCurrencySearchToken(token);
    const propertyIds = properties
      .filter((property) =>
        normalizeSearchText(`${property.code} ${property.name}`).includes(
          token,
        ),
      )
      .map((property) => property.id);
    const unitIds = units
      .filter((unit) => {
        const property = propertiesById.get(unit.property_id);

        return normalizeSearchText(
          ["unit", unit.unit_number, unit.floor, property?.code, property?.name]
            .filter(Boolean)
            .join(" "),
        ).includes(token);
      })
      .map((unit) => unit.id);

    if (amountToken !== null) {
      conditions.push(`monthly_rent_amount.eq.${amountToken}`);
      conditions.push(`deposit_amount.eq.${amountToken}`);
    }

    if (currencyToken) {
      conditions.push(`monthly_rent_currency.eq.${currencyToken}`);
      conditions.push(`deposit_currency.eq.${currencyToken}`);
    }

    if (propertyIds.length > 0) {
      conditions.push(
        `property_id.in.(${uniqueStrings(propertyIds).join(",")})`,
      );
    }

    if (token === "unit" || token === "units") {
      conditions.push("unit_id.not.is.null");
    } else if (unitIds.length > 0) {
      conditions.push(`unit_id.in.(${uniqueStrings(unitIds).join(",")})`);
    }

    return conditions.join(",");
  });
}

function getLeaseSearchTokens(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .map(sanitizePostgrestSearchToken)
    .filter(Boolean);
}

function sanitizePostgrestSearchToken(token: string) {
  return token.replace(/[^\p{L}\p{N}_.-]+/gu, "").toLowerCase();
}

function normalizeSearchText(value: string) {
  return value.toLowerCase();
}

function parseSearchAmountToken(token: string) {
  if (!/^\d+(\.\d+)?$/.test(token)) {
    return null;
  }

  const amount = Number(token);

  return Number.isFinite(amount) ? amount : null;
}

function parseCurrencySearchToken(token: string): CurrencyCode | null {
  const normalized = token.toUpperCase();

  return normalized === "USD" ? "USD" : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function compareLeaseSummaries(first: LeaseSummary, second: LeaseSummary) {
  return (
    Number(first.isArchived) - Number(second.isArchived) ||
    second.formValues.leaseStartDate.localeCompare(
      first.formValues.leaseStartDate,
    ) ||
    compareStrings(first.tenantName, second.tenantName)
  );
}

function sortLeaseSummaries(
  leases: LeaseSummary[],
  sort: LeaseViewQuery["sort"],
) {
  return [...leases].sort((first, second) => {
    if (sort === "end_asc") {
      return (
        first.formValues.leaseEndDate.localeCompare(
          second.formValues.leaseEndDate,
        ) || compareStrings(first.tenantName, second.tenantName)
      );
    }

    if (sort === "tenant_asc") {
      return (
        compareStrings(first.tenantName, second.tenantName) ||
        second.formValues.leaseStartDate.localeCompare(
          first.formValues.leaseStartDate,
        )
      );
    }

    if (sort === "rent_desc") {
      return (
        second.rentUsd - first.rentUsd ||
        compareStrings(first.tenantName, second.tenantName)
      );
    }

    return compareLeaseSummaries(first, second);
  });
}

function buildLeasePagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): LeasePagination {
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

function getLeasePageSummaries(
  leases: LeaseSummary[],
  pagination: LeasePagination,
) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return leases.slice(start, pagination.to);
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}
