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
    selectedRentMonths: ["2026-07-01", "2026-08-01"],
    signedExceptionCount: 0,
    tenantOpeningTotal: "875.00",
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
