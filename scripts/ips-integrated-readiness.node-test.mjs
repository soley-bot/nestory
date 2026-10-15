import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { quote, target, verifyTarget, verifyContainer, verifyResumeState, verifyPdfSummary, verifySheetSummary } from "./ips-integrated-readiness-fixture.mjs";

const valid = {
  config: `project_id = "${target.project}"\n`,
  status: { API_URL: target.api, ANON_KEY: "synthetic", SERVICE_ROLE_KEY: "synthetic" },
  cwd: path.resolve("ips-production-readiness-20261014"),
  handoff: target.project,
};
test("dedicated runner fails closed for wrong worktree, project, API, or missing handoff", () => {
  assert.doesNotThrow(() => verifyTarget(valid));
  for (const override of [
    { cwd: path.resolve("deposit-release-20261009") },
    { config: 'project_id = "nestory"' },
    { status: { ...valid.status, API_URL: "http://127.0.0.1:54321" } },
    { status: { ...valid.status, API_URL: "https://hosted.example.test" } },
    { handoff: undefined },
    { status: { API_URL: target.api, ANON_KEY: "synthetic" } },
  ]) assert.throws(() => verifyTarget({ ...valid, ...override }));
});
test("fixture SQL quotes only values, including apostrophes and null", () => {
  assert.equal(quote("O'Brien"), "'O''Brien'");
  assert.equal(quote(null), "NULL");
});
test("every SQL operation pins full container identity, label and port", () => {
  const container = { id: "a".repeat(64), name: `/${target.container}`, project: target.project, running: true, ports: [{ HostPort: "59322" }] };
  assert.doesNotThrow(() => verifyContainer(container, container.id));
  for (const override of [
    { id: "b".repeat(64) }, { name: "/supabase_db_nestory" }, { project: "nestory" },
    { running: false }, { ports: [{ HostPort: "54322" }] }, { ports: null },
  ]) assert.throws(() => verifyContainer({ ...container, ...override }, container.id));
});

test("resume refuses lagging checkpoints and never replaces an existing original intent", () => {
  const fixture = { ids: { receiptEvent: "receipt" }, state: { received: true, custody: true } };
  const observed = { receipts: [{ id: "receipt" }], applications: [], held: "600.00", outstanding: "600.00", custodyCurrent: true, journal: null };
  assert.doesNotThrow(() => verifyResumeState(fixture, observed));
  const original = { state: "resolved", token: "original-token", idempotencyKey: "original-key", payloadHash: "original-hash", payload: { operation: "apply" } };
  const committed = { ...observed, applications: [{ id: "application" }], held: "500.00", outstanding: "500.00", journal: original };
  assert.throws(() => verifyResumeState(fixture, committed), /checkpoint disagrees/);
  for (const state of ["preview", "attempted", "rejected", "resolved"]) assert.throws(() => verifyResumeState(fixture, { ...observed, journal: { ...original, state } }), /original journal exists/);
  const checkpointed = { ...fixture, state: { ...fixture.state, applied: true, applyIntent: original } };
  assert.doesNotThrow(() => verifyResumeState(checkpointed, committed));
  assert.throws(() => verifyResumeState(checkpointed, { ...committed, journal: { ...original, idempotencyKey: "replacement" } }), /idempotencyKey changed/);
  assert.throws(() => verifyResumeState({ ...fixture, state: {} }, observed), /Receipt checkpoint disagrees/);
  assert.throws(() => verifyResumeState(checkpointed, { ...committed, applications: [{}, {}] }), /checkpoint disagrees/);
});

test("PDF matches the uppercase summary card's exact amount, not an unrelated zero or substring", () => {
  const pdf = amount => Buffer.from(`%PDF-1.4\nBT /F2 6.8 Tf 1 0 0 1 44 445 Tm (RENT SETTLED FROM DEPOSITS) Tj ET\nBT /F2 10 Tf 1 0 0 1 44 432 Tm (USD ${amount}) Tj ET\nBT /F1 9 Tf 1 0 0 1 44 400 Tm (New bank receipt USD 0.00) Tj ET`);
  assert.doesNotThrow(() => verifyPdfSummary(pdf("100.00"), "100.00"));
  assert.doesNotThrow(() => verifyPdfSummary(pdf("0.00"), "0.00"));
  assert.throws(() => verifyPdfSummary(pdf("100.00"), "0.00"), /total mismatch/);
  assert.throws(() => verifyPdfSummary(Buffer.from(pdf("0.00").toString().replace("44 432", "80 432")), "0.00"), /matching summary card/);
});

test("Excel checks the matching totals row and rejects 100.00 when zero is expected", () => {
  const cell = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
  const sheet = amount => `<worksheet><sheetData><row r="1">${cell("A1", "New bank receipt")}${cell("B1", "USD 0.00")}</row><row r="2">${cell("A2", "Totals")}</row><row r="3">${cell("A3", "Metric")}${cell("B3", "Value")}</row><row r="4">${cell("A4", "Rent settled from deposits")}${cell("B4", `USD ${amount}`)}</row></sheetData></worksheet>`;
  assert.doesNotThrow(() => verifySheetSummary(sheet("100.00"), "100.00"));
  assert.doesNotThrow(() => verifySheetSummary(sheet("0.00"), "0.00"));
  assert.throws(() => verifySheetSummary(sheet("100.00"), "0.00"), /total mismatch/);
  assert.throws(() => verifySheetSummary(sheet("0.00").replace('r="B4"', 'r="C4"'), "0.00"), /total mismatch/);
});
