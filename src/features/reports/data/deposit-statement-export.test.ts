import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { loadStatementTransactionDetails } from "./owner-statement-transaction-details";
import { mapOwnerStatementPublicationPayload } from "./owner-statement-report";
import { ownerStatementPublicationPayload } from "./owner-statement-report.test-fixture";
import { canonicalizeSignedOwnerOpeningAmount as money } from "@/features/owner-balances/owner-balance.money";
import { buildOwnerStatementPdf } from "./pdf";
import { buildOwnerStatementXlsx } from "./excel";
import { isContainedPdf } from "@/lib/uploads/pdf-containment";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const packet = { version: 1, purpose: "deposit-statement-display", organizationId: id(1), propertyId: id(2),
  ownerPersonId: id(3), applicationId: id(4), sourceFingerprint: "a".repeat(64), leaseId: id(5), unitId: id(6),
  operation: "apply", originalApplicationId: null as string | null };
const packets = [packet, { ...packet, operation: "full-reversal", originalApplicationId: id(7) }];
// The local SQL harness also sends its actual ordinary-role response through
// these renderers. Default unit runs remain self-contained.
if (process.env.DEPOSIT_STATEMENT_PACKET) {
  packets.push(JSON.parse(readFileSync(process.env.DEPOSIT_STATEMENT_PACKET, "utf8")));
}
it.each(packets)("renders authorized deposit $operation in PDF and XLSX without changing frozen balances", async source => {
  const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
  Object.assign(model, { organizationId: source.organizationId, propertyId: source.propertyId, ownerPersonId: source.ownerPersonId });
  const reversal = source.operation === "full-reversal";
  model.lines = [{ ...model.lines[0]!, lineKind: "movement", signedAmount: money(reversal ? "-100.00" : "100.00"),
    sources: [{ ...model.lines[0]!.sources[0]!, sourceType: "deposit_rent_application", sourceLineId: source.applicationId, sourceFingerprint: source.sourceFingerprint }] }];
  model.components[0]!.movementAmount = model.lines[0]!.signedAmount;
  model.components[0]!.closingAmount = money(reversal ? "1150.00" : "1350.00");
  const before = structuredClone(model);
  const rpc = vi.fn().mockResolvedValue({ data: source, error: null });
  const identity = { ownerName: "Synthetic owner", organizationName: "Synthetic company" };
  const details = await loadStatementTransactionDetails({ rpc } as unknown as Parameters<typeof loadStatementTransactionDetails>[0], model, identity,
    { properties: [{ id: source.propertyId }], units: source.unitId ? [{ id: source.unitId, property_id: source.propertyId, unit_number: "A1" }] : [] });
  const presentation = { ...identity, propertyLabel: "Synthetic property", transactionDetails: details };
  const bytes = buildOwnerStatementPdf(model, presentation);
  const pdf = Buffer.from(bytes).toString("latin1");
  const sheet = strFromU8(unzipSync(buildOwnerStatementXlsx(model, presentation))["xl/worksheets/sheet1.xml"]);
  expect(isContainedPdf(bytes)).toBe(true);
  expect(sheet).toContain(reversal ? "Deposit Rent Reversal" : "Deposit Applied to Rent");
  expect(sheet).toContain(source.unitId ? "A1" : "Property-level");
  expect(sheet).toContain(`<v>${reversal ? "1150.00" : "1350.00"}</v>`);
  expect(pdf).toContain(reversal ? "$1,150.00" : "$1,350.00");
  expect(model).toEqual(before);
});
