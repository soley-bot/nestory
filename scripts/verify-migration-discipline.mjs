import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  evaluateMigrationChanges,
  evaluateReconciliationManifestChanges,
} from "./migration-discipline-core.mjs";

const projectRoot = process.cwd();
const migrationRoot = resolve(projectRoot, "supabase", "migrations");
const reconciliationRoot = resolve(
  projectRoot,
  "supabase",
  "migration-reconciliations",
);
const baseRef = resolveBaseRef();
const baseFiles = readBaseFiles(baseRef);
const baseReconciliationFiles = readBaseReconciliationFiles(baseRef);
const currentFiles = await readCurrentFiles();
const reconciliationState = await readReconciliations();
const reconciliations = reconciliationState.declarations;
const issues = [
  ...evaluateMigrationChanges({
    baseFiles,
    currentFiles,
    reconciliations,
  }),
  ...evaluateReconciliationManifestChanges({
    baseFiles: baseReconciliationFiles,
    currentFiles: reconciliationState.files,
  }),
];

if (issues.length > 0) {
  process.stderr.write(
    `Migration discipline failed against ${baseRef}:\n${issues
      .map((issue) => `- ${issue}`)
      .join("\n")}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Migration discipline passed: ${baseFiles.size} immutable base migrations and ${
    currentFiles.size - baseFiles.size
  } forward migrations checked against ${baseRef}; ${reconciliations.length} historical reconciliation declarations validated.\n`,
);

function git(args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function canResolve(ref) {
  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function resolveBaseRef() {
  const explicit = process.env.MIGRATION_BASE_REF?.trim();
  if (explicit) {
    if (!canResolve(explicit)) {
      throw new Error(`MIGRATION_BASE_REF cannot be resolved: ${explicit}`);
    }
    return explicit;
  }

  const before = process.env.GITHUB_EVENT_BEFORE?.trim();
  if (before && !/^0+$/.test(before) && canResolve(before)) return before;
  if (canResolve("origin/main") && git(["rev-parse", "origin/main"]) !== git(["rev-parse", "HEAD"])) {
    return "origin/main";
  }
  if (canResolve("HEAD^")) return "HEAD^";

  throw new Error(
    "No migration base is available. Set MIGRATION_BASE_REF to an immutable deployed commit.",
  );
}

function readBaseFiles(ref) {
  const prefix = "supabase/migrations/";
  const paths = git(["ls-tree", "-r", "--name-only", ref, "--", prefix])
    .split(/\r?\n/)
    .filter((path) => path.endsWith(".sql"));

  return new Map(
    paths.map((path) => [
      path.slice(prefix.length),
      execFileSync("git", ["show", `${ref}:${path}`], {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ]),
  );
}

async function readCurrentFiles() {
  const paths = (await readdir(migrationRoot))
    .filter((path) => path.endsWith(".sql"))
    .sort();
  return new Map(
    await Promise.all(
      paths.map(async (path) => [path, await readFile(resolve(migrationRoot, path), "utf8")]),
    ),
  );
}

function readBaseReconciliationFiles(ref) {
  const prefix = "supabase/migration-reconciliations/";
  const paths = git(["ls-tree", "-r", "--name-only", ref, "--", prefix])
    .split(/\r?\n/)
    .filter((path) => path.endsWith(".json"));

  return new Map(
    paths.map((path) => [
      path.slice(prefix.length),
      execFileSync("git", ["show", `${ref}:${path}`], {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ]),
  );
}

async function readReconciliations() {
  let entries;
  try {
    entries = await readdir(reconciliationRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { declarations: [], files: new Map() };
    }
    throw error;
  }

  const declarations = [];
  const files = new Map();
  for (const entry of entries
    .filter((candidate) => candidate.isFile() && candidate.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(reconciliationRoot, entry.name);
    const content = await readFile(path, "utf8");
    files.set(entry.name, content);
    const manifest = JSON.parse(content);
    if (!Array.isArray(manifest.entries)) {
      throw new Error(`Migration reconciliation manifest has no entries array: ${path}`);
    }
    declarations.push(...manifest.entries);
  }
  return { declarations, files };
}
