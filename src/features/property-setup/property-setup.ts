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

export function getHighestPropertySetupStep(
  selection: PropertySetupSelection,
): PropertySetupStep {
  if (!selection.ownerId) return 1;
  if (!selection.propertyId) return 2;
  if (!selection.unitId) return 3;
  if (!selection.leaseId) return 4;
  return 5;
}

export function normalizePropertySetupStep(
  requestedStep: number,
  selection: PropertySetupSelection,
) {
  const safeStep = Math.max(1, Math.min(5, requestedStep)) as PropertySetupStep;
  return Math.min(safeStep, getHighestPropertySetupStep(selection)) as PropertySetupStep;
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
