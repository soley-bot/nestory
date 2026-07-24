import { getTrustedReport } from "@/features/reports/data/trusted-report";
import type {
  ReportsViewQuery,
  TrustedReport,
  TrustedReportRow,
} from "@/features/reports/reports.types";
import { getReportExportFilename } from "@/features/reports/data/report-format";

export async function getReportCsv(
  organizationId: string,
  viewQuery: ReportsViewQuery,
) {
  const report = await getTrustedReport({
    organizationId,
    viewQuery,
  });

  return {
    body: buildTrustedReportCsv(report),
    filename: getReportExportFilename(report, viewQuery, "csv"),
  };
}

export function buildTrustedReportCsv(report: TrustedReport) {
  const includeEvidence = report.rows.some((row) => row.evidence?.length);
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
      "Source links",
      ...(includeEvidence ? ["Evidence records", "Evidence details"] : []),
    ],
  ];

  for (const [index, row] of report.rows.entries()) {
    rows.push(toCsvRow(index, row, report, includeEvidence));
  }

  if (report.rows.length === 0) {
    rows.push([
      "",
      report.emptyTitle,
      ...report.columns.map((_, index) =>
        index === 0 ? report.emptyDescription : "",
      ),
      "",
      "",
      "",
      ...(includeEvidence ? ["", ""] : []),
    ]);
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
  includeEvidence: boolean,
) {
  return [
    String(index + 1),
    row.title,
    ...report.columns.map((column) => row.cells[column.key] ?? ""),
    row.sourceLinks
      .map((source) => `${source.recordType}:${source.label}`)
      .join(" | "),
    row.sourceLinks.map((source) => source.id).join(" | "),
    row.sourceLinks
      .flatMap((source) => (source.href ? [source.href] : []))
      .join(" | "),
    ...(includeEvidence
      ? [
          (row.evidence ?? []).map(evidenceRecords).join(" || "),
          (row.evidence ?? []).map(evidenceDetails).join(" || "),
        ]
      : []),
  ];
}

function evidenceRecords(
  evidence: NonNullable<TrustedReportRow["evidence"]>[number],
) {
  return [
    `property:${evidence.propertyId}`,
    evidence.ownerPersonId && `owner-person:${evidence.ownerPersonId}`,
    evidence.ownerLinkId && `owner-link:${evidence.ownerLinkId}`,
    evidence.incomeItemId && `income-obligation:${evidence.incomeItemId}`,
    evidence.expenseItemId && `expense-obligation:${evidence.expenseItemId}`,
    evidence.receiptId && `receipt:${evidence.receiptId}`,
    evidence.allocationId &&
      evidence.receiptId &&
      `receipt-allocation:${evidence.allocationId}`,
    evidence.paymentId && `payment:${evidence.paymentId}`,
    evidence.allocationId &&
      evidence.paymentId &&
      `payment-allocation:${evidence.allocationId}`,
    evidence.depositEventId && `deposit-event:${evidence.depositEventId}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function evidenceDetails(
  evidence: NonNullable<TrustedReportRow["evidence"]>[number],
) {
  return [
    evidence.eventDate ?? "no-event-date",
    evidence.classification,
    `signed_cents=${evidence.signedAmountCents ?? "n/a"}`,
    `allocated_cents=${evidence.allocatedAmountCents ?? "n/a"}`,
    `fact=${evidence.statementFact}`,
  ].join(" | ");
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function escapeCsvCell(value: string) {
  const safeValue = toSpreadsheetSafeValue(value);

  if (!/[",\r\n]/.test(safeValue)) {
    return safeValue;
  }

  return `"${safeValue.replaceAll('"', '""')}"`;
}

function toSpreadsheetSafeValue(value: string) {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}
