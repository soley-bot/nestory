import { createSupabaseServerClient } from "@/lib/db/server";
import {
  buildPeopleInsightsFromCounts,
  type PeopleInsights,
} from "@/features/people/people.insights";
import type { PersonRoleValue } from "@/features/people/people.types";

const INSIGHT_PAGE_SIZE = 200;
const excludedActiveLeaseStatuses = new Set([
  "cancelled",
  "canceled",
  "ended",
  "terminated",
]);

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;
type InsightTable =
  | "documents"
  | "lease_parties"
  | "leases"
  | "people"
  | "person_contacts"
  | "person_roles"
  | "property_owners"
  | "vendor_profiles";
type UnknownRecord = Record<string, unknown>;

type InsightQueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type LeaseContext = {
  archivedAt: string | null;
  propertyId: string;
  status: string;
  unitId: string | null;
};

type LeasePartyContext = {
  archivedAt: string | null;
  endedOn: string | null;
  leaseId: string;
};

type OwnerContext = {
  archivedAt: string | null;
  endedOn: string | null;
  propertyId: string;
};

// Server data boundary: return aggregate display facts only. Never return the
// minimal source rows from this module to a client component.
export async function getPeopleInsightsData(
  organizationId: string,
): Promise<PeopleInsights> {
  const supabase = await createSupabaseServerClient();
  const [
    peopleRows,
    roleRows,
    contactRows,
    leasePartyRows,
    leaseRows,
    ownerRows,
    vendorRows,
    documentRows,
  ] = await Promise.all([
    getPagedInsightRows({
      columns: "id, primary_email, primary_phone",
      filters: [{ column: "archived_at", kind: "is-null" }],
      organizationId,
      supabase,
      table: "people",
    }),
    getPagedInsightRows({
      columns: "id, person_id, role",
      filters: [
        { column: "archived_at", kind: "is-null" },
        { column: "status", kind: "eq", value: "active" },
      ],
      organizationId,
      supabase,
      table: "person_roles",
    }),
    getPagedInsightRows({
      columns: "id, person_id, email, phone",
      filters: [{ column: "archived_at", kind: "is-null" }],
      organizationId,
      supabase,
      table: "person_contacts",
    }),
    getPagedInsightRows({
      columns: "id, person_id, lease_id, ended_on, archived_at",
      organizationId,
      supabase,
      table: "lease_parties",
    }),
    getPagedInsightRows({
      columns: "id, property_id, unit_id, status, archived_at",
      organizationId,
      supabase,
      table: "leases",
    }),
    getPagedInsightRows({
      columns: "id, person_id, property_id, ended_on, archived_at",
      organizationId,
      supabase,
      table: "property_owners",
    }),
    getPagedInsightRows({
      columns: "id, person_id, archived_at",
      organizationId,
      supabase,
      table: "vendor_profiles",
    }),
    getPagedInsightRows({
      columns: "id, lease_id, property_id, unit_id",
      organizationId,
      supabase,
      table: "documents",
    }),
  ]);

  const peopleById = new Map(
    peopleRows.flatMap((row) => {
      const id = readString(row, "id");

      return id ? [[id, row] as const] : [];
    }),
  );
  const activePersonIds = new Set(peopleById.keys());
  const usefulContactIds = new Set<string>();
  const rolesByPerson = new Map<string, Set<PersonRoleValue>>();
  const leasePartiesByPerson = new Map<string, LeasePartyContext[]>();
  const leasesById = new Map<string, LeaseContext>();
  const ownersByPerson = new Map<string, OwnerContext[]>();
  const vendorProfileIds = new Set<string>();

  for (const [personId, row] of peopleById) {
    if (
      hasUsefulValue(readNullableString(row, "primary_email")) ||
      hasUsefulValue(readNullableString(row, "primary_phone"))
    ) {
      usefulContactIds.add(personId);
    }
  }

  for (const row of contactRows) {
    const personId = readString(row, "person_id");

    if (
      personId &&
      activePersonIds.has(personId) &&
      (hasUsefulValue(readNullableString(row, "email")) ||
        hasUsefulValue(readNullableString(row, "phone")))
    ) {
      usefulContactIds.add(personId);
    }
  }

  for (const row of roleRows) {
    const personId = readString(row, "person_id");
    const role = readRole(row.role);

    if (!personId || !role || !activePersonIds.has(personId)) {
      continue;
    }

    const roles = rolesByPerson.get(personId) ?? new Set<PersonRoleValue>();
    roles.add(role);
    rolesByPerson.set(personId, roles);
  }

  for (const row of leaseRows) {
    const id = readString(row, "id");
    const propertyId = readString(row, "property_id");
    const status = readString(row, "status");

    if (!id || !propertyId || !status) {
      continue;
    }

    leasesById.set(id, {
      archivedAt: readNullableString(row, "archived_at"),
      propertyId,
      status,
      unitId: readNullableString(row, "unit_id"),
    });
  }

  for (const row of leasePartyRows) {
    const personId = readString(row, "person_id");
    const leaseId = readString(row, "lease_id");

    if (!personId || !leaseId || !activePersonIds.has(personId)) {
      continue;
    }

    const parties = leasePartiesByPerson.get(personId) ?? [];
    parties.push({
      archivedAt: readNullableString(row, "archived_at"),
      endedOn: readNullableString(row, "ended_on"),
      leaseId,
    });
    leasePartiesByPerson.set(personId, parties);
  }

  for (const row of ownerRows) {
    const personId = readString(row, "person_id");
    const propertyId = readString(row, "property_id");

    if (!personId || !propertyId || !activePersonIds.has(personId)) {
      continue;
    }

    const owners = ownersByPerson.get(personId) ?? [];
    owners.push({
      archivedAt: readNullableString(row, "archived_at"),
      endedOn: readNullableString(row, "ended_on"),
      propertyId,
    });
    ownersByPerson.set(personId, owners);
  }

  for (const row of vendorRows) {
    const personId = readString(row, "person_id");

    if (
      personId &&
      activePersonIds.has(personId) &&
      !readNullableString(row, "archived_at")
    ) {
      vendorProfileIds.add(personId);
    }
  }

  const documentLeaseIds = new Set<string>();
  const documentPropertyIds = new Set<string>();
  const documentUnitIds = new Set<string>();

  for (const row of documentRows) {
    addOptionalString(documentLeaseIds, row, "lease_id");
    addOptionalString(documentPropertyIds, row, "property_id");
    addOptionalString(documentUnitIds, row, "unit_id");
  }

  const tenants = getPeopleWithRole(rolesByPerson, "tenant");
  const owners = getPeopleWithRole(rolesByPerson, "owner");
  const vendors = getPeopleWithRole(rolesByPerson, "vendor");
  const staff = getPeopleWithRole(rolesByPerson, "staff");
  let missingEvidenceCount = 0;

  for (const personId of activePersonIds) {
    if (
      !hasLinkedEvidence({
        documentLeaseIds,
        documentPropertyIds,
        documentUnitIds,
        leaseParties: leasePartiesByPerson.get(personId) ?? [],
        leasesById,
        owners: ownersByPerson.get(personId) ?? [],
      })
    ) {
      missingEvidenceCount += 1;
    }
  }

  return buildPeopleInsightsFromCounts({
    activeCount: activePersonIds.size,
    missingContactCount: activePersonIds.size - usefulContactIds.size,
    missingEvidenceCount,
    missingRoleCount: [...activePersonIds].filter(
      (personId) => !rolesByPerson.has(personId),
    ).length,
    owners: {
      count: owners.size,
      readyCount: countReady(owners, (personId) =>
        Boolean(
          usefulContactIds.has(personId) &&
            ownersByPerson
              .get(personId)
              ?.some((owner) => !owner.archivedAt && !owner.endedOn),
        ),
      ),
    },
    staff: {
      count: staff.size,
      readyCount: countReady(staff, (personId) =>
        usefulContactIds.has(personId),
      ),
    },
    tenants: {
      count: tenants.size,
      readyCount: countReady(tenants, (personId) =>
        Boolean(
          usefulContactIds.has(personId) &&
            leasePartiesByPerson.get(personId)?.some((party) => {
              const lease = leasesById.get(party.leaseId);

              return (
                !party.archivedAt &&
                !party.endedOn &&
                lease !== undefined &&
                !lease.archivedAt &&
                !excludedActiveLeaseStatuses.has(lease.status.toLowerCase())
              );
            }),
        ),
      ),
    },
    totalCount: activePersonIds.size,
    vendors: {
      count: vendors.size,
      readyCount: countReady(
        vendors,
        (personId) =>
          usefulContactIds.has(personId) && vendorProfileIds.has(personId),
      ),
    },
    visibleCount: activePersonIds.size,
  });
}

type InsightFilter =
  | { column: string; kind: "eq"; value: string }
  | { column: string; kind: "is-null" };

async function getPagedInsightRows({
  columns,
  filters = [],
  organizationId,
  supabase,
  table,
}: {
  columns: string;
  filters?: InsightFilter[];
  organizationId: string;
  supabase: SupabaseServerClient;
  table: InsightTable;
}) {
  const rows: UnknownRecord[] = [];
  let cursor: string | null = null;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .eq("organization_id", organizationId);

    for (const filter of filters) {
      query =
        filter.kind === "eq"
          ? query.eq(filter.column, filter.value)
          : query.is(filter.column, null);
    }

    if (cursor) {
      query = query.gt("id", cursor);
    }

    const result = (await query
      .order("id", { ascending: true })
      .limit(INSIGHT_PAGE_SIZE)) as InsightQueryResult;

    if (result.error) {
      throw new Error(
        `Could not load people insights from ${table}: ${result.error.message}`,
      );
    }

    const page = asRows(result.data);
    rows.push(...page);

    if (page.length < INSIGHT_PAGE_SIZE) {
      return rows;
    }

    const nextCursor = readString(page.at(-1), "id");

    if (!nextCursor || nextCursor === cursor) {
      throw new Error(`Could not continue people insights from ${table}.`);
    }

    cursor = nextCursor;
  }
}

function getPeopleWithRole(
  rolesByPerson: Map<string, Set<PersonRoleValue>>,
  role: PersonRoleValue,
) {
  return new Set(
    [...rolesByPerson.entries()].flatMap(([personId, roles]) =>
      roles.has(role) ? [personId] : [],
    ),
  );
}

function countReady(ids: ReadonlySet<string>, isReady: (id: string) => boolean) {
  let count = 0;

  for (const id of ids) {
    if (isReady(id)) {
      count += 1;
    }
  }

  return count;
}

function hasLinkedEvidence({
  documentLeaseIds,
  documentPropertyIds,
  documentUnitIds,
  leaseParties,
  leasesById,
  owners,
}: {
  documentLeaseIds: ReadonlySet<string>;
  documentPropertyIds: ReadonlySet<string>;
  documentUnitIds: ReadonlySet<string>;
  leaseParties: LeasePartyContext[];
  leasesById: ReadonlyMap<string, LeaseContext>;
  owners: OwnerContext[];
}) {
  for (const party of leaseParties) {
    if (documentLeaseIds.has(party.leaseId)) {
      return true;
    }

    const lease = leasesById.get(party.leaseId);

    if (
      lease &&
      (documentPropertyIds.has(lease.propertyId) ||
        (lease.unitId ? documentUnitIds.has(lease.unitId) : false))
    ) {
      return true;
    }
  }

  return owners.some((owner) => documentPropertyIds.has(owner.propertyId));
}

function addOptionalString(
  values: Set<string>,
  row: UnknownRecord,
  key: string,
) {
  const value = readNullableString(row, key);

  if (value) {
    values.add(value);
  }
}

function readRole(value: unknown): PersonRoleValue | null {
  return value === "tenant" ||
    value === "owner" ||
    value === "vendor" ||
    value === "staff"
    ? value
    : null;
}

function hasUsefulValue(value: string | null) {
  return Boolean(value?.trim());
}

function asRows(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is UnknownRecord =>
          typeof row === "object" && row !== null,
      )
    : [];
}

function readString(row: UnknownRecord | undefined, key: string) {
  const value = row?.[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullableString(row: UnknownRecord, key: string) {
  return readString(row, key);
}
