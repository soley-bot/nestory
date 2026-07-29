const COPY_HEADER =
  /^COPY (?:"public"|public)\.(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*)) \((.+)\) FROM stdin;$/;

const DEFAULT_IGNORED_UNSCOPED_TABLES = new Set(["public_interest_requests"]);

export function transformTargetOrgDump(
  source,
  {
    sourceOrganizationId,
    targetOrganizationId,
    identityMap = new Map(),
    excludedTables = new Set(),
    ignoredUnscopedTables = DEFAULT_IGNORED_UNSCOPED_TABLES,
    forbiddenIdentityPattern,
  },
) {
  requireUuid(sourceOrganizationId, "sourceOrganizationId");
  requireUuid(targetOrganizationId, "targetOrganizationId");

  const normalized = source.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  const output = [
    "-- Target-organization data extracted from a PostgreSQL COPY dump.",
    "-- Restore only after independently verifying the destination identity.",
    "",
  ];
  const tableCounts = {};

  for (let index = 0; index < lines.length; index += 1) {
    const match = COPY_HEADER.exec(lines[index]);
    if (!match) {
      continue;
    }

    const tableName = match[1] ?? match[2];
    const columns = parseColumns(match[3]);
    const rows = [];

    index += 1;
    for (; index < lines.length && lines[index] !== "\\."; index += 1) {
      if (lines[index] !== "") {
        rows.push(lines[index]);
      }
    }

    if (index >= lines.length) {
      throw new Error(`COPY block for public.${tableName} is not terminated.`);
    }

    if (excludedTables.has(tableName)) {
      continue;
    }

    const boundaryColumn = tableName === "organizations" ? "id" : "organization_id";
    const boundaryIndex = columns.indexOf(boundaryColumn);

    if (boundaryIndex === -1) {
      if (rows.length > 0 && !ignoredUnscopedTables.has(tableName)) {
        throw new Error(
          `public.${tableName} does not expose an organization_id column.`,
        );
      }
      continue;
    }

    const selectedRows = rows
      .filter((row) => splitCopyRow(row).at(boundaryIndex) === sourceOrganizationId)
      .map((row) =>
        remapRow(row, sourceOrganizationId, targetOrganizationId, identityMap),
      );

    if (selectedRows.length === 0) {
      continue;
    }

    output.push(lines[index - rows.length - 1], ...selectedRows, "\\.", "");
    tableCounts[tableName] = selectedRows.length;
  }

  const sql = output.join("\n");
  if (forbiddenIdentityPattern?.test(sql)) {
    throw new Error("Target dump contains an unmapped local auth identity.");
  }

  return { sql, tableCounts };
}

function parseColumns(rawColumns) {
  return rawColumns.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
}

function splitCopyRow(row) {
  return row.split("\t");
}

function remapRow(
  row,
  sourceOrganizationId,
  targetOrganizationId,
  identityMap,
) {
  let mapped = row.replaceAll(sourceOrganizationId, targetOrganizationId);
  for (const [sourceIdentity, targetIdentity] of identityMap) {
    requireUuid(sourceIdentity, "identityMap source");
    requireUuid(targetIdentity, "identityMap target");
    mapped = mapped.replaceAll(sourceIdentity, targetIdentity);
  }
  return mapped;
}

function requireUuid(value, label) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${label} must be a UUID.`);
  }
}
