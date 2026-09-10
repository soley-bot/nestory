import type {
  PeopleReadinessArchiveState,
  PeopleReadinessView,
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
import { isReportKind } from "@/features/reports/report-catalog";

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const datePattern = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/;

type ReportSearchParams = Record<string, SearchParamValue>;

export const DEFAULT_REPORT_KIND: ReportKind = "monthly-owner-activity";
export const DEFAULT_REPORT_STATUS: ReportStatusFilter = "all";

export function parseReportSearchParams(
  params: ReportSearchParams,
): ReportsViewQuery {
  const ownerPersonIdParam = getFirstSearchParam(params.ownerPersonId);
  const ownerPersonId = getUuidOrAllSearchParam(params.ownerPersonId);

  return {
    ...(["propertyId", "unitId"].some((key) => {
      const raw = getFirstSearchParam(params[key]);
      return raw && raw !== "all" && getUuidOrAllSearchParam(params[key]) === "all";
    }) ? { scopeInvalid: true } : {}),
    dateFrom: getFirstSearchParam(params.dateFrom) ?? "",
    dateTo: getFirstSearchParam(params.dateTo) ?? "",
    query: (getFirstSearchParam(params.query) ?? "").trim().slice(0, 200),
    transactionType: getFirstSearchParam(params.transactionType) ?? "all",
    transactionStatus: getFirstSearchParam(params.transactionStatus) ?? "all",
    payeeId: getFirstSearchParam(params.payeeId) ?? "all",
    groupBy: ["property", "unit", "type", "payee", "status"].includes(getFirstSearchParam(params.groupBy) ?? "") ? getFirstSearchParam(params.groupBy) : "none",
    columns: (getFirstSearchParam(params.columns) ?? "").split(",").filter((key) => /^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)).slice(0, 30).join(","),
    month: parseMonth(params.month, params.date),
    ownerPersonId,
    ...(ownerPersonIdParam &&
    ownerPersonIdParam !== "all" &&
    ownerPersonId === "all"
      ? { ownerPersonIdInvalid: true }
      : {}),
    ...(getFirstSearchParam(params.print) === "1" ? { print: true } : {}),
    peopleArchiveState: parsePeopleArchiveState(params.archiveState),
    peopleView: parsePeopleView(params.peopleView),
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

function parseReportKind(value: string | string[] | undefined): ReportKind {
  const candidate = getFirstSearchParam(value);

  return candidate && isReportKind(candidate) ? candidate : DEFAULT_REPORT_KIND;
}

export function isExtendedReport(kind: ReportKind) {
  return ["transactions", "management-fees", "rent-roll", "rent-collections"].includes(kind);
}

export function getReportDateRange(query: ReportsViewQuery) {
  const month = getReportMonthRange(query.month);
  const start = query.dateFrom || month.start;
  const end = query.dateTo || month.end;
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(start) || !validDate(end) || start > end) {
    throw new Error("Choose a valid date range with the start before the end.");
  }
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 >= 366) {
    throw new Error("Choose a date range of 366 days or less.");
  }
  return { start, end };
}

export function buildReportQueryParams(query: ReportsViewQuery) {
  const params = new URLSearchParams({ report: query.report, month: query.month });
  for (const key of ["propertyId", "unitId", "ownerPersonId"] as const) {
    if (query[key] && query[key] !== "all") params.set(key, query[key]);
  }
  if (isExtendedReport(query.report)) {
    if (["rent-roll", "rent-collections"].includes(query.report) && query.status !== "all") params.set("status", query.status);
    for (const key of ["dateFrom", "dateTo", "query", "transactionType", "transactionStatus", "payeeId", "groupBy", "columns"] as const) {
      const value = query[key];
      if (value && value !== "all" && value !== "none") params.set(key, value);
    }
  }
  return params;
}

function parsePeopleArchiveState(
  value: string | string[] | undefined,
): PeopleReadinessArchiveState {
  const candidate = getFirstSearchParam(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parsePeopleView(
  value: string | string[] | undefined,
): PeopleReadinessView {
  const candidate = getFirstSearchParam(value);

  return candidate === "tenant" ||
    candidate === "owner" ||
    candidate === "vendor" ||
    candidate === "staff"
    ? candidate
    : "relationship";
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
