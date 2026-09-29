import { ProfitLossDetail } from "./profit-loss-detail";
import type { TrustedReport } from "../reports.types";

export function UnitProfitLossWorkspace({ report, returnTo }: { report: TrustedReport; returnTo?: string }) {
  if (report.scopeValidation) return null;
  return <ProfitLossDetail returnTo={returnTo} lines={report.unitProfitLossLines ?? []} funding={report.unitProfitLossFunding} />;
}
