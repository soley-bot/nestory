import { getPersonSelectOptions } from "@/features/people/data/person-options";
import type {
  PropertySetupData,
  PropertySetupLeaseOption,
  PropertySetupPropertyOption,
  PropertySetupSelection,
  PropertySetupUnitOption,
} from "@/features/property-setup/property-setup.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";

type PropertyRow = {
  code: string;
  id: string;
  name: string;
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
  requestedSelection,
}: {
  organizationId: string;
  requestedSelection: PropertySetupSelection;
}): Promise<PropertySetupData> {
  const supabase = await createSupabaseServerClient();
  const [owners, tenants, propertiesResult, ownerLinksResult, unitsResult, leasesResult] =
    await Promise.all([
      getPersonSelectOptions({ organizationId, roles: ["owner"] }),
      getPersonSelectOptions({ organizationId, roles: ["tenant"] }),
      supabase
        .from("properties")
        .select("id, code, name")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .in("status", ["active", "under_renovation"])
        .order("code", { ascending: true }),
      supabase
        .from("property_owners")
        .select("property_id, person_id")
        .eq("organization_id", organizationId)
        .eq("is_primary", true)
        .is("archived_at", null)
        .is("ended_on", null),
      supabase
        .from("units")
        .select("id, property_id, unit_number, status")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .neq("status", "inactive")
        .order("unit_number", { ascending: true }),
      supabase
        .from("leases")
        .select(
          "id, property_id, unit_id, primary_tenant_person_id, tenant_name, lease_start_date, lease_end_date, monthly_rent_amount, status",
        )
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .in("status", ["active", "draft", "notice_given"])
        .order("lease_start_date", { ascending: false }),
    ]);

  for (const [label, result] of [
    ["properties", propertiesResult],
    ["property owner links", ownerLinksResult],
    ["units", unitsResult],
    ["leases", leasesResult],
  ] as const) {
    if (result.error) {
      throw new Error(`Could not load setup ${label}: ${result.error.message}`);
    }
  }

  const properties = toPropertyOptions(
    (propertiesResult.data ?? []) as PropertyRow[],
    (ownerLinksResult.data ?? []) as OwnerLinkRow[],
  );
  const propertiesById = new Map(
    ((propertiesResult.data ?? []) as PropertyRow[]).map((property) => [property.id, property]),
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

  return { leases, owners, properties, selection, tenants, units };
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
