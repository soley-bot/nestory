#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const usage = `Usage:
  node scripts/report-owner-roster-preflight.mjs --target local --cutover YYYY-MM-DD --out <path>

Hosted reads additionally require --project-ref, --approval-file,
--remediation-manifest, --expected-clean-report-hash, and --database-url-env.
Use --dry-hosted-gate to validate every guard without making hosted contact.
Every database execution uses an explicit read-only transaction.`;

export function canonicalRosterSerialization(rows) {
  return [...rows]
    .sort((left, right) => left.propertyOwnerId.toLowerCase().localeCompare(right.propertyOwnerId.toLowerCase()))
    .map((row) => `${row.propertyOwnerId.toLowerCase()}|${row.ownerPersonId.toLowerCase()}|${row.ownershipPercent}|${row.startedOn}|${row.endedOn ?? ""}`)
    .join("\n");
}

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizePreflightRows(rows) {
  return rows.map((row) => ({
    organizationId: row.organization_id,
    propertyId: row.property_id,
    boundaryDate: row.boundary_date,
    nextBoundaryDate: row.next_boundary_date,
    issueCode: row.issue_code,
    propertyOwnerIds: row.property_owner_ids ?? [],
    activeOwnerCount: Number(row.active_owner_count),
    ownershipPercentTotal: row.ownership_percent_total,
    canonicalRoster: row.canonical_roster,
    ownershipRosterHash: row.ownership_roster_hash,
  })).sort((left, right) =>
    `${left.organizationId}|${left.propertyId}|${left.boundaryDate}|${left.issueCode ?? ""}|${left.propertyOwnerIds.join(",")}`
      .localeCompare(`${right.organizationId}|${right.propertyId}|${right.boundaryDate}|${right.issueCode ?? ""}|${right.propertyOwnerIds.join(",")}`),
  );
}

export function buildReport(rows, cutoverDate) {
  const normalizedRows = normalizePreflightRows(rows);
  return {
    contractVersion: "owner_roster_preflight_v2",
    transactionMode: "read only",
    cutoverDate,
    clean: normalizedRows.every((row) => row.issueCode === null),
    rowCount: normalizedRows.length,
    issueRowCount: normalizedRows.filter((row) => row.issueCode !== null).length,
    rows: normalizedRows,
    reportHash: sha256(JSON.stringify(normalizedRows)),
  };
}

export function remediationManifestPayload({ projectRef, report }) {
  return {
    contractVersion: "owner_roster_remediation_v1",
    projectRef,
    cutoverDate: report.cutoverDate,
    preflightReportHash: report.reportHash,
    issueRowCount: report.issueRowCount,
  };
}

export const PREFLIGHT_SQL = String.raw`
BEGIN TRANSACTION READ ONLY;
WITH
params AS (
  SELECT :'cutover_date'::date AS cutover_date,
    NULLIF(:'organization_id', '')::uuid AS organization_id
),
relevant_properties AS (
  SELECT p.organization_id, p.id AS property_id
  FROM public.properties AS p CROSS JOIN params
  WHERE p.archived_at IS NULL
    AND (params.organization_id IS NULL OR p.organization_id = params.organization_id)
),
owners AS (
  SELECT po.organization_id, po.property_id, po.id AS property_owner_id,
    po.person_id AS owner_person_id, po.ownership_percent, po.started_on, po.ended_on,
    pe.archived_at AS person_archived_at,
    EXISTS (SELECT 1 FROM public.person_roles AS pr
      WHERE pr.organization_id = po.organization_id AND pr.person_id = po.person_id
        AND pr.role = 'owner' AND pr.status = 'active' AND pr.archived_at IS NULL) AS has_active_owner_role
  FROM public.property_owners AS po
  JOIN relevant_properties AS rp ON rp.organization_id = po.organization_id AND rp.property_id = po.property_id
  JOIN public.people AS pe ON pe.organization_id = po.organization_id AND pe.id = po.person_id
  WHERE po.archived_at IS NULL
),
raw_boundaries AS (
  SELECT rp.organization_id, rp.property_id, params.cutover_date AS boundary_date
  FROM relevant_properties AS rp CROSS JOIN params
  UNION SELECT organization_id, property_id, started_on FROM owners WHERE started_on IS NOT NULL
  UNION SELECT organization_id, property_id, ended_on FROM owners WHERE ended_on IS NOT NULL
),
boundaries AS (
  SELECT raw.*, lead(boundary_date) OVER (PARTITION BY organization_id, property_id ORDER BY boundary_date) AS next_boundary_date
  FROM raw_boundaries AS raw
),
active AS (
  SELECT b.organization_id, b.property_id, b.boundary_date, b.next_boundary_date,
    o.property_owner_id, o.owner_person_id, o.ownership_percent, o.started_on, o.ended_on,
    o.person_archived_at, o.has_active_owner_role
  FROM boundaries AS b JOIN owners AS o
    ON o.organization_id = b.organization_id AND o.property_id = b.property_id
   AND o.started_on IS NOT NULL AND o.ownership_percent IS NOT NULL
   AND o.started_on <= b.boundary_date AND (o.ended_on IS NULL OR b.boundary_date < o.ended_on)
),
summaries AS (
  SELECT b.organization_id, b.property_id, b.boundary_date, b.next_boundary_date,
    count(a.property_owner_id)::integer AS active_owner_count,
    coalesce(sum(a.ownership_percent), 0)::numeric(9,3) AS ownership_percent_total,
    coalesce(array_agg(a.property_owner_id ORDER BY lower(a.property_owner_id::text))
      FILTER (WHERE a.property_owner_id IS NOT NULL), ARRAY[]::uuid[]) AS property_owner_ids,
    string_agg(lower(a.property_owner_id::text) || '|' || lower(a.owner_person_id::text) || '|' ||
      to_char(a.ownership_percent, 'FM990.000') || '|' || to_char(a.started_on, 'YYYY-MM-DD') || '|' ||
      coalesce(to_char(a.ended_on, 'YYYY-MM-DD'), ''), E'\n' ORDER BY lower(a.property_owner_id::text)) AS canonical_roster,
    bool_or(a.person_archived_at IS NOT NULL OR NOT a.has_active_owner_role) AS has_inactive_owner,
    count(a.property_owner_id) <> count(DISTINCT a.owner_person_id) AS has_overlap
  FROM boundaries AS b LEFT JOIN active AS a
    ON a.organization_id = b.organization_id AND a.property_id = b.property_id AND a.boundary_date = b.boundary_date
  GROUP BY b.organization_id, b.property_id, b.boundary_date, b.next_boundary_date
),
boundary_issue_sets AS (
  SELECT s.*, array_remove(ARRAY[
    CASE WHEN active_owner_count = 0 THEN 'owner_roster_missing' END,
    CASE WHEN active_owner_count > 0 AND ownership_percent_total <> 100.000 THEN 'owner_share_total_not_100' END,
    CASE WHEN coalesce(has_inactive_owner, false) THEN 'owner_person_inactive' END,
    CASE WHEN coalesce(has_overlap, false) THEN 'owner_interval_overlap' END
  ], NULL)::text[] AS issue_codes FROM summaries AS s
),
boundary_rows AS (
  SELECT s.organization_id, s.property_id, s.boundary_date, s.next_boundary_date,
    issue.issue_code, s.property_owner_ids, s.active_owner_count, s.ownership_percent_total,
    CASE WHEN issue.issue_code IS NULL THEN s.canonical_roster ELSE NULL END AS canonical_roster,
    CASE WHEN issue.issue_code IS NULL AND s.canonical_roster IS NOT NULL
      THEN encode(extensions.digest(s.canonical_roster, 'sha256'), 'hex') ELSE NULL END AS ownership_roster_hash
  FROM boundary_issue_sets AS s
  LEFT JOIN LATERAL unnest(CASE WHEN cardinality(s.issue_codes) = 0 THEN ARRAY[NULL::text] ELSE s.issue_codes END)
    AS issue(issue_code) ON true
),
intrinsic_rows AS (
  SELECT o.organization_id, o.property_id, params.cutover_date AS boundary_date, NULL::date AS next_boundary_date,
    issue.issue_code, ARRAY[o.property_owner_id]::uuid[] AS property_owner_ids,
    0::integer AS active_owner_count, 0::numeric(9,3) AS ownership_percent_total,
    NULL::text AS canonical_roster, NULL::text AS ownership_roster_hash
  FROM owners AS o CROSS JOIN params
  CROSS JOIN LATERAL unnest(array_remove(ARRAY[
    CASE WHEN o.started_on IS NULL THEN 'owner_start_missing' END,
    CASE WHEN o.ownership_percent IS NULL THEN 'owner_share_missing' END,
    CASE WHEN o.ownership_percent IS NOT NULL AND (o.ownership_percent <= 0 OR o.ownership_percent > 100) THEN 'owner_share_invalid' END,
    CASE WHEN o.started_on IS NOT NULL AND o.ended_on IS NOT NULL AND o.ended_on <= o.started_on THEN 'owner_interval_invalid' END
  ], NULL)) AS issue(issue_code)
),
final_rows AS (
  SELECT * FROM boundary_rows UNION ALL SELECT * FROM intrinsic_rows
),
json_rows AS (
  SELECT organization_id, property_id, to_char(boundary_date, 'YYYY-MM-DD') AS boundary_date,
    CASE WHEN next_boundary_date IS NULL THEN NULL ELSE to_char(next_boundary_date, 'YYYY-MM-DD') END AS next_boundary_date,
    issue_code, property_owner_ids, active_owner_count,
    to_char(ownership_percent_total, 'FM990.000') AS ownership_percent_total,
    canonical_roster, ownership_roster_hash
  FROM final_rows ORDER BY organization_id, property_id, boundary_date, issue_code NULLS FIRST, property_owner_ids
)
SELECT coalesce(jsonb_agg(to_jsonb(json_rows)), '[]'::jsonb)::text FROM json_rows;
COMMIT;
`;

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function findLocalDatabaseContainer(cwd) {
  const result = spawnSync("docker", ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Could not inspect local Supabase containers.");
  return selectLocalDatabaseContainer(cwd, result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function runPsql({ cwd, container, cutoverDate, organizationId = "", databaseUrl }) {
  const psql = databaseUrl
    ? ["psql", databaseUrl, "-X"]
    : ["psql", "-X", "-U", "postgres", "-d", "postgres"];
  const result = spawnSync("docker", ["exec", "-i", container, ...psql,
    "-At", "-v", "ON_ERROR_STOP=1", "-v", `cutover_date=${cutoverDate}`, "-v", `organization_id=${organizationId}`],
  { cwd, encoding: "utf8", input: PREFLIGHT_SQL, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Owner-roster preflight query failed.");
  const jsonLine = result.stdout.split(/\r?\n/).find((line) => line.trim().startsWith("["));
  if (!jsonLine) throw new Error("Owner-roster preflight returned no JSON result.");
  return JSON.parse(jsonLine);
}

async function validateHostedGate(args, cutoverDate) {
  const projectRef = valueAfter(args, "--project-ref");
  const approvalPath = valueAfter(args, "--approval-file");
  const manifestPath = valueAfter(args, "--remediation-manifest");
  const expectedHash = valueAfter(args, "--expected-clean-report-hash");
  const databaseUrlEnv = valueAfter(args, "--database-url-env");
  if (!projectRef || !approvalPath || !manifestPath || !/^[a-f0-9]{64}$/.test(expectedHash ?? "") || !databaseUrlEnv) {
    throw new Error("Hosted preflight requires explicit hosted-read approval, a named project, verified remediation manifest, expected clean report hash, and database URL environment name.");
  }
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  if (approval.approved !== true || approval.projectRef !== projectRef || approval.cutoverDate !== cutoverDate || !approval.approvedBy) {
    throw new Error("Hosted-read approval does not exactly match the named project and cutover date.");
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { manifestHash, ...payload } = manifest;
  if (manifestHash !== sha256(JSON.stringify(payload)) || payload.projectRef !== projectRef || payload.cutoverDate !== cutoverDate) {
    throw new Error("Remediation manifest hash or scope is invalid.");
  }
  return { projectRef, expectedHash, databaseUrlEnv };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { process.stdout.write(`${usage}\n`); return; }
  const target = valueAfter(args, "--target");
  const cutoverDate = valueAfter(args, "--cutover");
  const outputPath = valueAfter(args, "--out");
  const organizationId = valueAfter(args, "--organization") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate ?? "") || !outputPath || !["local", "hosted"].includes(target ?? "")) throw new Error(usage);

  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const container = findLocalDatabaseContainer(cwd);
  let hostedGate;
  if (target === "hosted") {
    hostedGate = await validateHostedGate(args, cutoverDate);
    if (args.includes("--dry-hosted-gate")) {
      process.stdout.write(`Hosted dry gate ready for ${hostedGate.projectRef}; no hosted contact performed.\n`);
      return;
    }
  }

  const databaseUrl = hostedGate ? process.env[hostedGate.databaseUrlEnv] : undefined;
  if (hostedGate && (!databaseUrl || !databaseUrl.includes(hostedGate.projectRef))) throw new Error("Hosted database URL is missing or does not match the approved project.");
  const report = buildReport(runPsql({ cwd, container, cutoverDate, organizationId, databaseUrl }), cutoverDate);
  await writeFile(path.resolve(cwd, outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const manifestOutput = valueAfter(args, "--remediation-manifest-out");
  if (!report.clean && manifestOutput) {
    const payload = remediationManifestPayload({ projectRef: hostedGate?.projectRef ?? "local", report });
    await writeFile(path.resolve(cwd, manifestOutput), `${JSON.stringify({ ...payload, manifestHash: sha256(JSON.stringify(payload)) }, null, 2)}\n`);
  }
  if (hostedGate && (!report.clean || report.reportHash !== hostedGate.expectedHash)) throw new Error("Hosted clean rerun did not match the approved expected report hash.");
  process.stdout.write(`Owner-roster preflight ${report.clean ? "clean" : "not clean"}: ${report.rowCount} rows, report ${report.reportHash}.\n`);
  if (!report.clean) process.exitCode = 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Owner-roster preflight failed."}\n`); process.exitCode = 2; });
}
