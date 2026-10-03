import { describe, expect, it } from "vitest";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import type { UnitProfitLossLine } from "../reports.types";
import { profitLossSummaryRows } from "./profit-loss-funding";
import { ownerStatementCash } from "./owner-statement-cash";
import { mapOwnerStatementPublicationPayload, type OwnerStatementLine } from "./owner-statement-report";
import { ownerStatementPublicationPayload } from "./owner-statement-report.test-fixture";

const amount = canonicalizeSignedOwnerOpeningAmount;
const source: UnitProfitLossLine = {
  id: "rent", amountCents: BigInt(10000), category: "Rent", categoryCode: "rent",
  categoryId: null, currency: "USD", date: "2026-09-01", description: "Synthetic September rent",
  direction: "income", property: "Synthetic property", unit: "Unit 1", reportingGroup: "income",
};

describe("report reconciliation boundaries (synthetic read models, not posting commands)", () => {
  it("keeps signed operating profit invariant under funding and unavailable opening activity", () => {
    const lines = [source, { ...source, id: "cost", direction: "expense" as const, amountCents: BigInt(4000) },
      { ...source, id: "cost-reversal", direction: "expense" as const, amountCents: BigInt(-1000) }];
    for (const funding of [undefined,
      { contributionCents: BigInt(90000), remainingBalanceCents: BigInt(25000) },
      { contributionCents: BigInt(-90000), remainingBalanceCents: null, unassignedContributionCents: BigInt(50000) }]) {
      const rows = profitLossSummaryRows(lines, funding);
      expect(rows.find(row => row.label === "Net operating income")?.amountCents).toBe(BigInt(7000));
      expect(rows.some(row => row.label === "Net income")).toBe(false);
    }
  });

  it("reconciles held cash while retaining direct-owner income and deposit custody outside held cash", () => {
    const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
    const base = model.lines[0]!;
    const movement = (number: number, sourceType: string, value: string,
      component: OwnerStatementLine["component"] = "ips_held_owner_cash",
      lineKind: OwnerStatementLine["lineKind"] = "movement"): OwnerStatementLine => ({
      ...base, id: `synthetic-${number}`, lineNumber: number, businessDate: "2026-08-15",
      component, lineKind, signedAmount: amount(value),
      sources: [{ ...base.sources[0]!, sourceType, sourceId: `synthetic-source-${number}` }],
    });
    model.lines = [
      movement(1, "tenant_rent_receipt", "100.00"),
      movement(2, "reversal", "-25.00"),
      movement(3, "owner_contribution", "200.00"),
      movement(4, "owner_distribution", "-50.00"),
      movement(5, "owner_direct_rent_receipt", "80.00", null, "activity"),
      movement(6, "security_deposit_receipt", "300.00", "security_deposit_custody"),
      movement(7, "security_deposit_refund", "-100.00", "security_deposit_custody"),
      movement(8, "management_fee_occurrence", "10.00", "owner_due_to_ips"),
    ];
    model.components[0]!.movementAmount = amount("225.00");
    model.components[0]!.closingAmount = amount("1475.00");
    model.components[3]!.movementAmount = amount("200.00");
    model.components[3]!.closingAmount = amount("1000.00");
    const before = structuredClone(model);
    const cash = ownerStatementCash(model);
    expect(cash).toMatchObject({ openingCents: 125000, cashInCents: 30000, cashOutCents: 7500,
      closingCents: 147500, depositCents: 100000 });
    expect(cash.transactions.map(line => line.lineNumber)).toEqual([1, 2, 3, 4]);
    expect(cash.openingCents + cash.cashInCents - cash.cashOutCents).toBe(cash.closingCents);
    expect(ownerStatementCash(model)).toEqual(cash);
    expect(model).toEqual(before);
    // A corrupted projection fails rather than returning a plausible partial total.
    model.lines = model.lines.filter(line => line.lineNumber !== 2);
    expect(() => ownerStatementCash(model)).toThrow("do not reconcile");
  });
});
