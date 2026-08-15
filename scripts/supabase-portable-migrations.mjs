import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function runWithLfMigrations({ migrationsDirectory, operation }) {
  const originals = [];

  try {
    for (const migrationPath of findSqlFiles(migrationsDirectory)) {
      const source = fs.readFileSync(migrationPath);
      const normalized = source.toString("utf8").replace(/\r\n?/g, "\n");
      const normalizedBuffer = Buffer.from(normalized, "utf8");

      if (!source.equals(normalizedBuffer)) {
        originals.push({ migrationPath, source });
        fs.writeFileSync(migrationPath, normalizedBuffer);
      }
    }

    return operation();
  } finally {
    for (const { migrationPath, source } of originals) {
      fs.writeFileSync(migrationPath, source);
    }
  }
}

export function runSupabaseWithPortableMigrations({
  repositoryRoot,
  cliEntryPoint,
  args,
  environment = process.env,
}) {
  return runWithLfMigrations({
    migrationsDirectory: path.join(repositoryRoot, "supabase", "migrations"),
    operation() {
      const result = spawnSync(process.execPath, [cliEntryPoint, ...args], {
        cwd: repositoryRoot,
        env: environment,
        stdio: "inherit",
      });

      if (result.error) throw result.error;
      return Number.isInteger(result.status) ? result.status : 1;
    },
  });
}

function findSqlFiles(directory) {
  const sqlFiles = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sqlFiles.push(...findSqlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      sqlFiles.push(entryPath);
    }
  }

  return sqlFiles;
}
