import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import { formatCalendarDate } from "@/lib/dates/format";
import type { UnitProfitLossLine } from "../reports.types";

export type ProfitLossFunding = {
  contributionCents: bigint;
  remainingBalanceCents: bigint | null;
  accountPeriod?: { start: string; end: string; closingBalanceCents: bigint | null };
  unassignedContributionCents?: bigint;
  unavailableReason?: string;
};

export const profitLossBasisLabel = "Accrual basis";
export const pilotProfitLossBasisNote = "Rent and its management fee count in the rental month. Other income and expenses use the invoice or cost date.";
export const profitLossBasisNote = "Accrual basis: income and expenses by invoice or cost date.";
export const profitLossFundingHeading = "Owner funding and account activity";

export type FundingCashRow = { id: string; property_id: string; unit_id: string | null; event_date: string; amount: number | string; reversal_of_id?: string | null };
export type FundingActivityRow = { property_id: string; unit_id: string | null; event_date: string; category: string; balance_effect: number | string; source_type: string; source_id: string; reversal_of_id?: string | null };

// Equal totals alone do not prove that unknown unit allocations cancel.
// Only an explicit reversal of the same source can neutralize an unknown row.
function hasUnresolvedRows(rows: { id: string; property_id: string; amount: number | string; reversal_of_id?: string | null }[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const cancelled = new Set<string>();
  for (const row of rows) {
    const original = row.reversal_of_id ? byId.get(row.reversal_of_id) : undefined;
    if (original && original.id !== row.id && !original.reversal_of_id && original.property_id === row.property_id && !cancelled.has(original.id)
      && parseExactMoneyToCents(row.amount) === -parseExactMoneyToCents(original.amount)) {
      cancelled.add(row.id);
      cancelled.add(original.id);
    }
  }
  return rows.some(row => !cancelled.has(row.id) && parseExactMoneyToCents(row.amount) !== BigInt(0));
}

export function buildProfitLossFunding({ propertyIds, unitId, units, monthStart, cash, activity, closing, activityScope = "property" }: {
  propertyIds: string[]; unitId: string; units: { id: string; property_id: string }[];
  monthStart: string; cash: FundingCashRow[]; activity: FundingActivityRow[]; activityScope?: "property" | "unit";
  closing?: { end: string; activity: FundingActivityRow[] };
}): ProfitLossFunding {
  const selectedUnit = units.find(unit => unit.id === unitId);
  const ids = new Set(unitId === "all" ? propertyIds : propertyIds.filter(id => id === selectedUnit?.property_id));
  const seen = new Set<string>();
  let contributionCents = BigInt(0);
  let unassignedContributionCents = BigInt(0);
  const unassignedCash: FundingCashRow[] = [];
  const multiUnit = unitId !== "all" && units.filter(unit => ids.has(unit.property_id)).length !== 1;
  for (const row of cash) {
    if (!ids.has(row.property_id) || row.event_date.slice(0, 7) !== monthStart.slice(0, 7)) continue;
    if (unitId !== "all" && row.unit_id !== null && row.unit_id !== unitId) continue;
    if (seen.has(row.id)) throw new Error("Duplicate owner contribution source.");
    seen.add(row.id);
    if (multiUnit && row.unit_id === null) {
      unassignedContributionCents += parseExactMoneyToCents(row.amount);
      unassignedCash.push(row);
    }
    else contributionCents += parseExactMoneyToCents(row.amount);
  }
  function accountBalance(rows: FundingActivityRow[]) {
    if (multiUnit && activityScope !== "unit") return null;
    const sources = new Set<string>();
    const unassigned = [];
    let balance = BigInt(0);
    for (const row of rows) {
      if (!ids.has(row.property_id)) continue;
      const key = `${row.source_type}:${row.source_id}`;
      if (sources.has(key)) throw new Error("Duplicate owner account activity source.");
      sources.add(key);
      if (multiUnit && row.unit_id === null) {
        const originalType = row.source_type === "expense_customer_adjustment" ? "ips_expense_responsibility" : row.source_type;
        unassigned.push({ id: key, property_id: row.property_id, amount: row.balance_effect,
          reversal_of_id: row.reversal_of_id ? `${originalType}:${row.reversal_of_id}` : null });
      }
      if (!multiUnit || row.unit_id === unitId) balance += parseExactMoneyToCents(row.balance_effect);
    }
    return hasUnresolvedRows(unassigned) ? null : balance;
  }
  const unresolvedCash = hasUnresolvedRows(unassignedCash);
  const remainingBalanceCents = !closing && unresolvedCash ? null : accountBalance(activity.filter(row => row.event_date < monthStart));
  const result: ProfitLossFunding = { contributionCents, remainingBalanceCents };
  if (closing) {
    result.accountPeriod = { start: monthStart, end: closing.end,
      closingBalanceCents: accountBalance(closing.activity.filter(row => row.event_date <= closing.end)) };
  }
  if (remainingBalanceCents === null || result.accountPeriod?.closingBalanceCents === null || unresolvedCash) {
    result.unassignedContributionCents = unassignedContributionCents;
    result.unavailableReason = "Some property account activity is not assigned to a unit. Review the property in Owner activity. Unassigned contributions are shown separately and excluded from the unit total.";
  }
  return result;
}

export function profitLossSummaryRows(lines: UnitProfitLossLine[], funding?: ProfitLossFunding, totals?: { income: bigint; expenses: bigint }) {
  const income = totals?.income ?? lines.filter(line => line.direction === "income").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const expenses = totals?.expenses ?? lines.filter(line => line.direction === "expense").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const rows: { label: string; amountCents: bigint | null; isClosingBalance?: boolean }[] = [
    { label: "Total income", amountCents: income }, { label: "Total expenses", amountCents: expenses },
    { label: "Net operating income", amountCents: income - expenses },
  ];
  if (!funding) return rows;
  const period = funding.accountPeriod;
  if (period) rows.push({ label: `Opening balance, ${formatCalendarDate(period.start)}`, amountCents: funding.remainingBalanceCents });
  rows.push({ label: "Owner funding contributions", amountCents: funding.contributionCents });
  if (funding.unassignedContributionCents) rows.push({ label: "Property-level contributions (unassigned)", amountCents: funding.unassignedContributionCents });
  if (period) {
    const opening = funding.remainingBalanceCents;
    const closing = period.closingBalanceCents;
    rows.push(
      { label: "Collections, costs and payouts", amountCents: opening === null || closing === null ? null : closing - opening - funding.contributionCents },
      { label: `Closing balance, ${formatCalendarDate(period.end)}`, amountCents: closing, isClosingBalance: true },
    );
  } else {
    rows.push({ label: "Opening account activity", amountCents: funding.remainingBalanceCents });
  }
  return rows;
}

export function formatProfitLossAmount(cents: bigint | null) {
  if (cents === null) return "Unavailable";
  const magnitude = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}USD ${(magnitude / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
}
