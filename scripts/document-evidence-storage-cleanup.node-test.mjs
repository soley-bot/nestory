import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("Storage cleanup uses the awaited authenticated API instead of SQL metadata deletion", async () => {
  const source = await readFile(
    path.join(repoRoot, "scripts", "document-evidence-storage.node-test.mjs"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /DELETE\s+FROM\s+storage\.objects/i,
    "test cleanup must never orphan physical Storage files by deleting metadata directly",
  );
  assert.match(
    source,
    /finally\s*\{[\s\S]*await\s+cleanupExactArtifacts\(/,
    "the async finally path must await exact authenticated Storage removal",
  );
});
