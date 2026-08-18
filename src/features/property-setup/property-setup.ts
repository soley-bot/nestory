import type {
  PropertySetupData,
  PropertySetupSelection,
  PropertySetupStep,
} from "@/features/property-setup/property-setup.types";


export function findOpenLeaseForUnit(
  leases: PropertySetupData["leases"],
  selection: PropertySetupSelection,
) {
  if (!selection.propertyId || !selection.unitId) return undefined;

  return leases.find(
    (lease) =>
      lease.propertyId === selection.propertyId &&
      lease.unitId === selection.unitId,
  );
}

export function getSelectableSetupTenants(
  leases: PropertySetupData["leases"],
  tenants: PropertySetupData["tenants"],
  selection: PropertySetupSelection,
) {
  return tenants.filter((tenant) =>
    leases.every(
      (lease) =>
        lease.tenantPersonId !== tenant.id ||
        (lease.propertyId === selection.propertyId &&
          lease.unitId === selection.unitId),
    ),
  );
}

export function getSetupUnitStatusLabel(
  unitId: string,
  fallback: string,
  leases: PropertySetupData["leases"],
) {
  return leases.some((lease) => lease.unitId === unitId) ? "open lease" : fallback;
}

/** A `single_space` property is leased whole, with `leases.unit_id` null. */
export function propertySetupRequiresUnit(
  properties: PropertySetupData["properties"],
  selection: PropertySetupSelection,
) {
  if (!selection.propertyId) return true;

  const property = properties.find(
    (candidate) => candidate.id === selection.propertyId,
  );

  return property?.rentalStructure !== "single_space";
}

export function shouldLoadPropertySetupReadiness(
  selection: PropertySetupSelection,
): boolean {
  return Boolean(selection.propertyId && selection.leaseId);
}

export function getHighestPropertySetupStep(
  selection: PropertySetupSelection,
  {
    ready = false,
    requiresUnit = true,
  }: { ready?: boolean; requiresUnit?: boolean } = {},
): PropertySetupStep {
  if (!selection.ownerId) return 1;
  if (!selection.propertyId) return 2;
  if (requiresUnit && !selection.unitId) return 2;
  if (!selection.leaseId) return 3;
  return ready ? 5 : 4;
}

export function normalizePropertySetupStep(
  requestedStep: number,
  selection: PropertySetupSelection,
  options: { ready?: boolean; requiresUnit?: boolean } = {},
) {
  const safeStep = Math.max(1, Math.min(5, requestedStep)) as PropertySetupStep;
  return Math.min(
    safeStep,
    getHighestPropertySetupStep(selection, options),
  ) as PropertySetupStep;
}

export function buildPropertySetupQuery({
  selection,
  step,
}: {
  selection: PropertySetupSelection;
  step: PropertySetupStep;
}) {
  const params = new URLSearchParams({ step: String(step) });
  for (const [key, value] of Object.entries(selection)) {
    if (value) params.set(key, value);
  }
  return params;
}

export function clearPropertySetupSelectionAfter(
  selection: PropertySetupSelection,
  field: keyof PropertySetupSelection,
  value: string | null,
): PropertySetupSelection {
  const next = { ...selection, [field]: value };
  const order: Array<keyof PropertySetupSelection> = [
    "ownerId",
    "propertyId",
    "unitId",
    "tenantId",
    "leaseId",
  ];
  const changedIndex = order.indexOf(field);
  for (const downstream of order.slice(changedIndex + 1)) {
    next[downstream] = null;
  }
  return next;
}
