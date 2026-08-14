import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMigrationChanges } from "./migration-discipline-core.mjs";

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
