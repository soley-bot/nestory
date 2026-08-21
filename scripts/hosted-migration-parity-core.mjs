import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const migrationVersionPattern = /^\d{14}$/;
const migrationNamePattern = /^[a-z0-9_]+$/;
const hostedLedgerMaxBufferBytes = 64 * 1024 * 1024;

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

export function evaluateHostedMigrationContent({
  localMigrations,
  remoteMigrations,
  contentExceptions = [],
}) {
  if (!Array.isArray(localMigrations)) {
    throw new Error("local migrations must be an array");
  }
  if (!Array.isArray(remoteMigrations)) {
    throw new Error("hosted migrations must be an array");
  }
  if (!Array.isArray(contentExceptions)) {
    throw new Error("hosted migration content exceptions must be an array");
  }

  const issues = [];
  const localByVersion = new Map();
  for (const migration of localMigrations) {
    if (!migration || typeof migration !== "object") {
      issues.push("local migration content contains a non-object row");
      continue;
    }
    const version = String(migration.version ?? "");
    if (!migrationVersionPattern.test(version)) {
      issues.push("local migration content contains an invalid version");
      continue;
    }
    if (
      !migrationNamePattern.test(String(migration.name ?? "")) ||
      typeof migration.body !== "string"
    ) {
      issues.push(`local migration content is malformed for ${version}`);
      continue;
    }
    if (localByVersion.has(version)) {
      issues.push(`duplicate local migration content for ${version}`);
      continue;
    }
    localByVersion.set(version, migration);
  }

  const exceptionsByVersion = new Map();
  const exceptionStates = new Map();
  for (const exception of contentExceptions) {
    const version = String(exception?.version ?? "");
    const name = String(exception?.name ?? "");
    if (
      !migrationVersionPattern.test(version) ||
      !migrationNamePattern.test(name) ||
      !isSha256(exception?.gitSqlSha256) ||
      !isSha256(exception?.hostedLedgerSha256)
    ) {
      issues.push(
        "hosted migration content exceptions contain a malformed entry",
      );
      continue;
    }
    if (exceptionsByVersion.has(version)) {
      issues.push(
        `duplicate hosted migration content exception for ${version}`,
      );
      continue;
    }
    exceptionsByVersion.set(version, exception);
    exceptionStates.set(version, "unseen");
  }

  const seenRemote = new Set();
  for (const migration of remoteMigrations) {
    if (!migration || typeof migration !== "object") {
      issues.push("hosted migration ledger contains a non-object row");
      continue;
    }
    const version = String(migration.version ?? "");
    if (!migrationVersionPattern.test(version)) {
      issues.push("hosted migration ledger contains an invalid version");
      continue;
    }
    if (seenRemote.has(version)) {
      issues.push(`duplicate hosted migration ledger content for ${version}`);
      continue;
    }
    seenRemote.add(version);

    const name = String(migration.name ?? "");
    if (!migrationNamePattern.test(name)) {
      issues.push(`hosted migration name is malformed for ${version}`);
      continue;
    }
    if (
      !Array.isArray(migration.statements) ||
      migration.statements.length === 0 ||
      migration.statements.some((statement) => typeof statement !== "string")
    ) {
      issues.push(`hosted migration statements are malformed for ${version}`);
      continue;
    }

    const local = localByVersion.get(version);
    if (!local) {
      issues.push(
        `hosted migration content has no Git migration for ${version}`,
      );
      continue;
    }
    if (local.name !== name) {
      issues.push(
        `hosted migration name mismatch for ${version}: expected ${local.name}, found ${name}`,
      );
    }
    if (!migrationBodyMatchesStatements(local.body, migration.statements)) {
      const exception = exceptionsByVersion.get(version);
      if (
        exception &&
        exception.name === local.name &&
        exception.gitSqlSha256 === hashGitMigrationBody(local.body) &&
        exception.hostedLedgerSha256 === hashHostedMigrationLedger(migration)
      ) {
        exceptionStates.set(version, "used");
      } else if (exception) {
        exceptionStates.set(version, "mismatch");
        issues.push(
          `hosted migration SQL mismatch for ${version} (pinned exception does not match)`,
        );
      } else {
        issues.push(`hosted migration SQL mismatch for ${version}`);
      }
    } else if (exceptionsByVersion.has(version)) {
      exceptionStates.set(version, "exact");
    }
  }

  for (const [version, state] of exceptionStates) {
    if (state === "unseen") {
      issues.push(
        `hosted migration content exception has no hosted migration for ${version}`,
      );
    } else if (state === "exact") {
      issues.push(
        `hosted migration content exception is no longer required for ${version}`,
      );
    }
  }

  return issues;
}

export function readHostedMigrationLedgerOutput(output) {
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
    if (!row || typeof row !== "object") {
      throw new Error("Supabase migration ledger contains a non-object row");
    }
    return {
      version: String(row.version ?? ""),
      name: String(row.name ?? ""),
      statements: row.statements,
    };
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

function validateVersions(label, values) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} migration versions must be an array`);
  }

  const issues = [];
  if (values.length === 0) {
    issues.push(`no ${label} migration versions found`);
  }
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

function migrationBodyMatchesStatements(body, statements) {
  const normalizedBody = normalizeMigrationText(body).replace(/^\uFEFF/, "");
  let cursor = 0;

  for (const rawStatement of statements) {
    const statement = normalizeMigrationText(rawStatement).trim();
    if (!statement) return false;
    const position = normalizedBody.indexOf(statement, cursor);
    if (position === -1) return false;
    if (!/^[\s;]*$/.test(normalizedBody.slice(cursor, position))) return false;
    cursor = position + statement.length;
  }

  return /^[\s;]*$/.test(normalizedBody.slice(cursor));
}

function normalizeMigrationText(value) {
  return String(value).replace(/\r\n?/g, "\n");
}

export function hashGitMigrationBody(body) {
  return sha256(normalizeMigrationText(body).replace(/^\uFEFF/, ""));
}

export function hashHostedMigrationLedger(migration) {
  return sha256(
    JSON.stringify({
      version: String(migration.version),
      name: String(migration.name),
      statements: migration.statements.map((statement) =>
        normalizeMigrationText(statement),
      ),
    }),
  );
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value ?? ""));
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
