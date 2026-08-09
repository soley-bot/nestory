import assert from "node:assert/strict";
import test from "node:test";

import {
  findUnsupportedFixtureActivityEntityTypes,
  fixtureSupportedActivityEntityTypes,
} from "./load-test-fixture.mjs";

test("fixture activity validation rejects entity types the application cannot resolve", () => {
  assert.deepEqual(
    findUnsupportedFixtureActivityEntityTypes(
      ["task", "unresolvable_fixture_type", "lease"],
      fixtureSupportedActivityEntityTypes,
    ),
    ["unresolvable_fixture_type"],
  );
});

test("fixture activity validation accepts the complete resolver allowlist", () => {
  assert.deepEqual(
    findUnsupportedFixtureActivityEntityTypes(
      [...fixtureSupportedActivityEntityTypes].reverse(),
      fixtureSupportedActivityEntityTypes,
    ),
    [],
  );
});
