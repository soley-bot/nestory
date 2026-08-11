import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import activityEntityTypesModule from "../src/features/activity/entity-types.ts";

export const fixtureSupportedActivityEntityTypes =
  activityEntityTypesModule.activityEntityTypes ??
  activityEntityTypesModule.default ??
  activityEntityTypesModule;

export function findUnsupportedFixtureActivityEntityTypes(
  fixtureEntityTypes,
  supportedEntityTypes,
) {
  const supported = new Set(supportedEntityTypes);

  return [...new Set(fixtureEntityTypes)]
    .filter((entityType) => !supported.has(entityType))
    .sort();
}

export function selectLocalDatabaseContainer(
  cwd,
  containerNames,
  { expectedContainerName } = {},
) {
  if (process.env.SUPABASE_DB_CONTAINER) {
    const explicitContainer = process.env.SUPABASE_DB_CONTAINER;
    if (!containerNames.includes(explicitContainer)) {
      throw new Error(
        `Explicit local Supabase database container is not running: ${explicitContainer}`,
      );
    }
    if (
      expectedContainerName &&
      explicitContainer !== expectedContainerName
    ) {
      throw new Error(
        `Explicit database target ${explicitContainer} does not match the configured local Supabase project (${expectedContainerName}).`,
      );
    }
    return explicitContainer;
  }

  const preferred = expectedContainerName ?? `supabase_db_${path.basename(cwd)}`;
  if (containerNames.includes(preferred)) return preferred;
  if (expectedContainerName) {
    throw new Error(
      `Configured local Supabase database container is not running: ${expectedContainerName}`,
    );
  }
  if (containerNames.length === 1) return containerNames[0];
  throw new Error(
    "Could not select one local Supabase database container. Set SUPABASE_DB_CONTAINER explicitly.",
  );
}

function configuredLocalDatabaseContainerName(cwd) {
  const config = readFileSync(path.join(cwd, "supabase", "config.toml"), "utf8");
  const projectId = config.match(/^\s*project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m)?.[1];
  if (!projectId) {
    throw new Error("Could not verify the local Supabase project_id in supabase/config.toml.");
  }
  return `supabase_db_${projectId}`;
}

export function findLocalDatabaseContainer(cwd) {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { encoding: "utf8", shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("Could not inspect the local Supabase database container.");
  }

  return selectLocalDatabaseContainer(
    cwd,
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    { expectedContainerName: configuredLocalDatabaseContainerName(cwd) },
  );
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const cwd = path.resolve(scriptDirectory, "..");
  const fixturePath = path.join(
    cwd,
    "supabase",
    "test-fixtures",
    "baseline.sql",
  );
  const fixtureSql = await readFile(fixturePath, "utf8");
  const container = findLocalDatabaseContainer(cwd);
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { cwd, encoding: "utf8", input: fixtureSql, shell: false },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not load the test fixture.");
  }

  const activityResult = spawnSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-c",
      "SELECT DISTINCT entity_type FROM public.activity_logs ORDER BY entity_type",
    ],
    { cwd, encoding: "utf8", shell: false },
  );

  if (activityResult.error) throw activityResult.error;
  if (activityResult.status !== 0) {
    throw new Error(
      activityResult.stderr.trim() ||
        "Could not inspect fixture activity entity types.",
    );
  }

  const fixtureActivityEntityTypes = activityResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const unsupportedActivityEntityTypes =
    findUnsupportedFixtureActivityEntityTypes(
      fixtureActivityEntityTypes,
      fixtureSupportedActivityEntityTypes,
    );

  if (unsupportedActivityEntityTypes.length > 0) {
    throw new Error(
      `Fixture activity target resolver is missing: ${unsupportedActivityEntityTypes.join(", ")}`,
    );
  }

  const paidCostFixture = spawnSync(
    process.execPath,
    [
      path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(cwd, "scripts", "load-paid-cost-scenarios-fixture.ts"),
    ],
    { cwd, encoding: "utf8", shell: false },
  );
  if (paidCostFixture.error) throw paidCostFixture.error;
  if (paidCostFixture.status !== 0) {
    throw new Error(
      paidCostFixture.stderr.trim() || "Could not load paid-cost scenarios.",
    );
  }

  const publicationFixture = spawnSync(
    process.execPath,
    [
      path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(cwd, "scripts", "load-owner-statement-publication-fixture.ts"),
    ],
    { cwd, encoding: "utf8", shell: false },
  );
  if (publicationFixture.error) throw publicationFixture.error;
  if (publicationFixture.status !== 0) {
    throw new Error(
      publicationFixture.stderr.trim() || "Could not load official Owner Statement fixture.",
    );
  }

  process.stdout.write("Database test baseline loaded.\n");
  process.stdout.write("Fixture activity targets verified.\n");
  process.stdout.write(paidCostFixture.stdout);
  process.stdout.write(publicationFixture.stdout);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Could not load the test fixture."}\n`,
    );
    process.exitCode = 1;
  });
}
