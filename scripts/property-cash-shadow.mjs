import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  iteratePropertyCashEvents,
} from "../src/features/finance/data/property-cash-events.ts";
import {
  buildPropertyCashShadowArtifact,
  propertyCashShadowStrictIssues,
} from "../src/features/finance/data/property-cash-shadow-artifact.ts";
import {
  buildPropertyCashShadowParity,
} from "../src/features/finance/data/property-cash-shadow-parity.ts";
import {
  buildPropertyCashShadowMaterialStateToken,
} from "../src/features/finance/data/property-cash-shadow-material.ts";
import {
  loadPropertyCashShadowDocuments,
} from "../src/features/finance/data/property-cash-shadow-documents.ts";
import {
  assertDisposableStackIdentity,
  assertRepositoryState,
  collectInventoryPages,
  compareWatermarks,
} from "../src/features/finance/inventory/finance-inventory.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));
if (options.has("help")) {
  process.stdout.write(`Usage:
  npm run finance:property-cash-shadow -- \\
    --organization <uuid> --property <uuid> --currency USD \\
    --period-start YYYY-MM-DD --period-end YYYY-MM-DD \\
    --stack-workdir artifacts/finance-inventory-stack \\
    [--page-size 500] [--strict] [--record-dirty]

The command accepts only the disposable local Finance inventory stack, authenticates
as its fixture administrator, reads checked public RPCs and current-path sources,
and writes deterministic JSON plus Markdown under artifacts/property-cash-shadow/.
`);
  process.exit(0);
}

for (const key of [
  "organization",
  "property",
  "currency",
  "period-start",
  "period-end",
  "stack-workdir",
]) {
  if (!options.get(key)) throw new Error(`Missing required --${key}.`);
}
if (options.get("currency") !== "USD") {
  throw new Error("Property cash shadow supports only exact USD currency.");
}
if (["production", "preview"].includes(process.env.VERCEL_ENV ?? "")) {
  throw new Error("Property cash shadow rejects production and preview execution.");
}

const stackWorkdir = resolve(options.get("stack-workdir"));
const config = await readFile(resolve(stackWorkdir, "supabase", "config.toml"), "utf8");
const stackStatus = readStackStatus(stackWorkdir);
assertDisposableStackIdentity({
  config,
  repositoryRoot,
  stackStatus,
  stackWorkdir,
});
const apiUrl = new URL(stackStatus.API_URL);
if (
  apiUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(apiUrl.hostname)
) {
  throw new Error("Property cash shadow rejects hosted Supabase URLs.");
}

const porcelainStatus = git(["status", "--porcelain=v1", "--untracked-files=all"]);
const repositoryState = assertRepositoryState({
  allowDirty: options.has("record-dirty"),
  porcelainStatus,
});
const repositorySha = git(["rev-parse", "HEAD"]).trim();
const client = createClient(stackStatus.API_URL, stackStatus.ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const signIn = await client.auth.signInWithPassword({
  email: requireEnvironment("FINANCE_INVENTORY_ADMIN_EMAIL"),
  password: requireEnvironment("FINANCE_INVENTORY_ADMIN_PASSWORD"),
});
if (signIn.error || !signIn.data.user) {
  throw new Error("Local Finance fixture administrator authentication failed.");
}

const scope = {
  currency: "USD",
  organizationId: options.get("organization"),
  periodEnd: options.get("period-end"),
  periodStart: options.get("period-start"),
  propertyId: options.get("property"),
};
const pageSize = Number(options.get("page-size") ?? "500");
if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
  throw new Error("Property cash shadow page size must be between 1 and 1,000.");
}

const watermarkBeforeRows = await inventorySection("watermark");
const currentBefore = await loadCurrentPathEvidence();
const canonicalEvents = [];
for await (const event of iteratePropertyCashEvents(client, {
  ...scope,
  pageSize,
})) {
  canonicalEvents.push(event);
}
const [financeInventorySourceRows, financeInventoryDiagnosticRows] =
  await Promise.all([
    inventorySection("sources"),
    inventorySection("diagnostics"),
  ]);
const current = await loadCurrentPathEvidence();
const watermarkAfterRows = await inventorySection("watermark");
const watermarkBefore = readWatermark(watermarkBeforeRows);
const baseWatermarkAfter = readWatermark(watermarkAfterRows);
const staleness = compareWatermarks(watermarkBefore, baseWatermarkAfter);
if (staleness.stale) throw new Error(staleness.reason);
const currentPathBefore =
  buildPropertyCashShadowMaterialStateToken(currentBefore);
const currentPathAfter =
  buildPropertyCashShadowMaterialStateToken(current);
if (currentPathBefore.hash !== currentPathAfter.hash) {
  throw new Error(
    "Shadow current-path inputs changed while the evidence snapshot was being collected.",
  );
}
const watermarkAfter = {
  ...baseWatermarkAfter,
  currentPathHash: currentPathAfter.hash,
  currentPathRowCount: currentPathAfter.rowCount,
};

const parity = await buildPropertyCashShadowParity({
  canonicalEvents,
  financeInventoryDiagnosticRows,
  financeInventorySourceRows,
  identityLimit: 30_000,
  ownerStatementRows: current.ownerStatementRows,
  propertySummaryInput: current.propertySummaryInput,
  scope,
  trustedReportInput: current.trustedReportInput,
});
const built = await buildPropertyCashShadowArtifact({
  canonicalEvents,
  contractVersion: "property_cash_events_v1",
  migrationIdentity: watermarkAfter.migrationIdentity,
  parityRecords: parity.records,
  repositoryDirty: repositoryState.dirty,
  repositorySha,
  schemaIdentity: watermarkAfter.schemaIdentity,
  scope,
  sourceWatermark: watermarkAfter,
});
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve(
  repositoryRoot,
  "artifacts",
  "property-cash-shadow",
  timestamp,
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "property-cash-shadow.normalized.json"), built.json);
await writeFile(
  resolve(outputDirectory, "property-cash-shadow.md"),
  renderMarkdown({
    artifact: built.artifact,
    canonicalEvents,
    hash: built.sha256,
    outputDirectory,
    parityRecords: parity.records,
  }),
);
await writeFile(
  resolve(outputDirectory, "run-metadata.json"),
  `${JSON.stringify(
    {
      completedAt: new Date().toISOString(),
      normalizedArtifactSha256: built.sha256,
      outputDirectory,
      repositoryDirty: repositoryState.dirty,
      stackIdentity: {
        apiUrl: stackStatus.API_URL,
        projectId: "nestory-finance-inventory",
        workdir: stackWorkdir,
      },
    },
    null,
    2,
  )}\n`,
);

const strictIssues = propertyCashShadowStrictIssues({
  canonicalEvents,
  parityRecords: parity.records,
});
process.stdout.write(
  `${JSON.stringify(
    {
      canonicalEventCount: canonicalEvents.length,
      normalizedArtifactSha256: built.sha256,
      outputDirectory,
      parityRecordCount: parity.records.length,
      strictIssueCount: strictIssues.length,
    },
    null,
    2,
  )}\n`,
);
if (options.has("strict") && strictIssues.length > 0) {
  process.stderr.write(
    `Strict property cash shadow found ${strictIssues.length} unresolved or mismatched records.\n${strictIssues
      .slice(0, 20)
      .join("\n")}${strictIssues.length > 20 ? "\n(additional issues retained in the normalized artifact)" : ""}\n`,
  );
  process.exitCode = 2;
}

async function inventorySection(section) {
  return collectInventoryPages({
    pageSize,
    fetchPage: async ({ afterKey, limit }) => {
      const { data, error } = await client.rpc("get_finance_inventory_page", {
        p_after_key: afterKey ?? undefined,
        p_currency: scope.currency,
        p_issue_codes: undefined,
        p_limit: limit,
        p_organization_id: scope.organizationId,
        p_period_end: scope.periodEnd,
        p_period_start: scope.periodStart,
        p_property_id: scope.propertyId,
        p_section: section,
        p_source_types: undefined,
      });
      if (error) {
        throw new Error(`Finance inventory ${section} page failed: ${error.message}`);
      }
      return data ?? [];
    },
  });
}

async function loadCurrentPathEvidence() {
  const monthBefore = addDays(scope.periodEnd, 1);
  const propertyRows = await loadPaged(
    () =>
      client
        .from("properties")
        .select("id, code, name, address, owner, property_type, status")
        .eq("organization_id", scope.organizationId)
        .eq("id", scope.propertyId)
        .is("archived_at", null)
        .order("id"),
    "property",
  );
  if (propertyRows.length !== 1) {
    throw new Error("Shadow current-path load expected exactly one property.");
  }
  const units = await loadPaged(
    () =>
      client
        .from("units")
        .select("id, property_id, unit_number, floor, size_sqm, status, current_rent_amount, current_rent_currency")
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .is("archived_at", null)
        .order("id"),
    "units",
  );
  const periodLedgerEntries = await loadPaged(
    () =>
      client
        .from("ledger_entries")
        .select("id, property_id, unit_id, transaction_date, direction, category, amount, currency, description")
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .is("archived_at", null)
        .gte("transaction_date", scope.periodStart)
        .lte("transaction_date", scope.periodEnd)
        .order("transaction_date")
        .order("id"),
    "period Ledger",
  );
  const allTimeLedgerEntries = await loadPaged(
    () =>
      client
        .from("ledger_entries")
        .select("id, property_id, unit_id, transaction_date, direction, category, amount, currency, description")
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .is("archived_at", null)
        .order("transaction_date")
        .order("id"),
    "all-time property-summary Ledger",
  );
  const dueIncomeItems = await loadPaged(
    () =>
      client
        .from("finance_income_items")
        .select("id, property_id, due_date, income_type, amount_due")
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .is("archived_at", null)
        .neq("status", "void")
        .gte("due_date", scope.periodStart)
        .lt("due_date", monthBefore)
        .order("id"),
    "income obligations",
  );
  const allReceiptRows = await loadPaged(
    () =>
      client
        .from("finance_receipt_allocations")
        .select("id, amount, income_item_id, finance_receipts!finance_receipt_allocations_receipt_id_fkey!inner(id, received_date, reversal_of_id, property_id), finance_income_items!finance_receipt_allocations_income_item_id_fkey!inner(id, property_id, due_date, income_type, amount_due)")
        .eq("organization_id", scope.organizationId)
        .eq("finance_receipts.property_id", scope.propertyId)
        .eq("finance_income_items.property_id", scope.propertyId)
        .is("finance_income_items.archived_at", null)
        .neq("finance_income_items.status", "void")
        .lt("finance_receipts.received_date", monthBefore)
        .order("id"),
    "receipt allocations",
  );
  const dueIds = new Set(dueIncomeItems.map((row) => row.id));
  const currentReceiptRows = allReceiptRows.filter(
    (row) => row.finance_receipts.received_date >= scope.periodStart,
  );
  const historicalReceiptRows = allReceiptRows.filter(
    (row) =>
      dueIds.has(row.income_item_id) &&
      row.finance_receipts.received_date < scope.periodStart,
  );
  const paymentRows = await loadPaged(
    () =>
      client
        .from("finance_payment_allocations")
        .select("id, amount, expense_item_id, finance_payments!finance_payment_allocations_payment_id_fkey!inner(id, paid_date, reversal_of_id, property_id), finance_expense_items!finance_payment_allocations_expense_item_id_fkey!inner(id, property_id, expense_type, economic_scope)")
        .eq("organization_id", scope.organizationId)
        .eq("finance_payments.property_id", scope.propertyId)
        .eq("finance_expense_items.property_id", scope.propertyId)
        .is("finance_expense_items.archived_at", null)
        .neq("finance_expense_items.status", "void")
        .gte("finance_payments.paid_date", scope.periodStart)
        .lt("finance_payments.paid_date", monthBefore)
        .order("id"),
    "payment allocations",
  );
  const depositRows = await loadPaged(
    () =>
      client
        .from("lease_deposit_events")
        .select("id, property_id, event_date, event_type, amount, reversal_of_id")
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .lt("event_date", monthBefore)
        .order("id"),
    "deposit events",
  );
  const ownerRows = await loadPaged(
    () =>
      client
        .from("property_owners")
        .select("id, property_id, person_id, ownership_percent, ownership_label, is_primary, started_on, ended_on, archived_at")
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .is("archived_at", null)
        .order("id"),
    "owner links",
  );
  const personIds = [...new Set(ownerRows.map((row) => row.person_id))];
  const personRows =
    personIds.length === 0
      ? []
      : await loadPaged(
          () =>
            client
              .from("people")
              .select("id, display_name, primary_email, primary_phone")
              .eq("organization_id", scope.organizationId)
              .in("id", personIds)
              .is("archived_at", null)
              .order("id"),
          "owner people",
        );
  const contactRows =
    personIds.length === 0
      ? []
      : await loadPaged(
          () =>
            client
              .from("person_contacts")
              .select("person_id, email, phone")
              .eq("organization_id", scope.organizationId)
              .in("person_id", personIds)
              .is("archived_at", null)
              .order("id"),
          "owner contacts",
        );
  const [leases, timelineEvents, maintenanceTasks, documents] = await Promise.all([
    loadPaged(
      () =>
        client
          .from("leases")
          .select("id, property_id, unit_id, tenant_name, primary_tenant_person_id, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency")
          .eq("organization_id", scope.organizationId)
          .eq("property_id", scope.propertyId)
          .is("archived_at", null)
          .order("id"),
      "leases",
    ),
    loadPaged(
      () =>
        client
          .from("timeline_events")
          .select("id, property_id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency")
          .eq("organization_id", scope.organizationId)
          .eq("property_id", scope.propertyId)
          .is("archived_at", null)
          .gte("event_date", scope.periodStart)
          .lte("event_date", scope.periodEnd)
          .order("event_date")
          .order("id"),
      "timeline",
    ),
    loadPaged(
      () =>
        client
          .from("tasks")
          .select("id, property_id, unit_id, title, category, priority, status, due_date, due_time, cost_estimate_amount, cost_estimate_currency, actual_cost_amount, actual_cost_currency, recurrence_frequency, ledger_entry_id, timeline_event_id, created_at")
          .eq("organization_id", scope.organizationId)
          .eq("property_id", scope.propertyId)
          .is("archived_at", null)
          .order("id"),
      "maintenance",
    ),
    loadPropertyCashShadowDocuments({
      client,
      organizationId: scope.organizationId,
    }),
  ]);
  const currentOwners = ownerRows.filter(
    (row) => row.is_primary && row.ended_on === null,
  );
  const activeOwner = currentOwners[0]
    ? {
        label:
          personRows.find((person) => person.id === currentOwners[0].person_id)
            ?.display_name ?? "Owner",
        personId: currentOwners[0].person_id,
      }
    : null;
  const viewQuery = {
    month: scope.periodStart.slice(0, 7),
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: scope.propertyId,
    report: "property-performance",
    status: "all",
    unitId: "all",
  };
  return {
    ownerStatementRows: {
      contactRows,
      currentReceiptRows,
      depositRows,
      dueIncomeItems,
      historicalReceiptRows,
      monthScope: { before: monthBefore, from: scope.periodStart },
      ownerRows,
      paymentRows,
      personRows,
      propertyIds: [scope.propertyId],
    },
    propertySummaryInput: {
      activeOwner,
      hasActiveOwnerLink: currentOwners.length > 0,
      ledgerEntries: allTimeLedgerEntries,
      property: propertyRows[0],
      units,
    },
    trustedReportInput: {
      documents,
      generatedAt: `${monthBefore}T00:00:00.000Z`,
      ledgerEntries: periodLedgerEntries,
      leases,
      maintenanceTasks,
      owners: currentOwners,
      people: personRows.map(({ id, display_name }) => ({ id, display_name })),
      periodEnd: scope.periodEnd,
      periodStart: scope.periodStart,
      properties: propertyRows,
      timelineEvents,
      units,
      viewQuery,
    },
  };
}

async function loadPaged(buildQuery, label) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await buildQuery().range(offset, offset + 999);
    if (result.error) {
      throw new Error(`Could not load shadow ${label}: ${result.error.message}`);
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
    if (rows.length > 10_000) {
      throw new Error(`Shadow ${label} exceeded the 10,000 exact-identity bound.`);
    }
  }
}

function readWatermark(rows) {
  if (rows.length !== 1) throw new Error("Expected exactly one source watermark.");
  const payload = rows[0].payload;
  if (
    typeof payload.hash !== "string" ||
    typeof payload.rowCount !== "number" ||
    typeof payload.migrationIdentity !== "string" ||
    typeof payload.schemaIdentity !== "string"
  ) {
    throw new Error("Invalid source watermark provenance contract.");
  }
  return {
    hash: payload.hash,
    migrationIdentity: payload.migrationIdentity,
    rowCount: payload.rowCount,
    schemaIdentity: payload.schemaIdentity,
  };
}

function renderMarkdown({ artifact, canonicalEvents, hash, parityRecords }) {
  const statusCounts = Object.fromEntries(
    ["match", "mismatch", "unresolved", "not_comparable"].map((status) => [
      status,
      parityRecords.filter((record) => record.status === status).length,
    ]),
  );
  return `# Property cash shadow

Read-only local shadow evidence. This artifact does not authorize a report cutover,
financial write, data repair, reconciliation identity, or hosted migration.

## Scope

- Organization: ${scope.organizationId}
- Property: ${scope.propertyId}
- Currency: ${scope.currency}
- Period: ${scope.periodStart} through ${scope.periodEnd}
- Repository: ${artifact.repository.sha}${artifact.repository.dirty ? " (dirty state explicitly recorded)" : ""}
- Contract: ${artifact.contractVersion}
- Migration: ${artifact.migrationIdentity}
- Schema: ${artifact.schemaIdentity}
- Source watermark: ${artifact.sourceWatermark.hash}
- Normalized SHA-256: ${hash}

## Evidence

- Canonical events: ${canonicalEvents.length}
- Residual header events: ${artifact.residualHeaderEvents.length}
- Requires resolution: ${canonicalEvents.filter((event) => event.requiresResolution).length}
- Parity matches: ${statusCounts.match}
- Parity mismatches: ${statusCounts.mismatch}
- Parity unresolved: ${statusCounts.unresolved}
- Expected not comparable: ${statusCounts.not_comparable}

## Resolution codes

${Object.entries(artifact.resolutionCodeCounts)
  .map(([code, count]) => `- ${code}: ${count}`)
  .join("\n") || "- none"}
`;
}

function parseOptions(args) {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (["help", "strict", "record-dirty"].includes(key)) {
      parsed.set(key, "true");
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }
    parsed.set(key, value);
    index += 1;
  }
  return parsed;
}

function readStackStatus(workdir) {
  try {
    return JSON.parse(
      execFileSync(
        process.platform === "win32" ? process.execPath : "npx",
        [
          ...(process.platform === "win32"
            ? [
                resolve(
                  dirname(process.execPath),
                  "node_modules",
                  "npm",
                  "bin",
                  "npx-cli.js",
                ),
              ]
            : []),
          "supabase",
          "status",
          "--workdir",
          workdir,
          "--output",
          "json",
        ],
        { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ),
    );
  } catch {
    throw new Error("Could not prove the disposable Supabase stack status.");
  }
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required local environment variable ${name}.`);
  return value;
}

function git(args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
