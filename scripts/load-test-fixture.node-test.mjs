import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findUnsupportedFixtureActivityEntityTypes,
  fixtureSupportedActivityEntityTypes,
  selectLocalDatabaseContainer,
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

test("fixture loader fails closed when an explicit database target is not verified as running", () => {
  const originalContainer = process.env.SUPABASE_DB_CONTAINER;
  process.env.SUPABASE_DB_CONTAINER = "supabase_db_unrelated";

  try {
    assert.throws(
      () => selectLocalDatabaseContainer(
        path.join("fixture-workspace", "nestory"),
        ["supabase_db_nestory"],
      ),
      /explicit local Supabase database container is not running/i,
    );
  } finally {
    if (originalContainer === undefined) {
      delete process.env.SUPABASE_DB_CONTAINER;
    } else {
      process.env.SUPABASE_DB_CONTAINER = originalContainer;
    }
  }
});

test("fixture loader rejects a running explicit target from a different local Supabase project", () => {
  const originalContainer = process.env.SUPABASE_DB_CONTAINER;
  process.env.SUPABASE_DB_CONTAINER = "supabase_db_unrelated";

  try {
    assert.throws(
      () => selectLocalDatabaseContainer(
        path.join(
          "fixture-workspace",
          "nestory",
          ".worktrees",
          "ips-operational-readiness",
        ),
        ["supabase_db_nestory", "supabase_db_unrelated"],
        { expectedContainerName: "supabase_db_nestory" },
      ),
      /does not match the configured local Supabase project/i,
    );
  } finally {
    if (originalContainer === undefined) {
      delete process.env.SUPABASE_DB_CONTAINER;
    } else {
      process.env.SUPABASE_DB_CONTAINER = originalContainer;
    }
  }
});

test("fixture loader selects the project configured for an isolated worktree", () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "nestory-fixture-selector-"));
  const supabaseDirectory = path.join(workspace, "supabase");
  mkdirSync(supabaseDirectory);
  writeFileSync(
    path.join(supabaseDirectory, "config.toml"),
    'project_id = "isolated_cleanup"\n',
  );

  try {
    assert.equal(
      selectLocalDatabaseContainer(workspace, [
        `supabase_db_${path.basename(workspace)}`,
        "supabase_db_isolated_cleanup",
      ]),
      "supabase_db_isolated_cleanup",
    );
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
});
