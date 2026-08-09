import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

import {
  buildReport,
  canonicalRosterSerialization,
  sha256,
} from "./report-owner-roster-preflight.mjs";

const script = fileURLToPath(
  new URL("./report-owner-roster-preflight.mjs", import.meta.url),
);
const repoRoot = path.resolve(path.dirname(script), "..");
const vectorsPath = fileURLToPath(
  new URL("./fixtures/owner-roster-preflight-vectors.json", import.meta.url),
);

test("owner roster preflight exposes its read-only local command contract", () => {
  const result = spawnSync(process.execPath, [script, "--help"], {
    encoding: "utf8",
    shell: false,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /--target local --cutover YYYY-MM-DD --out <path>/,
  );
  assert.match(result.stdout, /read-only/i);
});

test("owner roster preflight refuses an unnamed or unapproved hosted read", () => {
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--target",
      "hosted",
      "--cutover",
      "2026-08-01",
      "--out",
      "ignored.json",
    ],
    { encoding: "utf8", shell: false },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit hosted-read approval.*named project/i);
});

test("shared vectors pin the exact LF serialization and lowercase sha256", async () => {
  const vectors = JSON.parse(await readFile(vectorsPath, "utf8"));

  for (const vector of vectors.rosters) {
    const canonical = canonicalRosterSerialization(vector.rows);
    assert.equal(canonical, vector.canonicalRoster, vector.name);
    assert.equal(sha256(canonical), vector.rosterHash, vector.name);
  }
});

test("local preflight is deterministic and reports its read-only transaction", async () => {
  const firstPath = path.join(repoRoot, ".owner-roster-preflight-first.json");
  const secondPath = path.join(repoRoot, ".owner-roster-preflight-second.json");
  try {
    const args = ["--target", "local", "--cutover", "2026-08-01"];
    const first = spawnSync(process.execPath, [script, ...args, "--out", firstPath], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    const second = spawnSync(process.execPath, [script, ...args, "--out", secondPath], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    assert.ok([0, 3].includes(first.status), first.stderr);
    assert.equal(second.status, first.status, second.stderr);
    const firstReport = JSON.parse(await readFile(firstPath, "utf8"));
    const secondReport = JSON.parse(await readFile(secondPath, "utf8"));
    assert.equal(firstReport.transactionMode, "read only");
    assert.equal(firstReport.reportHash, secondReport.reportHash);
    assert.deepEqual(firstReport.rows, secondReport.rows);

    const containers = spawnSync(
      "docker",
      ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
      { cwd: repoRoot, encoding: "utf8", shell: false },
    );
    assert.equal(containers.status, 0, containers.stderr);
    const available = containers.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const preferred = `supabase_db_${path.basename(repoRoot)}`;
    const container = available.includes(preferred) ? preferred : available[0];
    assert.ok(container, "local Supabase database container is required");
    const helperSql = `
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'organization_id', organization_id,
        'property_id', property_id,
        'boundary_date', to_char(boundary_date, 'YYYY-MM-DD'),
        'issue_codes', issue_codes,
        'active_owner_count', active_owner_count,
        'ownership_percent_total', to_char(ownership_percent_total, 'FM990.000'),
        'canonical_roster', canonical_roster,
        'roster_hash', roster_hash
      ) ORDER BY organization_id, property_id, boundary_date), '[]'::jsonb)::text
      FROM app_private.owner_roster_legacy_preflight('2026-08-01');
    `;
    const helper = spawnSync(
      "docker",
      ["exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", helperSql],
      { cwd: repoRoot, encoding: "utf8", shell: false },
    );
    assert.equal(helper.status, 0, helper.stderr);
    const helperReport = buildReport(JSON.parse(helper.stdout.trim()), "2026-08-01");
    assert.deepEqual(helperReport.rows, firstReport.rows);
    assert.equal(helperReport.reportHash, firstReport.reportHash);
  } finally {
    await Promise.all([
      rm(firstPath, { force: true }),
      rm(secondPath, { force: true }),
    ]);
  }
});
