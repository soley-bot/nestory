import { ProfitLossDetail } from "./profit-loss-detail";
import type { TrustedReport } from "../reports.types";

export function UnitProfitLossWorkspace({ report }: { report: TrustedReport }) {
  if (report.scopeValidation) return null;
  return <ProfitLossDetail lines={report.unitProfitLossLines ?? []} funding={report.unitProfitLossFunding} />;
}
