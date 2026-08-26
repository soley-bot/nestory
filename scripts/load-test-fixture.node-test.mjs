import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findUnsupportedFixtureActivityEntityTypes,
  fixtureSupportedActivityEntityTypes,
  selectLocalDatabaseContainer,
} from "./load-test-fixture.mjs";

test("fixture TypeScript runner is installed by the repository manifest", () => {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"), "--version"],
    { cwd: repositoryRoot, encoding: "utf8", shell: false },
  );

  assert.equal(result.status, 0, result.stderr);
});

test("paid-cost fixture entry point loads in a standalone TypeScript process", () => {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const moduleUrl = pathToFileURL(
    path.join(
      repositoryRoot,
      "src",
      "features",
      "finance-operations",
      "paid-cost-evidence.ts",
    ),
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      "--eval",
      `import(${JSON.stringify(moduleUrl)}).then((module) => { const api = module.default ?? module; if (typeof api.preparePaidCostEvidenceForFixture !== "function") process.exit(2); })`,
    ],
    { cwd: repositoryRoot, encoding: "utf8", shell: false },
  );

  assert.equal(result.status, 0, result.stderr);
});

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
