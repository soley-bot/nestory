import { ProfitLossDetail } from "./profit-loss-detail";
import type { TrustedReport } from "../reports.types";

export function UnitProfitLossWorkspace({ report, returnTo }: { report: TrustedReport; returnTo?: string }) {
  if (report.scopeValidation || report.exportValidation) return null;
  return <>
    <div className="pt-4 pb-2">
      <h2 className="text-base font-semibold">{report.scopeLabel}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{report.periodLabel}</p>
      {report.unitProfitLossScopeNote ? <p className="mt-2 text-sm text-muted-foreground">{report.unitProfitLossScopeNote}</p> : null}
    </div>
    <ProfitLossDetail unitScope returnTo={returnTo} lines={report.unitProfitLossLines ?? []} funding={report.unitProfitLossFunding} />
  </>;
}
