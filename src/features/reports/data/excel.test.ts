import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  buildOwnerStatementXlsx,
  buildTrustedReportXlsx,
} from "@/features/reports/data/excel";
import { mapOwnerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report";
import { ownerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report.test-fixture";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report Excel export", () => {
  it("embeds the company logo at the top right and uses light transaction dividers", async () => {
    const bytes = await sharp({ create: { width: 200, height: 100, channels: 3, background: "white" } }).jpeg().toBuffer();
    const report = reportFixture();
    report.unitProfitLossLines = [];
    const files = unzipSync(buildTrustedReportXlsx(report, { organizationName: "Company", logo: { bytes, width: 200, height: 100 } }));
    expect(files["xl/media/company-logo.jpg"]).toEqual(new Uint8Array(bytes));
    expect(strFromU8(files["xl/drawings/drawing1.xml"])).toContain("<xdr:col>5</xdr:col>");
    expect(strFromU8(files["xl/drawings/drawing1.xml"])).toContain('cx="1447800" cy="723900"');
    expect(strFromU8(files["xl/drawings/_rels/drawing1.xml.rels"])).toContain("../media/company-logo.jpg");
    expect(strFromU8(files["xl/worksheets/_rels/sheet1.xml.rels"])).toContain("../drawings/drawing1.xml");
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('<mergeCell ref="A2:E2"/>');
    expect(sheet).toContain('<drawing ');
    expect(strFromU8(files["xl/styles.xml"])).toContain('style="hair"');
    expect(strFromU8(files["[Content_Types].xml"])).toContain('ContentType="image/jpeg"');
    const withoutLogo = unzipSync(buildTrustedReportXlsx(report));
    expect(withoutLogo["xl/media/company-logo.jpg"]).toBeUndefined();
    expect(strFromU8(withoutLogo["xl/worksheets/sheet1.xml"])).not.toContain('<drawing ');
    const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
    const presentation = { organizationName: "Company", ownerName: "Owner", propertyLabel: "Property", logo: { bytes, width: 200, height: 100 } };
    const statement = buildOwnerStatementXlsx(model, presentation);
    expect(buildOwnerStatementXlsx(model, presentation)).toEqual(statement);
    const ownerFiles = unzipSync(statement);
    expect(ownerFiles["xl/media/company-logo.jpg"]).toEqual(new Uint8Array(bytes));
    expect(strFromU8(ownerFiles["xl/worksheets/sheet1.xml"])).toContain('<drawing ');
  });
  it("matches the requested P&L layout while retaining custom accounts and exact funding totals", () => {
    const report = reportFixture();
    const line = { id: "rent", amountCents: BigInt(48333), category: "Rent", categoryCode: "rent", categoryId: null, currency: "USD" as const, date: "2026-09-01", description: "Monthly rent", direction: "income" as const, property: "Bellavita", reportingGroup: "rent", unit: "8F-D2" };
    report.unitProfitLossLines = [
      { ...line, id: "custom", direction: "expense", category: "Custom cost", amountCents: BigInt(88833), description: "=HYPERLINK(\"unsafe\")" },
      line,
      { ...line, id: "zero", category: "Utilities", amountCents: BigInt(0), description: "Zero transaction omitted" },
    ];
    report.unitProfitLossFunding = { contributionCents: BigInt(0), remainingBalanceCents: -BigInt(9300) };
    const files = unzipSync(buildTrustedReportXlsx(report));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    const styles = strFromU8(files["xl/styles.xml"]!);
    const labels = ["Profit and loss details", "Account", "Income", "Rent", "Total Income", "Expenses", "Custom cost", "Total Expenses", "Net operating income", "Owner funding contributions", "Opening account activity"];
    expect(sheet).not.toContain("Zero transaction omitted");
    expect(sheet).not.toContain(">Utilities</t>");
    let previous = -1;
    for (const label of labels) {
      const position = sheet.indexOf(`>${label}</t>`, previous + 1);
      expect(position, label).toBeGreaterThan(previous);
      previous = position;
    }
    expect(sheet).toContain('r="A8"');
    expect(sheet).toContain('>Unit</t>');
    expect(sheet).toContain('>Payment</t>');
    expect(sheet).toContain('>8F-D2</t>');
    expect(sheet).not.toContain('Bellavita / 8F-D2');
    expect(sheet).not.toContain(">Net income</t>");
    for (const amount of ["483.33", "888.33", "-405.00", "-93.00"]) expect(sheet).toContain(`<v>${amount}</v>`);
    expect(sheet.match(/>Custom cost<\/t>/g)).toHaveLength(1);
    expect(sheet).toContain("=HYPERLINK(&quot;unsafe&quot;)");
    expect(sheet).not.toContain("<f>");
    expect(sheet).not.toContain("XXXX");
    expect(styles).toContain("FFE7EEF5");
    expect(styles).toContain('<name val="Calibri"/>');
    expect(styles).toContain("mm/dd/yyyy");
  });

  it("keeps unavailable balances unavailable without empty category rows", () => {
    const report = reportFixture();
    report.unitProfitLossLines = [];
    report.unitProfitLossFunding = { contributionCents: BigInt(68200), remainingBalanceCents: null, unavailableReason: "Unassigned activity" };
    const sheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    expect(sheet.match(/>Unavailable<\/t>/g)).toHaveLength(1);
    expect(sheet).toContain("Unassigned activity");
    expect(sheet).not.toContain(">Rent</t>");
    expect(sheet).not.toContain(">Cleaning</t>");
    expect(sheet).toContain("<v>682.00</v>");
  });
  it("delivers P&L without event IDs, technical trace notes, or raw timestamps", () => {
    const report = reportFixture();
    report.unitProfitLossLines = [{ id: "private-event-uuid", amountCents: BigInt(50000), category: "Rent", categoryCode: "rent", categoryId: null, currency: "USD", date: "2026-07-01", description: "Monthly rent", direction: "income", property: "Property One", reportingGroup: "rent", unit: "A1" }];
    report.totalsTraceLabel = "private canonical ledger trace";
    const sheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    for (const internal of ["private-event-uuid", "Source event", "private canonical ledger trace", report.generatedAt]) expect(sheet).not.toContain(internal);
    expect(sheet).not.toContain("Prepared");
    expect(sheet).not.toContain("Generated");
    expect(sheet).toContain("<v>500.00</v>");
    expect(sheet).toContain("Monthly rent");
  });
  it("labels grouped subtotals even with the group column hidden and avoids SUM duplication", () => {
    const report = reportFixture();
    report.columns = [{ key: "amount", label: "Amount", numeric: true }];
    const detail = { ...report.rows[0]!, cells: { amount: "USD 30.00" }, amounts: { amount: "30.00" } };
    report.rows = [{ ...detail, id: "group", isGroup: true, title: "Garden Court", sourceLinks: [] }, detail];
    const worksheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain("Subtotal: Garden Court");
    expect(worksheet.match(/t="n"><v>30.00<\/v>/g)).toHaveLength(1);
  });
  it("exports exact money as numeric cells while keeping untrusted text inert", () => {
    const report = reportFixture();
    report.columns = [{ key: "description", label: "Description" }, { key: "amount", label: "Amount", numeric: true }];
    report.rows = [{ ...report.rows[0]!, cells: { description: "=HYPERLINK(\"bad\")", amount: "USD 0.30" }, amounts: { amount: "0.30" } }];
    const worksheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain('t="n"><v>0.30</v>');
    expect(worksheet).toContain("=HYPERLINK");
    expect(worksheet).not.toContain("<f>");
  });
  it("builds a real XLSX workbook with report metadata, rows, and totals", () => {
    const body = buildTrustedReportXlsx(reportFixture());
    const files = unzipSync(body);

    expect(Array.from(body.slice(0, 2))).toEqual([80, 75]);
    expect(Object.keys(files).toSorted()).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "docProps/app.xml",
        "docProps/core.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
      ]),
    );

    const worksheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain("Monthly Unit Profit &amp; Loss");
    expect(worksheet).toContain("P1 - Property One");
    expect(worksheet).toContain("USD 380.00");
    expect(worksheet).toContain("Net income");
    expect(worksheet).toContain("ledger:Rent receipt");
    expect(worksheet).toContain("receipt-allocation-1");
    expect(worksheet).toContain("/rent-income?receiptId=receipt-1");
  });

  it("writes formula-looking values as inline text instead of formulas", () => {
    const report = reportFixture();
    report.rows[0]!.cells.netIncome = "=HYPERLINK(\"bad\")";
    report.rows[0]!.title = "+unsafe";

    const worksheet = strFromU8(
      unzipSync(buildTrustedReportXlsx(report))[
        "xl/worksheets/sheet1.xml"
      ]!,
    );

    expect(worksheet).not.toContain("<f");
    expect(worksheet).toContain(
      "=HYPERLINK(&quot;bad&quot;)",
    );
  });
});

describe("official owner statement workbook", () => {
  it("is byte-stable with one owner-facing sheet and typed money", () => {
    const model = mapOwnerStatementPublicationPayload(
      structuredClone(ownerStatementPublicationPayload),
    );
    const first = buildOwnerStatementXlsx(model);
    const second = buildOwnerStatementXlsx(model);
    const files = unzipSync(first);
    const workbook = Buffer.from(files["xl/workbook.xml"] ?? []).toString();
    const statement = Buffer.from(
      files["xl/worksheets/sheet1.xml"] ?? [],
    ).toString();
    const packageText = Object.values(files).map((entry) => strFromU8(entry)).join("\n");
    expect(first).toEqual(second);
    expect(workbook).toContain('name="Statement"');
    expect(Object.keys(files).filter((path) => path.startsWith("xl/worksheets/"))).toEqual(["xl/worksheets/sheet1.xml"]);
    for (const internal of ["Source Trace", "Checks", "Statement line", "Balance components", "SHA-256", "ips_held_owner_cash", model.statementNumber, model.ownerPersonId, model.propertyId, model.contentHash]) {
      expect(packageText).not.toContain(internal);
    }
    expect(statement).toContain("01 Aug 2026 - 31 Aug 2026");
    expect(statement).toContain("Not provided");
    expect(statement).toContain("Currency: USD");
    expect(statement).not.toContain("Tenant deposits held separately");
    expect(statement).not.toContain("source trace");
    for (const label of ["Date", "Category", "Cash Out", "Cash In", "Opening balance", "Total", "Closing balance"]) {
      expect(statement).toContain(`>${label}</t>`);
    }
    expect(statement).toMatch(/<c r="[A-Z]+\d+" s="\d+"><v>1250\.00<\/v><\/c>/);
    expect(statement).not.toContain("#REF!");

    const compatibleExisting = strFromU8(
      unzipSync(buildOwnerStatementXlsx(model, undefined, { includeDepositSummary: true }))[
        "xl/worksheets/sheet1.xml"
      ],
    );
    expect(compatibleExisting).toContain(
      "Currency: USD | Tenant deposits held separately: 800.00",
    );
  });

  it("is byte-identical across ZIP timestamp buckets and host time zones", () => {
    const model = mapOwnerStatementPublicationPayload(
      structuredClone(ownerStatementPublicationPayload),
    );
    const originalTimezone = process.env.TZ;
    vi.useFakeTimers();
    try {
      process.env.TZ = "Pacific/Kiritimati";
      vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
      const first = buildOwnerStatementXlsx(model);

      process.env.TZ = "America/Adak";
      vi.setSystemTime(new Date("2026-08-10T00:00:05.000Z"));
      expect(buildOwnerStatementXlsx(model)).toEqual(first);
    } finally {
      vi.useRealTimers();
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
});

function reportFixture(): TrustedReport {
  return {
    columns: [
      { key: "property", label: "Property" },
      { key: "unit", label: "Unit" },
      { align: "right", key: "income", label: "Income" },
      { align: "right", key: "expenses", label: "Expenses" },
      { align: "right", key: "netIncome", label: "Net income" },
    ],
    description: "Income, expenses, and net income by unit.",
    emptyDescription: "No rows.",
    emptyTitle: "No unit rows",
    exportFilenameBase: "unit-profit-loss",
    generatedAt: "2026-08-01T00:00:00.000Z",
    kind: "unit-profit-loss",
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows: [
      {
        cells: {
          expenses: "USD 120.00",
          income: "USD 500.00",
          netIncome: "USD 380.00",
          property: "P1 - Property One",
          unit: "Unit A1",
        },
        id: "unit-1",
        sourceCount: 2,
        sourceLinks: [
          {
            href: "/rent-income?receiptId=receipt-1",
            id: "receipt-allocation-1",
            label: "Rent receipt",
            recordType: "ledger",
          },
        ],
        sourceSummary: "1 source row",
        title: "P1 / Unit A1",
      },
    ],
    scopeLabel: "All properties",
    summary: [
      {
        detail: "Income less expenses",
        label: "Net income",
        sourceCount: 2,
        value: "USD 380.00",
      },
    ],
    title: "Monthly Unit Profit & Loss",
    totalsTraceLabel: "Totals trace to 2 unit-linked ledger rows.",
  };
}
