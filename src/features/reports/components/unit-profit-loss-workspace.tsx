import { ProfitLossDetail } from "./profit-loss-detail";
import Link from "next/link";
import { withReportReturn } from "../report-return";
import type { TrustedReport } from "../reports.types";

export function UnitProfitLossWorkspace({ report, returnTo }: { report: TrustedReport; returnTo?: string }) {
  if (report.scopeValidation) return null;
  if (report.exportValidation) return report.rows.length ? <ul aria-label="Billing to review" className="divide-y divide-border">
    {report.rows.map(row => <li key={row.id} className="py-3 text-sm">
      <p className="font-medium">{row.title}</p>
      <p className="mt-1 text-muted-foreground">{row.cells.issue ?? row.sourceSummary}</p>
      {row.href ? <Link className="mt-1 inline-block underline underline-offset-2" href={withReportReturn(row.href, returnTo)}>Review billing for {row.title}</Link> : null}
    </li>)}
  </ul> : null;
  return <>
    <div className="pt-4 pb-2">
      <h2 className="text-base font-semibold">{report.scopeLabel}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{report.periodLabel}</p>
      {report.unitProfitLossScopeNote ? <p className="mt-2 text-sm text-muted-foreground">{report.unitProfitLossScopeNote}</p> : null}
    </div>
    <ProfitLossDetail unitScope returnTo={returnTo} lines={report.unitProfitLossLines ?? []} funding={report.unitProfitLossFunding} />
  </>;
}
