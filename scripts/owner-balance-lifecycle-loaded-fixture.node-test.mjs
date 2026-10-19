import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";

import {
  queryOwnerBalanceFixture,
  validateOwnerBalanceFixture,
} from "./smoke-fixture-owner-balance-lifecycle.mjs";

const manifestUrl = new URL("./fixtures/owner-balance-lifecycle.json", import.meta.url);

test("loaded fixture proves two-property, two-month lifecycle authority", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const before = ownershipSnapshot();
  const report = queryOwnerBalanceFixture();
  validateOwnerBalanceFixture(report, manifest);
  assert.equal(ownershipSnapshot(), before, "successful validation must preserve the exact ownership row");
});

function ownershipSnapshot() {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const result = spawnSync("docker", ["exec", findLocalDatabaseContainer(cwd),
    "psql", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
    "SELECT row_to_json(ownership)::text FROM public.property_owners AS ownership WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND id = '90000000-0000-0000-0000-000000000005'"],
    { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(result.stdout.trim(), "", "deliberate ownership fixture must exist");
  return result.stdout.trim();
}

test("failed fixture validation also preserves the ownership row", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const before = ownershipSnapshot();
  const report = queryOwnerBalanceFixture();
  assert.throws(() => validateOwnerBalanceFixture(report, { ...manifest, organizationId: "invalid" }),
    assert.AssertionError);
  assert.equal(ownershipSnapshot(), before, "failed validation must preserve the exact ownership row");
});
