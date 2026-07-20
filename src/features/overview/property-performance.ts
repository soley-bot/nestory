import {
  buildPropertyCash,
  type PropertyCashInput,
  type PropertyCashPropertyFacts,
  type PropertyCashTotals,
} from "@/features/finance/property-cash";
import type {
  OverviewPropertyPerformance,
  OverviewPropertyPerformanceRow,
  OverviewReview,
} from "@/features/overview/overview.types";
import {
  formatMoneyDisplay,
  type CurrencyCode,
} from "@/lib/money/format";

export type OverviewPropertyInputRow = {
  code: string;
  id: string;
  name: string;
};

export type OverviewUnitInputRow = {
  id: string;
  property_id: string;
};

export type OverviewIncomeItemInputRow = {
  amount_due: number;
  due_date: string;
  id: string;
  income_type: string;
  property_id: string;
};

export type OverviewReceiptAllocationInputRow = {
  allocation_id: string;
  amount: number;
  income_item_id: string;
  receipt_id: string;
  received_date: string;
  reversal_of_id: string | null;
};

export type OverviewExpenseItemInputRow = {
  economic_scope: string;
  expense_type: string;
  id: string;
  property_id: string;
};

export type OverviewPaymentAllocationInputRow = {
  allocation_id: string;
  amount: number;
  expense_item_id: string;
  paid_date: string;
  payment_id: string;
  reversal_of_id: string | null;
};

export type OverviewDepositEventType =
  | "applied"
  | "received"
  | "refunded"
  | "retained";

type OverviewDepositEventInputBase = {
  amount: number;
  event_date: string;
  id: string;
  property_id: string;
};

export type OverviewDepositEventInputRow =
  | (OverviewDepositEventInputBase & {
      event_type: OverviewDepositEventType;
      reversed_event_type: null;
    })
  | (OverviewDepositEventInputBase & {
      event_type: "reversed";
      reversed_event_type: OverviewDepositEventType;
    });

export type OverviewMonthScope = {
  before: string;
  from: string;
};

export type OverviewPropertyCountInputRow = {
  property_id: string;
};

export type OverviewStatementReadinessInputRow = {
  blocker_count: number;
  property_id: string;
  ready_statement_count: number;
};

export type OverviewStatementReadinessInput = {
  properties: OverviewStatementReadinessInputRow[];
  summary: OverviewPropertyPerformance["summary"]["statementReadiness"];
};

export type OverviewPropertyPerformanceInput = {
  cashInput: PropertyCashInput;
  currency: CurrencyCode;
  openBills: OverviewPropertyCountInputRow[];
  properties: OverviewPropertyInputRow[];
  statementReadiness: OverviewStatementReadinessInput;
  units: OverviewUnitInputRow[];
};

type OverviewAttentionAccumulator = {
  openBillCount: number;
  readyStatementCount: number;
  statementBlockers: number;
};

const statusOrder: Record<OverviewPropertyPerformanceRow["status"], number> = {
  loss: 0,
  arrears: 1,
  attention: 2,
  healthy: 3,
};

export function buildOverviewPropertyPerformance(
  input: OverviewPropertyPerformanceInput,
  review: OverviewReview = "all",
): OverviewPropertyPerformance {
  const cash = buildPropertyCash(input.cashInput);
  const cashByPropertyId = new Map(
    cash.properties.map((facts) => [facts.propertyId, facts]),
  );
  const attentionByPropertyId = new Map<string, OverviewAttentionAccumulator>();

  for (const property of input.properties) {
    attentionByPropertyId.set(property.id, emptyAttentionAccumulator());
  }

  for (const bill of input.openBills) {
    const attention = attentionByPropertyId.get(bill.property_id);
    if (attention) attention.openBillCount += 1;
  }

  for (const readiness of input.statementReadiness.properties) {
    const attention = attentionByPropertyId.get(readiness.property_id);
    if (attention) {
      attention.readyStatementCount = readiness.ready_statement_count;
      attention.statementBlockers = readiness.blocker_count;
    }
  }

  const unitCountByPropertyId = countByPropertyId(input.units);
  const allRows = input.properties.map((property) => {
    const facts = cashByPropertyId.get(property.id);
    if (!facts) {
      throw new Error(`Property cash facts are missing for ${property.id}`);
    }

    return toPerformanceRow({
      attention:
        attentionByPropertyId.get(property.id) ?? emptyAttentionAccumulator(),
      currency: input.currency,
      facts,
      property,
      unitCount: unitCountByPropertyId.get(property.id) ?? 0,
    });
  });
  const summary = buildSummary(cash.totals, input.statementReadiness.summary);
  const rows = allRows
    .filter((row) =>
      matchesReview(row, attentionByPropertyId.get(row.propertyId), review),
    )
    .sort(compareRows);

  return { rows, summary };
}

function emptyAttentionAccumulator(): OverviewAttentionAccumulator {
  return {
    openBillCount: 0,
    readyStatementCount: 0,
    statementBlockers: 0,
  };
}

function countByPropertyId(rows: OverviewUnitInputRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.property_id, (counts.get(row.property_id) ?? 0) + 1);
  }
  return counts;
}

function toPerformanceRow({
  attention,
  currency,
  facts,
  property,
  unitCount,
}: {
  attention: OverviewAttentionAccumulator;
  currency: CurrencyCode;
  facts: PropertyCashPropertyFacts;
  property: OverviewPropertyInputRow;
  unitCount: number;
}): OverviewPropertyPerformanceRow {
  const arrearsAmount = centsToAmount(facts.arrearsCents);
  const { cashExpensesCents, netCashCents } =
    deriveOverviewCashPresentation(facts);
  const cashExpensesAmount = centsToAmount(cashExpensesCents);
  const cashIncomeAmount = centsToAmount(facts.operatingCashReceivedCents);
  const managementFeeEarnedAmount = centsToAmount(
    facts.managementFeesEarnedCents,
  );
  const managementFeeOutstandingAmount = centsToAmount(
    facts.managementFeesOutstandingCents,
  );
  const managementFeeReceivedAmount = centsToAmount(
    facts.managementFeesReceivedCents,
  );
  const netCashAmount = centsToAmount(netCashCents);
  const collectionRate = percentage(
    facts.rentReceivedCents,
    facts.rentDueCents,
  );
  const status = getStatus({
    arrearsAmount,
    hasAttention:
      attention.openBillCount > 0 ||
      attention.statementBlockers > 0 ||
      managementFeeOutstandingAmount > 0,
    netCashAmount,
  });

  return {
    arrears: formatMoneyDisplay(arrearsAmount, currency),
    arrearsAmount,
    cashExpenses: formatMoneyDisplay(cashExpensesAmount, currency),
    cashExpensesAmount,
    cashIncome: formatMoneyDisplay(cashIncomeAmount, currency),
    cashIncomeAmount,
    collectionRate,
    href: `/properties/${property.id}`,
    label: `${property.code} / ${property.name}`,
    managementFeeEarned: formatMoneyDisplay(managementFeeEarnedAmount, currency),
    managementFeeEarnedAmount,
    managementFeeOutstandingAmount,
    managementFeeReceived: formatMoneyDisplay(
      managementFeeReceivedAmount,
      currency,
    ),
    managementFeeReceivedAmount,
    netCash: formatMoneyDisplay(netCashAmount, currency),
    netCashAmount,
    propertyId: property.id,
    readyStatementCount: attention.readyStatementCount,
    securityDepositHeldAmount: centsToAmount(facts.securityDepositHeldCents),
    statementBlockers: attention.statementBlockers,
    status,
    unitCount,
  };
}

function getStatus({
  arrearsAmount,
  hasAttention,
  netCashAmount,
}: {
  arrearsAmount: number;
  hasAttention: boolean;
  netCashAmount: number;
}): OverviewPropertyPerformanceRow["status"] {
  if (netCashAmount < 0) return "loss";
  if (arrearsAmount > 0) return "arrears";
  if (hasAttention) return "attention";
  return "healthy";
}

function buildSummary(
  totals: PropertyCashTotals,
  statementReadiness: OverviewPropertyPerformance["summary"]["statementReadiness"],
) {
  const { cashExpensesCents, netCashCents } =
    deriveOverviewCashPresentation(totals);

  return {
    arrearsAmount: centsToAmount(totals.arrearsCents),
    cashExpensesAmount: centsToAmount(cashExpensesCents),
    cashIncomeAmount: centsToAmount(totals.operatingCashReceivedCents),
    collectionRate: percentage(totals.rentReceivedCents, totals.rentDueCents),
    managementFeeEarnedAmount: centsToAmount(
      totals.managementFeesEarnedCents,
    ),
    managementFeeOutstandingAmount: centsToAmount(
      totals.managementFeesOutstandingCents,
    ),
    managementFeeReceivedAmount: centsToAmount(
      totals.managementFeesReceivedCents,
    ),
    netCashAmount: centsToAmount(netCashCents),
    statementReadiness,
  };
}

function deriveOverviewCashPresentation(totals: PropertyCashTotals) {
  const cashExpensesCents =
    totals.propertyExpensesPaidCents + totals.managementFeesReceivedCents;

  return {
    cashExpensesCents,
    netCashCents: totals.operatingCashReceivedCents - cashExpensesCents,
  };
}

function matchesReview(
  row: OverviewPropertyPerformanceRow,
  attention: OverviewAttentionAccumulator | undefined,
  review: OverviewReview,
) {
  if (review === "negative") return row.netCashAmount < 0;
  if (review === "arrears") return row.arrearsAmount > 0;
  if (review === "bills") return (attention?.openBillCount ?? 0) > 0;
  if (review === "statement-blocked") return row.statementBlockers > 0;
  return true;
}

function compareRows(
  first: OverviewPropertyPerformanceRow,
  second: OverviewPropertyPerformanceRow,
) {
  return (
    statusOrder[first.status] - statusOrder[second.status] ||
    first.netCashAmount - second.netCashAmount ||
    first.collectionRate - second.collectionRate ||
    first.label.localeCompare(second.label) ||
    first.propertyId.localeCompare(second.propertyId)
  );
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round(clamp((numerator / denominator) * 100, 0, 100));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function centsToAmount(cents: number) {
  return cents / 100;
}
