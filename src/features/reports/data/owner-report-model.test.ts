import { describe, expect, it } from "vitest";
import { buildOwnerReportModel, parseOwnerReportBasis, type OwnerReportFact } from "./owner-report-model";

const source = { sourceType: "tenant_invoice_line", sourceId: "rent-charge", organizationId: "org", propertyId: "p1", unitId: "u1",
  currency: "USD" as const, category: "Custom rent", description: "Synthetic rent", obligationId: "rent", reversalOfSourceKey: null };
const rent: OwnerReportFact = { ...source, kind: "recognition", direction: "income", recognizedOn: "2026-09-01", signedAmount: "100.00" };
const receipt: OwnerReportFact = { ...source, kind: "income_received", sourceType: "tenant_invoice_payment_allocation", sourceId: "receipt",
  receivedOn: "2026-10-01", signedAmount: "100.00", collector: "manager", responsibility: "owner_income" };
const fee: OwnerReportFact = { ...source, kind: "recognition", sourceType: "management_fee_occurrence", sourceId: "fee-charge",
  direction: "expense", recognizedOn: "2026-09-01", signedAmount: "10.00", obligationId: "fee" };
const feePaid: OwnerReportFact = { ...source, kind: "fee_settled", sourceType: "owner_charge_cash_allocation", sourceId: "fee-payment",
  settledOn: "2026-10-02", signedAmount: "10.00", sourceOfFunds: "held_owner_cash", obligationId: "fee" };
const funded: OwnerReportFact = { ...source, kind: "manager_funded_cost", sourceType: "expense_responsibility", sourceId: "advance",
  vendorPaidOn: "2026-09-10", vendorCost: "80.00", ownerChargeRecognizedOn: "2026-09-10", ownerCharge: "100.00", markup: "20.00",
  ownerSettlements: [{ settledOn: "2026-10-10", amount: "100.00", sourceKey: "owner_payment_allocation:cost-payment" }], sourceOfFunds: "unclassified" };
const sourceRead = { complete: true, consistency: "verified" as const, fingerprint: "synthetic-complete-input" };
function report(facts: readonly OwnerReportFact[], basis: "cash" | "accrual" = "cash", month = "2026-10", propertyIds = ["p1"]) {
  const [year, number] = month.split("-").map(Number);
  const periodEnd = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return buildOwnerReportModel({ basis, facts, sourceRead, scope: { organizationId: "org", propertyIds, periodStart: `${month}-01`, periodEnd } });
}

describe("canonical owner report basis model (synthetic inputs, not live posting)", () => {
  it("defaults its explicit basis parser to Cash and rejects unknown values", () => {
    expect(parseOwnerReportBasis()).toBe("cash");
    expect(parseOwnerReportBasis("accrual")).toBe("accrual");
    expect(() => parseOwnerReportBasis("bank")).toThrow("Unsupported");
  });
  it("separates September recognition from October receipt and fee settlement", () => {
    const facts = [rent, receipt, fee, feePaid];
    const september = buildOwnerReportModel({ basis: "accrual", facts, sourceRead,
      scope: { organizationId: "org", propertyIds: ["p1"], periodStart: "2026-09-01", periodEnd: "2026-09-30" } });
    expect(september.netOperatingIncomeCents).toBe(BigInt(9000));
    expect(september.lines.map(line => line.sourceKey)).toEqual(["management_fee_occurrence:fee-charge", "tenant_invoice_line:rent-charge"]);
    expect(report(facts).netOperatingIncomeCents).toBe(BigInt(9000));
    expect(report(facts, "accrual").netOperatingIncomeCents).toBe(BigInt(0));
  });
  it("retains direct-owner income and collection evidence in activity", () => {
    const direct: OwnerReportFact = { ...receipt, sourceType: "owner_collection_allocation", sourceId: "direct", collector: "owner" };
    const model = report([direct]);
    expect(model.incomeCents).toBe(BigInt(10000));
    expect(model.activity).toEqual([direct]);
    // Held cash is a separate component projection, never inferred from income.
    expect(model).not.toHaveProperty("heldCashCents");
  });
  it("counts partial fee settlements and signed reversals once, not the fee charge", () => {
    const second = { ...feePaid, sourceId: "part-2", signedAmount: "4.00" };
    const reversal = { ...feePaid, sourceId: "reverse", signedAmount: "-3.00", reversalOfSourceKey: "owner_charge_cash_allocation:fee-payment" };
    const model = report([{ ...feePaid, signedAmount: "6.00" }, second, reversal, fee]);
    expect(model.expenseCents).toBe(BigInt(700));
    expect(model.lines).toHaveLength(3);
    expect(model.lines.find(line => line.sourceKey.endsWith(":reverse"))?.reversalOfSourceKey).toBe(reversal.reversalOfSourceKey);
  });
  it("keeps a verified owner-paid expense settlement distinct from vendor cost and recognition", () => {
    const charge: OwnerReportFact = { ...fee, sourceId: "cost-charge", sourceType: "owner_invoice_line", signedAmount: "100.00" };
    const paid: OwnerReportFact = { ...feePaid, kind: "expense_settled", sourceId: "cost-paid", sourceType: "owner_payment_allocation",
      signedAmount: "100.00", sourceOfFunds: "owner_payment" };
    expect(report([charge, paid]).expenseCents).toBe(BigInt(10000));
    expect(report([charge, paid]).lines[0]?.sourceKey).toBe("owner_payment_allocation:cost-paid");
    expect(() => report([{ ...paid, sourceOfFunds: "held_owner_cash" }])).toThrow("funding evidence");
    expect(() => report([{ ...receipt, collector: "owner" }])).toThrow("collector evidence");
  });
  it("keeps funding, distributions, custody and transfers outside both profit bases", () => {
    const activity = (["funding", "distribution", "custody", "transfer"] as const).map(kind => ({ ...source, kind,
      sourceType: kind, sourceId: kind, eventOn: "2026-10-03", signedAmount: "250.00" }));
    for (const basis of ["cash", "accrual"] as const) {
      const model = report(activity, basis);
      expect(model.netOperatingIncomeCents).toBe(BigInt(0));
      expect(model.activity).toHaveLength(4);
    }
  });
  it("does not count tenant-responsibility recovery as owner cash income", () => {
    expect(report([{ ...receipt, responsibility: "tenant_recovery" }]).incomeCents).toBe(BigInt(0));
  });
  it("isolates ambiguous funded costs while preserving every financial datum and verified income", () => {
    const facts = [receipt, feePaid, funded];
    const before = structuredClone(facts);
    const model = report(facts);
    expect(model.incomeCents).toBe(BigInt(10000));
    expect(model.expenseCents).toBeNull();
    expect(model.netOperatingIncomeCents).toBeNull();
    expect(model.lines).toHaveLength(2);
    expect(model.coverageIssues).toMatchObject([{ sourceKey: "expense_responsibility:advance", affects: "expenses" }]);
    expect(model.activity).toContainEqual(funded);
    expect(facts).toEqual(before);
    expect(report(facts, "accrual").coverageIssues).toEqual([]);
  });
  it("does not block a different property or an unaffected later period", () => {
    expect(report([receipt], "cash", "2026-10", ["p1", "p2"]).netOperatingIncomeCents).toBe(BigInt(10000));
    expect(report([funded], "cash", "2026-12").coverageIssues).toEqual([]);
    const other = { ...receipt, propertyId: "p2" };
    expect(report([other], "cash", "2026-10", ["p2"]).coverageIssues).toEqual([]);
  });
  it("refuses incomplete or unverified source reads instead of reporting partial totals", () => {
    for (const read of [{ ...sourceRead, complete: false }, { ...sourceRead, consistency: "unverified" as const }]) {
      const model = buildOwnerReportModel({ basis: "cash", facts: [receipt], sourceRead: read,
        scope: { organizationId: "org", propertyIds: ["p1"], periodStart: "2026-10-01", periodEnd: "2026-10-31" } });
      expect(model.lines).toHaveLength(1);
      expect(model.incomeCents).toBeNull();
      expect(model.expenseCents).toBeNull();
      expect(model.netOperatingIncomeCents).toBeNull();
    }
  });
  it("rejects cross-scope, duplicate, invalid date and duplicate receipt-layer inputs", () => {
    expect(() => report([{ ...receipt, organizationId: "other" }])).toThrow("scope mismatch");
    expect(() => report([{ ...receipt, propertyId: "other" }])).toThrow("scope mismatch");
    expect(() => report([receipt, receipt])).toThrow("Duplicate");
    expect(() => report([{ ...receipt, receivedOn: "2026-02-30" }])).toThrow("date");
    expect(() => report([{ ...receipt, sourceType: "finance_receipt_allocation" }])).toThrow("canonical invoice settlement");
  });
  it("separates section source coverage from unresolved expense interpretation", () => {
    const model = buildOwnerReportModel({ basis: "cash", facts: [receipt, feePaid],
      sourceRead: { ...sourceRead, complete: false, sections: { income: "complete", expenses: "unverified" } },
      scope: { organizationId: "org", propertyIds: ["p1"], periodStart: "2026-10-01", periodEnd: "2026-10-31" } });
    expect(model.incomeCents).toBe(BigInt(10000));
    expect(model.expenseCents).toBeNull();
    expect(model.netOperatingIncomeCents).toBeNull();
    expect(model.coverageIssues[0]?.code).toBe("source_incomplete");
    expect(report([receipt, funded]).coverageIssues[0]?.code).toBe("manager_funded_cost_mapping_unresolved");
  });
  it("applies a selected unit to every fact and keeps property-level activity unassigned", () => {
    const propertyCost: OwnerReportFact = { ...feePaid, sourceId: "unassigned-cost", unitId: null };
    const otherUnit = { ...receipt, sourceId: "other-unit", unitId: "u2" };
    const model = buildOwnerReportModel({ basis: "cash", facts: [receipt, propertyCost, otherUnit], sourceRead,
      scope: { organizationId: "org", propertyIds: ["p1"], unitId: "u1", periodStart: "2026-10-01", periodEnd: "2026-10-31" } });
    expect(model.lines.map(item => item.sourceKey)).toEqual(["tenant_invoice_payment_allocation:receipt"]);
    expect(model.unassigned).toEqual([propertyCost]);
    expect(model.activity).toEqual([receipt]);
    expect(model.incomeCents).toBe(BigInt(10000));
    expect(model.expenseCents).toBeNull();
    expect(model.coverageIssues).toMatchObject([{ code: "unit_attribution_unavailable", affects: "expenses" }]);
    expect(report([propertyCost]).expenseCents).toBe(BigInt(1000));
  });
  it("preserves 80 vendor cost/100 owner charge without adding 180 or counting 200", () => {
    const charge: OwnerReportFact = { ...fee, sourceType: "owner_invoice_line", sourceId: "cost100", signedAmount: "100.00" };
    const paid: OwnerReportFact = { ...feePaid, kind: "expense_settled", sourceType: "owner_payment_allocation", sourceId: "paid100",
      sourceOfFunds: "owner_payment", signedAmount: "100.00" };
    const activity: OwnerReportFact = { ...source, kind: "vendor_payment", sourceType: "vendor_payment", sourceId: "vendor80", eventOn: "2026-10-10", signedAmount: "80.00" };
    expect(report([charge, paid, activity]).expenseCents).toBe(BigInt(10000));
    expect(report([charge, paid, funded, activity]).expenseCents).toBeNull();
    expect(report([charge, paid, funded, activity], "accrual", "2026-09").expenseCents).toBe(BigInt(10000));
  });
  it("keeps deposit receipts, refunds and applications and funding reversals outside operating profit", () => {
    const activity: OwnerReportFact[] = [
      { ...source, kind: "custody", sourceType: "lease_deposit_event", sourceId: "deposit-received", eventOn: "2026-10-01", signedAmount: "500.00" },
      { ...source, kind: "custody", sourceType: "lease_deposit_event", sourceId: "deposit-refunded", eventOn: "2026-10-02", signedAmount: "-400.00" },
      { ...source, kind: "custody", sourceType: "lease_deposit_event", sourceId: "deposit-applied", eventOn: "2026-10-03", signedAmount: "-100.00" },
      { ...source, kind: "funding", sourceType: "owner_cash_event", sourceId: "contribution", eventOn: "2026-10-01", signedAmount: "250.01" },
      { ...source, kind: "funding", sourceType: "owner_cash_event", sourceId: "contribution-reversal", eventOn: "2026-10-02", signedAmount: "-250.01", reversalOfSourceKey: "owner_cash_event:contribution" },
    ];
    // A custody application alone proves no invoice-income settlement. The actual
    // application-to-invoice posting workflow remains a DB acceptance requirement.
    for (const basis of ["cash", "accrual"] as const) {
      const model = report(activity, basis);
      expect(model.incomeCents).toBe(BigInt(0));
      expect(model.expenseCents).toBe(BigInt(0));
      expect(model.activity).toHaveLength(5);
      expect(model.lines).toEqual([]);
    }
  });
  it("preserves direct-owner partial receipts and reversal cents without management-held cash inference", () => {
    const direct: OwnerReportFact = { ...receipt, sourceType: "owner_collection_allocation", collector: "owner", sourceId: "owner-partial", signedAmount: "99.99" };
    const reversal: OwnerReportFact = { ...direct, sourceId: "owner-reversal", signedAmount: "-0.03", reversalOfSourceKey: "owner_collection_allocation:owner-partial" };
    const model = report([direct, reversal, { ...receipt, sourceId: "manager-partial", signedAmount: "0.07" }]);
    expect(model.incomeCents).toBe(BigInt(10003));
    expect(model.lines).toHaveLength(3);
    expect(model).not.toHaveProperty("heldCashCents");
    expect(report([direct, reversal], "accrual").incomeCents).toBe(BigInt(0));
  });
  it("keeps unverified ordinary-role custody coverage separate from verified operating sources", () => {
    const model = buildOwnerReportModel({ basis: "cash", facts: [receipt, feePaid],
      sourceRead: { ...sourceRead, complete: false, sections: { income: "complete", expenses: "complete", activity: "unverified" } },
      scope: { organizationId: "org", propertyIds: ["p1"], periodStart: "2026-10-01", periodEnd: "2026-10-31" } });
    expect(model.incomeCents).toBe(BigInt(10000));
    expect(model.netOperatingIncomeCents).toBe(BigInt(9000));
    expect(model.activityCoverage).toBe("unverified");
    // This is a model contract, not proof that the actual DB loader can certify
    // ordinary-role fee or deposit root sets under the current RLS policies.
  });
  it("rejects projected receipt recognition and ambiguous multi-property unit scope", () => {
    expect(() => report([{ ...rent, sourceType: "finance_receipt_allocation" }], "accrual", "2026-09")).toThrow("canonical obligation");
    expect(() => report([{ ...rent, direction: "expense" }], "accrual", "2026-09")).toThrow("canonical obligation");
    expect(() => buildOwnerReportModel({ basis: "cash", facts: [], sourceRead,
      scope: { organizationId: "org", propertyIds: ["p1", "p2"], unitId: "u1", periodStart: "2026-10-01", periodEnd: "2026-10-31" } })).toThrow("scope");
  });
});
