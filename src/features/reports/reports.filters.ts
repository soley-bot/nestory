import type {
  ReportKind,
  ReportStatusFilter,
  ReportsViewQuery,
} from "@/features/reports/reports.types";
import {
  getFirstSearchParam,
  getUuidOrAllSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";
import { getBusinessMonthValue } from "@/lib/dates/business-date";

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const datePattern = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/;

type ReportSearchParams = Record<string, SearchParamValue>;

export const DEFAULT_REPORT_KIND: ReportKind = "rent-roll";
export const DEFAULT_REPORT_STATUS: ReportStatusFilter = "all";

export const OWNER_STATEMENT_UNIT_SCOPE_MESSAGE =
  "Owner Statements are property-level reports. Clear the unit filter to continue.";

export function parseReportSearchParams(
  params: ReportSearchParams,
): ReportsViewQuery {
  return {
    month: parseMonth(params.month, params.date),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    report: parseReportKind(params.report),
    status: parseStatus(params.status),
    unitId: getUuidOrAllSearchParam(params.unitId),
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

export function getReportScopeValidation(viewQuery: ReportsViewQuery) {
  return viewQuery.report === "owner-statement" && viewQuery.unitId !== "all"
    ? {
        code: "owner_statement_unit_scope" as const,
        message: OWNER_STATEMENT_UNIT_SCOPE_MESSAGE,
        status: 400 as const,
      }
    : null;
}

function parseReportKind(value: string | string[] | undefined): ReportKind {
  const candidate = getFirstSearchParam(value);

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
  const candidate = getFirstSearchParam(value);

  return candidate === "all" ||
    candidate === "occupied" ||
    candidate === "vacant" ||
    candidate === "reserved" ||
    candidate === "maintenance" ||
    candidate === "inactive"
    ? candidate
    : DEFAULT_REPORT_STATUS;
}

function parseMonth(
  monthValue: string | string[] | undefined,
  dateValue: string | string[] | undefined,
) {
  const month = getFirstSearchParam(monthValue);

  if (month && monthPattern.test(month)) {
    return month;
  }

  const date = getFirstSearchParam(dateValue);

  if (date && datePattern.test(date)) {
    return date.slice(0, 7);
  }

  return getCurrentMonthValue();
}

function getCurrentMonthValue() {
  return getBusinessMonthValue();
}
