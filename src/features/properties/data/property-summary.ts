import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";
import type {
  PropertyBadgeTone,
  PropertyFormValues,
  PropertyStatusValue,
} from "@/features/properties/property.types";

export type PropertyRecord = {
  address: string | null;
  acquisition_date?: string | null;
  archived_at?: string | null;
  code: string;
  id: string;
  name: string;
  notes?: string | null;
  owner: string | null;
  property_type: string;
  status: string;
};

export type PropertyUnitRecord = {
  status: string;
};

export type PropertyLedgerRecord = {
  amount: number | null;
  currency: CurrencyCode | null;
  direction: string | null;
};

export type PropertySummary = {
  address: string;
  code: string;
  formValues: PropertyFormValues;
  hasActiveOwnerLink: boolean;
  id: string;
  isArchived: boolean;
  name: string;
  netIncome: MoneyDisplayValue;
  netIncomeUsd: number;
  occupiedUnits: number;
  owner: string;
  status: string;
  statusTone: PropertyBadgeTone;
  type: string;
  unitSummary: string;
  units: number;
};

export type ActivePropertyOwnerLink = {
  label: string;
  personId: string;
};

export function buildPropertySummary({
  activeOwner,
  ledgerEntries,
  property,
  units,
  hasActiveOwnerLink = false,
}: {
  activeOwner?: ActivePropertyOwnerLink | null;
  hasActiveOwnerLink?: boolean;
  ledgerEntries: PropertyLedgerRecord[];
  property: PropertyRecord;
  units: PropertyUnitRecord[];
}): PropertySummary {
  const status = normalizePropertyStatus(property.status);
  const netIncomeUsd = calculateNetIncomeUsd(ledgerEntries);
  const occupiedUnits = units.filter((unit) => unit.status === "occupied").length;

  return {
    address: property.address ?? "No address recorded",
    id: property.id,
    code: property.code,
    formValues: {
      acquisitionDate: property.acquisition_date ?? "",
      address: property.address ?? "",
      code: property.code,
      name: property.name,
      notes: property.notes ?? "",
      owner: property.owner ?? "",
      ownerPersonId: activeOwner?.personId ?? "",
      propertyType: property.property_type,
      status,
    },
    hasActiveOwnerLink: hasActiveOwnerLink || Boolean(activeOwner),
    isArchived: Boolean(property.archived_at),
    name: property.name,
    netIncome: formatMoneyTotalsDisplay(ledgerEntries),
    netIncomeUsd,
    occupiedUnits,
    owner: activeOwner?.label ?? property.owner ?? "Unassigned",
    status: formatPropertyStatus(property.status),
    statusTone: getPropertyStatusTone(status),
    type: property.property_type,
    unitSummary:
      units.length === 0 ? "Property-only" : `${occupiedUnits}/${units.length} occupied`,
    units: units.length,
  };
}

export function normalizePropertyStatus(status: string): PropertyStatusValue {
  const normalized = status.trim().toLowerCase().replace(/[-\s]+/g, "_");

  if (normalized === "under_renovation" || normalized === "renovation") {
    return "under_renovation";
  }

  if (normalized === "inactive") {
    return "inactive";
  }

  return "active";
}

export function formatPropertyStatus(status: string) {
  const normalized = status.trim().toLowerCase().replace(/[_-]+/g, " ");

  if (normalized === "active") {
    return "Active";
  }

  if (normalized === "archived") {
    return "Archived";
  }

  if (normalized === "under renovation" || normalized === "renovation") {
    return "Under Renovation";
  }

  if (normalized === "inactive") {
    return "Inactive";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getPropertyStatusTone(status: PropertyStatusValue): PropertyBadgeTone {
  if (status === "active") {
    return "success";
  }

  if (status === "under_renovation") {
    return "warning";
  }

  return "neutral";
}

function calculateNetIncomeUsd(ledgerEntries: PropertyLedgerRecord[]) {
  return ledgerEntries.reduce((total, entry) => {
    if (entry.amount === null) {
      return total;
    }

    const signedAmount = entry.direction === "expense" ? -entry.amount : entry.amount;

    return total + signedAmount;
  }, 0);
}
