import assert from "node:assert/strict";
import test from "node:test";

import {
  MANIFEST_SQL,
  parseManifestArgs,
} from "./demo-seed-manifest.mjs";

test("manifest output paths are optional and explicit", () => {
  assert.deepEqual(parseManifestArgs([]), { outputPath: null });
  assert.deepEqual(parseManifestArgs(["--output", "manifest.json"]), {
    outputPath: "manifest.json",
  });
  assert.throws(() => parseManifestArgs(["--execute"]), /Usage/);
});

test("manifest SQL orders every fixture id collection", () => {
  assert.equal((MANIFEST_SQL.match(/jsonb_agg\(id ORDER BY id\)/g) ?? []).length, 5);
  assert.doesNotMatch(MANIFEST_SQL, /SELECT \*/i);
});
