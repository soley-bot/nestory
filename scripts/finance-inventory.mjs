import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  assertKnownFinanceInventoryIssueCodes,
  assertDisposableStackIdentity,
  assertRepositoryState,
  buildFinanceInventoryArtifact,
  collectInventoryPages,
  compareWatermarks,
  financeInventoryContractVersion,
  inventoryArtifactJson,
} from "../src/features/finance/inventory/finance-inventory.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));
const required = [
  "organization",
  "property",
  "currency",
  "period-start",
  "period-end",
  "stack-workdir",
];

for (const option of required) {
  if (!options.get(option)) throw new Error(`Missing required --${option}.`);
}

if (options.get("currency") !== "USD") {
  throw new Error("The current database currency contract supports only USD.");
}

const stackWorkdir = resolve(options.get("stack-workdir"));
const config = await readFile(
  resolve(stackWorkdir, "supabase", "config.toml"),
  "utf8",
);
const stackStatus = readStackStatus(stackWorkdir);
assertDisposableStackIdentity({
  config,
  repositoryRoot,
  stackStatus,
  stackWorkdir,
});

const porcelainStatus = execFileSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
);
const repositoryState = assertRepositoryState({
  allowDirty: options.has("record-dirty"),
  porcelainStatus,
});

const supabaseUrl = stackStatus.API_URL;
const anonKey = stackStatus.ANON_KEY;
if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Disposable stack status did not provide the local API URL and anonymous key.",
  );
}

const email = requireSecret("FINANCE_INVENTORY_ADMIN_EMAIL");
const password = requireSecret("FINANCE_INVENTORY_ADMIN_PASSWORD");
const client = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error || !signIn.data.user) {
  throw new Error(
    "Local finance inventory administrator authentication failed.",
  );
}

const scope = {
  currency: "USD",
  organizationId: options.get("organization"),
  periodEnd: options.get("period-end"),
  periodStart: options.get("period-start"),
  propertyId: options.get("property"),
};
const issueCodes = listOption(options.get("issues"));
const sourceTypes = listOption(options.get("sources"));
assertKnownFinanceInventoryIssueCodes(issueCodes);
const pageSize = Number(options.get("page-size") ?? "500");

async function fetchSection(section) {
  return collectInventoryPages({
    pageSize,
    fetchPage: async ({ afterKey, limit }) => {
      const { data, error } = await client.rpc(
        "get_finance_inventory_page",
        {
          p_after_key: afterKey ?? undefined,
          p_currency: scope.currency,
          p_issue_codes:
            section === "diagnostics" ? (issueCodes ?? undefined) : undefined,
          p_limit: limit,
          p_organization_id: scope.organizationId,
          p_period_end: scope.periodEnd,
          p_period_start: scope.periodStart,
          p_property_id: scope.propertyId,
          p_section: section,
          p_source_types:
            section === "sources" || section === "diagnostics"
              ? (sourceTypes ?? undefined)
              : undefined,
        },
      );
      if (error) {
        throw new Error(
          `Finance inventory ${section} page failed: ${error.message}`,
        );
      }
      return data;
    },
  });
}

const watermarkBeforeRows = await fetchSection("watermark");
const sourceRows = await fetchSection("sources");
const diagnosticRows = await fetchSection("diagnostics");
const accessRows = await fetchSection("access");
const watermarkAfterRows = await fetchSection("watermark");
const watermarkBefore = readWatermark(watermarkBeforeRows);
const watermarkAfter = readWatermark(watermarkAfterRows);
const staleness = compareWatermarks(watermarkBefore, watermarkAfter);
if (staleness.stale) throw new Error(staleness.reason);

const repositorySha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const artifact = buildFinanceInventoryArtifact({
  accessRows,
  diagnosticRows,
  migrationIdentity: watermarkAfter.migrationIdentity,
  repositoryDirty: repositoryState.dirty,
  repositorySha,
  schemaIdentity: watermarkAfter.schemaIdentity,
  scope,
  sourceRows,
  watermark: watermarkAfter,
});

const normalizedJson = inventoryArtifactJson(artifact);
const normalizedHash = createHash("sha256").update(normalizedJson).digest("hex");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve(
  repositoryRoot,
  "artifacts",
  "finance-inventory",
  timestamp,
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "inventory.normalized.json"),
  normalizedJson,
);
await writeFile(
  resolve(outputDirectory, "run-metadata.json"),
  `${JSON.stringify(
    {
      commandParameters: safeCommandParameters(options),
      completedAt: new Date().toISOString(),
      contractVersion: financeInventoryContractVersion,
      normalizedArtifactSha256: normalizedHash,
      outputDirectory,
      repositoryDirty: repositoryState.dirty,
      stackIdentity: {
        apiUrl: supabaseUrl,
        projectId: "nestory-finance-inventory",
        workdir: stackWorkdir,
      },
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(outputDirectory, "inventory.md"),
  renderMarkdown(artifact, diagnosticRows, sourceRows, normalizedHash),
);

process.stdout.write(
  `Finance inventory written to ${outputDirectory} (${sourceRows.length} sources, ${diagnosticRows.length} issues, SHA-256 ${normalizedHash}).\n`,
);

if (
  options.has("strict") &&
  diagnosticRows.some((row) => row.payload.severity === "Critical")
) {
  process.exitCode = 2;
}

function readStackStatus(workdir) {
  let output;
  try {
    output = execFileSync(
      npxInvocation().command,
      [
        ...npxInvocation().prefixArguments,
        "supabase",
        "status",
        "--workdir",
        workdir,
        "--output",
        "json",
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    throw new Error(
      "Could not read status from the required disposable Supabase stack workdir.",
    );
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new Error("Disposable Supabase stack status was not valid JSON.");
  }
}

function npxInvocation() {
  return process.platform === "win32"
    ? {
        command: process.execPath,
        prefixArguments: [
          resolve(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npx-cli.js",
          ),
        ],
      }
    : { command: "npx", prefixArguments: [] };
}

function parseOptions(arguments_) {
  const parsed = new Map();
  for (let index = 0; index < arguments_.length; index += 1) {
    const token = arguments_[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (key === "strict" || key === "record-dirty") {
      parsed.set(key, "true");
      continue;
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }
    parsed.set(key, value);
    index += 1;
  }
  return parsed;
}

function safeCommandParameters(parsedOptions) {
  return Object.fromEntries(
    [...parsedOptions]
      .filter(([key]) => !key.toLowerCase().includes("key"))
      .toSorted(([first], [second]) => first.localeCompare(second)),
  );
}

function listOption(value) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : null;
}

function requireSecret(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required local secret environment variable ${name}.`,
    );
  }
  return value;
}

function readWatermark(rows) {
  if (rows.length !== 1) {
    throw new Error("Expected exactly one source watermark.");
  }
  const hash = rows[0].payload.hash;
  const rowCount = rows[0].payload.rowCount;
  const migrationIdentity = rows[0].payload.migrationIdentity;
  const schemaIdentity = rows[0].payload.schemaIdentity;
  if (
    typeof hash !== "string" ||
    typeof rowCount !== "number" ||
    typeof migrationIdentity !== "string" ||
    typeof schemaIdentity !== "string"
  ) {
    throw new Error("Invalid source watermark provenance contract.");
  }
  return { hash, migrationIdentity, rowCount, schemaIdentity };
}

function renderMarkdown(
  artifact,
  diagnostics,
  sources,
  normalizedArtifactSha256,
) {
  const issueCounts = artifact.parity.unresolvedIssueCounts;
  const proposedBuckets = Object.entries(artifact.parity.proposedBuckets)
    .map(
      ([label, bucket]) =>
        `### ${label}\n\n- Amount: ${bucket.amount} ${scope.currency}\n- Confidence: ${bucket.confidence}\n- Included: ${bucket.includedSources.join(", ") || "none"}\n- Excluded: ${bucket.excludedSources.join(", ") || "none"}\n- Unresolved: ${bucket.unresolvedSources.join(", ") || "none"}`,
    )
    .join("\n\n");

  return `# Finance inventory

This is read-only current-state evidence. Proposed classifications are non-authoritative and do not authorize a repair, backfill, exclusion, or source cutover.

## Scope

- Organization: ${scope.organizationId}
- Property: ${scope.propertyId}
- Currency: ${scope.currency}
- Period: ${scope.periodStart} through ${scope.periodEnd}
- Repository: ${artifact.provenance.repositorySha}${artifact.provenance.repositoryDirty ? " (dirty state explicitly recorded)" : ""}
- Database migration: ${artifact.provenance.migrationIdentity}
- Database schema identity: ${artifact.provenance.schemaIdentity}
- Contract: ${artifact.contractVersion}
- Watermark: ${artifact.sourceWatermark.hash} (${artifact.sourceWatermark.rowCount} dependencies)
- Normalized artifact SHA-256: ${normalizedArtifactSha256}

## Counts

- Sources: ${sources.length}
- Critical: ${issueCounts.Critical}
- High: ${issueCounts.High}
- Medium: ${issueCounts.Medium}
- Low: ${issueCounts.Low}

## Current gross totals

${Object.entries(artifact.parity.currentGrossTotals)
  .map(([label, value]) => `- ${label}: ${value} ${scope.currency}`)
  .join("\n")}

## Non-authoritative proposed buckets

${proposedBuckets}

## Issues

${diagnostics
  .map(
    (row) =>
      `- ${String(row.payload.severity)} ${String(row.payload.issueCode)} (${row.stable_key}): ${String(row.payload.explanation)}`,
  )
  .join("\n")}
`;
}
