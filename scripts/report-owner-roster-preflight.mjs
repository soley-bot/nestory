#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const usage = `Usage:
  node scripts/report-owner-roster-preflight.mjs --target local --cutover YYYY-MM-DD --out <path>

Runs the self-contained owner-roster preflight in a read-only transaction.
Hosted reads require explicit approval and a named project and are not enabled by default.`;

export function canonicalRosterSerialization(rows) {
  return [...rows]
    .sort((left, right) =>
      left.propertyOwnerId.toLowerCase().localeCompare(right.propertyOwnerId.toLowerCase()),
    )
    .map(
      (row) =>
        `${row.propertyOwnerId.toLowerCase()}|${row.ownerPersonId.toLowerCase()}|${row.ownershipPercent}|${row.startedOn}|${row.endedOn ?? ""}`,
    )
    .join("\n");
}

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizePreflightRows(rows) {
  return rows
    .map((row) => ({
      organizationId: row.organization_id,
      propertyId: row.property_id,
      boundaryDate: row.boundary_date,
      issueCodes: row.issue_codes ?? [],
      activeOwnerCount: Number(row.active_owner_count),
      ownershipPercentTotal: row.ownership_percent_total,
      canonicalRoster: row.canonical_roster,
      rosterHash: row.roster_hash,
    }))
    .sort((left, right) =>
      `${left.organizationId}|${left.propertyId}|${left.boundaryDate}`.localeCompare(
        `${right.organizationId}|${right.propertyId}|${right.boundaryDate}`,
      ),
    );
}

export function buildReport(rows, cutoverDate) {
  const normalizedRows = normalizePreflightRows(rows);
  const canonicalReport = JSON.stringify(normalizedRows);
  return {
    contractVersion: "owner_roster_preflight_v1",
    transactionMode: "read only",
    cutoverDate,
    clean: normalizedRows.every((row) => row.issueCodes.length === 0),
    rowCount: normalizedRows.length,
    issueRowCount: normalizedRows.filter((row) => row.issueCodes.length > 0).length,
    rows: normalizedRows,
    reportHash: sha256(canonicalReport),
  };
}

// Deliberately self-contained: this query uses only the pre-Task-2.0 baseline
// relations and never calls the helper installed by the migration.
export const PREFLIGHT_SQL = String.raw`
BEGIN TRANSACTION READ ONLY;
WITH
params AS (
  SELECT :'cutover_date'::date AS cutover_date
),
relevant_properties AS (
  SELECT p.organization_id, p.id AS property_id
  FROM public.properties AS p
  WHERE p.archived_at IS NULL
),
owners AS (
  SELECT
    po.organization_id,
    po.property_id,
    po.id AS property_owner_id,
    po.person_id AS owner_person_id,
    po.ownership_percent,
    po.started_on,
    po.ended_on,
    pe.archived_at AS person_archived_at,
    EXISTS (
      SELECT 1
      FROM public.person_roles AS pr
      WHERE pr.organization_id = po.organization_id
        AND pr.person_id = po.person_id
        AND pr.role = 'owner'
        AND pr.status = 'active'
        AND pr.archived_at IS NULL
    ) AS has_active_owner_role
  FROM public.property_owners AS po
  JOIN public.people AS pe
    ON pe.organization_id = po.organization_id
   AND pe.id = po.person_id
  WHERE po.archived_at IS NULL
),
boundaries AS (
  SELECT rp.organization_id, rp.property_id, params.cutover_date AS boundary_date
  FROM relevant_properties AS rp CROSS JOIN params
  UNION
  SELECT organization_id, property_id, started_on
  FROM owners
  WHERE started_on IS NOT NULL
  UNION
  SELECT organization_id, property_id, ended_on
  FROM owners
  WHERE ended_on IS NOT NULL
),
active AS (
  SELECT
    b.organization_id,
    b.property_id,
    b.boundary_date,
    o.property_owner_id,
    o.owner_person_id,
    o.ownership_percent,
    o.started_on,
    o.ended_on,
    o.person_archived_at,
    o.has_active_owner_role
  FROM boundaries AS b
  JOIN owners AS o
    ON o.organization_id = b.organization_id
   AND o.property_id = b.property_id
   AND o.started_on IS NOT NULL
   AND o.ownership_percent IS NOT NULL
   AND o.started_on <= b.boundary_date
   AND (o.ended_on IS NULL OR b.boundary_date < o.ended_on)
),
summaries AS (
  SELECT
    b.organization_id,
    b.property_id,
    b.boundary_date,
    count(a.property_owner_id)::integer AS active_owner_count,
    coalesce(sum(a.ownership_percent), 0)::numeric(9,3) AS ownership_percent_total,
    string_agg(
      lower(a.property_owner_id::text) || '|' ||
      lower(a.owner_person_id::text) || '|' ||
      to_char(a.ownership_percent, 'FM990.000') || '|' ||
      to_char(a.started_on, 'YYYY-MM-DD') || '|' ||
      coalesce(to_char(a.ended_on, 'YYYY-MM-DD'), ''),
      E'\n' ORDER BY lower(a.property_owner_id::text)
    ) AS canonical_roster,
    bool_or(a.person_archived_at IS NOT NULL OR NOT a.has_active_owner_role) AS has_inactive_owner,
    count(a.property_owner_id) <> count(DISTINCT a.owner_person_id) AS has_overlap
  FROM boundaries AS b
  LEFT JOIN active AS a
    ON a.organization_id = b.organization_id
   AND a.property_id = b.property_id
   AND a.boundary_date = b.boundary_date
  GROUP BY b.organization_id, b.property_id, b.boundary_date
),
intrinsic AS (
  SELECT
    organization_id,
    property_id,
    bool_or(started_on IS NULL) AS start_missing,
    bool_or(ownership_percent IS NULL) AS share_missing,
    bool_or(ownership_percent IS NOT NULL AND (ownership_percent <= 0 OR ownership_percent > 100)) AS share_invalid,
    bool_or(started_on IS NOT NULL AND ended_on IS NOT NULL AND ended_on <= started_on) AS interval_invalid
  FROM owners
  GROUP BY organization_id, property_id
),
final_rows AS (
  SELECT
    s.organization_id,
    s.property_id,
    to_char(s.boundary_date, 'YYYY-MM-DD') AS boundary_date,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN coalesce(i.start_missing, false) THEN 'owner_start_missing' END,
      CASE WHEN coalesce(i.share_missing, false) THEN 'owner_share_missing' END,
      CASE WHEN coalesce(i.share_invalid, false) THEN 'owner_share_invalid' END,
      CASE WHEN coalesce(i.interval_invalid, false) THEN 'owner_interval_invalid' END,
      CASE WHEN s.active_owner_count = 0 THEN 'owner_roster_missing' END,
      CASE WHEN s.active_owner_count > 0 AND s.ownership_percent_total <> 100.000 THEN 'owner_share_total_invalid' END,
      CASE WHEN coalesce(s.has_inactive_owner, false) THEN 'owner_inactive' END,
      CASE WHEN coalesce(s.has_overlap, false) THEN 'owner_overlap' END
    ], NULL)::text[] AS issue_codes,
    s.active_owner_count,
    to_char(s.ownership_percent_total, 'FM990.000') AS ownership_percent_total,
    s.canonical_roster,
    CASE
      WHEN s.canonical_roster IS NULL THEN NULL
      ELSE encode(extensions.digest(s.canonical_roster, 'sha256'), 'hex')
    END AS roster_hash
  FROM summaries AS s
  LEFT JOIN intrinsic AS i
    ON i.organization_id = s.organization_id
   AND i.property_id = s.property_id
  ORDER BY s.organization_id, s.property_id, s.boundary_date
)
SELECT coalesce(jsonb_agg(to_jsonb(final_rows)), '[]'::jsonb)::text
FROM final_rows;
COMMIT;
`;

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function findLocalDatabaseContainer(cwd) {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { encoding: "utf8", shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Could not inspect local Supabase containers.");
  return selectLocalDatabaseContainer(
    cwd,
    result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const target = valueAfter(args, "--target");
  const cutoverDate = valueAfter(args, "--cutover");
  const outputPath = valueAfter(args, "--out");

  if (target === "hosted") {
    throw new Error(
      "A hosted preflight requires explicit hosted-read approval and a named project.",
    );
  }
  if (target !== "local" || !/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate ?? "") || !outputPath) {
    throw new Error(usage);
  }

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const cwd = path.resolve(scriptDirectory, "..");
  const container = findLocalDatabaseContainer(cwd);
  const result = spawnSync(
    "docker",
    [
      "exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres",
      "-At", "-v", "ON_ERROR_STOP=1", "-v", `cutover_date=${cutoverDate}`,
    ],
    { cwd, encoding: "utf8", input: PREFLIGHT_SQL, shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Owner-roster preflight query failed.");
  }

  const jsonLine = result.stdout.split(/\r?\n/).find((line) => line.trim().startsWith("["));
  if (!jsonLine) throw new Error("Owner-roster preflight returned no JSON result.");
  const report = buildReport(JSON.parse(jsonLine), cutoverDate);
  const resolvedOutput = path.resolve(cwd, outputPath);
  await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Owner-roster preflight ${report.clean ? "clean" : "not clean"}: ${report.rowCount} boundary rows, report ${report.reportHash}.\n`,
  );
  if (!report.clean) process.exitCode = 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Owner-roster preflight failed."}\n`);
    process.exitCode = 2;
  });
}
