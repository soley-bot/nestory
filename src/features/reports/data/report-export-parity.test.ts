import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildTrustedReportXlsx, buildOwnerStatementXlsx } from "./excel";
import { buildTrustedReportPdf, buildOwnerStatementPdf } from "./pdf";
import { ownerStatementCash } from "./owner-statement-cash";
import { mapOwnerStatementPublicationPayload } from "./owner-statement-report";
import { ownerStatementPublicationPayload } from "./owner-statement-report.test-fixture";
import type { TrustedReport } from "../reports.types";

const events = [
  ["Rent", 700, "income", "Monthly rental"],
  ["Management Fees", 70, "expense", "IPS Management Fees in Aug 2026"],
  ["Repairs", 300, "expense", "Installing water booster pump"],
  ["Repairs", 15, "expense", "Change AC wing"],
  ["Repairs", 45, "expense", "Repair water heater & clean"],
  ["Repairs", 25, "expense", "Checking water heater & Purchase pipe"],
  ["Repairs", 18, "expense", "Purchase 2 Power point & cover and service"],
  ["Cleaning", 30, "expense", "Salary cleaning in Jul 2026"],
  ["Other Expenses", 65, "expense", "Pay for sewage and septic tank pumping"],
] as const;
const report: TrustedReport = {
  kind: "unit-profit-loss", title: "Monthly Unit Profit & Loss", scopeLabel: "Xavier St.65",
  periodLabel: "01 Aug 2026 - 31 Aug 2026", generatedAt: "2026-09-01T00:00:00.000Z",
  description: "Recognized owner income and expenses", emptyDescription: "No activity", emptyTitle: "No activity",
  exportFilenameBase: "unit-profit-loss", columns: [], rows: [],
  summary: [
    { label: "Income", value: "USD 700.00", detail: "", sourceCount: 1 },
    { label: "Expenses", value: "USD 568.00", detail: "", sourceCount: 8 },
    { label: "Net income", value: "USD 132.00", detail: "", sourceCount: 9 },
  ],
  totalsTraceLabel: "Illustrative export using nine August transactions from the supplied Xavier workbook.",
  unitProfitLossLines: events.map(([category, amount, direction, description], index) => ({
    id: `demo-${index}`, amountCents: BigInt(amount * 100), category, categoryCode: category,
    categoryId: null, currency: "USD", date: index === 0 ? "2026-08-01" : "2026-08-02",
    description, direction, property: "Xavier St.65",
    reportingGroup: direction, unit: "Xavier St.65",
  })),
};

function cashFixture() {
  const payload = JSON.parse(JSON.stringify(ownerStatementPublicationPayload));
  payload.generated_at = "2026-09-01T00:00:00.000Z";
  payload.components[0] = { component: "ips_held_owner_cash", opening_amount: "1250.00", movement_amount: "132.00", closing_amount: "1382.00" };
  payload.lines = events.map(([, amount, direction, description], index) => ({
    ...payload.lines[0], id: `40000000-0000-0000-0000-${String(index + 10).padStart(12, "0")}`,
    line_number: index + 1, business_date: index === 0 ? "2026-08-01" : "2026-08-02",
    line_kind: "movement", signed_amount: `${direction === "expense" ? "-" : ""}${amount}.00`,
    description, sources: [{ ...payload.lines[0].sources[0], source_type: index === 0 ? "tenant_rent_receipt" : index === 1 ? "management_fee_occurrence" : "owner_invoice_payment" }],
  }));
  return mapOwnerStatementPublicationPayload(payload);
}

describe("PDF and XLSX accounting presentation", () => {
  it("omits internal source appendices even when P&L rows have audit links", () => {
    const withSources = { ...report, rows: [{ id: "internal-row", title: "Internal row", cells: {}, sourceCount: 1, sourceLinks: [{ id: "40000000-0000-0000-0000-000000000099", label: "Internal event", recordType: "property", href: "/internal/source" }] }] } as TrustedReport;
    const pdf = Buffer.from(buildTrustedReportPdf({ organizationName: "IPS", report: withSources })).toString("latin1");
    expect(pdf).not.toContain("SOURCE TRACE");
    expect(pdf).not.toContain("40000000-0000-0000-0000-000000000099");
    expect(pdf).not.toContain("/internal/source");
    expect(pdf).not.toContain(report.generatedAt);
    expect(pdf).toContain("USD 132.00");
  });
  it("uses owner-friendly generated descriptions and calendar dates", () => {
    const model = cashFixture();
    model.lines[0]!.description = "Rent collected by Nestory | ips_held_owner_cash";
    model.lines[1]!.description = "Owner invoice payment \u00b7 ips_held_owner_cash";
    const cash = ownerStatementCash(model);
    expect(cash.transactions[0]!.details).toBe("Rent received");
    expect(cash.transactions[1]!.details).toBe("Property expense paid");
    const pdf = Buffer.from(buildOwnerStatementPdf(model, { organizationName: "IPS", ownerName: "Owner", propertyLabel: "Property" })).toString("latin1");
    expect(pdf).toContain("01 Aug 2026");
    expect(pdf).not.toContain("2026-08-01");
    expect(pdf).not.toContain("ips_held_owner_cash");
    expect(pdf).not.toContain(model.statementNumber);
    expect(pdf).not.toContain("Owner Account");
  });

  it("keeps the end of long descriptions across PDF continuation pages", () => {
    const description = `${"Detailed maintenance work and itemized materials. ".repeat(150)} END-OF-DETAIL`;
    const detailed = { ...report, unitProfitLossLines: [{ ...report.unitProfitLossLines![0]!, description }] };
    const pdf = Buffer.from(buildTrustedReportPdf({ organizationName: "IPS", report: detailed })).toString("latin1");
    expect(pdf).toContain("END-OF-DETAIL");
    const model = cashFixture();
    model.lines[0]!.description = description;
    const statement = Buffer.from(buildOwnerStatementPdf(model, { organizationName: "IPS", ownerName: "Owner", propertyLabel: "Property" })).toString("latin1");
    expect(statement).toContain("END-OF-DETAIL");
    expect(statement).toContain("Balance brought forward");
    expect(statement).not.toContain("Owner cash available");
  });
  it("preserves August scope, original descriptions, and 700 / 568 / 132 totals", () => {
    const pdf = buildTrustedReportPdf({ organizationName: "Illustrative Property Services", report });
    const xlsx = buildTrustedReportXlsx(report, { organizationName: "Illustrative Property Services" });
    const text = Buffer.from(pdf).toString("latin1");
    const sheet = strFromU8(unzipSync(xlsx)["xl/worksheets/sheet1.xml"]!);
    for (const total of ["700.00", "568.00", "132.00"]) {
      expect(text).toContain(total);
      expect(sheet).toContain(`<v>${total}</v>`);
    }
    for (const detail of ["Xavier St.65", "Installing water booster pump", "01 Aug 2026 - 31 Aug 2026"]) {
      expect(text).toContain(detail);
      expect(sheet).toContain(detail);
    }
    expect(text).not.toContain("Cash basis");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("Illustrative Property Services");
    expect(sheet).not.toContain("Scope summary");
    expect(sheet).toContain('s="5"><v>46235</v>');
    savePreview("profit-loss-august", pdf, xlsx);
  });

  it("reconciles every running cash balance and excludes separate deposits exactly once", () => {
    const model = cashFixture();
    const cash = ownerStatementCash(model);
    expect(cash).toMatchObject({ openingCents: 125000, cashInCents: 70000, cashOutCents: 56800, closingCents: 138200, depositCents: 80000 });
    expect(cash.transactions.map((line) => line.balanceCents)).toEqual([195000, 188000, 158000, 156500, 152000, 149500, 147700, 144700, 138200]);
    expect(cash.transactions[0]?.details).toBe("Monthly rental");
    const identity = { organizationName: "Illustrative Property Services", ownerName: "Xavier Tissieres", propertyLabel: "Xavier St.65" };
    const pdf = buildOwnerStatementPdf(model, identity);
    const xlsx = buildOwnerStatementXlsx(model, identity);
    const text = Buffer.from(pdf).toString("latin1");
    const sheet = strFromU8(unzipSync(xlsx)["xl/worksheets/sheet1.xml"]!);
    expect(text).toContain("$1,382.00");
    expect(text).toContain("$800.00");
    expect(text).toContain("Monthly rental");
    expect(sheet).toContain("Xavier");
    expect(sheet).toContain("<v>1382.00</v>");
    expect(sheet).not.toContain(model.ownerPersonId);
    savePreview("owner-statement-august", pdf, xlsx);
  });

  it("rejects cash transactions that cannot reconcile to the frozen closing balance", () => {
    const model = cashFixture();
    model.lines.pop();
    expect(() => buildOwnerStatementXlsx(model)).toThrow("do not reconcile");
    expect(() => buildOwnerStatementPdf(model, { organizationName: "IPS", ownerName: "Owner", propertyLabel: "Property" })).toThrow("do not reconcile");
  });
});

function savePreview(name: string, pdf: Uint8Array, xlsx: Uint8Array) {
  const output = process.env.NESTORY_REPORT_PREVIEW_DIR;
  if (!output) return;
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, `${name}.pdf`), pdf);
  writeFileSync(join(output, `${name}.xlsx`), xlsx);
}
