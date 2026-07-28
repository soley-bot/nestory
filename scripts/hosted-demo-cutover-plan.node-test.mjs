import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCutoverManifest,
  CUTOVER_EXPECTATIONS,
  REQUIRED_TARGET_COUNTS,
  validateInventory,
} from "./hosted-demo-cutover-plan-core.mjs";

function validInventory() {
  return {
    projectRef: CUTOVER_EXPECTATIONS.projectRef,
    projectSlug: CUTOVER_EXPECTATIONS.projectSlug,
    migrationHead: CUTOVER_EXPECTATIONS.migrationHead,
    organizations: [
      {
        id: CUTOVER_EXPECTATIONS.targetOrganizationId,
        name: "Nestory",
        slug: "nestory-demo",
        tableCounts: Object.fromEntries(
          REQUIRED_TARGET_COUNTS.map((table) => [table, 0]),
        ),
        invitationsByStatus: { pending: 0, accepted: 1, revoked: 0 },
        adminUserIds: ["00000000-0000-0000-0000-000000000101"],
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Preserved Company",
        slug: "preserved-company",
      },
    ],
  };
}

test("a complete exact-scope inventory produces a planning-only manifest", () => {
  const manifest = buildCutoverManifest(validInventory(), "2030-01-15");

  assert.equal(manifest.mode, "planning-only");
  assert.equal(manifest.executeSupported, false);
  assert.equal(
    manifest.targetOrganization.id,
    CUTOVER_EXPECTATIONS.targetOrganizationId,
  );
  assert.deepEqual(
    manifest.preservedOrganizations.map((organization) => organization.id),
    ["22222222-2222-2222-2222-222222222222"],
  );
  assert.match(manifest.inventorySha256, /^[0-9a-f]{64}$/);
});

test("the project ref and slug fail closed", () => {
  const wrongRef = validInventory();
  wrongRef.projectRef = "wrong";
  assert.throws(() => validateInventory(wrongRef), /projectRef/);

  const wrongSlug = validInventory();
  wrongSlug.projectSlug = "wrong";
  assert.throws(() => validateInventory(wrongSlug), /projectSlug/);
});

test("the exact migration head is required", () => {
  const inventory = validInventory();
  inventory.migrationHead = "older_migration";
  assert.throws(() => validateInventory(inventory), /migrationHead/);
});

test("the expected target organization must appear exactly once", () => {
  const missing = validInventory();
  missing.organizations[0].id = "11111111-1111-1111-1111-111111111111";
  assert.throws(() => validateInventory(missing), /exactly one organization/);

  const duplicate = validInventory();
  duplicate.organizations.push({ ...duplicate.organizations[0] });
  assert.throws(() => validateInventory(duplicate), /duplicated/);
});

test("incomplete snapshots are rejected", () => {
  const missingCount = validInventory();
  delete missingCount.organizations[0].tableCounts.leases;
  assert.throws(() => validateInventory(missingCount), /tableCounts\.leases/);

  const missingAdmins = validInventory();
  missingAdmins.organizations[0].adminUserIds = [];
  assert.throws(() => validateInventory(missingAdmins), /adminUserId/);
});
