import { describe, expect, it } from "vitest";
import { buildProfitLossFunding, profitLossSummaryRows } from "./profit-loss-funding";

const scope = { propertyIds: ["p1"], unitId: "u1", units: [{ id: "u1", property_id: "p1" }], monthStart: "2026-08-01" };
const cash = [{ id: "c1", property_id: "p1", unit_id: "u1", event_date: "2026-08-02", amount: "682.00" }];
const expense = { property_id: "p1", unit_id: "u1", event_date: "2026-08-01", category: "owner_expense", balance_effect: "-775.00", source_type: "ips_expense_responsibility", source_id: "e1" };

describe("P&L owner funding", () => {
  it("matches the Bellavita template using known complete recorded activity", () => {
    const funding = buildProfitLossFunding({ ...scope, cash, activity: [] });
    expect(profitLossSummaryRows([], funding, { income: BigInt(0), expenses: BigInt(77500) }).map(row => [row.label, row.amountCents])).toEqual([
      ["Total income", BigInt(0)], ["Total expenses", BigInt(77500)], ["Net operating income", BigInt(-77500)],
      ["Owner Contribution", BigInt(68200)], ["Remaining Balance", BigInt(0)], ["Net income", BigInt(-9300)],
    ]);
  });
  it("carries previous activity once and preserves contribution reversal signs", () => {
    const funding = buildProfitLossFunding({ ...scope, monthStart: "2026-09-01", cash: cash.map(row => ({ ...row, event_date: "2026-09-19" })).flatMap(row => [row, { ...row, id: "c2", amount: "-682.00" }]), activity: [expense, { ...expense, source_type: "owner_contribution", source_id: "c1", balance_effect: "682.00" }] });
    expect(funding.contributionCents).toBe(BigInt(0));
    expect(funding.remainingBalanceCents).toBe(BigInt(-9300));
    expect(profitLossSummaryRows([], funding, { income: BigInt(48333), expenses: BigInt(88833) }).at(-1)?.amountCents).toBe(BigInt(-49800));
  });
  it("reproduces Pilot's property-level 907 funding and minus 93 carried balance", () => {
    const activity = [expense, { ...expense, source_id: "e2", unit_id: "u2", balance_effect: "-225.00" }, { ...expense, unit_id: null, source_type: "owner_contribution", source_id: "c1", balance_effect: "682.00" }, { ...expense, unit_id: null, source_type: "owner_contribution", source_id: "c2", balance_effect: "225.00" }];
    const funding = buildProfitLossFunding({ ...scope, unitId: "all", monthStart: "2026-09-01", cash: [], activity });
    expect(funding.remainingBalanceCents).toBe(BigInt(-9300));
    expect(profitLossSummaryRows([], funding, { income: BigInt(75333), expenses: BigInt(40000) }).at(-1)?.amountCents).toBe(BigInt(26033));
  });
  it("does not allocate Pilot's unassigned property contributions to either unit", () => {
    const funding = buildProfitLossFunding({ ...scope, units: [...scope.units, { id: "u2", property_id: "p1" }], cash: [{ ...cash[0], unit_id: null }, { ...cash[0], id: "c2", unit_id: null, amount: "225.00" }], activity: [] });
    expect(funding.contributionCents).toBe(BigInt(0));
    expect(funding.unassignedContributionCents).toBe(BigInt(90700));
    expect(funding.remainingBalanceCents).toBeNull();
    expect(funding.unavailableReason).toMatch(/property.*multiple units/i);
    expect(profitLossSummaryRows([], funding).at(-1)?.amountCents).toBeNull();
  });
  it("filters another property and rejects duplicate source identities", () => {
    const funding = buildProfitLossFunding({ ...scope, cash: [...cash, { ...cash[0], id: "other", property_id: "p2" }], activity: [] });
    expect(funding.contributionCents).toBe(BigInt(68200));
    expect(() => buildProfitLossFunding({ ...scope, cash: [...cash, ...cash], activity: [] })).toThrow(/duplicate/i);
    expect(() => buildProfitLossFunding({ ...scope, monthStart: "2026-09-01", cash: [], activity: [expense, expense] })).toThrow(/duplicate/i);
  });
});
