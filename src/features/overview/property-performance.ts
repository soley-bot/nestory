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
  id: string;
  income_type: string;
  property_id: string;
};

export type OverviewReceiptAllocationInputRow = {
  amount: number;
  income_item_id: string;
  reversal_of_id: string | null;
};

export type OverviewExpenseItemInputRow = {
  economic_scope: string;
  expense_type: string;
  id: string;
  property_id: string;
};

export type OverviewPaymentAllocationInputRow = {
  amount: number;
  expense_item_id: string;
  reversal_of_id: string | null;
};

export type OverviewDepositEventType =
  | "applied"
  | "received"
  | "refunded"
  | "retained";

export type OverviewDepositEventInputRow = {
  amount: number;
  event_type: OverviewDepositEventType | "reversed";
  property_id: string;
  reversed_event_type: OverviewDepositEventType | null;
};

export type OverviewPropertyCountInputRow = {
  property_id: string;
};

export type OverviewStatementBlockerInputRow = {
  blocker_count: number;
  property_id: string;
};

export type OverviewPropertyPerformanceInput = {
  currency: CurrencyCode;
  depositEvents: OverviewDepositEventInputRow[];
  expenseItems: OverviewExpenseItemInputRow[];
  incomeItems: OverviewIncomeItemInputRow[];
  openBills: OverviewPropertyCountInputRow[];
  paymentAllocations: OverviewPaymentAllocationInputRow[];
  properties: OverviewPropertyInputRow[];
  receiptAllocations: OverviewReceiptAllocationInputRow[];
  statementBlockers: OverviewStatementBlockerInputRow[];
  units: OverviewUnitInputRow[];
};

type PropertyAccumulator = {
  arrearsAmount: number;
  cashExpensesAmount: number;
  cashIncomeAmount: number;
  managementFeeEarnedAmount: number;
  managementFeeOutstandingAmount: number;
  openBillCount: number;
  rentDueAmount: number;
  rentReceivedAmount: number;
  securityDepositHeldAmount: number;
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
  const accumulators = new Map<string, PropertyAccumulator>();
  const incomeItemsById = new Map(input.incomeItems.map((item) => [item.id, item]));
  const expenseItemsById = new Map(input.expenseItems.map((item) => [item.id, item]));
  const receiptAmountByIncomeItemId = sumSignedAllocations(
    input.receiptAllocations,
    (row) => row.income_item_id,
  );

  for (const property of input.properties) {
    accumulators.set(property.id, emptyAccumulator());
  }

  for (const item of input.incomeItems) {
    const totals = accumulators.get(item.property_id);
    if (!totals) continue;

    const amountDue = Number(item.amount_due);
    const receivedAmount = receiptAmountByIncomeItemId.get(item.id) ?? 0;

    if (item.income_type === "rent") {
      totals.rentDueAmount += amountDue;
      totals.rentReceivedAmount += clamp(receivedAmount, 0, amountDue);
      totals.arrearsAmount += Math.max(amountDue - receivedAmount, 0);
    }

    if (item.income_type === "management_fee") {
      totals.managementFeeEarnedAmount += receivedAmount;
      totals.managementFeeOutstandingAmount += Math.max(amountDue - receivedAmount, 0);
    }
  }

  for (const allocation of input.receiptAllocations) {
    const item = incomeItemsById.get(allocation.income_item_id);
    const totals = item ? accumulators.get(item.property_id) : undefined;
    if (!item || !totals) continue;

    const signedAmount = signed(allocation.amount, allocation.reversal_of_id);
    if (item.income_type === "management_fee") {
      totals.cashExpensesAmount += signedAmount;
    } else if (
      item.income_type !== "security_deposit" &&
      item.income_type !== "owner_contribution"
    ) {
      totals.cashIncomeAmount += signedAmount;
    }
  }

  for (const allocation of input.paymentAllocations) {
    const item = expenseItemsById.get(allocation.expense_item_id);
    const totals = item ? accumulators.get(item.property_id) : undefined;
    if (
      !item ||
      !totals ||
      item.expense_type === "owner_payout" ||
      item.economic_scope !== "property_expense"
    ) {
      continue;
    }

    totals.cashExpensesAmount += signed(allocation.amount, allocation.reversal_of_id);
  }

  for (const event of input.depositEvents) {
    const totals = accumulators.get(event.property_id);
    if (!totals) continue;
    totals.securityDepositHeldAmount += getDepositBalanceEffect(event);
  }

  for (const bill of input.openBills) {
    const totals = accumulators.get(bill.property_id);
    if (totals) totals.openBillCount += 1;
  }

  for (const blocker of input.statementBlockers) {
    const totals = accumulators.get(blocker.property_id);
    if (totals) totals.statementBlockers += blocker.blocker_count;
  }

  const unitCountByPropertyId = countByPropertyId(input.units);
  const allRows = input.properties.map((property) => {
    const totals = accumulators.get(property.id) ?? emptyAccumulator();
    return toPerformanceRow({
      currency: input.currency,
      property,
      totals,
      unitCount: unitCountByPropertyId.get(property.id) ?? 0,
    });
  });
  const summary = buildSummary(allRows, accumulators);
  const rows = allRows
    .filter((row) => matchesReview(row, accumulators.get(row.propertyId), review))
    .sort(compareRows);

  return { rows, summary };
}

function emptyAccumulator(): PropertyAccumulator {
  return {
    arrearsAmount: 0,
    cashExpensesAmount: 0,
    cashIncomeAmount: 0,
    managementFeeEarnedAmount: 0,
    managementFeeOutstandingAmount: 0,
    openBillCount: 0,
    rentDueAmount: 0,
    rentReceivedAmount: 0,
    securityDepositHeldAmount: 0,
    statementBlockers: 0,
  };
}

function sumSignedAllocations<T extends { amount: number; reversal_of_id: string | null }>(
  rows: T[],
  getTargetId: (row: T) => string,
) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const targetId = getTargetId(row);
    totals.set(
      targetId,
      (totals.get(targetId) ?? 0) + signed(row.amount, row.reversal_of_id),
    );
  }
  return totals;
}

function signed(amount: number, reversalOfId: string | null) {
  return Number(amount) * (reversalOfId ? -1 : 1);
}

function getDepositBalanceEffect(event: OverviewDepositEventInputRow) {
  if (event.event_type === "reversed") {
    return -depositDirection(event.reversed_event_type) * Number(event.amount);
  }
  return depositDirection(event.event_type) * Number(event.amount);
}

function depositDirection(eventType: OverviewDepositEventType | null) {
  return eventType === "received" ? 1 : -1;
}

function countByPropertyId(rows: OverviewUnitInputRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.property_id, (counts.get(row.property_id) ?? 0) + 1);
  }
  return counts;
}

function toPerformanceRow({
  currency,
  property,
  totals,
  unitCount,
}: {
  currency: CurrencyCode;
  property: OverviewPropertyInputRow;
  totals: PropertyAccumulator;
  unitCount: number;
}): OverviewPropertyPerformanceRow {
  const arrearsAmount = roundMoney(totals.arrearsAmount);
  const cashExpensesAmount = roundMoney(totals.cashExpensesAmount);
  const cashIncomeAmount = roundMoney(totals.cashIncomeAmount);
  const managementFeeEarnedAmount = roundMoney(totals.managementFeeEarnedAmount);
  const managementFeeOutstandingAmount = roundMoney(
    totals.managementFeeOutstandingAmount,
  );
  const netCashAmount = roundMoney(cashIncomeAmount - cashExpensesAmount);
  const collectionRate = percentage(totals.rentReceivedAmount, totals.rentDueAmount);
  const status = getStatus({
    arrearsAmount,
    hasAttention:
      totals.openBillCount > 0 ||
      totals.statementBlockers > 0 ||
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
    netCash: formatMoneyDisplay(netCashAmount, currency),
    netCashAmount,
    propertyId: property.id,
    securityDepositHeldAmount: roundMoney(totals.securityDepositHeldAmount),
    statementBlockers: totals.statementBlockers,
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
  rows: OverviewPropertyPerformanceRow[],
  accumulators: Map<string, PropertyAccumulator>,
) {
  const totals = rows.reduce(
    (summary, row) => ({
      arrearsAmount: summary.arrearsAmount + row.arrearsAmount,
      cashExpensesAmount: summary.cashExpensesAmount + row.cashExpensesAmount,
      cashIncomeAmount: summary.cashIncomeAmount + row.cashIncomeAmount,
      managementFeeEarnedAmount:
        summary.managementFeeEarnedAmount + row.managementFeeEarnedAmount,
      managementFeeOutstandingAmount:
        summary.managementFeeOutstandingAmount + row.managementFeeOutstandingAmount,
      rentDueAmount:
        summary.rentDueAmount +
        (accumulators.get(row.propertyId)?.rentDueAmount ?? 0),
      rentReceivedAmount:
        summary.rentReceivedAmount +
        (accumulators.get(row.propertyId)?.rentReceivedAmount ?? 0),
    }),
    {
      arrearsAmount: 0,
      cashExpensesAmount: 0,
      cashIncomeAmount: 0,
      managementFeeEarnedAmount: 0,
      managementFeeOutstandingAmount: 0,
      rentDueAmount: 0,
      rentReceivedAmount: 0,
    },
  );
  const blockedCount = rows.filter((row) => row.statementBlockers > 0).length;

  return {
    arrearsAmount: roundMoney(totals.arrearsAmount),
    cashExpensesAmount: roundMoney(totals.cashExpensesAmount),
    cashIncomeAmount: roundMoney(totals.cashIncomeAmount),
    collectionRate: percentage(totals.rentReceivedAmount, totals.rentDueAmount),
    managementFeeEarnedAmount: roundMoney(totals.managementFeeEarnedAmount),
    managementFeeOutstandingAmount: roundMoney(
      totals.managementFeeOutstandingAmount,
    ),
    netCashAmount: roundMoney(
      totals.cashIncomeAmount - totals.cashExpensesAmount,
    ),
    statementReadiness: {
      blockedCount,
      readyCount: rows.length - blockedCount,
      totalCount: rows.length,
    },
  };
}

function matchesReview(
  row: OverviewPropertyPerformanceRow,
  totals: PropertyAccumulator | undefined,
  review: OverviewReview,
) {
  if (review === "negative") return row.netCashAmount < 0;
  if (review === "arrears") return row.arrearsAmount > 0;
  if (review === "bills") return (totals?.openBillCount ?? 0) > 0;
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
