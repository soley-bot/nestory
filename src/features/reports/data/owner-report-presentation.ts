import type { TrustedReport, TrustedReportRow } from "../reports.types";
import { buildOwnerReportModel, type OwnerReportFact } from "./owner-report-model";
import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import { formatProfitLossAmount } from "./profit-loss-funding";

// Draft ad hoc adapter only. The caller still owns authorization and certified
// source reads. Deliberately use the generic renderer: the legacy P&L renderer
// assumes Accrual and recomputes totals from potentially incomplete detail.
export function presentOwnerReport(model: ReturnType<typeof buildOwnerReportModel>, options: {
  generatedAt: string; expectedFingerprint?: string;
}): TrustedReport {
  if (options.expectedFingerprint !== undefined && options.expectedFingerprint !== model.sourceFingerprint) {
    throw new Error("Owner report sources changed. Refresh before exporting.");
  }
  const rows: TrustedReportRow[] = [];
  const add = (id: string, date: string, type: string, detail: string, cents: bigint | null) => {
    const magnitude = cents === null ? null : cents < BigInt(0) ? -cents : cents;
    const decimal = magnitude === null ? undefined
      : `${cents! < BigInt(0) ? "-" : ""}${magnitude / BigInt(100)}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
    rows.push({ id, title: type, cells: { date, type, source: id, detail, amount: formatProfitLossAmount(cents) },
      amounts: decimal === undefined ? undefined : { amount: decimal }, sourceCount: id.startsWith("metadata:") || id.startsWith("coverage:") || id === "activity-coverage" ? 0 : 1, sourceLinks: [], sourceSummary: id });
  };
  const included = new Set(model.lines.map(line => line.sourceKey));
  for (const line of model.lines) add(line.sourceKey, line.date, line.direction, `${line.category}: ${line.description} | Property ${line.propertyId} | Unit ${line.unitId ?? "unassigned"}${line.reversalOfSourceKey ? ` | Reverses ${line.reversalOfSourceKey}` : ""}`, line.signedAmountCents);
  const activity = (fact: OwnerReportFact, unassigned: boolean) => {
    const key = `${fact.sourceType}:${fact.sourceId}`;
    if (!unassigned && included.has(key)) return;
    const date = fact.kind === "manager_funded_cost" ? fact.vendorPaidOn
      : fact.kind === "recognition" ? fact.recognizedOn : fact.kind === "income_received" ? fact.receivedOn
        : "settledOn" in fact ? fact.settledOn : fact.eventOn;
    const detail = fact.kind === "manager_funded_cost"
      ? `Vendor cost ${fact.vendorCost} on ${fact.vendorPaidOn}; owner charge ${fact.ownerCharge} on ${fact.ownerChargeRecognizedOn}; markup ${fact.markup}; settlements ${fact.ownerSettlements.map(item => `${item.amount} on ${item.settledOn} (${item.sourceKey})`).join(", ") || "none"}`
      : `${fact.category}: ${fact.description}`;
    add(key, date, `${unassigned ? "Unassigned" : "Activity"}: ${fact.kind}`, `${detail} | Property ${fact.propertyId} | Unit ${fact.unitId ?? "unassigned"}${fact.reversalOfSourceKey ? ` | Reverses ${fact.reversalOfSourceKey}` : ""}`,
      fact.kind === "manager_funded_cost" ? null : parseExactMoneyToCents(fact.signedAmount));
  };
  model.activity.forEach(fact => activity(fact, false));
  model.unassigned.forEach(fact => activity(fact, true));
  model.coverageIssues.forEach((issue, index) => add(`coverage:${index}`, "", "Coverage warning", `${issue.code}: ${issue.message}${issue.sourceKey ? ` | ${issue.sourceKey}` : ""}`, null));
  if (model.activityCoverage !== "complete") add("activity-coverage", "", "Coverage warning", `Activity source coverage: ${model.activityCoverage}. Visible custody and funding are not certified complete.`, null);
  // Header fields have bounded space in the legacy PDF. Repeat exact context
  // in preserved rows so long IDs and fingerprints cannot be truncated.
  const scopeLabel = `Organization ${model.scope.organizationId} | Properties ${model.scope.propertyIds.join(", ")}${model.scope.unitId ? ` | Unit ${model.scope.unitId}` : ""}`;
  for (const [key, detail] of [["basis", model.basisLabel], ["scope", scopeLabel], ["period", `${model.scope.periodStart} - ${model.scope.periodEnd}`], ["fingerprint", model.sourceFingerprint], ["caution", "Profit is not management-held cash"]]) {
    add(`metadata:${key}`, "", "Report context", detail, null);
    rows[rows.length - 1].cells.amount = "";
  }
  return {
    kind: "unit-profit-loss", preserveRowDetails: true, title: `Owner operating report - ${model.basisLabel}`,
    description: "Ad hoc projection. Activity and unassigned amounts are excluded from operating totals. Profit is not management-held cash.",
    emptyTitle: "No verified operating lines", emptyDescription: "Review source coverage before relying on totals.",
    exportFilenameBase: `owner-report-${model.basis}-${model.scope.periodStart}-${model.scope.periodEnd}`,
    generatedAt: options.generatedAt, periodLabel: `${model.scope.periodStart} - ${model.scope.periodEnd}`,
    scopeLabel,
    columns: [{ key: "date", label: "Date" }, { key: "type", label: "Type" }, { key: "source", label: "Source" },
      { key: "detail", label: "Detail" }, { key: "amount", label: "USD amount", numeric: true }], rows,
    summary: [
      { label: "Income", value: formatProfitLossAmount(model.incomeCents), detail: model.basisLabel, sourceCount: model.lines.filter(line => line.direction === "income").length },
      { label: "Expenses", value: formatProfitLossAmount(model.expenseCents), detail: model.basisLabel, sourceCount: model.lines.filter(line => line.direction === "expense").length },
      { label: "Net operating income", value: formatProfitLossAmount(model.netOperatingIncomeCents), detail: model.basisLabel, sourceCount: model.lines.length },
    ],
    totalsTraceLabel: `${model.basisLabel} | Source fingerprint ${model.sourceFingerprint} | Activity coverage ${model.activityCoverage}`,
  };
}
