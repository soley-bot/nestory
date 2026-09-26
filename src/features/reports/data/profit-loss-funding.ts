import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import type { UnitProfitLossLine } from "../reports.types";

export type ProfitLossFunding = {
  contributionCents: bigint;
  remainingBalanceCents: bigint | null;
  unassignedContributionCents?: bigint;
  unavailableReason?: string;
};

export const profitLossFundingNote = "Remaining Balance is recorded property-account activity before this month. Net income adds that balance and owner contributions to accrual operating income. Owner funding is outside operating profit; this total is not cash available for withdrawal.";

export type FundingCashRow = { id: string; property_id: string; unit_id: string | null; event_date: string; amount: number | string };
export type FundingActivityRow = { property_id: string; unit_id: string | null; event_date: string; category: string; balance_effect: number | string; source_type: string; source_id: string };

export function buildProfitLossFunding({ propertyIds, unitId, units, monthStart, cash, activity, activityScope = "property" }: {
  propertyIds: string[]; unitId: string; units: { id: string; property_id: string }[];
  monthStart: string; cash: FundingCashRow[]; activity: FundingActivityRow[]; activityScope?: "property" | "unit";
}): ProfitLossFunding {
  const selectedUnit = units.find(unit => unit.id === unitId);
  const ids = new Set(unitId === "all" ? propertyIds : propertyIds.filter(id => id === selectedUnit?.property_id));
  const seen = new Set<string>();
  let contributionCents = BigInt(0);
  let unassignedContributionCents = BigInt(0);
  const multiUnit = unitId !== "all" && units.filter(unit => ids.has(unit.property_id)).length !== 1;
  for (const row of cash) {
    if (!ids.has(row.property_id) || row.event_date.slice(0, 7) !== monthStart.slice(0, 7)) continue;
    if (unitId !== "all" && row.unit_id !== null && row.unit_id !== unitId) continue;
    if (seen.has(row.id)) throw new Error("Duplicate owner contribution source.");
    seen.add(row.id);
    if (multiUnit && row.unit_id === null) unassignedContributionCents += parseExactMoneyToCents(row.amount);
    else contributionCents += parseExactMoneyToCents(row.amount);
  }
  const unavailable = (unavailableReason: string): ProfitLossFunding => ({ contributionCents, unassignedContributionCents, remainingBalanceCents: null, unavailableReason });
  let remainingBalanceCents = BigInt(0);
  let unassignedBalanceCents = BigInt(0);
  for (const row of activity) {
    if (!ids.has(row.property_id) || row.event_date >= monthStart) continue;
    const key = `${row.source_type}:${row.source_id}`;
    if (seen.has(key)) throw new Error("Duplicate owner account activity source.");
    seen.add(key);
    if (multiUnit && activityScope === "unit") {
      if (row.unit_id === null) unassignedBalanceCents += parseExactMoneyToCents(row.balance_effect);
      if (row.unit_id !== unitId) continue;
    }
    remainingBalanceCents += parseExactMoneyToCents(row.balance_effect);
  }
  // Property account balances include all units. Never guess an allocation.
  if (multiUnit && (activityScope !== "unit" || unassignedBalanceCents !== BigInt(0) || unassignedContributionCents !== BigInt(0))) return unavailable("Some property account activity is not assigned to a unit. Select all units to include the full owner balance. Unassigned contributions are shown separately and excluded from the unit total.");
  return { contributionCents, remainingBalanceCents };
}

export function profitLossSummaryRows(lines: UnitProfitLossLine[], funding?: ProfitLossFunding, totals?: { income: bigint; expenses: bigint }) {
  const income = totals?.income ?? lines.filter(line => line.direction === "income").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const expenses = totals?.expenses ?? lines.filter(line => line.direction === "expense").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const rows: { label: string; amountCents: bigint | null }[] = [
    { label: "Total income", amountCents: income }, { label: "Total expenses", amountCents: expenses },
    { label: "Net operating income", amountCents: income - expenses },
  ];
  if (funding) rows.push(
    { label: "Owner Contribution", amountCents: funding.contributionCents },
    { label: "Remaining Balance", amountCents: funding.remainingBalanceCents },
    { label: "Net income", amountCents: funding.remainingBalanceCents === null ? null : income - expenses + funding.contributionCents + funding.remainingBalanceCents },
  );
  if (funding?.unassignedContributionCents) rows.splice(4, 0, { label: "Property-level contributions (unassigned)", amountCents: funding.unassignedContributionCents });
  return rows;
}

export function formatProfitLossAmount(cents: bigint | null) {
  if (cents === null) return "Unavailable";
  const magnitude = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}USD ${(magnitude / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
}
