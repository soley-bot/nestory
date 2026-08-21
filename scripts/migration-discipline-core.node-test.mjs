import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMigrationChanges,
  evaluateReconciliationManifestChanges,
} from "./migration-discipline-core.mjs";

const baseFiles = new Map([
  ["20260813090000_create_lease_record.sql", "select 1;\n"],
  ["20260813100000_add_lease_history.sql", "select 2;\n"],
]);

test("allows only forward, timestamped migrations after the base history", () => {
  const currentFiles = new Map([
    ...baseFiles,
    ["20260814090000_add_lease_notice.sql", "select 3;\n"],
  ]);

  assert.deepEqual(evaluateMigrationChanges({ baseFiles, currentFiles }), []);
});

test("rejects edits and deletions in the base migration history", () => {
  const currentFiles = new Map([
    ["20260813090000_create_lease_record.sql", "select 99;\n"],
  ]);

  assert.deepEqual(evaluateMigrationChanges({ baseFiles, currentFiles }), [
    "applied migration was modified: 20260813090000_create_lease_record.sql",
    "applied migration was deleted: 20260813100000_add_lease_history.sql",
  ]);
});

test("rejects malformed, backdated, duplicate, and non-portable new migrations", () => {
  const currentFiles = new Map([
    ...baseFiles,
    ["20260812080000_backdated.sql", "select 3;\n"],
    ["20260814090000_add_notice.sql", "select 4;\n"],
    ["20260814090000_duplicate_time.sql", "select 5;\n"],
    ["migration.sql", "select 6;"],
  ]);

  assert.deepEqual(evaluateMigrationChanges({ baseFiles, currentFiles }), [
    "new migration predates the base migration head: 20260812080000_backdated.sql",
    "duplicate migration timestamp 20260814090000: 20260814090000_add_notice.sql, 20260814090000_duplicate_time.sql",
    "invalid migration filename: migration.sql",
    "migration must end with a newline: migration.sql",
  ]);
});

test("allows a declared byte-identical migration version reconciliation", () => {
  const oldPath = "20260813090000_example.sql";
  const newPath = "20260814090000_example.sql";

  assert.deepEqual(
    evaluateMigrationChanges({
      baseFiles: new Map([[oldPath, "select 1;\n"]]),
      currentFiles: new Map([[newPath, "select 1;\n"]]),
      reconciliations: [
        {
          from: oldPath,
          to: newPath,
          name: "example",
          gitSha256:
            "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c",
          sqlSha256:
            "354b7196c9ba5fb4b21cf615bb6ec4cd5c07503c34229feef033fc081a8c03f4",
        },
      ],
    }),
    [],
  );
});

test("rejects a reconciliation when the migration bytes or declared identity differ", () => {
  const oldPath = "20260813090000_example.sql";
  const newPath = "20260814090000_example.sql";
  const declaration = {
    from: oldPath,
    to: newPath,
    name: "example",
    gitSha256:
      "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c",
    sqlSha256:
      "354b7196c9ba5fb4b21cf615bb6ec4cd5c07503c34229feef033fc081a8c03f4",
  };

  const changedBytes = evaluateMigrationChanges({
    baseFiles: new Map([[oldPath, "select 1;\n"]]),
    currentFiles: new Map([[newPath, "select 2;\n"]]),
    reconciliations: [declaration],
  });
  const wrongName = evaluateMigrationChanges({
    baseFiles: new Map([[oldPath, "select 1;\n"]]),
    currentFiles: new Map([[newPath, "select 1;\n"]]),
    reconciliations: [{ ...declaration, name: "different" }],
  });
  const wrongHash = evaluateMigrationChanges({
    baseFiles: new Map([[oldPath, "select 1;\n"]]),
    currentFiles: new Map([[newPath, "select 1;\n"]]),
    reconciliations: [{ ...declaration, gitSha256: "0".repeat(64) }],
  });

  assert.ok(
    changedBytes.includes(
      `reconciled migration bytes changed: ${oldPath} -> ${newPath}`,
    ),
  );
  assert.ok(
    wrongName.includes(
      `reconciliation name does not match paths: different (${oldPath} -> ${newPath})`,
    ),
  );
  assert.ok(
    wrongHash.includes(
      `reconciled migration Git hash mismatch: ${oldPath} -> ${newPath}`,
    ),
  );
});

test("keeps validating reconciliation evidence after the destination is in the base", () => {
  const oldPath = "20260813090000_example.sql";
  const newPath = "20260814090000_example.sql";
  const content = "select 1;\n";
  const declaration = {
    from: oldPath,
    to: newPath,
    name: "example",
    gitSha256:
      "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c",
    sqlSha256:
      "354b7196c9ba5fb4b21cf615bb6ec4cd5c07503c34229feef033fc081a8c03f4",
  };
  const mergedBase = new Map([[newPath, content]]);
  const currentFiles = new Map([[newPath, content]]);

  assert.deepEqual(
    evaluateMigrationChanges({
      baseFiles: mergedBase,
      currentFiles,
      reconciliations: [declaration],
    }),
    [],
  );
  assert.ok(
    evaluateMigrationChanges({
      baseFiles: mergedBase,
      currentFiles,
      reconciliations: [{ ...declaration, gitSha256: "0".repeat(64) }],
    }).includes(
      `reconciled migration Git hash mismatch: ${oldPath} -> ${newPath}`,
    ),
  );
  assert.ok(
    evaluateMigrationChanges({
      baseFiles: mergedBase,
      currentFiles,
      reconciliations: [{ ...declaration, name: "different" }],
    }).includes(
      `reconciliation name does not match paths: different (${oldPath} -> ${newPath})`,
    ),
  );
});

test("preserves reconciliation manifests once they reach the base", () => {
  const manifestPath = "20260821-hosted-ledger.json";
  const manifest = '{"entries":[{"from":"old","to":"new"}]}\n';
  const baseManifests = new Map([[manifestPath, manifest]]);

  assert.deepEqual(
    evaluateReconciliationManifestChanges({
      baseFiles: baseManifests,
      currentFiles: new Map([
        [manifestPath, manifest],
        ["20260901-new-reconciliation.json", '{"entries":[]}\n'],
      ]),
    }),
    [],
  );
  assert.deepEqual(
    evaluateReconciliationManifestChanges({
      baseFiles: baseManifests,
      currentFiles: new Map(),
    }),
    [`migration reconciliation manifest was deleted: ${manifestPath}`],
  );
  assert.deepEqual(
    evaluateReconciliationManifestChanges({
      baseFiles: baseManifests,
      currentFiles: new Map([[manifestPath, '{"entries":[]}\n']]),
    }),
    [`migration reconciliation manifest was modified: ${manifestPath}`],
  );
});
