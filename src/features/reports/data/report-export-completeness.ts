import type { TrustedReport } from "../reports.types";

/** A screen page must never accidentally become a partial financial download. */
export function assertCompleteReportForExport(report: TrustedReport) {
  if (!report.screenPagination) return;
  const complete = report.unitProfitLossScreen
    ? report.unitProfitLossScreen.groups.reduce((count, group) => count + group.count, 0) === report.unitProfitLossLines?.length
    : report.totalRowCount === report.rows.filter(row => !row.isGroup).length;
  if (!complete) throw new Error("A paged report cannot be exported. Load the complete report before downloading it.");
}
