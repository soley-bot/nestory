import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { canonicalizeSignedOwnerOpeningAmount as money } from "@/features/owner-balances/owner-balance.money";
import { buildOwnerStatementXlsx } from "./excel";
import { buildOwnerStatementPdf } from "./pdf";
import { ownerStatementCash } from "./owner-statement-cash";
import { statementSourceKey } from "./owner-statement-corrections";
import { mapOwnerStatementPublicationPayload, type OwnerStatementLine } from "./owner-statement-report";
import { ownerStatementPublicationPayload } from "./owner-statement-report.test-fixture";

function statement() {
  return mapOwnerStatementPublicationPayload({ ...ownerStatementPublicationPayload, presentation_version: 2 });
}

function movement(lineNumber: number, type: string, amount: string): OwnerStatementLine {
  const source = { id: String(lineNumber), sourceId: String(lineNumber), sourceLineId: String(lineNumber),
    sourceFingerprint: String(lineNumber).padStart(64, "0"), sourceType: type };
  return { id: String(lineNumber), component: "ips_held_owner_cash", lineKind: "movement", lineNumber,
    signedAmount: money(amount), businessDate: "2026-08-26", description: "Staff-only correction note", sourceCount: 1, sources: [source] };
}

describe("effective owner statement movements", () => {
  it("exports only the final rent and fee and preserves independent equal charges", () => {
    const model = statement();
    const original = movement(1, "tenant_rent_receipt", "700.00");
    const reversal = movement(2, "reversal", "-700.00");
    model.lines = [original, reversal, movement(3, "tenant_rent_receipt", "680.00"),
      movement(4, "owner_invoice_payment", "-40.00"), movement(5, "owner_invoice_payment", "-40.00"),
      movement(6, "management_fee_occurrence", "-68.00")];
    model.components[0].closingAmount = money("1782.00");
    const links = new Map([[statementSourceKey(reversal.sources[0]), original.sources[0]]]);
    const cash = ownerStatementCash(model, links);
    expect(cash.transactions.map(row => row.lineNumber)).toEqual([3, 4, 5, 6]);
    expect(cash).toMatchObject({ openingCents: 125000, closingCents: 178200, cashInCents: 68000, cashOutCents: 14800 });
    expect(ownerStatementCash(model).transactions).toHaveLength(6);
    const presentation = { organizationName: "Pilot", propertyLabel: "Test property", ownerName: "Test owner", correctionSources: links,
      transactionDetails: Object.fromEntries(model.lines.map(line => [line.lineNumber, {
        unit: "Unit A", name: "Example", category: line.lineNumber === 3 ? "Rent" : line.lineNumber === 6 ? "Management fee" : "Cleaning",
      }])) };
    const sheet = strFromU8(unzipSync(buildOwnerStatementXlsx(model, presentation))["xl/worksheets/sheet1.xml"]);
    const pdf = Buffer.from(buildOwnerStatementPdf(model, presentation)).toString("latin1");
    expect(sheet).toContain("<v>1782.00</v>");
    expect(pdf).toContain("$1,782.00");
    for (const content of [sheet, pdf]) {
      expect(content).toContain("680.00");
      expect(content).toContain("68.00");
      expect(content).not.toMatch(/700\.00|Staff-only|Reversal|Correction/i);
    }
  });

  it("nets a linked partial return to the cent and displays a previous-period refund", () => {
    const model = statement();
    const original = movement(1, "tenant_rent_receipt", "70.13");
    const partial = movement(2, "reversal", "-15.12");
    const prior = movement(3, "reversal", "-20.00");
    model.lines = [original, partial, prior];
    model.components[0].closingAmount = money("1285.01");
    const links = new Map([[statementSourceKey(partial.sources[0]), original.sources[0]],
      [statementSourceKey(prior.sources[0]), movement(4, "tenant_rent_receipt", "20.00").sources[0]]]);
    const cash = ownerStatementCash(model, links);
    expect(cash.transactions.map(row => [row.type, row.cashInCents, row.cashOutCents])).toEqual([
      ["Rent received", 5501, 0], ["Rent refund", 0, 2000],
    ]);
    expect(() => ownerStatementCash(model, new Map())).toThrow("verify");
  });

  it("retains ambiguous movements and uses a business label for a mixed source", () => {
    const model = statement();
    const original = movement(1, "management_fee_occurrence", "-5.00");
    const reversal = movement(3, "reversal", "5.00");
    const mixed = movement(4, "reversal", "1.00");
    mixed.sources.push(movement(5, "owner_contribution", "1.00").sources[0]);
    model.lines = [original, { ...original, lineNumber: 2 }, reversal, mixed];
    model.components[0].closingAmount = money("1246.00");
    const links = new Map([reversal, mixed].map(line => [statementSourceKey(line.sources[0]), original.sources[0]]));
    expect(ownerStatementCash(model, links).transactions.map(row => row.type)).toEqual([
      "Management fee", "Management fee", "Management fee credit", "Cash in",
    ]);
  });
});
