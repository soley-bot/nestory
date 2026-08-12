import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the authenticated route contract proves every dashboard page is discoverable or intentionally denied", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-authenticated-route-discoverability.mjs"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  assert.match(result.stdout, /38\/38 authenticated routes discoverable/);
});
