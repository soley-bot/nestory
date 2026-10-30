import type { ReportPagination, ReportsViewQuery, TrustedReport, TrustedReportRow, UnitProfitLossLine, UnitProfitLossScreen } from "../reports.types";

const screenSourceLinkLimit = 5;

export function profitLossAccountKey(line: UnitProfitLossLine) {
  return JSON.stringify([line.direction, line.categoryId ?? line.categoryCode, line.currency]);
}

/** Page only after recognition, filters and exact group/report totals are complete. */
export function paginateTrustedReportForScreen(report: TrustedReport, query?: ReportsViewQuery): TrustedReport {
  // Finance-safe record rewriting may call preparation again at the route boundary.
  if (report.screenPagination) return report;
  const isProfitLoss = report.kind === "unit-profit-loss";
  const search = query?.scopeQuery?.trim().toLowerCase() ?? "";
  let totalRowCount = 0;
  let zeroActivityRowCount = 0;
  const matchingRows = report.rows.filter(row => {
    if (row.isGroup) return true;
    totalRowCount += 1;
    if (!isProfitLoss) return true;
    const active = hasFinancialActivity(row);
    if (!active) zeroActivityRowCount += 1;
    return (query?.showZeroActivity || active) && (!search || `${row.cells.property} ${row.cells.unit}`.toLowerCase().includes(search));
  });
  const totalRecords = matchingRows.reduce((count, row) => count + (row.isGroup ? 0 : 1), 0);
  const pagination = reportPagination(totalRecords, isProfitLoss ? 25 : 50, query?.page);
  const rows = paginateReportRows(matchingRows, pagination).map(row => ({
    ...row,
    sourceLinks: report.kind === "monthly-owner-activity" || ["transactions", "management-fees", "rent-roll", "rent-collections"].includes(report.kind)
      ? row.sourceLinks
      : row.sourceLinks.slice(0, screenSourceLinkLimit),
  }));
  return {
    ...report,
    rows,
    totalRowCount,
    screenPagination: pagination,
    ...(isProfitLoss ? { zeroActivityRowCount, ...paginateProfitLossDetails(report.unitProfitLossLines ?? [], query) } : {}),
  };
}

export function reportPagination(totalRecords: number, pageSize: number, requestedPage = 1): ReportPagination {
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(totalPages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  return { page, pageSize, totalRecords, totalPages };
}

/** Group headers do not consume record slots; continued pages repeat full subtotals. */
function paginateReportRows(rows: TrustedReportRow[], pagination: ReportPagination) {
  const result: TrustedReportRow[] = [];
  const start = (pagination.page - 1) * pagination.pageSize;
  const end = start + pagination.pageSize;
  let group: TrustedReportRow | undefined;
  let includedGroup: TrustedReportRow | undefined;
  let index = 0;
  for (const row of rows) {
    if (row.isGroup) { group = row; continue; }
    if (index >= end) break;
    if (index >= start) {
      if (group && group !== includedGroup) { result.push(group); includedGroup = group; }
      result.push(row);
    }
    index += 1;
  }
  return result;
}

function paginateProfitLossDetails(lines: UnitProfitLossLine[], query?: ReportsViewQuery) {
  const totals = { income: BigInt(0), expenses: BigInt(0) };
  const groups = new Map<string, UnitProfitLossScreen["groups"][number] & { lines: UnitProfitLossLine[] }>();
  const search = query?.scopeQuery?.trim().toLowerCase() ?? "";
  for (const line of lines) {
    totals[line.direction === "income" ? "income" : "expenses"] += line.amountCents;
    const key = profitLossAccountKey(line);
    const group = groups.get(key) ?? { key, label: line.category, direction: line.direction, total: BigInt(0), count: 0, firstPage: null, lines: [] };
    group.total += line.amountCents;
    group.count += 1;
    if (!search || `${line.property} ${line.unit}`.toLowerCase().includes(search)) group.lines.push(line);
    groups.set(key, group);
  }
  const orderedGroups = [...groups.values()].sort((a, b) => Number(a.direction === "expense") - Number(b.direction === "expense") || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  const pagination = reportPagination(orderedGroups.reduce((count, group) => count + group.lines.length, 0), 25, query?.detailPage);
  const start = (pagination.page - 1) * pagination.pageSize;
  const end = start + pagination.pageSize;
  let offset = 0;
  const selected: UnitProfitLossLine[] = [];
  const summaries = orderedGroups.map(({ lines: groupLines, ...group }) => {
    group.firstPage = groupLines.length ? Math.floor(offset / pagination.pageSize) + 1 : null;
    selected.push(...groupLines.slice(Math.max(0, start - offset), Math.max(0, end - offset)));
    offset += groupLines.length;
    return group;
  });
  return { unitProfitLossLines: selected, unitProfitLossScreen: { groups: summaries, pagination, totals } };
}

function hasFinancialActivity(row: TrustedReportRow) {
  return ["income", "expenses", "netIncome"].some(key => {
    const value = row.amounts?.[key] ?? row.cells[key];
    if (!value) return false;
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) && parsed !== 0;
  });
}
