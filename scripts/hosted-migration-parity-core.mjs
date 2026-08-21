const migrationVersionPattern = /^\d{14}$/;

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
    const position = mismatchIndex === -1 ? local.versions.length : mismatchIndex;
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
