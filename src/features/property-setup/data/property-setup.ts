import { getPersonSelectPage } from "@/features/people/data/person-options";
import type {
  PropertySetupData,
  PropertySetupLeaseOption,
  PropertySetupPropertyOption,
  PropertySetupSelection,
  PropertySetupUnitOption,
} from "@/features/property-setup/property-setup.types";
import { normalizePropertyRentalStructure } from "@/features/properties/property-rental-structure";
import { shouldLoadPropertySetupReadiness } from "@/features/property-setup/property-setup";
import { createSupabaseServerClient } from "@/lib/db/server";
import { readAllRows, readAllRowsByIds } from "@/lib/db/read-all-rows";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";
import { getBusinessDateValue } from "@/lib/dates/business-date";

type PropertyRow = {
  code: string;
  id: string;
  name: string;
  rental_structure: string | null;
};
type OwnerLinkRow = {
  person_id: string;
  property_id: string;
};
type UnitRow = {
  id: string;
  property_id: string;
  status: string;
  unit_number: string;
};
type LeaseRow = {
  id: string;
  lease_end_date: string;
  lease_start_date: string;
  monthly_rent_amount: number;
  primary_tenant_person_id: string;
  property_id: string;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

export async function getPropertySetupData({
  organizationId,
  operationalTimezone,
  requestedSelection,
}: {
  organizationId: string;
  operationalTimezone?: string;
  requestedSelection: PropertySetupSelection;
}): Promise<PropertySetupData> {
  const supabase = await createSupabaseServerClient();
  const [ownerPage, tenantPage] = await Promise.all([
    getPersonSelectPage({ organizationId, roles: ["owner"], selectedId: requestedSelection.ownerId ?? undefined }),
    getPersonSelectPage({ organizationId, roles: ["tenant"], selectedId: requestedSelection.tenantId ?? undefined }),
  ]);
  const owners = [...new Map([...ownerPage.options, ...(ownerPage.selectedOption && !ownerPage.selectedOption.archived ? [ownerPage.selectedOption] : [])].map(person => [person.id,person])).values()];
  const tenants = [...new Map([...tenantPage.options, ...(tenantPage.selectedOption && !tenantPage.selectedOption.archived ? [tenantPage.selectedOption] : [])].map(person => [person.id,person])).values()];
  const ownerId = owners.find(owner => owner.id === requestedSelection.ownerId)?.id;
  const ownerLinksResult = ownerId ? await readAllRows((from,to) => supabase
    .from("property_owners")
    .select("property_id, person_id")
    .eq("organization_id", organizationId).eq("person_id",ownerId)
    .eq("is_primary", true).is("archived_at", null).is("ended_on", null)
    .order("property_id").order("id").range(from,to)) : { data: [],error: null };
  if (ownerLinksResult.error) throw new Error(`Could not load setup property owner links: ${ownerLinksResult.error.message}`);

  const propertiesResult = await readAllRowsByIds((ownerLinksResult.data ?? []).map(link => link.property_id), (ids,from,to) => supabase
    .from("properties").select("id, code, name, rental_structure")
    .eq("organization_id",organizationId).in("id",ids).is("archived_at",null)
    .in("status",["active","under_renovation"]).order("code").order("id").range(from,to));
  if (propertiesResult.error) throw new Error(`Could not load setup properties: ${propertiesResult.error.message}`);
  const propertyRows = ((propertiesResult.data ?? []) as PropertyRow[]).toSorted((first,second) => first.code.localeCompare(second.code) || first.id.localeCompare(second.id));
  const selectedProperty = propertyRows.find(property => property.id === requestedSelection.propertyId);
  const legacyPropertyIds = propertyRows.filter(property => property.id !== selectedProperty?.id && !["single_space","multi_unit"].includes(property.rental_structure ?? "")).map(property => property.id);
  const [unitsResult, legacyUnitsResult, leasesResult] = await Promise.all([
    selectedProperty ? readAllRows((from,to) => supabase
      .from("units").select("id, property_id, unit_number, status")
      .eq("organization_id",organizationId).eq("property_id",selectedProperty.id)
      .is("archived_at",null).neq("status","inactive")
      .order("unit_number").order("id").range(from,to)) : { data: [],error: null },
    readAllRowsByIds(legacyPropertyIds,(ids,from,to) => supabase
      .from("units").select("id, property_id")
      .eq("organization_id",organizationId).in("property_id",ids)
      .is("archived_at",null).neq("status","inactive")
      .order("property_id").order("id").range(from,to)),
    // Tenant choices exclude leases anywhere in the authorized portfolio, not
    // only this property. Preserve that eligibility until a tenant is chosen.
    selectedProperty ? readAllRows((from,to) => supabase
      .from("current_leases")
      .select("id, property_id, unit_id, primary_tenant_person_id, tenant_name, lease_start_date, lease_end_date, monthly_rent_amount, status")
      .eq("organization_id",organizationId).is("archived_at",null)
      .in("status",["active","draft","notice_given"])
      .order("lease_start_date",{ ascending: false }).order("id").range(from,to)) : { data: [],error: null },
  ]);

  for (const [label, result] of [
    ["units", unitsResult],
    ["property unit counts", legacyUnitsResult],
    ["leases", leasesResult],
  ] as const) {
    if (result.error) {
      throw new Error(`Could not load setup ${label}: ${result.error.message}`);
    }
  }

  const unitCounts = new Map<string,number>();
  for (const unit of [...(unitsResult.data ?? []),...(legacyUnitsResult.data ?? [])]) {
    unitCounts.set(unit.property_id,(unitCounts.get(unit.property_id) ?? 0)+1);
  }
  const properties = toPropertyOptions(
    propertyRows,
    (ownerLinksResult.data ?? []) as OwnerLinkRow[],
    unitCounts,
  );
  const propertiesById = new Map(
    propertyRows.map((property) => [property.id, property]),
  );
  const units = toUnitOptions((unitsResult.data ?? []) as UnitRow[], propertiesById);
  const leases = toLeaseOptions((leasesResult.data ?? []) as LeaseRow[]);
  const selection = validateSelection({
    leases,
    owners,
    properties,
    requestedSelection,
    tenants,
    units,
  });
  let readiness: PropertySetupData["readiness"] = null;
  if (shouldLoadPropertySetupReadiness(selection)) {
    const readinessResult = await supabase.rpc("get_ips_setup_readiness", {
      p_effective_date: getBusinessDateValue(new Date(), operationalTimezone),
      p_lease_id: selection.leaseId!,
      p_organization_id: organizationId,
      p_property_id: selection.propertyId!,
      p_unit_id: selection.unitId!,
    });
    if (readinessResult.error) {
      throw new Error(
        `Could not load setup readiness: ${readinessResult.error.message}`,
      );
    }
    readiness = normalizeRentalSetupReadiness(
      readinessResult.data as PropertySetupData["readiness"],
    );
  }

  return { leases, owners, properties, readiness, selection, tenants, units };
}

export function normalizeRentalSetupReadiness(
  readiness: PropertySetupData["readiness"],
): PropertySetupData["readiness"] {
  if (!readiness) return readiness;

  const items = readiness.items
    .filter((item) => !["opening_balance", "deposit"].includes(item.code))
    .map((item) =>
      item.code === "owner_roster"
        ? { ...item, label: "Property owner" }
        : item,
    );

  return {
    ...readiness,
    items,
    ready: items.every((item) => item.ready),
  };
}

export function validateSelection({
  leases,
  owners,
  properties,
  requestedSelection,
  tenants,
  units,
}: Omit<PropertySetupData, "selection"> & {
  requestedSelection: PropertySetupSelection;
}): PropertySetupSelection {
  const ownerId = owners.some((owner) => owner.id === requestedSelection.ownerId)
    ? requestedSelection.ownerId
    : null;
  const propertyId = properties.some(
    (property) =>
      property.id === requestedSelection.propertyId &&
      property.ownerPersonId === ownerId,
  )
    ? requestedSelection.propertyId
    : null;
  const unitId = units.some(
    (unit) =>
      unit.id === requestedSelection.unitId && unit.propertyId === propertyId,
  )
    ? requestedSelection.unitId
    : null;
  const tenantId = tenants.some(
    (tenant) => tenant.id === requestedSelection.tenantId,
  )
    ? requestedSelection.tenantId
    : null;
  const leaseId = leases.some(
    (lease) =>
      lease.id === requestedSelection.leaseId &&
      lease.propertyId === propertyId &&
      lease.unitId === unitId &&
      lease.tenantPersonId === tenantId,
  )
    ? requestedSelection.leaseId
    : null;

  return { leaseId, ownerId, propertyId, tenantId, unitId };
}

function toPropertyOptions(
  properties: PropertyRow[],
  ownerLinks: OwnerLinkRow[],
  unitCounts: ReadonlyMap<string,number>,
): PropertySetupPropertyOption[] {
  const primaryOwnerByProperty = new Map(
    ownerLinks.map((link) => [link.property_id, link.person_id]),
  );
  return properties.flatMap((property) => {
    const ownerPersonId = primaryOwnerByProperty.get(property.id);
    return ownerPersonId
      ? [
          {
            id: property.id,
            label: formatPropertyOptionLabel(property),
            ownerPersonId,
            rentalStructure: normalizePropertyRentalStructure(
              property.rental_structure,
              unitCounts.get(property.id) ?? 0,
            ),
          },
        ]
      : [];
  });
}

function toUnitOptions(
  units: UnitRow[],
  propertiesById: Map<string, PropertyRow>,
): PropertySetupUnitOption[] {
  return units.map((unit) => ({
    id: unit.id,
    label: formatUnitOptionLabel({
      propertyCode: propertiesById.get(unit.property_id)?.code,
      unitNumber: unit.unit_number,
    }),
    propertyId: unit.property_id,
    statusLabel: unit.status.replace(/_/g, " "),
  }));
}

function toLeaseOptions(leases: LeaseRow[]): PropertySetupLeaseOption[] {
  return leases.map((lease) => ({
    endDate: lease.lease_end_date,
    id: lease.id,
    label: `${lease.tenant_name} · ${lease.lease_start_date} to ${lease.lease_end_date}`,
    monthlyRentAmount: lease.monthly_rent_amount,
    propertyId: lease.property_id,
    startDate: lease.lease_start_date,
    status: lease.status,
    tenantPersonId: lease.primary_tenant_person_id,
    unitId: lease.unit_id,
  }));
}
