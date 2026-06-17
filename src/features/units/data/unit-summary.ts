import type { TimelineEventType } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import {
  convertMoney,
  formatMoney,
  formatMoneyDisplay,
  normalizeCurrencyDisplaySettings,
  type CurrencyCode,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";
import { formatMoneyTotals, formatMoneyTotalsDisplay } from "@/lib/money/totals";
import type {
  UnitBadgeTone,
  UnitDetail,
  UnitLedgerContext,
  UnitLeaseSummary,
  UnitRecordCounts,
  UnitStatusValue,
  UnitSummary,
  UnitTimelineContext,
} from "@/features/units/unit.types";

export type UnitRecord = {
  archived_at: string | null;
  current_rent_amount: number | null;
  current_rent_currency: CurrencyCode | null;
  floor: string | null;
  id: string;
  property_id: string;
  size_sqm: number | null;
  status: string;
  unit_number: string;
};

export type UnitPropertyRecord = {
  code: string;
  id: string;
  name: string;
};

export type UnitLeaseRecord = {
  id: string;
  lease_end_date: string;
  lease_start_date: string;
  monthly_rent_amount: number;
  monthly_rent_currency: CurrencyCode;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

export type UnitLedgerRecord = {
  amount: number | null;
  currency: CurrencyCode | null;
  direction: string | null;
  unit_id: string | null;
};

export type RecentUnitLedgerRecord = UnitLedgerRecord & {
  category: string;
  description: string | null;
  id: string;
  transaction_date: string;
};

export type UnitTimelineRecord = {
  event_date: string;
  event_type: TimelineEventType;
  id: string;
  title: string;
  unit_id: string | null;
};

const inactiveLeaseStatuses = new Set([
  "cancelled",
  "ended",
  "expired",
  "terminated",
]);

export function buildUnitSummary({
  activeLease,
  currencySettings,
  latestTimelineEvent,
  ledgerEntries,
  property,
  unit,
}: {
  activeLease?: UnitLeaseRecord;
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  latestTimelineEvent?: UnitTimelineRecord;
  ledgerEntries: UnitLedgerRecord[];
  property?: UnitPropertyRecord;
  unit: UnitRecord;
}): UnitSummary {
  const statusValue = normalizeUnitStatus(unit.status);

  return {
    formValues: {
      currentRentAmount: unit.current_rent_amount,
      currentRentCurrency: unit.current_rent_currency,
      floor: unit.floor,
      propertyId: unit.property_id,
      sizeSqm: unit.size_sqm,
      status: normalizeFormValue(unit.status),
      unitNumber: unit.unit_number,
    },
    floorLabel: unit.floor ?? "Not set",
    id: unit.id,
    isArchived: Boolean(unit.archived_at),
    ledgerNetUsd: calculateLedgerNetUsd(ledgerEntries, currencySettings),
    ledgerNetDisplay: formatMoneyTotalsDisplay(ledgerEntries, currencySettings),
    ledgerNetLabel: formatMoneyTotals(ledgerEntries),
    latestTimelineEvent: latestTimelineEvent
      ? toTimelineContext(latestTimelineEvent)
      : undefined,
    leaseLabel: activeLease
      ? `${activeLease.tenant_name} / ${formatLeaseStatus(activeLease.status)}`
      : "No active lease",
    propertyCode: property?.code ?? "Unknown",
    propertyId: unit.property_id,
    propertyName: property?.name ?? "Unknown property",
    rentUsd: calculateRentUsd(unit, activeLease, currencySettings),
    rentDisplay: formatUnitRentDisplay(unit, activeLease, currencySettings),
    rentLabel: formatUnitRent(unit, activeLease),
    statusValue,
    statusLabel: formatUnitStatus(unit.status),
    statusTone: getUnitStatusTone(unit.status),
    unitNumber: unit.unit_number,
  };
}

export function buildUnitDetail({
  activeLease,
  counts,
  currencySettings,
  ledgerEntries,
  property,
  recentLedgerEntries,
  recentTimelineEvents,
  unit,
}: {
  activeLease?: UnitLeaseRecord;
  counts: UnitRecordCounts;
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  ledgerEntries: UnitLedgerRecord[];
  property?: UnitPropertyRecord;
  recentLedgerEntries: RecentUnitLedgerRecord[];
  recentTimelineEvents: UnitTimelineRecord[];
  unit: UnitRecord;
}): UnitDetail {
  return {
    ...buildUnitSummary({
      activeLease,
      currencySettings,
      latestTimelineEvent: recentTimelineEvents[0],
      ledgerEntries,
      property,
      unit,
    }),
    activeLease: activeLease
      ? toLeaseSummary(activeLease, currencySettings)
      : undefined,
    counts,
    recentLedgerEntries: recentLedgerEntries.map((entry) =>
      toLedgerContext(entry, currencySettings),
    ),
    recentTimelineEvents: recentTimelineEvents.map(toTimelineContext),
    sizeLabel:
      unit.size_sqm === null
        ? "No size recorded"
        : `${formatNumber(unit.size_sqm)} sqm`,
  };
}

export function selectCurrentLease(rows: UnitLeaseRecord[]) {
  return rows
    .filter((lease) => !inactiveLeaseStatuses.has(normalizeStoredValue(lease.status)))
    .toSorted((first, second) =>
      second.lease_start_date.localeCompare(first.lease_start_date),
    )[0];
}

export function formatUnitStatus(status: string) {
  return formatStoredLabel(status);
}

export function formatLeaseStatus(status: string) {
  return formatStoredLabel(status);
}

export function getUnitStatusTone(status: string): UnitBadgeTone {
  const normalized = normalizeStoredValue(status);

  if (normalized === "occupied") {
    return "success";
  }

  if (normalized === "reserved" || normalized === "maintenance") {
    return "warning";
  }

  if (normalized === "archived" || normalized === "inactive") {
    return "danger";
  }

  if (normalized === "vacant") {
    return "neutral";
  }

  return "accent";
}

function toLeaseSummary(
  lease: UnitLeaseRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): UnitLeaseSummary {
  return {
    endDate: lease.lease_end_date,
    id: lease.id,
    monthlyRentDisplay: formatMoneyDisplay(
      lease.monthly_rent_amount,
      lease.monthly_rent_currency,
      currencySettings,
    ),
    monthlyRentLabel: formatMoney(
      lease.monthly_rent_amount,
      lease.monthly_rent_currency,
    ),
    startDate: lease.lease_start_date,
    statusLabel: formatLeaseStatus(lease.status),
    tenantName: lease.tenant_name,
  };
}

function toTimelineContext(event: UnitTimelineRecord): UnitTimelineContext {
  return {
    eventDate: event.event_date,
    eventType: event.event_type,
    id: event.id,
    title: event.title,
  };
}

function toLedgerContext(
  entry: RecentUnitLedgerRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): UnitLedgerContext {
  const direction = entry.direction === "expense" ? "expense" : "income";
  const amount = entry.amount ?? 0;
  const signedAmount = direction === "expense" ? -amount : amount;
  const currency = entry.currency ?? "USD";

  return {
    amount,
    amountDisplay: formatMoneyDisplay(signedAmount, currency, currencySettings),
    amountLabel: `${direction === "expense" ? "-" : ""}${formatMoney(amount, currency)}`,
    category: entry.category,
    currency,
    description: entry.description ?? "",
    direction,
    id: entry.id,
    transactionDate: entry.transaction_date,
  };
}

function formatUnitRent(unit: UnitRecord, activeLease?: UnitLeaseRecord) {
  if (unit.current_rent_amount !== null && unit.current_rent_currency) {
    return formatMoney(unit.current_rent_amount, unit.current_rent_currency);
  }

  if (activeLease) {
    return formatMoney(
      activeLease.monthly_rent_amount,
      activeLease.monthly_rent_currency,
    );
  }

  return "No rent recorded";
}

function formatUnitRentDisplay(
  unit: UnitRecord,
  activeLease?: UnitLeaseRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  if (unit.current_rent_amount !== null && unit.current_rent_currency) {
    return formatMoneyDisplay(
      unit.current_rent_amount,
      unit.current_rent_currency,
      currencySettings,
    );
  }

  if (activeLease) {
    return formatMoneyDisplay(
      activeLease.monthly_rent_amount,
      activeLease.monthly_rent_currency,
      currencySettings,
    );
  }

  return undefined;
}

function calculateRentUsd(
  unit: UnitRecord,
  activeLease?: UnitLeaseRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  if (unit.current_rent_amount !== null && unit.current_rent_currency) {
    return toUsd(unit.current_rent_amount, unit.current_rent_currency, currencySettings);
  }

  if (activeLease) {
    return toUsd(
      activeLease.monthly_rent_amount,
      activeLease.monthly_rent_currency,
      currencySettings,
    );
  }

  return 0;
}

function calculateLedgerNetUsd(
  entries: UnitLedgerRecord[],
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  return entries.reduce((total, entry) => {
    if (entry.amount === null || !entry.currency) {
      return total;
    }

    const amount = toUsd(entry.amount, entry.currency, currencySettings);
    return total + (entry.direction === "expense" ? -amount : amount);
  }, 0);
}

function toUsd(
  amount: number,
  currency: CurrencyCode,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  return convertMoney(
    amount,
    currency,
    "USD",
    normalizeCurrencyDisplaySettings(currencySettings).khrPerUsd,
  );
}

function normalizeUnitStatus(status: string): UnitStatusValue {
  const normalized = normalizeFormValue(status);

  if (
    normalized === "occupied" ||
    normalized === "reserved" ||
    normalized === "maintenance" ||
    normalized === "inactive"
  ) {
    return normalized;
  }

  return "vacant";
}

function formatStoredLabel(value: string) {
  const normalized = normalizeStoredValue(value);

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeStoredValue(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function normalizeFormValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUnitTimelineContext(event: UnitTimelineContext) {
  return `${formatDate(event.eventDate)} - ${event.eventType}`;
}
