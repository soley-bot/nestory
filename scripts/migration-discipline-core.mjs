const migrationNamePattern = /^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

export function evaluateMigrationChanges({ baseFiles, currentFiles }) {
  const appliedIssues = [];
  const backdatedIssues = [];
  const duplicateIssues = [];
  const formatIssues = [];

  for (const [path, baseContent] of baseFiles) {
    if (!currentFiles.has(path)) {
      appliedIssues.push(`applied migration was deleted: ${path}`);
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

      if (!baseFiles.has(path) && baseHead && timestamp < baseHead) {
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
