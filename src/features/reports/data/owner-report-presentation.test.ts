import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildOwnerReportModel, type OwnerReportFact } from "./owner-report-model";
import { presentOwnerReport } from "./owner-report-presentation";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";

const source = { organizationId: "synthetic-org", propertyId: "p1", unitId: "u1", currency: "USD" as const,
  category: "Rent", description: "Synthetic rent", obligationId: "invoice1", reversalOfSourceKey: null };
const receipt: OwnerReportFact = { ...source, sourceType: "tenant_invoice_payment_allocation", sourceId: "allocation1", kind: "income_received",
  signedAmount: "100.03", receivedOn: "2026-10-05", collector: "manager", responsibility: "owner_income" };
const deposit: OwnerReportFact = { ...source, sourceType: "lease_deposit_event", sourceId: "application1", kind: "custody",
  signedAmount: "-100.03", eventOn: "2026-10-05" };
const fee: OwnerReportFact = { ...source, sourceType: "owner_charge_cash_allocation", sourceId: "fee1", category: "Management fee", kind: "fee_settled",
  signedAmount: "10.02", settledOn: "2026-10-06", sourceOfFunds: "held_owner_cash" };
function model(facts: OwnerReportFact[], extra: { activity?: "unverified"; unitId?: string; incomplete?: boolean } = {}) {
  return buildOwnerReportModel({ basis: "cash", facts,
    scope: { organizationId: source.organizationId, propertyIds: ["p1"], unitId: extra.unitId, periodStart: "2026-10-01", periodEnd: "2026-10-31" },
    sourceRead: { complete: !extra.incomplete, consistency: "verified", fingerprint: "synthetic-fingerprint",
      ...(extra.activity ? { sections: { income: "complete" as const, expenses: "complete" as const, activity: extra.activity } } : {}) } });
}
function outputs(value: ReturnType<typeof model>) {
  const report = presentOwnerReport(value, { generatedAt: "2026-10-04T00:00:00Z", expectedFingerprint: "synthetic-fingerprint" });
  const pdfBytes = Buffer.from(buildTrustedReportPdf({ organizationName: "Synthetic company", report })).toString("latin1");
  return { report, pdf: [...pdfBytes.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match => match[1].replace(/\\([\\()])/g, "$1")).join(""),
    sheet: strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!) };
}
describe("draft Cash model to actual generic PDF/Excel acceptance", () => {
  it("anchors filter, frozen pane and header style after long title/scope expansion", () => {
    const report = presentOwnerReport(model([receipt]), { generatedAt: "2026-10-04T00:00:00Z" });
    report.scopeLabel = Array.from({ length: 60 }, (_, index) => `synthetic-property-${String(index).padStart(3, "0")}`).join(" | ");
    report.title = `${"LONG TITLE\n".repeat(40)}TITLE-END`;
    const read = () => strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    const sheet = read();
    const rows = sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
    const header = rows.find(row => row.includes(">Source records<") && row.includes(">Date<"))!;
    const headerNumber = Number(header.match(/r="(\d+)"/)?.[1]);
    expect(headerNumber).toBeGreaterThan(6);
    expect(header.match(/<c\b/g)?.length).toBe(8);
    expect((header.match(/s="2"/g) ?? []).length).toBe(8);
    const data = rows.filter(row => row.includes("metadata:caution"));
    const lastData = Math.max(...data.map(row => Number(row.match(/r="(\d+)"/)?.[1])));
    expect(sheet).toContain(`autoFilter ref="A${headerNumber}:H${lastData}"`);
    expect(sheet).toContain(`pane ySplit="${headerNumber}" topLeftCell="A${headerNumber + 1}"`);
    expect(sheet).toContain("synthetic-property-059");
    // Display text resembling a section marker must never control row bounds.
    report.rows[0].cells.date = "Totals";
    expect(read()).toContain(`autoFilter ref="A${headerNumber}:H${lastData}"`);
    report.rows = [];
    expect(read()).toContain(`autoFilter ref="A${headerNumber}:H${headerNumber}"`);
  });
  it("splits multiline evidence within Excel's row-height limit without repeating money", () => {
    const report = presentOwnerReport(model([receipt]), { generatedAt: "2026-10-04T00:00:00Z" });
    const row = report.rows.find(row => row.id === "tenant_invoice_payment_allocation:allocation1")!;
    const evidence = `${"EVIDENCE\n".repeat(50)}FINAL-MULTILINE-TOKEN`;
    row.cells.detail = evidence;
    const sheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    const rows = (sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []).filter(row => row.includes("EVIDENCE") || row.includes("FINAL-MULTILINE-TOKEN"));
    expect(rows.length).toBeGreaterThan(1);
    const fragments = rows.flatMap(row => [...row.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)].map(match => match[1]).filter(text => text.includes("EVIDENCE") || text.includes("FINAL-MULTILINE-TOKEN")));
    expect(fragments.join("")).toBe(evidence);
    for (const row of rows) {
      const height = Number(row.match(/ht="([\d.]+)"/)?.[1]);
      expect(height).toBeLessThanOrEqual(409);
      const lines = Math.max(...[...row.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)].map(match => match[1].split(/\r\n|\r|\n/).length));
      expect(height).toBeGreaterThanOrEqual(lines * 15 + 6);
      expect(row).toContain("allocation1");
    }
    expect((sheet.match(/<v>100\.03<\/v>/g) ?? []).length).toBe(1);
  });
  it("keeps settlement dates, exact totals, basis, scope and custody distinct in both exports", () => {
    // Canonical settlement is supplied independently; this does not prove the
    // deposit command creates it or that the source loader can link the pair.
    const value = model([deposit, receipt, fee]);
    const { report, pdf, sheet } = outputs(value);
    expect(report.summary.map(item => item.value)).toEqual(["USD 100.03", "USD 10.02", "USD 90.01"]);
    expect(report.unitProfitLossLines).toBeUndefined();
    expect(report.exportFilenameBase).toContain("cash-2026-10-01-2026-10-31");
    for (const text of [pdf, sheet]) {
      for (const token of ["Cash basis", "2026-10-05", "2026-10-06", "synthetic-org", "p1", "synthetic-fingerprint", "USD 100.03", "USD 10.02", "USD 90.01", "Activity: custody"]) expect(text).toContain(token);
      expect(text).not.toContain("Accrual basis");
    }
    for (const amount of ["100.03", "10.02", "-100.03"]) expect(sheet).toContain(`<v>${amount}</v>`);
    expect(report.rows.filter(row => row.cells.type === "income")).toHaveLength(1);
    const reversed: OwnerReportFact = { ...receipt, sourceId: "correction1", signedAmount: "-0.02", receivedOn: "2026-10-07", reversalOfSourceKey: "tenant_invoice_payment_allocation:allocation1" };
    const correction = outputs(model([receipt, reversed]));
    for (const text of [correction.pdf, correction.sheet]) expect(text).toContain("USD 100.01");
    expect(correction.sheet).toContain("<v>-0.02</v>");
    expect(correction.report.rows[1].cells.detail).toContain("Reverses tenant_invoice_payment_allocation:allocation1");
  });
  it("preserves unavailable expenses, unresolved timing and independent activity warnings", () => {
    const unresolved: OwnerReportFact = { ...source, sourceType: "expense_responsibility", sourceId: "ips80", kind: "manager_funded_cost",
      vendorPaidOn: "2026-10-02", vendorCost: "80.00", ownerChargeRecognizedOn: "2026-10-03", ownerCharge: "100.00", markup: "20.00",
      ownerSettlements: [{ settledOn: "2026-10-08", amount: "100.00", sourceKey: "owner_payment_allocation:payment1" }], sourceOfFunds: "unclassified" };
    const { report, pdf, sheet } = outputs(model([receipt, unresolved], { activity: "unverified" }));
    expect(report.summary.map(item => item.value)).toEqual(["USD 100.03", "Unavailable", "Unavailable"]);
    for (const text of [pdf, sheet]) for (const token of ["Unavailable", "manager_funded_cost_mapping_unresolved", "Activity source coverage: unverified", "2026-10-08"]) expect(text.replace(/\s+/g, "")).toContain(token.replace(/\s+/g, ""));
    expect(report.rows.find(row => row.id === "expense_responsibility:ips80")?.amounts).toBeUndefined();
  });
  it("does not sum unassigned detail or incomplete sources and rejects stale fingerprint", () => {
    const value = model([receipt, { ...fee, unitId: null }], { unitId: "u1" });
    const { report, pdf, sheet } = outputs(value);
    expect(report.summary.map(item => item.value)).toEqual(["USD 100.03", "Unavailable", "Unavailable"]);
    for (const text of [pdf, sheet]) for (const token of ["Unavailable", "Unassigned: fee_settled", "unit_attribution_unavailable"]) expect(text).toContain(token);
    expect(outputs(model([receipt], { incomplete: true })).report.summary.every(item => item.value === "Unavailable")).toBe(true);
    expect(() => presentOwnerReport(value, { generatedAt: "2026-10-04T00:00:00Z", expectedFingerprint: "stale" })).toThrow("Refresh before exporting");
  });
  it("paginates lengthy source details without losing the final evidence or source identity", () => {
    const long: OwnerReportFact = { ...receipt, sourceId: "synthetic-source-identity-with-a-long-suffix-0123456789",
      description: `${"Synthetic supporting evidence. ".repeat(120)}FINAL-EVIDENCE-TOKEN` };
    const { pdf, sheet } = outputs(model([long]));
    for (const text of [pdf, sheet]) {
      expect(text).toContain("FINAL-EVIDENCE-TOKEN");
      expect(text).toContain(long.sourceId);
    }
    expect(pdf).toContain("Page 2 of");
    const report = presentOwnerReport(model([long]), { generatedAt: "2026-10-04T00:00:00Z" });
    const raw = Buffer.from(buildTrustedReportPdf({ organizationName: "Synthetic company", report })).toString("latin1");
    const pages = [...raw.matchAll(/\bstream\n([\s\S]*?)\nendstream/g)].map(match => [...match[1].matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(text => text[1].replace(/\\([\\()])/g, "$1")).join("").replace(/\s+/g, ""));
    const evidencePages = pages.filter(page => page.includes("Synthetic supporting evidence".replace(/\s+/g, "")) || page.includes("FINAL-EVIDENCE-TOKEN"));
    expect(evidencePages.length).toBeGreaterThan(1);
    for (const [index, page] of evidencePages.entries()) {
      expect(page).toContain(long.sourceId);
      if (index > 0) expect(page).toContain("(continued)");
    }
    expect((sheet.match(/<v>100\.03<\/v>/g) ?? []).length).toBe(1);
  });
  it("exports the financial caution and visibly wraps long warnings in Excel", () => {
    const value = model([receipt, { ...fee, unitId: null }], { unitId: "u1" });
    const { pdf, sheet, report } = outputs(value);
    const files = unzipSync(buildTrustedReportXlsx(report));
    const styles = strFromU8(files["xl/styles.xml"]!);
    expect(styles).toContain('wrapText="1"');
    const warning = sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g)?.find(row => row.includes("unit_attribution_unavailable"));
    expect(warning).toContain('customHeight="1"');
    expect(Number(warning?.match(/ht="([\d.]+)"/)?.[1])).toBeGreaterThan(60);
    for (const text of [pdf, sheet]) expect(text.replace(/\s+/g, "")).toContain("Profit is not management-held cash".replace(/\s+/g, ""));
    expect(sheet).toContain("Report purpose");
  });
});
