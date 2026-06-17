import {
  buildPropertySummary,
  type PropertyLedgerRecord,
  type PropertyRecord,
} from "@/features/properties/data/property-summary";
import {
  formatMoney,
  formatMoneyDisplay,
  type CurrencyCode,
  type CurrencyDisplaySettings,
  type MoneyDisplayValue,
} from "@/lib/money/format";

export type PropertyDetailUnitRecord = {
  archived_at: string | null;
  current_rent_amount: number | null;
  current_rent_currency: CurrencyCode | null;
  floor: string | null;
  id: string;
  status: string;
  unit_number: string;
};

export type PropertyDetailUnit = {
  archivedAt: string | null;
  currentRent: string;
  currentRentDisplay?: MoneyDisplayValue;
  floor: string;
  id: string;
  isArchived: boolean;
  status: string;
  unitNumber: string;
};

export type PropertyDetail = ReturnType<typeof buildPropertySummary> & {
  activeUnitCount: number;
  archivedUnitCount: number;
  totalUnitCount: number;
  unitSummary: string;
  unitsList: PropertyDetailUnit[];
};

export function buildPropertyDetail({
  currencySettings,
  ledgerEntries,
  property,
  units,
}: {
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  ledgerEntries: PropertyLedgerRecord[];
  property: PropertyRecord;
  units: PropertyDetailUnitRecord[];
}): PropertyDetail {
  const activeUnits = units.filter((unit) => !unit.archived_at);
  const summary = buildPropertySummary({
    currencySettings,
    ledgerEntries,
    property,
    units: activeUnits,
  });

  return {
    ...summary,
    activeUnitCount: activeUnits.length,
    archivedUnitCount: units.length - activeUnits.length,
    totalUnitCount: units.length,
    unitSummary: formatUnitSummary({
      activeUnitCount: activeUnits.length,
      archivedUnitCount: units.length - activeUnits.length,
      occupiedUnitCount: summary.occupiedUnits,
    }),
    unitsList: units.map((unit) => formatUnit(unit, currencySettings)),
  };
}

function formatUnit(
  unit: PropertyDetailUnitRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): PropertyDetailUnit {
  return {
    archivedAt: unit.archived_at,
    currentRent: formatCurrentRent(unit),
    currentRentDisplay: formatCurrentRentDisplay(unit, currencySettings),
    floor: unit.floor?.trim() || "Not set",
    id: unit.id,
    isArchived: Boolean(unit.archived_at),
    status: formatStatusLabel(unit.status),
    unitNumber: unit.unit_number,
  };
}

function formatCurrentRent(unit: PropertyDetailUnitRecord) {
  if (unit.current_rent_amount === null || !unit.current_rent_currency) {
    return "No rent set";
  }

  return formatMoney(Number(unit.current_rent_amount), unit.current_rent_currency);
}

function formatCurrentRentDisplay(
  unit: PropertyDetailUnitRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  if (unit.current_rent_amount === null || !unit.current_rent_currency) {
    return undefined;
  }

  return formatMoneyDisplay(
    Number(unit.current_rent_amount),
    unit.current_rent_currency,
    currencySettings,
  );
}

function formatUnitSummary({
  activeUnitCount,
  archivedUnitCount,
  occupiedUnitCount,
}: {
  activeUnitCount: number;
  archivedUnitCount: number;
  occupiedUnitCount: number;
}) {
  if (activeUnitCount === 0 && archivedUnitCount === 0) {
    return "Property-only";
  }

  const activeSummary =
    activeUnitCount === 0
      ? "No active units"
      : `${occupiedUnitCount}/${activeUnitCount} occupied`;

  if (archivedUnitCount === 0) {
    return activeSummary;
  }

  return `${activeSummary}, ${archivedUnitCount} archived`;
}

function formatStatusLabel(status: string) {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
