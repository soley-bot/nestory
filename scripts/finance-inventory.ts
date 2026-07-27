import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/database.generated.ts";
import {
  assertLocalInventoryEnvironment,
  buildFinanceInventoryArtifact,
  collectInventoryPages,
  compareWatermarks,
  financeInventoryContractVersion,
  inventoryArtifactJson,
  type FinanceInventoryPageRow,
  type FinanceInventorySection,
} from "../src/features/finance/inventory/finance-inventory.ts";

const expectedProjectId = "nestory-finance-inventory";
const expectedEnvironmentId = "local-disposable";
const options = parseOptions(process.argv.slice(2));
const required = [
  "organization",
  "property",
  "currency",
  "period-start",
  "period-end",
  "supabase-url",
  "project-id",
  "environment-id",
] as const;

for (const option of required) {
  if (!options.get(option)) throw new Error(`Missing required --${option}.`);
}

const supabaseUrl = options.get("supabase-url")!;
assertLocalInventoryEnvironment({
  environmentId: options.get("environment-id")!,
  expectedEnvironmentId,
  expectedProjectId,
  projectId: options.get("project-id")!,
  supabaseUrl,
});

const anonKey = requireSecret("FINANCE_INVENTORY_ANON_KEY");
const email = requireSecret("FINANCE_INVENTORY_ADMIN_EMAIL");
const password = requireSecret("FINANCE_INVENTORY_ADMIN_PASSWORD");
const client = createClient<Database>(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error || !signIn.data.user) {
  throw new Error("Local finance inventory administrator authentication failed.");
}

if (options.get("currency") !== "USD") {
  throw new Error("The current database currency contract supports only USD.");
}
const scope = {
  currency: "USD" as const,
  organizationId: options.get("organization")!,
  periodEnd: options.get("period-end")!,
  periodStart: options.get("period-start")!,
  propertyId: options.get("property")!,
};
const issueCodes = listOption(options.get("issues"));
const sourceTypes = listOption(options.get("sources"));
const pageSize = Number(options.get("page-size") ?? "500");

async function fetchSection(section: FinanceInventorySection) {
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
      if (error) throw new Error(`Finance inventory ${section} page failed: ${error.message}`);
      return data as unknown as FinanceInventoryPageRow[];
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
if (staleness.stale) throw new Error(staleness.reason!);

const repositorySha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: resolve(import.meta.dirname, ".."),
  encoding: "utf8",
}).trim();
const migrationIdentity = (
  await readFile(
    resolve(
      import.meta.dirname,
      "..",
      "supabase",
      "migrations",
      "20260727010101_finance_inventory_diagnostics.sql",
    ),
    "utf8",
  )
).includes(financeInventoryContractVersion)
  ? "20260727010101_finance_inventory_diagnostics"
  : "unknown";
const artifact = buildFinanceInventoryArtifact({
  accessRows,
  diagnosticRows,
  migrationIdentity,
  repositorySha,
  scope,
  sourceRows,
  watermark: watermarkAfter,
});

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve(
  import.meta.dirname,
  "..",
  "artifacts",
  "finance-inventory",
  timestamp,
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "inventory.normalized.json"),
  inventoryArtifactJson(artifact),
);
await writeFile(
  resolve(outputDirectory, "run-metadata.json"),
  `${JSON.stringify(
    {
      commandParameters: Object.fromEntries([...options].toSorted()),
      completedAt: new Date().toISOString(),
      contractVersion: financeInventoryContractVersion,
      outputDirectory,
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(outputDirectory, "inventory.md"),
  renderMarkdown(artifact, diagnosticRows, sourceRows),
);

process.stdout.write(
  `Finance inventory written to ${outputDirectory} (${sourceRows.length} sources, ${diagnosticRows.length} issues).\n`,
);

if (
  options.has("strict") &&
  diagnosticRows.some((row) => row.payload.severity === "Critical")
) {
  process.exitCode = 2;
}

function parseOptions(arguments_: string[]) {
  const parsed = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const token = arguments_[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "strict") {
      parsed.set(key, "true");
      continue;
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    parsed.set(key, value);
    index += 1;
  }
  return parsed;
}

function listOption(value: string | undefined) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : null;
}

function requireSecret(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required local secret environment variable ${name}.`);
  return value;
}

function readWatermark(rows: FinanceInventoryPageRow[]) {
  if (rows.length !== 1) throw new Error("Expected exactly one source watermark.");
  const hash = rows[0].payload.hash;
  const rowCount = rows[0].payload.rowCount;
  if (typeof hash !== "string" || typeof rowCount !== "number") {
    throw new Error("Invalid source watermark contract.");
  }
  return { hash, rowCount };
}

function renderMarkdown(
  artifact: ReturnType<typeof buildFinanceInventoryArtifact>,
  diagnostics: FinanceInventoryPageRow[],
  sources: FinanceInventoryPageRow[],
) {
  const issueCounts = artifact.parity.unresolvedIssueCounts;
  return `# Finance inventory

This is read-only current-state evidence. Proposed classifications are non-authoritative and do not authorize a repair, backfill, exclusion, or source cutover.

## Scope

- Organization: ${scope.organizationId}
- Property: ${scope.propertyId}
- Currency: ${scope.currency}
- Period: ${scope.periodStart} through ${scope.periodEnd}
- Repository: ${artifact.provenance.repositorySha}
- Migration: ${artifact.provenance.migrationIdentity}
- Contract: ${artifact.contractVersion}
- Watermark: ${artifact.sourceWatermark.hash} (${artifact.sourceWatermark.rowCount} rows)

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

## Proposed de-duplicated result

- Amount: ${artifact.parity.proposedDeduplicated.amount} ${scope.currency}
- Confidence: ${artifact.parity.proposedDeduplicated.confidence}
- Included typed sources: ${artifact.parity.proposedDeduplicated.includedSources.join(", ") || "none"}
- Excluded typed sources: ${artifact.parity.proposedDeduplicated.excludedSources.join(", ") || "none"}

## Issues

${diagnostics
  .map(
    (row) =>
      `- ${String(row.payload.severity)} ${String(row.payload.issueCode)} (${row.stable_key}): ${String(row.payload.explanation)}`,
  )
  .join("\n")}
`;
}
