import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ProfitLossDetail } from "../components/profit-loss-detail";
import type { TrustedReport, UnitProfitLossLine } from "../reports.types";
import { buildOwnerReportModel, type OwnerReportFact } from "./owner-report-model";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";

// Verified normalized facts are synthetic assumptions here. These tests do not
// prove DB posting, source completeness, authorization, or a deposit-to-invoice
// application path. No source loader or live Cash export is enabled by this file.
const scope = { organizationId: "synthetic-org", propertyIds: ["synthetic-property"], periodStart: "2026-10-01", periodEnd: "2026-10-31" };
const common = { organizationId: scope.organizationId, propertyId: scope.propertyIds[0], unitId: "u1", currency: "USD" as const,
  category: "Rent", description: "Synthetic obligation", obligationId: "rent-obligation", reversalOfSourceKey: null };
const sourceRead = { complete: true, consistency: "verified" as const, fingerprint: "synthetic-facts-only" };
type Fact<K extends OwnerReportFact["kind"]> = OwnerReportFact & { kind: K };
const receipt = (id: string, amount: string, unitId = "u1", receivedOn = "2026-10-05"): Fact<"income_received"> => ({
  ...common, sourceId: id, sourceType: "tenant_invoice_payment_allocation", kind: "income_received", signedAmount: amount,
  unitId, receivedOn, collector: "manager", responsibility: "owner_income" });
const custody = (id: string, amount: string, eventOn = "2026-10-05"): Fact<"custody"> => ({
  ...common, obligationId: "deposit-obligation", sourceId: id, sourceType: "lease_deposit_event", kind: "custody", eventOn, signedAmount: amount });
const charge = (id: string, amount: string, unitId = "u1", recognizedOn = "2026-10-01", direction: "income" | "expense" = "income"): Fact<"recognition"> => ({
  ...common, sourceId: id, sourceType: direction === "income" ? "tenant_invoice_line" : "owner_invoice_line",
  category: direction === "income" ? "Rent" : "Maintenance", kind: "recognition", direction, unitId, recognizedOn, signedAmount: amount });
const settlement = (id: string, amount: string, unitId = "u1"): Fact<"expense_settled"> => ({
  ...common, sourceId: id, sourceType: "owner_payment_allocation", kind: "expense_settled", settledOn: "2026-10-06",
  unitId, signedAmount: amount, sourceOfFunds: "owner_payment", category: "Maintenance" });
const funding = (id: string, amount: string, unitId: string | null = "u1"): Fact<"funding"> => ({
  ...common, obligationId: "owner-funding", sourceId: id, sourceType: "owner_cash_event", kind: "funding", eventOn: "2026-10-07", signedAmount: amount, unitId });
function project(facts: readonly OwnerReportFact[], basis: "cash" | "accrual" = "cash", unitId?: string, month = "2026-10") {
  const [year, number] = month.split("-").map(Number);
  return buildOwnerReportModel({ facts, basis, sourceRead, scope: { ...scope, unitId,
    periodStart: `${month}-01`, periodEnd: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) } });
}

describe("synthetic owner-report acceptance boundaries", () => {
  it("does not turn deposit application into income without separately supplied canonical settlement evidence", () => {
    const deposit = custody("received", "200.00", "2026-08-01");
    const applied = custody("applied", "-100.03");
    const earned = charge("recognized-rent", "100.03", "u1", "2026-09-01");
    expect(project([deposit, applied, earned]).incomeCents).toBe(BigInt(0));
    // Conditional normalization contract: if the source layer independently
    // verifies an invoice settlement for the application, it is income once.
    const suppliedSettlement = receipt("verified-application-allocation", "100.03");
    const facts = [deposit, applied, earned, suppliedSettlement];
    const cash = project(facts);
    expect(cash.incomeCents).toBe(BigInt(10003));
    expect(cash.lines.map(line => line.sourceKey)).toEqual(["tenant_invoice_payment_allocation:verified-application-allocation"]);
    expect(project(facts, "accrual", undefined, "2026-09").incomeCents).toBe(BigInt(10003));
    expect(project(facts, "accrual").incomeCents).toBe(BigInt(0));
    expect(() => project([suppliedSettlement, { ...suppliedSettlement, sourceId: "receipt-projection", sourceType: "finance_receipt_allocation" }])).toThrow("canonical invoice settlement");
  });
  it("preserves deposit/application correction dates and signed conservation without rewriting history", () => {
    const initial = receipt("initial-application", "100.03");
    const reversed: OwnerReportFact = { ...receipt("reverse-application", "-100.03", "u1", "2026-11-03"), reversalOfSourceKey: "tenant_invoice_payment_allocation:initial-application" };
    const replacement = receipt("replacement-application", "80.01", "u1", "2026-11-03");
    const facts = [custody("received", "200.00", "2026-08-01"), custody("applied", "-100.03"), initial,
      { ...custody("application-reversed", "100.03", "2026-11-03"), reversalOfSourceKey: "lease_deposit_event:applied" },
      custody("replacement-applied", "-80.01", "2026-11-03"), reversed, replacement];
    const before = structuredClone(facts);
    const october = project(facts);
    const november = project(facts, "cash", undefined, "2026-11");
    expect(october.incomeCents).toBe(BigInt(10003));
    expect(november.incomeCents).toBe(BigInt(-2002));
    expect(october.incomeCents! + november.incomeCents!).toBe(BigInt(8001));
    expect(november.activity.filter(fact => fact.kind === "custody")).toHaveLength(2);
    expect(facts).toEqual(before);
  });
  it("keeps owner funding and owner-direct partial receipt corrections separate", () => {
    const direct: OwnerReportFact = { ...receipt("direct", "123.45"), sourceType: "owner_collection_allocation", collector: "owner" };
    const correction: OwnerReportFact = { ...direct, sourceId: "direct-reverse", receivedOn: "2026-10-08", signedAmount: "-0.02", reversalOfSourceKey: "owner_collection_allocation:direct" };
    const model = project([direct, correction, funding("contribution", "250.01"),
      { ...funding("contribution-reverse", "-250.01"), reversalOfSourceKey: "owner_cash_event:contribution" }]);
    expect(model.incomeCents).toBe(BigInt(12343));
    expect(model.netOperatingIncomeCents).toBe(BigInt(12343));
    expect(model.lines).toHaveLength(2);
    expect(model.activity).toHaveLength(4);
    expect(model).not.toHaveProperty("heldCashCents");
  });
  it("conserves assigned unit totals and leaves property-level funding outside profit", () => {
    const direct: OwnerReportFact = { ...receipt("u2-direct", "200.07", "u2"), sourceType: "owner_collection_allocation", collector: "owner" };
    const facts = [receipt("u1-income", "100.03"), direct, settlement("u1-expense", "10.02"), settlement("u2-expense", "20.05", "u2"),
      funding("u1-funding", "999.99"), funding("u2-funding", "111.11", "u2"), funding("property-funding", "500.01", null)];
    const property = project(facts);
    const first = project(facts, "cash", "u1");
    const second = project(facts, "cash", "u2");
    expect(property.incomeCents).toBe(BigInt(30010));
    expect(property.expenseCents).toBe(BigInt(3007));
    expect(first.incomeCents! + second.incomeCents!).toBe(property.incomeCents);
    expect(first.expenseCents! + second.expenseCents!).toBe(property.expenseCents);
    expect(first.netOperatingIncomeCents! + second.netOperatingIncomeCents!).toBe(BigInt(27003));
    expect(first.unassigned.map(fact => fact.sourceId)).toEqual(["property-funding"]);
    expect(first.coverageIssues).toEqual([]);
    const withUnassignedCost = project([...facts, { ...settlement("property-expense", "3.01"), unitId: null }], "cash", "u1");
    expect(withUnassignedCost.incomeCents).toBe(first.incomeCents);
    expect(withUnassignedCost.expenseCents).toBeNull();
    expect(withUnassignedCost.netOperatingIncomeCents).toBeNull();
    expect(withUnassignedCost.unassigned.map(fact => fact.sourceId)).toEqual(["property-funding", "property-expense"]);
  });
  it("preserves unit reassignment correction lineage with no property-level duplicate income", () => {
    const original = receipt("old-unit", "100.03");
    const reversal: OwnerReportFact = { ...receipt("old-unit-reversal", "-100.03"), reversalOfSourceKey: "tenant_invoice_payment_allocation:old-unit" };
    const replacement = receipt("new-unit", "100.03", "u2");
    const facts = [original, reversal, replacement];
    expect(project(facts).incomeCents).toBe(BigInt(10003));
    expect(project(facts, "cash", "u1").incomeCents).toBe(BigInt(0));
    expect(project(facts, "cash", "u2").incomeCents).toBe(BigInt(10003));
    expect(project(facts).lines.find(line => line.sourceKey.endsWith(":old-unit-reversal"))?.reversalOfSourceKey).toBe("tenant_invoice_payment_allocation:old-unit");
  });
  it("keeps the 80 cost / 100 owner charge / 20 markup interpretation unresolved", () => {
    const marker: OwnerReportFact = { ...common, sourceId: "ips-funded", sourceType: "expense_responsibility", kind: "manager_funded_cost",
      vendorPaidOn: "2026-10-02", vendorCost: "80.00", ownerChargeRecognizedOn: "2026-10-02", ownerCharge: "100.00", markup: "20.00",
      ownerSettlements: [{ settledOn: "2026-10-06", amount: "100.00", sourceKey: "owner_payment_allocation:owner-settled" }], sourceOfFunds: "unclassified" };
    const facts = [receipt("rent", "100.00"), charge("earned", "100.00"), charge("owner-charge", "100.00", "u1", "2026-10-02", "expense"), settlement("owner-settled", "100.00"), marker];
    const cash = project(facts);
    expect(cash.incomeCents).toBe(BigInt(10000));
    expect(cash.expenseCents).toBeNull();
    expect(cash.netOperatingIncomeCents).toBeNull();
    expect(cash.coverageIssues).toMatchObject([{ code: "manager_funded_cost_mapping_unresolved" }]);
    expect(project(facts, "accrual").expenseCents).toBe(BigInt(10000));
    expect(project(facts, "accrual").netOperatingIncomeCents).toBe(BigInt(0));
  });
  it("keeps assigned-unit Accrual cents identical in actual UI/PDF/Excel renderers", () => {
    const facts = [charge("u1-rent", "100.03"), charge("u2-rent", "200.07", "u2"), charge("u1-cost", "10.02", "u1", "2026-10-01", "expense"),
      funding("owner-funding", "250.01"), custody("deposit-applied", "-100.03"), receipt("application-evidence", "100.03")];
    const model = project(facts, "accrual", "u1");
    const lines: UnitProfitLossLine[] = model.lines.map(item => ({ id: item.sourceKey, direction: item.direction, amountCents: item.signedAmountCents,
      category: item.category, categoryCode: item.direction === "income" ? "rent" : "maintenance", categoryId: null,
      reportingGroup: item.direction === "income" ? "rent" : "maintenance", currency: "USD", date: item.date,
      description: "Synthetic recognized transaction", property: "Synthetic property", unit: "Unit one" }));
    const report: TrustedReport = { kind: "unit-profit-loss", title: "Profit and loss", description: "Synthetic Accrual report", emptyTitle: "None", emptyDescription: "None",
      exportFilenameBase: "synthetic", generatedAt: "2026-10-03T00:00:00Z", periodLabel: "01 Oct 2026 - 31 Oct 2026", scopeLabel: "Unit one",
      columns: [], rows: [], summary: [], totalsTraceLabel: "Synthetic source", unitProfitLossLines: lines,
      unitProfitLossFunding: { contributionCents: BigInt(25001), remainingBalanceCents: BigInt(0) } };
    const html = renderToStaticMarkup(createElement(ProfitLossDetail, { lines, funding: report.unitProfitLossFunding }));
    const pdf = Buffer.from(buildTrustedReportPdf({ report, organizationName: "Synthetic company" })).toString("latin1");
    const sheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    for (const text of [html, pdf]) for (const amount of ["USD 100.03", "USD 10.02", "USD 90.01", "USD 250.01"]) expect(text).toContain(amount);
    for (const amount of ["100.03", "10.02", "90.01", "250.01"]) expect(sheet).toContain(`<v>${amount}</v>`);
    for (const [label, value] of [["Income subtotal", "100.03"], ["Expenses subtotal", "10.02"]]) {
      const start = pdf.indexOf(`(${label})`);
      expect(start).toBeGreaterThan(-1);
      expect(pdf.slice(start, start + 300)).toContain(`(USD ${value})`);
    }
    for (const [label, value] of [["Total Income", "100.03"], ["Total Expenses", "10.02"], ["Net operating income", "90.01"]]) {
      const row = sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g)?.find(item => item.includes(`>${label}</t>`));
      expect(row).toContain(`<v>${value}</v>`);
    }
    for (const text of [html, pdf, sheet]) expect(text).not.toContain("200.07");
    expect(pdf).toContain("Accrual basis");
    expect(sheet).toContain("Accrual basis");
  });
});
