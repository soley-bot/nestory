import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { TrustedReport, TrustedReportRow } from "../reports.types";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";

// Literal rendering inputs only: no held accounting model, source reader or
// business-policy calculation is needed to verify presentation boundaries.
function fixture(): TrustedReport {
  const context = (id: string, detail: string): TrustedReportRow => ({
    id, title: "Report context", sourceCount: 0, sourceLinks: [], sourceSummary: id,
    cells: { date: "", type: "Context", source: id, detail, amount: "" },
  });
  return {
    kind: "unit-profit-loss", preserveRowDetails: true, title: "Synthetic report",
    description: "Profit is not management-held cash.",
    emptyTitle: "No detail", emptyDescription: "Review source coverage.",
    exportFilenameBase: "synthetic-evidence", generatedAt: "2026-10-04T00:00:00Z",
    periodLabel: "2026-10-01 - 2026-10-31", scopeLabel: "Synthetic organization / property",
    columns: [{ key: "date", label: "Date" }, { key: "type", label: "Type" },
      { key: "source", label: "Source" }, { key: "detail", label: "Detail" },
      { key: "amount", label: "USD amount", numeric: true }],
    rows: [
      { id: "synthetic:allocation1", title: "Recorded activity", sourceCount: 1,
        sourceLinks: [], sourceSummary: "synthetic:allocation1", amounts: { amount: "100.03" },
        cells: { date: "2026-10-05", type: "Recorded activity", source: "synthetic:allocation1",
          detail: "Synthetic supporting evidence", amount: "USD 100.03" } },
      context("coverage:warning", "Source coverage unavailable"),
      context("metadata:basis", "Basis supplied by caller"),
      context("metadata:scope", "Synthetic organization / property"),
      context("metadata:period", "2026-10-01 - 2026-10-31"),
      context("metadata:fingerprint", "synthetic-fingerprint"),
      context("metadata:caution", "Profit is not management-held cash"),
    ],
    summary: [{ label: "Caller-provided total", value: "Unavailable", detail: "Unverified source coverage", sourceCount: 1 }],
    totalsTraceLabel: "Synthetic source fingerprint; completeness is not certified",
  };
}

function exportsFor(report: TrustedReport) {
  const rawPdf = Buffer.from(buildTrustedReportPdf({ organizationName: "Synthetic company", report })).toString("latin1");
  const files = unzipSync(buildTrustedReportXlsx(report));
  return { rawPdf, files, sheet: strFromU8(files["xl/worksheets/sheet1.xml"]!),
    pdf: [...rawPdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
      .map(match => match[1].replace(/\\([\\()])/g, "$1")).join("") };
}

describe("standalone generic report evidence exports", () => {
  it.each([
    `${"x".repeat(499)}\u{1F600}TAIL`,
    `${"e\n".repeat(25)}${"x".repeat(35)}\u{1F600}TAIL`,
  ])("preserves Unicode across detail and row-height continuation boundaries", (evidence) => {
    const report = fixture();
    report.rows[0].cells.detail = evidence;
    const { sheet } = exportsFor(report);
    const rows = (sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [])
      .filter(row => row.includes("synthetic:allocation1"));
    const fragments = rows.map(row => row.match(/<c r="D\d+"[^>]*><is><t xml:space="preserve">([\s\S]*?)<\/t>/)?.[1] ?? "");
    expect(rows.length).toBeGreaterThan(1);
    expect(fragments.join("")).toBe(evidence);
    expect(sheet).not.toContain("\uFFFD");
    expect((sheet.match(/<v>100\.03<\/v>/g) ?? []).length).toBe(1);
  });

  it.each(["source", "type", "title"])("keeps long PDF %s evidence inside the printable body", (field) => {
    const report = fixture();
    const evidence = `${"LONG IDENTITY EVIDENCE ".repeat(120)}ENDMARKER`;
    if (field === "title") report.rows[0].title = evidence;
    else report.rows[0].cells[field] = evidence;
    const { rawPdf } = exportsFor(report);
    const bodyText = [...rawPdf.matchAll(/BT \/F\d 8\.2 Tf 1 0 0 1 [\d.-]+ ([\d.-]+) Tm \(((?:\\.|[^\\)])*)\) Tj ET/g)];
    expect(bodyText.length).toBeGreaterThan(100);
    expect(bodyText.some(match => match[2].includes("ENDMARKER"))).toBe(true);
    expect(bodyText.every(match => Number(match[1]) >= 45 && Number(match[1]) <= 358)).toBe(true);
    expect(bodyText.filter(match => match[2] === "USD 100.03")).toHaveLength(1);
  });

  it("anchors the 60-property export at header 8, filter A8:H15 and freeze 8", () => {
    const report = fixture();
    report.scopeLabel = Array.from({ length: 60 }, (_, index) => `synthetic-property-${String(index).padStart(3, "0")}`).join(" | ");
    report.title = `${"LONG TITLE\n".repeat(40)}TITLE-END`;
    const { sheet } = exportsFor(report);
    const header = (sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [])
      .find(row => row.includes(">Source records<") && row.includes(">Date<"))!;
    expect(header).toContain('r="8"');
    expect(header.match(/<c\b/g)?.length).toBe(8);
    expect((header.match(/s="2"/g) ?? []).length).toBe(8);
    expect(sheet).toContain('autoFilter ref="A8:H15"');
    expect(sheet).toContain('pane ySplit="8" topLeftCell="A9"');
    expect(sheet).toContain("synthetic-property-059");
    report.rows[0].cells.date = "Totals";
    expect(exportsFor(report).sheet).toContain('autoFilter ref="A8:H15"');
    report.rows = [];
    expect(exportsFor(report).sheet).toContain('autoFilter ref="A8:H8"');
  });

  it("splits multiline evidence within Excel's row-height limit without repeating money", () => {
    const report = fixture();
    const evidence = `${"EVIDENCE\n".repeat(50)}FINAL-MULTILINE-TOKEN`;
    report.rows[0].cells.detail = evidence;
    const { sheet } = exportsFor(report);
    const rows = (sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [])
      .filter(row => row.includes("EVIDENCE") || row.includes("FINAL-MULTILINE-TOKEN"));
    expect(rows.length).toBeGreaterThan(1);
    const fragments = rows.flatMap(row => [...row.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)]
      .map(match => match[1]).filter(text => text.includes("EVIDENCE") || text.includes("FINAL-MULTILINE-TOKEN")));
    expect(fragments.join("")).toBe(evidence);
    for (const row of rows) {
      const height = Number(row.match(/ht="([\d.]+)"/)?.[1]);
      expect(height).toBeLessThanOrEqual(409);
      const lines = Math.max(...[...row.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)]
        .map(match => match[1].split(/\r\n|\r|\n/).length));
      expect(height).toBeGreaterThanOrEqual(lines * 15 + 6);
      expect(row).toContain("allocation1");
    }
    expect((sheet.match(/<v>100\.03<\/v>/g) ?? []).length).toBe(1);
  });

  it("paginates lengthy detail while retaining short source identity on each evidence page", () => {
    const report = fixture();
    report.rows[0].cells.detail = `${"Synthetic supporting evidence. ".repeat(120)}FINAL-EVIDENCE-TOKEN`;
    const { pdf, rawPdf, sheet } = exportsFor(report);
    for (const text of [pdf, sheet]) expect(text).toContain("FINAL-EVIDENCE-TOKEN");
    const pages = [...rawPdf.matchAll(/\bstream\n([\s\S]*?)\nendstream/g)]
      .map(match => [...match[1].matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
        .map(text => text[1].replace(/\\([\\()])/g, "$1")).join("").replace(/\s+/g, ""));
    const evidencePages = pages.filter(page => page.includes("Syntheticsupportingevidence") || page.includes("FINAL-EVIDENCE-TOKEN"));
    expect(evidencePages.length).toBeGreaterThan(1);
    for (const [index, page] of evidencePages.entries()) {
      expect(page).toContain("synthetic:allocation1");
      if (index > 0) expect(page).toContain("(continued)");
    }
    expect((sheet.match(/<v>100\.03<\/v>/g) ?? []).length).toBe(1);
  });

  it("preserves provided unavailable totals, warnings and report context without calculating them", () => {
    const report = fixture();
    report.rows[1].cells.detail = `${"Source coverage remains unverified. ".repeat(12)}FINAL-WARNING`;
    const { pdf, sheet, files } = exportsFor(report);
    for (const text of [pdf, sheet]) for (const token of ["Unavailable", "FINAL-WARNING", "synthetic-fingerprint", "Profit is not management-held cash"])
      expect(text.replace(/\s+/g, "")).toContain(token.replace(/\s+/g, ""));
    expect(strFromU8(files["xl/styles.xml"]!)).toContain('wrapText="1"');
    expect(sheet).toContain("Report purpose");
  });
});
