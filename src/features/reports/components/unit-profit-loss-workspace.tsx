import { ProfitLossDetail } from "./profit-loss-detail";
import type { ReportsViewQuery, TrustedReport } from "../reports.types";

export function UnitProfitLossWorkspace({ report, returnTo, viewQuery }: { report: TrustedReport; returnTo?: string; viewQuery?: ReportsViewQuery }) {
  if (report.scopeValidation) return null;
  return <ProfitLossDetail returnTo={returnTo} lines={report.unitProfitLossLines ?? []} funding={report.unitProfitLossFunding} screenPage={report.unitProfitLossScreen} viewQuery={viewQuery} />;
}
