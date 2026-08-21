import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { TextDecoder } from "node:util";

const migrationVersionPattern = /^\d{14}$/;
const migrationNamePattern = /^[a-z0-9_]+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const hostedLedgerMaxBufferBytes = 64 * 1024 * 1024;
const separatorPattern = /^[\u0009-\u000d\u0020;]*/;
const trailingSeparatorPattern = /^[\u0009-\u000d\u0020;]*$/;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const supabaseCliPackages = {
  darwin: {
    arm64: ["@supabase/cli-darwin-arm64"],
    x64: ["@supabase/cli-darwin-x64"],
  },
  linux: {
    arm64: ["@supabase/cli-linux-arm64", "@supabase/cli-linux-arm64-musl"],
    x64: ["@supabase/cli-linux-x64", "@supabase/cli-linux-x64-musl"],
  },
  win32: {
    arm64: ["@supabase/cli-windows-arm64"],
    x64: ["@supabase/cli-windows-x64"],
  },
};

export function resolvePinnedSupabaseCliBinary() {
  const candidates = supabaseCliPackages[process.platform]?.[process.arch];
  if (!candidates) {
    throw new Error(
      `unsupported platform for pinned Supabase CLI: ${process.platform}-${process.arch}`,
    );
  }

  const require = createRequire(import.meta.url);
  const extension = process.platform === "win32" ? ".exe" : "";
  for (const packageName of candidates) {
    try {
      const packageJson = require.resolve(`${packageName}/package.json`);
      return path.join(
        path.dirname(packageJson),
        "bin",
        `supabase${extension}`,
      );
    } catch {}
  }

  throw new Error(
    `pinned Supabase CLI binary package is unavailable for ${process.platform}-${process.arch}`,
  );
}

export function runCommandWithBoundedOutput(command, args, options = {}) {
  const {
    encoding = "utf8",
    maxBuffer = hostedLedgerMaxBufferBytes,
    ...spawnOptions
  } = options;
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer <= 0) {
    throw new Error("command capture limit must be a positive safe integer");
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...spawnOptions,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let captureError;
    let settled = false;

    const finish = (status, error, signal = null) => {
      if (settled) return;
      settled = true;
      resolve({
        status,
        signal,
        error,
        stdout: Buffer.concat(stdout).toString(encoding),
        stderr: Buffer.concat(stderr).toString(encoding),
      });
    };

    const capture = (label, chunks, chunk) => {
      if (captureError) return;
      const nextBytes =
        label === "stdout"
          ? stdoutBytes + chunk.length
          : stderrBytes + chunk.length;
      if (nextBytes > maxBuffer) {
        captureError = new Error(
          `${label} exceeded ${maxBuffer} byte capture limit`,
        );
        child.kill();
        return;
      }
      if (label === "stdout") stdoutBytes = nextBytes;
      else stderrBytes = nextBytes;
      chunks.push(chunk);
    };

    child.stdout.on("data", (chunk) => capture("stdout", stdout, chunk));
    child.stderr.on("data", (chunk) => capture("stderr", stderr, chunk));
    child.once("error", (error) => finish(null, error));
    child.once("close", (status, signal) =>
      finish(status, captureError, signal),
    );
  });
}

export function evaluateHostedMigrationParity({
  localVersions,
  remoteVersions,
  phase,
}) {
  if (phase !== "preflight" && phase !== "postflight") {
    throw new Error(`Unsupported hosted migration parity phase: ${phase}`);
  }

  const local = validateVersions("local", localVersions);
  const remote = validateVersions("remote", remoteVersions);
  const issues = [...local.issues, ...remote.issues];
  const localSet = new Set(local.versions);

  for (const version of remote.versions) {
    if (!localSet.has(version)) {
      issues.push(`unknown remote migration version: ${version}`);
    }
  }

  let prefixMatches = remote.versions.length <= local.versions.length;
  let mismatchIndex = -1;
  for (let index = 0; index < remote.versions.length; index += 1) {
    if (remote.versions[index] !== local.versions[index]) {
      prefixMatches = false;
      mismatchIndex = index;
      break;
    }
  }

  if (!prefixMatches) {
    const position =
      mismatchIndex === -1 ? local.versions.length : mismatchIndex;
    issues.push(
      `remote migration history is not an exact Git prefix at position ${
        position + 1
      }: expected ${local.versions[position] ?? "<end>"}, found ${
        remote.versions[position] ?? "<end>"
      }`,
    );
  }

  const pendingVersions = prefixMatches
    ? local.versions.slice(remote.versions.length)
    : [];
  if (phase === "postflight") {
    for (const version of pendingVersions) {
      issues.push(`postflight still has pending local migration: ${version}`);
    }
  }

  return {
    issues,
    localCount: local.versions.length,
    remoteCount: remote.versions.length,
    pendingVersions,
  };
}

export function evaluateHostedMigrationHashes({
  localMigrations,
  remoteVersions,
  remoteMigrations,
  manifestEntries,
  contentExceptions = [],
}) {
  const issues = [];
  const localByVersion = readLocalMigrationMap(localMigrations, issues);
  const manifestByVersion = readManifestMap(manifestEntries, issues);
  const exceptionsByVersion = readExceptionMap(contentExceptions, issues);
  const remoteByVersion = readRemoteMigrationMap(remoteMigrations, issues);

  const expectedRemote = validateExactVersions(
    "hosted migration",
    remoteVersions,
    issues,
  );
  if (!sameOrderedVersions(expectedRemote, [...remoteByVersion.keys()].sort())) {
    issues.push(
      "hosted hash query did not return every ledger version exactly once",
    );
  }

  const localVersions = [...localByVersion.keys()].sort();
  const manifestVersions = [...manifestByVersion.keys()].sort();
  if (
    manifestVersions.length === 0 ||
    !isOrderedPrefix(manifestVersions, localVersions) ||
    !isOrderedPrefix(manifestVersions, expectedRemote)
  ) {
    issues.push(
      "hosted migration hash manifest is not an exact non-empty ledger prefix",
    );
  }

  for (const [version, local] of localByVersion) {
    const manifest = manifestByVersion.get(version);
    if (!manifest) continue;
    if (manifest.name !== local.name) {
      issues.push(`hosted migration hash manifest name mismatch for ${version}`);
    }
    if (manifest.gitSqlSha256 !== hashGitMigrationBody(local.body)) {
      issues.push(`hosted migration Git hash mismatch for ${version}`);
    }
  }

  const usedExceptions = new Set();
  for (const [version, remote] of remoteByVersion) {
    const local = localByVersion.get(version);
    const manifest = manifestByVersion.get(version);
    if (!local) {
      issues.push(`hosted migration hash has no Git evidence for ${version}`);
      continue;
    }
    if (remote.name !== local.name) {
      issues.push(
        `hosted migration name mismatch for ${version}: expected ${local.name}, found ${remote.name}`,
      );
    }
    const recomputedRemoteHash = canonicalMigrationHash(remote);
    if (remote.canonicalSha256 !== recomputedRemoteHash) {
      issues.push(`hosted canonical hash is internally inconsistent for ${version}`);
    }

    const exception = exceptionsByVersion.get(version);
    if (exception) {
      usedExceptions.add(version);
      if (
        !manifest ||
        exception.name !== local.name ||
        exception.gitSqlSha256 !== hashGitMigrationBody(local.body) ||
        exception.hostedLedgerDbSha256 !== remote.hostedLedgerDbSha256 ||
        manifest.canonicalSha256 !== remote.canonicalSha256 ||
        manifest.legacyException !== true
      ) {
        issues.push(
          `hosted migration SQL mismatch for ${version} (pinned exception does not match)`,
        );
      }
      continue;
    }

    if (manifest?.legacyException === true) {
      issues.push(`unexpected legacy exception marker for ${version}`);
    }
    const reconstructed = reconstructLocalMigrationDescriptors(
      local.body,
      remote.statements,
    );
    if (reconstructed.issue) {
      issues.push(`hosted migration SQL mismatch for ${version}`);
      continue;
    }
    const localCanonicalHash = canonicalMigrationHash({
      version,
      name: local.name,
      statements: reconstructed.statements,
    });
    if (
      localCanonicalHash !== remote.canonicalSha256 ||
      (manifest && manifest.canonicalSha256 !== remote.canonicalSha256)
    ) {
      issues.push(`hosted migration canonical hash mismatch for ${version}`);
    }
  }

  for (const version of exceptionsByVersion.keys()) {
    if (!usedExceptions.has(version)) {
      issues.push(
        `hosted migration content exception has no hosted migration for ${version}`,
      );
    }
  }

  return issues;
}

export function reconstructLocalMigrationDescriptors(body, descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return { issue: "statement descriptors are empty", statements: [] };
  }
  const normalizedBody = normalizeMigrationText(body).replace(/^\uFEFF/, "");
  let cursor = 0;
  const statements = [];

  for (const descriptor of descriptors) {
    if (!isStatementDescriptor(descriptor)) {
      return { issue: "statement descriptor is malformed", statements: [] };
    }
    const separator = separatorPattern.exec(normalizedBody.slice(cursor))?.[0] ?? "";
    cursor += separator.length;
    const remaining = normalizedBody.slice(cursor);
    const remainingBytes = Buffer.from(remaining, "utf8");
    if (remainingBytes.length < descriptor.byteLength) {
      return { issue: "Git migration is shorter than hosted statement", statements: [] };
    }

    const statementBytes = remainingBytes.subarray(0, descriptor.byteLength);
    let statement;
    try {
      statement = utf8Decoder.decode(statementBytes);
    } catch {
      return { issue: "hosted statement length splits a UTF-8 character", statements: [] };
    }
    const localDescriptor = describeMigrationStatement(statement);
    if (
      localDescriptor.byteLength !== descriptor.byteLength ||
      localDescriptor.sha256 !== descriptor.sha256
    ) {
      return { issue: "Git statement hash differs from hosted statement", statements: [] };
    }
    statements.push(localDescriptor);
    cursor += statement.length;
  }

  if (!trailingSeparatorPattern.test(normalizedBody.slice(cursor))) {
    return { issue: "Git migration has unmatched SQL content", statements: [] };
  }
  return { statements };
}

export function describeMigrationStatement(statement) {
  const normalized = normalizeMigrationText(statement);
  return {
    byteLength: Buffer.byteLength(normalized, "utf8"),
    sha256: sha256(normalized),
  };
}

export function canonicalMigrationHash({ version, name, statements }) {
  const normalizedVersion = String(version ?? "");
  const normalizedName = String(name ?? "");
  if (
    !migrationVersionPattern.test(normalizedVersion) ||
    !migrationNamePattern.test(normalizedName) ||
    !Array.isArray(statements) ||
    statements.some((statement) => !isStatementDescriptor(statement))
  ) {
    throw new Error("cannot hash malformed migration descriptors");
  }

  const descriptorStream = statements
    .map(
      (statement) =>
        `s${statement.byteLength}:${statement.sha256}`,
    )
    .join("");
  const canonical =
    `v${Buffer.byteLength(normalizedVersion, "utf8")}:${normalizedVersion}` +
    `n${Buffer.byteLength(normalizedName, "utf8")}:${normalizedName}` +
    `c${statements.length}:${descriptorStream}`;
  return sha256(canonical);
}

export function readHostedMigrationHashOutput(output) {
  let payload;
  try {
    payload = JSON.parse(String(output ?? ""));
  } catch (error) {
    throw new Error(`Supabase db-query output is not JSON: ${error.message}`);
  }
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error("Supabase db-query JSON has no rows array");
  }

  return payload.rows.map((row) => {
    const migration = {
      version: String(row?.version ?? ""),
      name: String(row?.name ?? ""),
      statementCount: Number(row?.statement_count),
      statementBytes: Number(row?.statement_bytes),
      statements: Array.isArray(row?.statement_descriptors)
        ? row.statement_descriptors.map((statement) => ({
            byteLength: Number(statement?.byteLength),
            sha256: String(statement?.sha256 ?? ""),
          }))
        : [],
      canonicalSha256: String(row?.canonical_sha256 ?? ""),
      hostedLedgerDbSha256: String(row?.hosted_ledger_db_sha256 ?? ""),
    };
    if (!isRemoteMigrationHash(migration)) {
      throw new Error("Supabase migration hash query contains a malformed row");
    }
    return migration;
  });
}

export function readMigrationVersions(payload) {
  if (!payload || !Array.isArray(payload.migrations)) {
    throw new Error("Supabase migration list JSON has no migrations array");
  }
  const localVersions = [];
  const remoteVersions = [];
  for (const row of payload.migrations) {
    if (!row || typeof row !== "object") {
      throw new Error("Supabase migration list contains a non-object row");
    }
    if (row.local) localVersions.push(String(row.local));
    if (row.remote) remoteVersions.push(String(row.remote));
  }
  return { localVersions, remoteVersions };
}

export function readMigrationListOutput(output) {
  const text = String(output ?? "");
  try {
    return readMigrationVersions(JSON.parse(text));
  } catch (error) {
    if (!/Local\s+\|\s+Remote/.test(text)) {
      throw new Error(
        `Supabase migration list was neither supported JSON nor a migration table: ${error.message}`,
      );
    }
  }

  const localVersions = [];
  const remoteVersions = [];
  for (const line of text.split(/\r?\n/)) {
    const row = line.match(/^\s*(\d{14})?\s*\|\s*(\d{14})?\s*\|/);
    if (!row) continue;
    if (row[1]) localVersions.push(row[1]);
    if (row[2]) remoteVersions.push(row[2]);
  }
  return { localVersions, remoteVersions };
}

export function hashGitMigrationBody(body) {
  return sha256(normalizeMigrationText(body).replace(/^\uFEFF/, ""));
}

export function isMigrationBodyEffectivelyEmpty(body) {
  const text = normalizeMigrationText(body).replace(/^\uFEFF/, "");
  let cursor = 0;

  while (cursor < text.length) {
    const separator = separatorPattern.exec(text.slice(cursor))?.[0] ?? "";
    cursor += separator.length;
    if (cursor >= text.length) return true;

    if (text.startsWith("--", cursor)) {
      const newline = text.indexOf("\n", cursor + 2);
      cursor = newline === -1 ? text.length : newline + 1;
      continue;
    }

    if (text.startsWith("/*", cursor)) {
      cursor += 2;
      let depth = 1;
      while (cursor < text.length && depth > 0) {
        if (text.startsWith("/*", cursor)) {
          depth += 1;
          cursor += 2;
        } else if (text.startsWith("*/", cursor)) {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      continue;
    }

    return false;
  }

  return true;
}

function readLocalMigrationMap(localMigrations, issues) {
  const result = new Map();
  if (!Array.isArray(localMigrations)) {
    issues.push("local migrations must be an array");
    return result;
  }
  for (const migration of localMigrations) {
    const version = String(migration?.version ?? "");
    const name = String(migration?.name ?? "");
    if (
      !migrationVersionPattern.test(version) ||
      !migrationNamePattern.test(name) ||
      typeof migration?.body !== "string" ||
      result.has(version)
    ) {
      issues.push("local migration content contains malformed or duplicate rows");
      continue;
    }
    result.set(version, { version, name, body: migration.body });
  }
  return result;
}

function readManifestMap(entries, issues) {
  const result = new Map();
  if (!Array.isArray(entries)) {
    issues.push("hosted migration hash manifest must be an array");
    return result;
  }
  for (const entry of entries) {
    const version = String(entry?.version ?? "");
    const name = String(entry?.name ?? "");
    if (
      !migrationVersionPattern.test(version) ||
      !migrationNamePattern.test(name) ||
      !sha256Pattern.test(String(entry?.gitSqlSha256 ?? "")) ||
      !sha256Pattern.test(String(entry?.canonicalSha256 ?? "")) ||
      (entry?.legacyException !== undefined &&
        typeof entry.legacyException !== "boolean") ||
      result.has(version)
    ) {
      issues.push("hosted migration hash manifest contains malformed rows");
      continue;
    }
    result.set(version, {
      version,
      name,
      gitSqlSha256: entry.gitSqlSha256,
      canonicalSha256: entry.canonicalSha256,
      legacyException: entry.legacyException === true,
    });
  }
  return result;
}

function readExceptionMap(exceptions, issues) {
  const result = new Map();
  if (!Array.isArray(exceptions)) {
    issues.push("hosted migration content exceptions must be an array");
    return result;
  }
  for (const exception of exceptions) {
    const version = String(exception?.version ?? "");
    const name = String(exception?.name ?? "");
    if (
      !migrationVersionPattern.test(version) ||
      !migrationNamePattern.test(name) ||
      !sha256Pattern.test(String(exception?.gitSqlSha256 ?? "")) ||
      !sha256Pattern.test(String(exception?.hostedLedgerSha256 ?? "")) ||
      !sha256Pattern.test(String(exception?.hostedLedgerDbSha256 ?? "")) ||
      result.has(version)
    ) {
      issues.push("hosted migration content exceptions contain malformed rows");
      continue;
    }
    result.set(version, exception);
  }
  return result;
}

function readRemoteMigrationMap(remoteMigrations, issues) {
  const result = new Map();
  if (!Array.isArray(remoteMigrations)) {
    issues.push("hosted migration hashes must be an array");
    return result;
  }
  for (const migration of remoteMigrations) {
    if (!isRemoteMigrationHash(migration) || result.has(migration.version)) {
      issues.push("hosted migration hashes contain malformed or duplicate rows");
      continue;
    }
    result.set(migration.version, migration);
  }
  return result;
}

function isRemoteMigrationHash(migration) {
  return (
    migration &&
    migrationVersionPattern.test(String(migration.version ?? "")) &&
    migrationNamePattern.test(String(migration.name ?? "")) &&
    Number.isSafeInteger(migration.statementCount) &&
    migration.statementCount >= 0 &&
    Number.isSafeInteger(migration.statementBytes) &&
    migration.statementBytes >= 0 &&
    Array.isArray(migration.statements) &&
    migration.statements.length === migration.statementCount &&
    migration.statements.every(isStatementDescriptor) &&
    migration.statements.reduce(
      (total, statement) => total + statement.byteLength,
      0,
    ) === migration.statementBytes &&
    sha256Pattern.test(String(migration.canonicalSha256 ?? "")) &&
    sha256Pattern.test(String(migration.hostedLedgerDbSha256 ?? ""))
  );
}

function isStatementDescriptor(statement) {
  return (
    statement &&
    Number.isSafeInteger(statement.byteLength) &&
    statement.byteLength > 0 &&
    sha256Pattern.test(String(statement.sha256 ?? ""))
  );
}

function validateVersions(label, values) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} migration versions must be an array`);
  }
  const issues = [];
  if (values.length === 0) issues.push(`no ${label} migration versions found`);
  const seen = new Set();
  const versions = [];
  for (const rawVersion of values) {
    const version = String(rawVersion);
    if (!migrationVersionPattern.test(version)) {
      issues.push(`invalid ${label} migration version: ${version}`);
      continue;
    }
    if (seen.has(version)) {
      issues.push(`duplicate ${label} migration version: ${version}`);
      continue;
    }
    seen.add(version);
    versions.push(version);
  }
  versions.sort();
  return { issues, versions };
}

function validateExactVersions(label, values, issues) {
  if (!Array.isArray(values) || values.length === 0) {
    issues.push(`${label} versions must be a non-empty array`);
    return [];
  }
  const result = [];
  const seen = new Set();
  for (const rawVersion of values) {
    const version = String(rawVersion);
    if (!migrationVersionPattern.test(version) || seen.has(version)) {
      issues.push(`${label} versions are malformed or duplicated`);
      continue;
    }
    seen.add(version);
    result.push(version);
  }
  return result.sort();
}

function sameOrderedVersions(left, right) {
  return (
    left.length === right.length &&
    left.every((version, index) => version === right[index])
  );
}

function isOrderedPrefix(prefix, values) {
  return (
    prefix.length <= values.length &&
    prefix.every((version, index) => version === values[index])
  );
}

function normalizeMigrationText(value) {
  return String(value).replace(/\r\n?/g, "\n");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
