import { describe, expect, it } from "vitest";
import { normalizeDepositRentSources, type DepositRentAllocation, type DepositRentEvent } from "./deposit-rent-source";
import { buildOwnerReportModel, type OwnerReportFact } from "./owner-report-model";
import { presentOwnerReport } from "./owner-report-presentation";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";
import { strFromU8, unzipSync } from "fflate";

const scope = { organizationId: "synthetic-org", propertyIds: ["p1"], unitId: "u1", periodEnd: "2026-11-30" };
const application: DepositRentEvent = { id: "event1", lease_deposit_id: "d1", property_id: "p1", unit_id: "u1",
  event_type: "applied", event_date: "2026-10-05", amount: "100.03", currency: "USD", reversal_of_id: null };
const allocation: DepositRentAllocation = { id: "a1", application_id: "app1", application_amount: "100.03", deposit_event_id: "event1",
  lease_deposit_id: "d1", invoice_id: "invoice1", invoice_line_id: "line1", property_id: "p1", unit_id: "u1", currency: "USD",
  settlement_date: "2026-10-05", custodian: "ips", owner_person_id: null, signed_amount: "100.03", reversal_of_allocation_id: null,
  reversal_of_application_id: null, custody_confirmation_id: "verified1", line_type: "rent" };
const packet = (events = [application], allocations = [allocation]) => ({ organizationId: scope.organizationId, events, allocations });
function model(facts: readonly OwnerReportFact[], month = "2026-10", basis: "cash" | "accrual" = "cash") {
  return buildOwnerReportModel({ facts, basis, scope: { ...scope, periodStart: `${month}-01`, periodEnd: `${month}-${month === "2026-11" ? "30" : "31"}` },
    sourceRead: { complete: true, consistency: "verified", fingerprint: "independently-assumed-synthetic-snapshot" } });
}
describe("proposed explicit deposit settlement normalization; no database posting proof", () => {
  it("requires review by default and never constructs a new cash receipt or Other Income", () => {
    const normalized = normalizeDepositRentSources(scope, packet());
    expect(normalized.sourceCoverage).toBe("unverified");
    expect(normalized.facts.map(fact => fact.kind)).toEqual(["deposit_rent_settlement", "custody"]);
    expect(normalized.facts.some(fact => fact.kind === "income_received")).toBe(false);
    const report = model(normalized.facts);
    expect(report.incomeCents).toBeNull();
    expect(report.netOperatingIncomeCents).toBeNull();
    expect(report.coverageIssues).toMatchObject([{ code: "deposit_rent_recognition_unreviewed", affects: "income" }]);
    expect(report.lines).toEqual([]);
  });
  it("projects application-date rent only under the explicit proposed policy; Accrual stays independent", () => {
    const facts = normalizeDepositRentSources(scope, packet(), "application_date").facts;
    expect(model(facts).incomeCents).toBe(BigInt(10003));
    expect(model(facts).lines.map(line => line.sourceKey)).toEqual(["deposit_rent_allocation:a1"]);
    expect(model(facts, "2026-10", "accrual").incomeCents).toBe(BigInt(0));
    expect(facts.find(fact => fact.kind === "custody")).toMatchObject({ signedAmount: "-100.03" });
    expect(model(facts)).not.toHaveProperty("heldCashCents");
  });
  it("keeps owner custody explicit with zero implied new IPS receipt", () => {
    const row = { ...allocation, custodian: "owner" as const, owner_person_id: "owner1" };
    const facts = normalizeDepositRentSources(scope, packet([application], [row]), "application_date").facts;
    expect(facts[0]).toMatchObject({ custodian: "owner", ownerPersonId: "owner1" });
    expect(facts[0].description).toContain("no new cash receipt");
    expect(model(facts).incomeCents).toBe(BigInt(10003));
    expect(() => normalizeDepositRentSources(scope, packet([application], [{ ...row, owner_person_id: null }]))).toThrow("allocation");
  });
  it("conserves multiple rent lines once and rejects event reuse/fan-out", () => {
    const second = { ...allocation, id: "a2", invoice_line_id: "line2", signed_amount: "20.02" };
    const first = { ...allocation, signed_amount: "80.01" };
    const facts = normalizeDepositRentSources(scope, packet([application], [first, second]), "application_date").facts;
    expect(model(facts).incomeCents).toBe(BigInt(10003));
    expect(() => normalizeDepositRentSources(scope, packet([application], [first, { ...second, signed_amount: "20.01" }]))).toThrow("conservation");
    expect(() => normalizeDepositRentSources(scope, packet([application], [first, { ...second, invoice_line_id: "line1" }]))).toThrow("fan-out");
    expect(() => normalizeDepositRentSources(scope, packet([application], [allocation, { ...allocation, id: "a2", application_id: "app2" }]))).toThrow("multiple applications");
  });
  it("retains full linked reversal dates, original source keys and signed custody restoration", () => {
    const reverseEvent: DepositRentEvent = { ...application, id: "event2", event_type: "reversed", event_date: "2026-11-02", reversal_of_id: application.id };
    const reverse: DepositRentAllocation = { ...allocation, id: "a2", application_id: "app2", deposit_event_id: "event2",
      settlement_date: "2026-11-02", signed_amount: "-100.03", reversal_of_allocation_id: "a1", reversal_of_application_id: "app1" };
    const facts = normalizeDepositRentSources(scope, packet([reverseEvent, application], [reverse, allocation]), "application_date").facts;
    expect(model(facts).incomeCents).toBe(BigInt(10003));
    expect(model(facts, "2026-11").incomeCents).toBe(BigInt(-10003));
    expect(facts.find(fact => fact.sourceId === "event2")).toMatchObject({ signedAmount: "100.03" });
    expect(facts.find(fact => fact.sourceId === "a2")).toMatchObject({ reversalOfSourceKey: "deposit_rent_allocation:a1" });
    expect(() => normalizeDepositRentSources(scope, packet([application, reverseEvent], [allocation]))).toThrow("paired rent reversal");
    expect(() => normalizeDepositRentSources(scope, packet([application, reverseEvent], [{ ...reverse, custodian: "owner", owner_person_id: "owner1" }, allocation]))).toThrow("custody mismatch");
  });
  it("rejects wrong tenant scope, currency, event date, missing pair and duplicate identities", () => {
    for (const row of [{ ...allocation, property_id: "other" }, { ...allocation, unit_id: "other" }, { ...allocation, currency: "KHR" },
      { ...allocation, settlement_date: "2026-10-06" }, { ...allocation, invoice_id: "" }, { ...allocation, deposit_event_id: "missing" }]) {
      expect(() => normalizeDepositRentSources(scope, packet([application], [row]))).toThrow();
    }
    expect(() => normalizeDepositRentSources(scope, packet([application, application]))).toThrow("duplicate");
    expect(() => normalizeDepositRentSources(scope, packet([application], [allocation, allocation]))).toThrow("allocation");
  });
  it("reports an unlinked legacy application as uncertified custody, never invented income", () => {
    const value = normalizeDepositRentSources(scope, packet([application], []));
    expect(value.unlinkedAppliedEventIds).toEqual(["event1"]);
    expect(value.sourceCoverage).toBe("unverified");
    expect(value.facts.map(fact => fact.kind)).toEqual(["custody"]);
  });
  it("exports review warnings and custody without a fabricated complete profit total", () => {
    const report = presentOwnerReport(model(normalizeDepositRentSources(scope, packet()).facts), { generatedAt: "2026-10-04T00:00:00Z" });
    const pdf = Buffer.from(buildTrustedReportPdf({ organizationName: "Synthetic company", report })).toString("latin1");
    const sheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    expect(report.summary[0].value).toBe("Unavailable");
    expect(report.rows.find(row => row.id === "deposit_rent_allocation:a1")?.cells.detail).toContain("no new cash receipt");
    for (const text of [pdf, sheet]) expect(text).toContain("Unavailable");
    expect(sheet).toContain("deposit_rent_recognition_unreviewed");
    expect(sheet).not.toContain("Other Income");
  });
});
