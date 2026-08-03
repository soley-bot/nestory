import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function selectLocalDatabaseContainer(cwd, containerNames) {
  if (process.env.SUPABASE_DB_CONTAINER) {
    return process.env.SUPABASE_DB_CONTAINER;
  }

  const preferred = `supabase_db_${path.basename(cwd)}`;
  if (containerNames.includes(preferred)) return preferred;
  if (containerNames.length === 1) return containerNames[0];
  throw new Error(
    "Could not select one local Supabase database container. Set SUPABASE_DB_CONTAINER explicitly.",
  );
}

function findLocalDatabaseContainer(cwd) {
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
  );
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const cwd = path.resolve(scriptDirectory, "..");
  const fixturePath = path.join(
    cwd,
    "supabase",
    "tests",
    "fixtures",
    "legacy-baseline.sql",
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
  process.stdout.write("Database test baseline loaded.\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Could not load the test fixture."}\n`,
    );
    process.exitCode = 1;
  });
}
