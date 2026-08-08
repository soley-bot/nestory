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

  return candidate === "monthly-owner-activity" ||
    candidate === "unit-profit-loss"
    ? candidate
    : DEFAULT_REPORT_KIND;
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
