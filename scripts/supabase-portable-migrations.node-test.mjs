import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runSupabaseWithPortableMigrations,
  runWithLfMigrations,
} from "./supabase-portable-migrations.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("repository commands and text policies keep migration replay portable", () => {
  const attributes = fs.readFileSync(
    path.join(repositoryRoot, ".gitattributes"),
    "utf8",
  );
  const editorConfig = fs.readFileSync(
    path.join(repositoryRoot, ".editorconfig"),
    "utf8",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  );

  assert.match(attributes, /^supabase\/migrations\/\*\.sql text eol=lf$/m);
  assert.match(
    editorConfig,
    /\[supabase\/migrations\/\*\.sql\][\s\S]*?end_of_line = lf/,
  );
  assert.equal(
    packageJson.scripts["supabase:start"],
    "node scripts/run-supabase-portable.mjs start",
  );
  assert.equal(
    packageJson.scripts["db:reset"],
    "node scripts/run-supabase-portable.mjs db reset --local --no-seed",
  );
});

test("presents LF migrations to an operation and restores the exact source bytes", (t) => {
  const fixture = createMigrationFixture(t);
  let observed;

  const result = runWithLfMigrations({
    migrationsDirectory: fixture.migrationsDirectory,
    operation() {
      observed = fs.readFileSync(fixture.crlfMigrationPath, "utf8");
      return "completed";
    },
  });

  assert.equal(result, "completed");
  assert.equal(observed, "select 1;\nselect 2;\n");
  assert.equal(fs.readFileSync(fixture.crlfMigrationPath, "utf8"), fixture.crlfSource);
  assert.equal(fs.readFileSync(fixture.lfMigrationPath, "utf8"), fixture.lfSource);
});

test("restores migration bytes when the operation fails", (t) => {
  const fixture = createMigrationFixture(t);

  assert.throws(
    () =>
      runWithLfMigrations({
        migrationsDirectory: fixture.migrationsDirectory,
        operation() {
          assert.equal(
            fs.readFileSync(fixture.crlfMigrationPath, "utf8"),
            "select 1;\nselect 2;\n",
          );
          throw new Error("expected failure");
        },
      }),
    /expected failure/,
  );

  assert.equal(fs.readFileSync(fixture.crlfMigrationPath, "utf8"), fixture.crlfSource);
  assert.equal(fs.readFileSync(fixture.lfMigrationPath, "utf8"), fixture.lfSource);
});

test("runs the CLI from the repository while migrations are LF-normalized", (t) => {
  const fixture = createMigrationFixture(t);
  const observationPath = path.join(fixture.repositoryRoot, "observed.json");
  const fakeCliPath = path.join(fixture.repositoryRoot, "fake-supabase.mjs");
  fs.writeFileSync(
    fakeCliPath,
    [
      'import fs from "node:fs";',
      'import path from "node:path";',
      "const migration = fs.readFileSync(",
      '  path.join(process.cwd(), "supabase", "migrations", "20260814000000_crlf.sql"),',
      '  "utf8",',
      ");",
      "fs.writeFileSync(",
      "  process.env.NESTORY_TEST_OBSERVATION,",
      "  JSON.stringify({ args: process.argv.slice(2), migration, cwd: process.cwd() }),",
      ");",
    ].join("\n"),
  );

  const status = runSupabaseWithPortableMigrations({
    repositoryRoot: fixture.repositoryRoot,
    cliEntryPoint: fakeCliPath,
    args: ["db", "reset", "--local", "--no-seed"],
    environment: {
      ...process.env,
      NESTORY_TEST_OBSERVATION: observationPath,
    },
  });
  const observation = JSON.parse(fs.readFileSync(observationPath, "utf8"));

  assert.equal(status, 0);
  assert.deepEqual(observation.args, ["db", "reset", "--local", "--no-seed"]);
  assert.equal(observation.migration, "select 1;\nselect 2;\n");
  assert.equal(observation.cwd, fixture.repositoryRoot);
  assert.equal(fs.readFileSync(fixture.crlfMigrationPath, "utf8"), fixture.crlfSource);
});

function createMigrationFixture(t) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "nestory-supabase-migrations-"),
  );
  t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

  const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
  fs.mkdirSync(migrationsDirectory, { recursive: true });

  const crlfMigrationPath = path.join(
    migrationsDirectory,
    "20260814000000_crlf.sql",
  );
  const lfMigrationPath = path.join(
    migrationsDirectory,
    "20260814000001_lf.sql",
  );
  const crlfSource = "select 1;\r\nselect 2;\r\n";
  const lfSource = "select 3;\n";
  fs.writeFileSync(crlfMigrationPath, crlfSource);
  fs.writeFileSync(lfMigrationPath, lfSource);

  return {
    repositoryRoot,
    migrationsDirectory,
    crlfMigrationPath,
    lfMigrationPath,
    crlfSource,
    lfSource,
  };
}
