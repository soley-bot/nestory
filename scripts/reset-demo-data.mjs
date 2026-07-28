import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertReferenceDate(value) {
  if (!DATE_PATTERN.test(value)) {
    throw new Error("Reference date must use YYYY-MM-DD.");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Reference date must be a real calendar date.");
  }

  return value;
}

export function parseArgs(args) {
  const result = { referenceDate: null, help: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }

    if (argument === "--reference-date") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--reference-date requires a YYYY-MM-DD value.");
      }
      result.referenceDate = assertReferenceDate(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return result;
}

export function buildSeedInput(seedSql, referenceDate) {
  const checkedDate = assertReferenceDate(referenceDate);
  return [
    `SET app.demo_seed_reference_date = '${checkedDate}';`,
    seedSql,
  ].join("\n");
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    shell: false,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

export function findLocalDatabaseContainer(cwd) {
  if (process.env.SUPABASE_DB_CONTAINER) {
    return process.env.SUPABASE_DB_CONTAINER;
  }

  const preferred = `supabase_db_${path.basename(cwd).replace(/-fresh-demo-data$/, "")}`;
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { encoding: "utf8", shell: false },
  );

  if (result.error || result.status !== 0) {
    throw new Error("Could not inspect the local Supabase database container.");
  }

  const containers = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (containers.includes(preferred)) {
    return preferred;
  }
  if (containers.length === 1) {
    return containers[0];
  }

  throw new Error(
    "Could not select one local Supabase database container. Set SUPABASE_DB_CONTAINER explicitly.",
  );
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    process.stdout.write(
      [
        "Usage: npm run db:reset:demo -- [--reference-date YYYY-MM-DD]",
        "",
        "Runs the normal local Supabase reset. When a reference date is supplied,",
        "the deterministic seed is replayed in one local PostgreSQL session.",
        "",
      ].join("\n"),
    );
    return;
  }

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const cwd = path.resolve(scriptDirectory, "..");
  if (process.platform === "win32") {
    runChecked(
      process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "npx.cmd supabase db reset"],
      { cwd },
    );
  } else {
    runChecked("npx", ["supabase", "db", "reset"], { cwd });
  }

  if (!options.referenceDate) {
    return;
  }

  const seedPath = path.join(cwd, "supabase", "seed.sql");
  const seedSql = await readFile(seedPath, "utf8");
  const container = findLocalDatabaseContainer(cwd);

  runChecked(
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
    {
      cwd,
      input: buildSeedInput(seedSql, options.referenceDate),
    },
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
