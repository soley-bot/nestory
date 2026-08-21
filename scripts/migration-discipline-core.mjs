import { createHash } from "node:crypto";

const migrationNamePattern = /^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

export function evaluateMigrationChanges({
  baseFiles,
  currentFiles,
  reconciliations = [],
}) {
  const reconciliation = evaluateReconciliations({
    baseFiles,
    currentFiles,
    reconciliations,
  });
  const appliedIssues = [...reconciliation.issues];
  const backdatedIssues = [];
  const duplicateIssues = [];
  const formatIssues = [];

  for (const [path, baseContent] of baseFiles) {
    if (!currentFiles.has(path)) {
      if (!reconciliation.approvedSources.has(path)) {
        appliedIssues.push(`applied migration was deleted: ${path}`);
      }
    } else if (currentFiles.get(path) !== baseContent) {
      appliedIssues.push(`applied migration was modified: ${path}`);
    }
  }

  const baseTimestamps = [...baseFiles.keys()]
    .map((path) => migrationNamePattern.exec(path)?.[1])
    .filter(Boolean)
    .sort();
  const baseHead = baseTimestamps.at(-1);
  const pathsByTimestamp = new Map();

  for (const [path, content] of currentFiles) {
    const match = migrationNamePattern.exec(path);
    if (!match) {
      formatIssues.push(`invalid migration filename: ${path}`);
    } else {
      const timestamp = match[1];
      const paths = pathsByTimestamp.get(timestamp) ?? [];
      paths.push(path);
      pathsByTimestamp.set(timestamp, paths);

      if (
        !baseFiles.has(path) &&
        !reconciliation.approvedTargets.has(path) &&
        baseHead &&
        timestamp < baseHead
      ) {
        backdatedIssues.push(`new migration predates the base migration head: ${path}`);
      }
    }

    if (!content.endsWith("\n")) {
      formatIssues.push(`migration must end with a newline: ${path}`);
    }
  }

  for (const [timestamp, paths] of pathsByTimestamp) {
    if (paths.length > 1) {
      duplicateIssues.push(
        `duplicate migration timestamp ${timestamp}: ${paths.sort().join(", ")}`,
      );
    }
  }

  return [
    ...appliedIssues,
    ...backdatedIssues.sort(),
    ...duplicateIssues.sort(),
    ...formatIssues.sort(),
  ];
}

function evaluateReconciliations({ baseFiles, currentFiles, reconciliations }) {
  const approvedSources = new Set();
  const approvedTargets = new Set();
  const issues = [];
  const declaredSources = new Set();
  const declaredTargets = new Set();

  for (const entry of reconciliations) {
    const from = entry?.from;
    const to = entry?.to;
    const name = entry?.name;
    const label = `${from ?? "<missing>"} -> ${to ?? "<missing>"}`;

    if (
      typeof from !== "string" ||
      typeof to !== "string" ||
      typeof name !== "string" ||
      typeof entry?.gitSha256 !== "string" ||
      typeof entry?.sqlSha256 !== "string"
    ) {
      issues.push(`invalid migration reconciliation declaration: ${label}`);
      continue;
    }

    if (declaredSources.has(from) || declaredTargets.has(to)) {
      issues.push(`duplicate migration reconciliation declaration: ${label}`);
      continue;
    }
    declaredSources.add(from);
    declaredTargets.add(to);

    const expectedSuffix = `_${name}.sql`;
    if (!from.endsWith(expectedSuffix) || !to.endsWith(expectedSuffix)) {
      issues.push(
        `reconciliation name does not match paths: ${name} (${label})`,
      );
      continue;
    }

    // Once merged, the canonical destination is immutable base history. Keep
    // validating the declaration against that file so the proof cannot drift.
    if (!baseFiles.has(from) && baseFiles.has(to)) {
      if (!currentFiles.has(to)) {
        issues.push(`reconciliation target not found in current history: ${to}`);
        continue;
      }
      if (currentFiles.has(from)) {
        issues.push(`reconciliation source reappeared in current history: ${from}`);
        continue;
      }

      const currentContent = currentFiles.get(to);
      if (sha256(currentContent) !== entry.gitSha256) {
        issues.push(`reconciled migration Git hash mismatch: ${label}`);
        continue;
      }
      if (sha256(trimTrailingNewlines(currentContent)) !== entry.sqlSha256) {
        issues.push(`reconciled migration SQL hash mismatch: ${label}`);
      }
      continue;
    }

    if (!baseFiles.has(from)) {
      issues.push(`reconciliation source not found in base: ${from}`);
      continue;
    }
    if (!currentFiles.has(to)) {
      issues.push(`reconciliation target not found in current history: ${to}`);
      continue;
    }
    if (currentFiles.has(from)) {
      issues.push(`reconciliation source still exists in current history: ${from}`);
      continue;
    }

    const baseContent = baseFiles.get(from);
    const currentContent = currentFiles.get(to);
    if (baseContent !== currentContent) {
      issues.push(`reconciled migration bytes changed: ${label}`);
      continue;
    }
    if (sha256(currentContent) !== entry.gitSha256) {
      issues.push(`reconciled migration Git hash mismatch: ${label}`);
      continue;
    }
    if (sha256(trimTrailingNewlines(currentContent)) !== entry.sqlSha256) {
      issues.push(`reconciled migration SQL hash mismatch: ${label}`);
      continue;
    }

    approvedSources.add(from);
    approvedTargets.add(to);
  }

  return { approvedSources, approvedTargets, issues };
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function trimTrailingNewlines(content) {
  return content.replace(/[\r\n]+$/u, "");
}
