import { formatDate } from "@/lib/dates/format";
import {
  convertMoney,
  formatMoney,
  formatMoneyDisplay,
  normalizeCurrencyDisplaySettings,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";
import type { Database } from "@/types/database";
import type {
  LeaseBadgeTone,
  LeaseFormValues,
  LeaseStatusValue,
  LeaseSummary,
} from "@/features/leases/lease.types";

export type LeaseRow = Pick<
  Database["public"]["Tables"]["leases"]["Row"],
  | "archived_at"
  | "deposit_amount"
  | "deposit_currency"
  | "id"
  | "lease_end_date"
  | "lease_start_date"
  | "monthly_rent_amount"
  | "monthly_rent_currency"
  | "property_id"
  | "status"
  | "tenant_name"
  | "unit_id"
>;

export type LeasePropertyRow = Pick<
  Database["public"]["Tables"]["properties"]["Row"],
  "code" | "id" | "name"
>;

export type LeaseUnitRow = Pick<
  Database["public"]["Tables"]["units"]["Row"],
  "floor" | "id" | "property_id" | "status" | "unit_number"
>;

type BuildLeaseSummaryInput = {
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  lease: LeaseRow;
  property?: LeasePropertyRow;
  unit?: LeaseUnitRow;
};

export function buildLeaseSummary({
  currencySettings,
  lease,
  property,
  unit,
}: BuildLeaseSummaryInput): LeaseSummary {
  const settings = normalizeCurrencyDisplaySettings(currencySettings);
  const statusValue = normalizeLeaseStatus(lease.status);
  const statusLabel = formatLeaseStatus(statusValue);
  const propertyCode = property?.code ?? "No code";
  const propertyName = property?.name ?? "Property not found";
  const unitLabel = unit
    ? `Unit ${unit.unit_number}${unit.floor ? ` / Floor ${unit.floor}` : ""}`
    : "No unit assigned";
  const rentAmount = Number(lease.monthly_rent_amount);
  const rentCurrency = lease.monthly_rent_currency;
  const rentUsd = convertMoney(
    rentAmount,
    rentCurrency,
    "USD",
    settings.khrPerUsd,
  );
  const depositAmount =
    lease.deposit_amount === null ? null : Number(lease.deposit_amount);
  const depositCurrency = lease.deposit_currency ?? rentCurrency;
  const hasDeposit = depositAmount !== null;
  const formValues: LeaseFormValues = {
    depositAmount,
    depositCurrency: lease.deposit_currency,
    leaseEndDate: lease.lease_end_date,
    leaseStartDate: lease.lease_start_date,
    monthlyRentAmount: rentAmount,
    monthlyRentCurrency: rentCurrency,
    propertyId: lease.property_id,
    status: statusValue,
    tenantName: lease.tenant_name,
    unitId: lease.unit_id,
  };

  return {
    depositDisplay: hasDeposit
      ? formatMoneyDisplay(depositAmount, depositCurrency, settings)
      : undefined,
    depositLabel: hasDeposit
      ? formatMoney(depositAmount, depositCurrency)
      : "No deposit recorded",
    endDateLabel: formatDate(lease.lease_end_date),
    formValues,
    id: lease.id,
    isArchived: Boolean(lease.archived_at),
    leaseLabel: `${lease.tenant_name} / ${statusLabel}`,
    occupancyLabel: getOccupancyLabel(statusValue, unit),
    partySummary: lease.tenant_name,
    propertyCode,
    propertyId: lease.property_id,
    propertyName,
    rentDisplay: formatMoneyDisplay(rentAmount, rentCurrency, settings),
    rentLabel: formatMoney(rentAmount, rentCurrency),
    rentUsd,
    startDateLabel: formatDate(lease.lease_start_date),
    statusLabel,
    statusTone: getLeaseStatusTone(statusValue),
    statusValue,
    tenantName: lease.tenant_name,
    termLabel: `${formatDate(lease.lease_start_date)} - ${formatDate(
      lease.lease_end_date,
    )}`,
    unitId: lease.unit_id,
    unitLabel,
  };
}

export function normalizeLeaseStatus(value: string): LeaseStatusValue {
  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, "_");

  if (normalized === "current" || normalized === "occupied") {
    return "active";
  }

  if (normalized === "expired" || normalized === "inactive") {
    return "ended";
  }

  if (normalized === "notice") {
    return "notice_given";
  }

  if (normalized === "pending") {
    return "draft";
  }

  if (
    normalized === "active" ||
    normalized === "cancelled" ||
    normalized === "draft" ||
    normalized === "ended" ||
    normalized === "notice_given" ||
    normalized === "terminated"
  ) {
    return normalized;
  }

  return "active";
}

export function formatLeaseStatus(status: LeaseStatusValue) {
  if (status === "notice_given") {
    return "Notice";
  }

  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getLeaseStatusTone(status: LeaseStatusValue): LeaseBadgeTone {
  if (status === "active") {
    return "success";
  }

  if (status === "draft" || status === "notice_given") {
    return "warning";
  }

  if (status === "cancelled" || status === "terminated") {
    return "danger";
  }

  return "neutral";
}

function getOccupancyLabel(status: LeaseStatusValue, unit?: LeaseUnitRow) {
  if (!unit) {
    return "No unit assigned";
  }

  if (status === "active") {
    return "Occupying unit";
  }

  if (status === "notice_given") {
    return "Notice period";
  }

  if (status === "draft") {
    return "Scheduled";
  }

  return "Historical occupancy";
}
