import type {
  ReportKind,
  ReportStatusFilter,
  ReportsViewQuery,
} from "@/features/reports/reports.types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const datePattern = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/;

type ReportSearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_REPORT_KIND: ReportKind = "rent-roll";
export const DEFAULT_REPORT_STATUS: ReportStatusFilter = "all";

export function parseReportSearchParams(
  params: ReportSearchParams,
): ReportsViewQuery {
  return {
    month: parseMonth(params.month, params.date),
    propertyId: parseUuidFilter(params.propertyId),
    report: parseReportKind(params.report),
    status: parseStatus(params.status),
  };
}

export function getReportMonthRange(month: string) {
  const safeMonth = monthPattern.test(month) ? month : getCurrentMonthValue();
  const [year, monthNumber] = safeMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    end: `${safeMonth}-${String(lastDay).padStart(2, "0")}`,
    start: `${safeMonth}-01`,
  };
}

function parseReportKind(value: string | string[] | undefined): ReportKind {
  const candidate = getFirstValue(value);

  if (candidate === "profit-loss") {
    return "income-expense";
  }

  if (candidate === "occupancy") {
    return "vacancy-risk";
  }

  return candidate === "unit-performance" ||
    candidate === "property-performance" ||
    candidate === "owner-statement" ||
    candidate === "income-expense" ||
    candidate === "lease-expiry" ||
    candidate === "vacancy-risk" ||
    candidate === "maintenance-cost" ||
    candidate === "missing-data"
    ? candidate
    : DEFAULT_REPORT_KIND;
}

function parseStatus(value: string | string[] | undefined): ReportStatusFilter {
  const candidate = getFirstValue(value);

  return candidate === "all" ||
    candidate === "occupied" ||
    candidate === "vacant" ||
    candidate === "reserved" ||
    candidate === "maintenance" ||
    candidate === "inactive"
    ? candidate
    : DEFAULT_REPORT_STATUS;
}

function parseUuidFilter(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && uuidPattern.test(candidate) ? candidate : "all";
}

function parseMonth(
  monthValue: string | string[] | undefined,
  dateValue: string | string[] | undefined,
) {
  const month = getFirstValue(monthValue);

  if (month && monthPattern.test(month)) {
    return month;
  }

  const date = getFirstValue(dateValue);

  if (date && datePattern.test(date)) {
    return date.slice(0, 7);
  }

  return getCurrentMonthValue();
}

function getCurrentMonthValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getFirstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
