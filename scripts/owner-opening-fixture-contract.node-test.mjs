import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertCurrentMonthDates,
  reportSha256,
  validateReport,
} from "./smoke-fixture-owner-opening-balances.mjs";

const manifestUrl = new URL("./fixtures/owner-opening-balances.json", import.meta.url);
const smokeUrl = new URL("./smoke-fixture-owner-opening-balances.mjs", import.meta.url);
const browserUrl = new URL("./smoke-owner-opening-browser-acceptance.mjs", import.meta.url);

const pinnedOwnershipRoster = [
  {
    propertyOwnerId: "90000000-0000-0000-0000-000000000001",
    ownerPersonId: "80000000-0000-0000-0000-000000000004",
    ownershipPercent: "100.000",
    startedOn: "2024-01-01",
    endedOn: null,
  },
];

function withPinnedOwnershipRoster(manifest) {
  return { ...manifest, ownershipRoster: pinnedOwnershipRoster };
}

function inMemoryFixtureReport(manifest, effectiveDate) {
  const requestIds = new Map(
    manifest.requests.map((row, index) => [row.sourceReference, `request-${index + 1}`]),
  );
  const entryIds = new Map(
    manifest.entries.map((row, index) => [row.entryKey, `entry-${index + 1}`]),
  );
  const requests = manifest.requests.map((row) => ({
    ...row,
    id: requestIds.get(row.sourceReference),
    effectiveDate,
    correctionOfEntryId: row.targetEntryKey ? entryIds.get(row.targetEntryKey) : null,
    resubmissionOfRequestId: row.predecessorSource
      ? requestIds.get(row.predecessorSource)
      : null,
    payloadHash: row.canonicalPayloadSha256,
    expectedPayloadHash: row.canonicalPayloadSha256,
  }));
  const entries = manifest.entries.map((row) => ({
    ...row,
    id: entryIds.get(row.entryKey),
    requestId: requestIds.get(row.sourceReference),
    effectiveDate,
    reversalOfEntryId: row.reversalTargetEntryKey
      ? entryIds.get(row.reversalTargetEntryKey)
      : null,
  }));
  const idempotency = manifest.transitions.map((row, index) => ({
    ...row,
    id: `idempotency-${index + 1}`,
    payloadHash: row.canonicalPayloadSha256,
    expectedPayloadHash: row.canonicalPayloadSha256,
    status: "completed",
  }));
  const activity = manifest.transitions.map((row, index) => ({
    ...row,
    payloadHash: row.canonicalPayloadSha256,
    financialIdempotencyRequestId: `idempotency-${index + 1}`,
    source: "checked_rpc",
  }));

  return {
    organizationId: manifest.organizationId,
    propertyId: manifest.propertyId,
    ownerPersonId: manifest.ownerPersonId,
    propertyOwnerId: manifest.propertyOwnerId,
    currency: manifest.currency,
    effectiveDate,
    ownershipRoster: manifest.ownershipRoster,
    ownershipRosterHash: manifest.ownershipRosterHash,
    statuses: manifest.expected.requestStatuses,
    authority: manifest.authority.map((row) => ({ ...row, effectiveDate })),
    requests,
    entries,
    idempotency,
    activity,
    documentReferences: 0,
    storageObjects: 0,
  };
}

test("owner-opening fixture manifest fixes the four-component authority and lineage contract", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, 2);
  assert.equal(manifest.currency, "USD");
  assert.deepEqual(
    manifest.authority.map(({ component, amount }) => [component, amount]),
    [
      ["ips_held_owner_cash", "1250.00"],
      ["owner_due_to_ips", "0.00"],
      ["ips_due_to_owner", "240.50"],
      ["security_deposit_custody", "800.00"],
    ],
  );
  assert.equal(manifest.expected.requestCount, 8);
  assert.equal(manifest.expected.entryCount, 6);
  assert.deepEqual(manifest.expected.requestStatuses, {
    approved: 5,
    rejected: 2,
    submitted: 1,
  });
  assert.equal(manifest.expected.transitionCount, 15);
  assert.match(manifest.reportSha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.effectiveMonth, "CURRENT_MONTH");
  assert.deepEqual(manifest.ownershipRoster, pinnedOwnershipRoster);
  assert.equal(manifest.requests.length, 8);
  assert.equal(manifest.entries.length, 6);
  for (const row of [...manifest.requests, ...manifest.entries]) {
    assert.equal(row.propertyOwnerId, manifest.propertyOwnerId);
    assert.equal(row.ownershipPercent, "100.000");
    assert.match(row.ownershipRosterHash, /^[0-9a-f]{64}$/);
  }
});

test("semantic reconciliation recomputes the full pinned roster across month rollover", async () => {
  const manifest = withPinnedOwnershipRoster(
    JSON.parse(await readFile(manifestUrl, "utf8")),
  );
  const august = inMemoryFixtureReport(manifest, "2026-08-01");
  const september = inMemoryFixtureReport(manifest, "2026-09-01");

  validateReport(august, manifest, { expectedCurrentMonth: "2026-08-01" });
  validateReport(september, manifest, { expectedCurrentMonth: "2026-09-01" });
  assert.equal(reportSha256(august), reportSha256(september));
  assert.throws(
    () => assertCurrentMonthDates(
      { ...september, authority: [{ effectiveDate: "2026-08-01" }] },
      "2026-09-01",
    ),
    /effective date/i,
  );
  assert.throws(
    () => validateReport(
      {
        ...september,
        ownershipRoster: september.ownershipRoster.map((row) => ({
          ...row,
          startedOn: "2024-09-01",
        })),
      },
      manifest,
      { expectedCurrentMonth: "2026-09-01" },
    ),
    /roster/i,
  );
  const driftedRoster = september.ownershipRoster.map((row) => ({
    ...row,
    startedOn: "2024-09-01",
  }));
  assert.throws(
    () => validateReport(
      { ...september, ownershipRoster: driftedRoster },
      { ...manifest, ownershipRoster: driftedRoster },
      { expectedCurrentMonth: "2026-09-01" },
    ),
    /roster hash changed/i,
  );
});

test("reconciliation rejects valid-looking wrong ownership identities and payload hashes", async () => {
  const manifest = withPinnedOwnershipRoster(
    JSON.parse(await readFile(manifestUrl, "utf8")),
  );
  const report = inMemoryFixtureReport(manifest, "2026-08-01");
  validateReport(report, manifest);
  const wrongUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const wrongHash = "a".repeat(64);

  assert.throws(
    () => validateReport({ ...report, requests: report.requests.map((row, index) => index === 0 ? { ...row, propertyOwnerId: wrongUuid } : row) }, manifest),
    /propertyOwnerId/i,
  );
  assert.throws(
    () => validateReport({ ...report, requests: report.requests.map((row, index) => index === 0 ? { ...row, payloadHash: wrongHash } : row) }, manifest),
    /payload hash/i,
  );
});

test("fixture reconciliation smoke is mutation-aware and checks physical Storage absence", async () => {
  const source = await readFile(smokeUrl, "utf8");

  for (const required of [
    "reportSha256",
    "ownershipRosterHash",
    "financial_idempotency_requests",
    "activity_logs",
    "storage.objects",
    "supporting_document_id",
    "resubmission_of_request_id",
    "correction_of_entry_id",
  ]) {
    assert.match(source, new RegExp(required.replace(".", "\\.")));
  }
});

test("authenticated acceptance starts at the shell and covers the independent-review zero-correction journey", async () => {
  const source = await readFile(browserUrl, "utf8");

  assert.match(source, /goto\(`?\$\{baseUrl\}\/workspace/);
  assert.match(source, /Open workspace/);
  assert.match(source, /Finance/);
  assert.match(source, /Owner balances/);
  assert.doesNotMatch(source, /goto\([^\n]*owner-balances/);
  for (const required of [
    "finance_member",
    "super_admin",
    "finance_manager",
    "operations_manager",
    "operations_member",
    "reject",
    "resubmit",
    "correction",
    "0.00",
    "role=status",
    "document.activeElement",
    "assertEqualTimestampFixtureCurrentLineage",
    "pending deposit correction exposed a second correction action",
  ]) {
    assert.match(source, new RegExp(required));
  }
});
