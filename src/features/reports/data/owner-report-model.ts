import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";

export type OwnerReportBasis = "cash" | "accrual";

export function parseOwnerReportBasis(value?: string): OwnerReportBasis {
  if (value === undefined || value === "cash") return "cash";
  if (value === "accrual") return "accrual";
  throw new Error("Unsupported owner report basis.");
}

type Source = {
  sourceType: string;
  sourceId: string;
  organizationId: string;
  propertyId: string;
  unitId: string | null;
  currency: "USD";
  category: string;
  description: string;
  obligationId: string | null;
  reversalOfSourceKey: string | null;
};

export type OwnerReportFact = Source & (
  | { kind: "recognition"; direction: "income" | "expense"; recognizedOn: string; signedAmount: string }
  | { kind: "income_received"; receivedOn: string; signedAmount: string; collector: "manager" | "owner"; responsibility: "owner_income" | "tenant_recovery" }
  | { kind: "fee_settled" | "expense_settled"; settledOn: string; signedAmount: string; sourceOfFunds: "held_owner_cash" | "owner_payment" }
  | { kind: "funding" | "distribution" | "custody" | "transfer" | "vendor_payment" | "other_activity"; eventOn: string; signedAmount: string }
  | { kind: "manager_funded_cost"; vendorPaidOn: string; vendorCost: string; ownerChargeRecognizedOn: string; ownerCharge: string; markup: string;
      ownerSettlements: readonly { settledOn: string; amount: string; sourceKey: string }[]; sourceOfFunds: "ips_advance" | "ips_service" | "unclassified" }
);

export type OwnerReportScope = {
  organizationId: string;
  propertyIds: readonly string[];
  unitId?: string;
  periodStart: string;
  periodEnd: string;
};

export type OwnerReportLine = {
  sourceKey: string;
  obligationId: string | null;
  reversalOfSourceKey: string | null;
  propertyId: string;
  unitId: string | null;
  date: string;
  direction: "income" | "expense";
  signedAmountCents: bigint;
  category: string;
  description: string;
};

export type OwnerReportCoverageIssue = {
  code: "source_incomplete" | "source_consistency_unverified" | "manager_funded_cost_mapping_unresolved" | "unit_attribution_unavailable";
  sourceKey: string | null;
  affects: "both" | "income" | "expenses";
  message: string;
};

// Pure projection of already-authorized source facts. This is not an authorization
// boundary and does not prove that a caller's source read has a common DB snapshot.
// It is intentionally not connected to live report routes until loader acceptance.
export function buildOwnerReportModel({ basis, scope, facts, sourceRead }: {
  basis: OwnerReportBasis;
  scope: OwnerReportScope;
  facts: readonly OwnerReportFact[];
  sourceRead: { complete: boolean; consistency: "verified" | "unverified"; fingerprint: string;
    // Only independently certified source sections may override the legacy
    // all-or-nothing completeness flag. Interpretation is a different issue.
    sections?: { income: "complete" | "incomplete" | "unverified"; expenses: "complete" | "incomplete" | "unverified";
      activity?: "complete" | "incomplete" | "unverified" } };
}) {
  basis = parseOwnerReportBasis(basis);
  validateDate(scope.periodStart);
  validateDate(scope.periodEnd);
  if (scope.periodStart > scope.periodEnd || !scope.organizationId || new Set(scope.propertyIds).size !== scope.propertyIds.length
    || (scope.unitId !== undefined && (!scope.unitId || scope.propertyIds.length !== 1))) {
    throw new Error("Invalid owner report scope.");
  }
  if (!sourceRead.fingerprint) throw new Error("Owner report source fingerprint is required.");
  const coverageIssues: OwnerReportCoverageIssue[] = [];
  if (sourceRead.sections) {
    for (const section of ["income", "expenses"] as const) if (sourceRead.sections[section] !== "complete") {
      coverageIssues.push({ code: "source_incomplete", sourceKey: null, affects: section, message: `The ${section} source records are not certified complete. This total is unavailable.` });
    }
  } else if (!sourceRead.complete) coverageIssues.push({ code: "source_incomplete", sourceKey: null, affects: "both", message: "Source records are incomplete. Profit totals are unavailable." });
  if (sourceRead.consistency !== "verified") coverageIssues.push({ code: "source_consistency_unverified", sourceKey: null, affects: "both", message: "Source consistency could not be verified. Refresh before sharing this report." });
  const properties = new Set(scope.propertyIds);
  const seen = new Set<string>();
  const lines: OwnerReportLine[] = [];
  const activity: OwnerReportFact[] = [];
  const unassigned: OwnerReportFact[] = [];
  const inPeriod = (date: string) => date >= scope.periodStart && date <= scope.periodEnd;
  for (const fact of facts) {
    if (fact.organizationId !== scope.organizationId || !properties.has(fact.propertyId) || fact.currency !== "USD") {
      throw new Error("Owner report source scope mismatch.");
    }
    const sourceKey = `${fact.sourceType}:${fact.sourceId}`;
    if (!fact.sourceType || !fact.sourceId || seen.has(sourceKey)) throw new Error("Duplicate or incomplete owner report source identity.");
    seen.add(sourceKey);
    const dates = fact.kind === "manager_funded_cost"
      ? [fact.vendorPaidOn, fact.ownerChargeRecognizedOn, ...fact.ownerSettlements.map(item => item.settledOn)]
      : [fact.kind === "recognition" ? fact.recognizedOn : fact.kind === "income_received" ? fact.receivedOn
        : "settledOn" in fact ? fact.settledOn : fact.eventOn];
    dates.forEach(validateDate);
    if (fact.kind === "manager_funded_cost") {
      [fact.vendorCost, fact.ownerCharge, fact.markup, ...fact.ownerSettlements.map(item => item.amount)].forEach(parseExactMoneyToCents);
    } else parseExactMoneyToCents(fact.signedAmount);
    // Property-level costs remain explicitly visible; attribution is never guessed.
    if (scope.unitId && fact.unitId !== null && fact.unitId !== scope.unitId) continue;
    if (!dates.some(inPeriod)) continue;
    if (scope.unitId && fact.unitId === null) {
      unassigned.push(fact);
      const affects = basis === "accrual" && fact.kind === "recognition" ? (fact.direction === "income" ? "income" : "expenses")
        : basis === "cash" && fact.kind === "income_received" && fact.responsibility === "owner_income" ? "income"
          : basis === "cash" && ["fee_settled", "expense_settled", "manager_funded_cost"].includes(fact.kind) ? "expenses" : null;
      if (affects) coverageIssues.push({ code: "unit_attribution_unavailable", sourceKey, affects,
        message: "Property activity has no unit attribution. It is shown separately and is not assigned to this unit; the affected unit total is unavailable." });
      continue;
    }
    activity.push(fact);
    if (fact.kind === "manager_funded_cost") {
      if (basis === "cash") coverageIssues.push({ code: "manager_funded_cost_mapping_unresolved", sourceKey, affects: "expenses",
        message: "An IPS-funded cost needs its owner expense timing confirmed. Cash expenses and profit are unavailable; verified activity remains visible." });
      continue;
    }
    let date: string;
    let direction: "income" | "expense";
    if (basis === "accrual") {
      if (fact.kind !== "recognition") continue;
      const sourceDirection = fact.sourceType === "tenant_invoice_line" ? "income"
        : ["management_fee_occurrence", "owner_invoice_line", "expense_customer_adjustment"].includes(fact.sourceType) ? "expense" : null;
      if (sourceDirection === null || fact.direction !== sourceDirection) throw new Error("Accrual recognition requires canonical obligation evidence.");
      date = fact.recognizedOn;
      direction = fact.direction;
    } else if (fact.kind === "income_received") {
      if (fact.responsibility === "tenant_recovery") continue;
      if (!["tenant_invoice_payment_allocation", "owner_collection_allocation"].includes(fact.sourceType)) {
        throw new Error("Cash income requires canonical invoice settlement evidence.");
      }
      if ((fact.sourceType === "owner_collection_allocation") !== (fact.collector === "owner")) {
        throw new Error("Cash income collector evidence is inconsistent.");
      }
      date = fact.receivedOn;
      direction = "income";
    } else if (fact.kind === "fee_settled" || fact.kind === "expense_settled") {
      if (!["owner_charge_cash_allocation", "owner_payment_allocation"].includes(fact.sourceType)) {
        throw new Error("Cash expense requires canonical owner charge settlement evidence.");
      }
      if ((fact.sourceType === "owner_charge_cash_allocation") !== (fact.sourceOfFunds === "held_owner_cash")) {
        throw new Error("Cash expense funding evidence is inconsistent.");
      }
      date = fact.settledOn;
      direction = "expense";
    } else continue;
    lines.push({ sourceKey, obligationId: fact.obligationId, reversalOfSourceKey: fact.reversalOfSourceKey,
      propertyId: fact.propertyId, unitId: fact.unitId, date, direction,
      signedAmountCents: parseExactMoneyToCents(fact.signedAmount), category: fact.category, description: fact.description });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.sourceKey.localeCompare(b.sourceKey));
  const income = lines.filter(line => line.direction === "income").reduce((sum, line) => sum + line.signedAmountCents, BigInt(0));
  const expenses = lines.filter(line => line.direction === "expense").reduce((sum, line) => sum + line.signedAmountCents, BigInt(0));
  const incomeCents = coverageIssues.some(issue => issue.affects === "both" || issue.affects === "income") ? null : income;
  const expenseCents = coverageIssues.some(issue => issue.affects === "both" || issue.affects === "expenses") ? null : expenses;
  return { basis, basisLabel: basis === "cash" ? "Cash basis" : "Accrual basis", scope,
    sourceFingerprint: sourceRead.fingerprint, lines, activity, unassigned, coverageIssues,
    // Visible activity is not proof that all custody/funding/transfer roots were
    // read. Its coverage is independent of availability of operating profit.
    activityCoverage: sourceRead.consistency !== "verified" ? "unverified" as const
      : sourceRead.sections?.activity ?? (sourceRead.complete ? "complete" as const : "unverified" as const),
    incomeCents, expenseCents, netOperatingIncomeCents: incomeCents === null || expenseCents === null ? null : incomeCents - expenseCents };
}

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error("Owner report source date is invalid.");
  }
}
