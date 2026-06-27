import { getReportsScreenData } from "@/features/reports/data/reports";
import type {
  ReportsViewQuery,
  TrustedReport,
  TrustedReportRow,
} from "@/features/reports/reports.types";
import { slugifyReportPart } from "@/features/reports/data/report-format";

export async function getReportCsv(
  organizationId: string,
  viewQuery: ReportsViewQuery,
) {
  const data = await getReportsScreenData(organizationId, viewQuery);
  const report = data.trustedReport;

  return {
    body: buildTrustedReportCsv(report),
    filename: `${report.exportFilenameBase}-${viewQuery.month}-${slugifyReportPart(
      report.scopeLabel,
    )}.csv`,
  };
}

export function buildTrustedReportCsv(report: TrustedReport) {
  const rows = [
    ["Report", report.title],
    ["Scope", report.scopeLabel],
    ["Period", report.periodLabel],
    ["Generated at", report.generatedAt],
    ["Trace", report.totalsTraceLabel],
    [],
    [
      "Row",
      "Title",
      ...report.columns.map((column) => column.label),
      "Source records",
      "Source ids",
    ],
  ];

  for (const [index, row] of report.rows.entries()) {
    rows.push(toCsvRow(index, row, report));
  }

  if (report.rows.length === 0) {
    rows.push(["", report.emptyTitle, report.emptyDescription, "", ""]);
  }

  rows.push([]);
  rows.push(["Metric", "Value", "Detail", "Source count"]);

  for (const metric of report.summary) {
    rows.push([
      metric.label,
      metric.value,
      metric.detail,
      String(metric.sourceCount),
    ]);
  }

  return toCsv(rows);
}

function toCsvRow(
  index: number,
  row: TrustedReportRow,
  report: TrustedReport,
) {
  return [
    String(index + 1),
    row.title,
    ...report.columns.map((column) => row.cells[column.key] ?? ""),
    row.sourceLinks
      .map((source) => `${source.recordType}:${source.label}`)
      .join(" | "),
    row.sourceLinks.map((source) => source.id).join(" | "),
  ];
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function escapeCsvCell(value: string) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
