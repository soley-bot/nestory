import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalizeIpsCutoverManifest,
  inspectIpsCutoverManifest,
} from "./verify-ips-cutover-manifest.mjs";

const manifest = JSON.parse(
  await readFile(
    new URL("./fixtures/ips-cutover-manifest.json", import.meta.url),
    "utf8",
  ),
);

test("redacted IPS cutover manifest has one explicit selected-month story and four owner components", () => {
  const result = inspectIpsCutoverManifest(manifest);

  assert.deepEqual(result, {
    authorityStartDate: "2026-09-01",
    dataOwner: "REDACTED-IPS-DATA-OWNER",
    importTypes: ["leases", "people", "properties", "units"],
    ownerComponentCount: 4,
    ownerOpeningTotals: [{ amount: "2290.50", currency: "USD" }],
    selectedRentMonths: ["2026-07-01", "2026-08-01"],
    signedExceptionCount: 0,
    tenantOpeningTotals: [{ amount: "875.00", currency: "USD" }],
  });
});

test("manifest canonical form is stable across object-key ordering and rejects adjacent inference", () => {
  const canonical = canonicalizeIpsCutoverManifest(manifest);
  const reordered = {
    ...manifest,
    scope: {
      propertyCode: manifest.scope.propertyCode,
      organizationReference: manifest.scope.organizationReference,
    },
  };

  assert.equal(canonicalizeIpsCutoverManifest(reordered), canonical);
  assert.doesNotMatch(canonical, /2026-06-01/);
});

test("normal multi-tenant and multi-property manifests preserve per-scope uniqueness", () => {
  const expanded = structuredClone(manifest);
  expanded.tenantOpeningBalances.push({
    ...structuredClone(expanded.tenantOpeningBalances[0]),
    sourceKey: "cutover-garden-b01-tenant-balance-v1",
    propertyCode: "GDN-RES",
    unitNumber: "B-01",
    expectedBalance: "125.00",
  });
  expanded.ownerOpeningComponents.push(
    ...expanded.ownerOpeningComponents.map((opening) => ({
      ...structuredClone(opening),
      sourceKey: `${opening.sourceKey}-garden`,
      sourceReference: `${opening.sourceReference}-GARDEN`,
      propertyCode: "GDN-RES",
    })),
  );

  assert.deepEqual(inspectIpsCutoverManifest(expanded), {
    authorityStartDate: "2026-09-01",
    dataOwner: "REDACTED-IPS-DATA-OWNER",
    importTypes: ["leases", "people", "properties", "units"],
    ownerComponentCount: 8,
    ownerOpeningTotals: [{ amount: "4581.00", currency: "USD" }],
    selectedRentMonths: ["2026-07-01", "2026-08-01"],
    signedExceptionCount: 0,
    tenantOpeningTotals: [{ amount: "1000.00", currency: "USD" }],
  });
});

test("manifest rejects incomplete owner groups and duplicate months only within one tenant", () => {
  const incomplete = structuredClone(manifest);
  incomplete.ownerOpeningComponents.push(
    ...manifest.ownerOpeningComponents.slice(0, 3).map((opening) => ({
      ...structuredClone(opening),
      sourceKey: `${opening.sourceKey}-incomplete`,
      propertyCode: "GDN-RES",
    })),
  );
  assert.throws(
    () => inspectIpsCutoverManifest(incomplete),
    /all four owner opening components/i,
  );

  const duplicateMonth = structuredClone(manifest);
  duplicateMonth.tenantOpeningBalances[0].selectedRentMonths.push("2026-07-01");
  assert.throws(
    () => inspectIpsCutoverManifest(duplicateMonth),
    /unique within each tenant opening/i,
  );
});

test("manifest enforces USD authority and canonical signed-exception timestamps", () => {
  const unsupported = structuredClone(manifest);
  unsupported.tenantOpeningBalances[0].currency = "KHR";
  assert.throws(() => inspectIpsCutoverManifest(unsupported), /unsupported currency/i);

  const signed = structuredClone(manifest);
  signed.signedExceptions.push({
    approvedAt: "2026-08-10T01:02:03Z",
    approvedBy: "REDACTED-DATA-OWNER",
    reason: "Redacted source exception independently approved",
    sourceKey: "cutover-exception-v1",
  });
  assert.equal(inspectIpsCutoverManifest(signed).signedExceptionCount, 1);

  signed.signedExceptions[0].approvedAt = "2026-99-99Tnot-a-timestamp";
  assert.throws(
    () => inspectIpsCutoverManifest(signed),
    /canonical approval timestamp/i,
  );
});
