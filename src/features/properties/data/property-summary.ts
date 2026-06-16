import { formatMoneyTotals } from "@/lib/money/totals";

export type PropertyRecord = {
  address: string | null;
  code: string;
  id: string;
  name: string;
  owner: string | null;
  property_type: string;
  status: string;
};

export type PropertyUnitRecord = {
  status: string;
};

export type PropertyLedgerRecord = {
  amount: number | null;
  currency: "USD" | "KHR" | null;
  direction: string | null;
};

export type PropertySummary = {
  id: string;
  name: string;
  code: string;
  type: string;
  owner: string;
  address: string;
  status: string;
  units: number;
  occupiedUnits: number;
  netIncome: string;
};

export function buildPropertySummary({
  ledgerEntries,
  property,
  units,
}: {
  ledgerEntries: PropertyLedgerRecord[];
  property: PropertyRecord;
  units: PropertyUnitRecord[];
}): PropertySummary {
  return {
    id: property.id,
    name: property.name,
    code: property.code,
    type: property.property_type,
    owner: property.owner ?? "Unassigned",
    address: property.address ?? "No address recorded",
    status: formatPropertyStatus(property.status),
    units: units.length,
    occupiedUnits: units.filter((unit) => unit.status === "occupied").length,
    netIncome: formatMoneyTotals(ledgerEntries),
  };
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

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
