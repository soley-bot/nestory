import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

import {
  buildReport,
  canonicalRosterSerialization,
  PREFLIGHT_SQL,
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

  const report = buildReport(
    vectors.normalizedRows.map((row) => ({
      organization_id: row.organizationId,
      property_id: row.propertyId,
      boundary_date: row.boundaryDate,
      next_boundary_date: row.nextBoundaryDate,
      issue_code: row.issueCode,
      property_owner_ids: row.propertyOwnerIds,
      active_owner_count: row.activeOwnerCount,
      ownership_percent_total: row.ownershipPercentTotal,
      canonical_roster: row.canonicalRoster,
      ownership_roster_hash: row.ownershipRosterHash,
    })),
    "2026-08-01",
  );
  const sortedExpectedRows = [...vectors.normalizedRows].sort((left, right) =>
    `${left.organizationId}|${left.propertyId}|${left.boundaryDate}|${left.issueCode ?? ""}|${left.propertyOwnerIds.join(",")}`
      .localeCompare(`${right.organizationId}|${right.propertyId}|${right.boundaryDate}|${right.issueCode ?? ""}|${right.propertyOwnerIds.join(",")}`),
  );
  assert.deepEqual(report.rows, sortedExpectedRows);
  assert.equal(report.reportHash, vectors.reportHash);
});

function hostedGateDocuments({ projectRef, cutoverDate, expectedCleanReportHash, decision = "repair_explicit_ownership" }) {
  const identity = {
    organizationId: "a1000000-0000-0000-0000-000000000001",
    propertyId: "b1000000-0000-0000-0000-000000000001",
    boundaryDate: cutoverDate,
    issueCode: "owner_share_total_not_100",
    propertyOwnerIds: ["01000000-0000-0000-0000-000000000001"],
  };
  const issue = {
    ...identity,
    issueIdentityHash: sha256(JSON.stringify(identity)),
    decision,
  };
  const manifestPayload = {
    contractVersion: "owner_roster_remediation_v2",
    projectRef,
    cutoverDate,
    preflightReportHash: "1".repeat(64),
    issueRowCount: 1,
    issues: [issue],
  };
  const manifest = {
    ...manifestPayload,
    manifestHash: sha256(JSON.stringify(manifestPayload)),
  };
  const approvalPayload = {
    contractVersion: "owner_roster_hosted_approval_v2",
    approved: true,
    projectRef,
    cutoverDate,
    manifestHash: manifest.manifestHash,
    expectedCleanReportHash,
    approvedBy: "local-review-test",
  };
  return {
    manifest,
    approval: {
      ...approvalPayload,
      approvalHash: sha256(JSON.stringify(approvalPayload)),
    },
  };
}

async function runHostedDryGate({ name, databaseUrl, mutateDocuments }) {
  const approvalPath = path.join(repoRoot, `.owner-roster-hosted-approval-${name}.json`);
  const manifestPath = path.join(repoRoot, `.owner-roster-remediation-manifest-${name}.json`);
  const projectRef = "pfvmztxktkwyewvxfgot";
  const cutoverDate = "2026-08-01";
  const expectedCleanReportHash = "2".repeat(64);
  const documents = hostedGateDocuments({ projectRef, cutoverDate, expectedCleanReportHash });
  mutateDocuments?.(documents);
  const databaseUrlEnv = `OWNER_ROSTER_TEST_DATABASE_URL_${name.toUpperCase()}`;
  try {
    await writeFile(approvalPath, JSON.stringify(documents.approval));
    await writeFile(manifestPath, JSON.stringify(documents.manifest));
    return spawnSync(process.execPath, [
      script, "--target", "hosted", "--dry-hosted-gate",
      "--project-ref", projectRef,
      "--approval-file", approvalPath,
      "--remediation-manifest", manifestPath,
      "--expected-clean-report-hash", expectedCleanReportHash,
      "--database-url-env", databaseUrlEnv,
      "--cutover", cutoverDate,
      "--out", "ignored.json",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env: databaseUrl === undefined ? process.env : { ...process.env, [databaseUrlEnv]: databaseUrl },
      shell: false,
    });
  } finally {
    await Promise.all([rm(approvalPath, { force: true }), rm(manifestPath, { force: true })]);
  }
}

test("hosted dry gate validates a signed approval, explicit issue decision, and exact direct project URL without contact", async () => {
  const result = await runHostedDryGate({
    name: "valid",
    databaseUrl: "postgresql://postgres:never-print-this@db.pfvmztxktkwyewvxfgot.supabase.co:5432/postgres",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry gate ready.*no hosted contact/i);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /never-print-this/);
});

test("hosted dry gate rejects a missing URL before returning success", async () => {
  const result = await runHostedDryGate({ name: "missing_url" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /database URL.*missing|approved project/i);
});

test("hosted dry gate rejects a URL whose host merely contains the approved project ref", async () => {
  const result = await runHostedDryGate({
    name: "substring_host",
    databaseUrl: "postgresql://postgres:never-print-this@db.pfvmztxktkwyewvxfgot.supabase.co.attacker.example:5432/postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the approved project/i);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /never-print-this/);
});

test("hosted dry gate rejects a nested pooler lookalike even with the approved project username", async () => {
  const result = await runHostedDryGate({
    name: "nested_pooler_host",
    databaseUrl: "postgresql://postgres.pfvmztxktkwyewvxfgot:never-print-this@evil.aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the approved project/i);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /never-print-this/);
});

test("hosted dry gate requires one explicit decision for every normalized issue identity", async () => {
  const result = await runHostedDryGate({
    name: "missing_decision",
    databaseUrl: "postgresql://postgres:never-print-this@db.pfvmztxktkwyewvxfgot.supabase.co:5432/postgres",
    mutateDocuments: ({ manifest }) => {
      manifest.issues[0].decision = "";
      const payload = { ...manifest };
      delete payload.manifestHash;
      manifest.manifestHash = sha256(JSON.stringify(payload));
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit decision.*issue identity/i);
});

test("hosted dry gate rejects a non-normalized issue identity with duplicate owner IDs", async () => {
  const result = await runHostedDryGate({
    name: "duplicate_owner_identity",
    databaseUrl: "postgresql://postgres:never-print-this@db.pfvmztxktkwyewvxfgot.supabase.co:5432/postgres",
    mutateDocuments: ({ manifest, approval }) => {
      const issue = manifest.issues[0];
      issue.propertyOwnerIds.push(issue.propertyOwnerIds[0]);
      const identity = {
        organizationId: issue.organizationId,
        propertyId: issue.propertyId,
        boundaryDate: issue.boundaryDate,
        issueCode: issue.issueCode,
        propertyOwnerIds: issue.propertyOwnerIds,
      };
      issue.issueIdentityHash = sha256(JSON.stringify(identity));
      const manifestPayload = { ...manifest };
      delete manifestPayload.manifestHash;
      manifest.manifestHash = sha256(JSON.stringify(manifestPayload));
      approval.manifestHash = manifest.manifestHash;
      const approvalPayload = { ...approval };
      delete approvalPayload.approvalHash;
      approval.approvalHash = sha256(JSON.stringify(approvalPayload));
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /normalized issue identity/i);
});

test("hosted dry gate requires approval to bind manifest and expected clean hashes", async () => {
  const result = await runHostedDryGate({
    name: "approval_binding",
    databaseUrl: "postgresql://postgres:never-print-this@db.pfvmztxktkwyewvxfgot.supabase.co:5432/postgres",
    mutateDocuments: ({ approval }) => {
      approval.expectedCleanReportHash = "3".repeat(64);
      const payload = { ...approval };
      delete payload.approvalHash;
      approval.approvalHash = sha256(JSON.stringify(payload));
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /approval.*expected clean report hash/i);
});

test("self-contained baseline SQL and installed helper match the shared database vectors", async () => {
  const vectors = JSON.parse(await readFile(vectorsPath, "utf8"));
  const seed = vectors.databaseSeed;
  const outputPath = path.join(repoRoot, ".owner-roster-vector-report.json");
  const remediationPath = path.join(repoRoot, ".owner-roster-vector-remediation.json");
  assert.doesNotMatch(PREFLIGHT_SQL, /owner_roster_legacy_preflight/i);

  const containers = spawnSync("docker", ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"], {
    cwd: repoRoot, encoding: "utf8", shell: false,
  });
  assert.equal(containers.status, 0, containers.stderr);
  const available = containers.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preferred = `supabase_db_${path.basename(repoRoot)}`;
  const container = available.includes(preferred) ? preferred : available[0];
  assert.ok(container);

  const runSql = (sql) => spawnSync("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    cwd: repoRoot, encoding: "utf8", shell: false,
  });
  const quoted = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const cleanupSql = `
    DELETE FROM public.property_owners WHERE organization_id = ${quoted(seed.organization.id)};
    DELETE FROM public.person_roles WHERE organization_id = ${quoted(seed.organization.id)};
    DELETE FROM public.people WHERE organization_id = ${quoted(seed.organization.id)};
    DELETE FROM public.properties WHERE organization_id = ${quoted(seed.organization.id)};
    SET session_replication_role = replica;
    DELETE FROM public.financial_reconciliation_sources WHERE organization_id = ${quoted(seed.organization.id)};
    DELETE FROM public.organizations WHERE id = ${quoted(seed.organization.id)};
    SET session_replication_role = origin;
  `;
  const restoreShareConstraintSql = `
    DO $restore$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.property_owners'::regclass
          AND conname = 'property_owners_unarchived_share_required_check'
      ) THEN
        ALTER TABLE public.property_owners
          ADD CONSTRAINT property_owners_unarchived_share_required_check
          CHECK (archived_at IS NOT NULL OR (ownership_percent IS NOT NULL AND ownership_percent > 0 AND ownership_percent <= 100))
          NOT VALID;
      END IF;
    END
    $restore$;
    ALTER TABLE public.property_owners
      VALIDATE CONSTRAINT property_owners_unarchived_share_required_check;
  `;

  try {
    runSql(cleanupSql);
    const setupSql = `
      ALTER TABLE public.property_owners
        DROP CONSTRAINT property_owners_unarchived_share_required_check;
      INSERT INTO public.organizations (id, name, slug) VALUES (${quoted(seed.organization.id)}, ${quoted(seed.organization.name)}, ${quoted(seed.organization.slug)});
      INSERT INTO public.properties (id, organization_id, name, code, property_type, archived_at) VALUES
        ${seed.properties.map((property) => `(${quoted(property.id)}, ${quoted(seed.organization.id)}, ${quoted(property.name)}, ${quoted(property.code)}, 'Apartment', ${property.archivedAt ? quoted(property.archivedAt) : "NULL"}::timestamptz)`).join(",")};
      INSERT INTO public.people (id, organization_id, display_name) VALUES
        ${seed.people.map((person) => `(${quoted(person.id)}, ${quoted(seed.organization.id)}, ${quoted(person.name)})`).join(",")};
      INSERT INTO public.person_roles (organization_id, person_id, role, status) VALUES
        ${seed.people.map((person) => `(${quoted(seed.organization.id)}, ${quoted(person.id)}, 'owner', 'active')`).join(",")};
      INSERT INTO public.property_owners (id, organization_id, property_id, person_id, ownership_percent, started_on) VALUES
        ${seed.owners.map((owner) => `(${quoted(owner.id)}, ${quoted(seed.organization.id)}, ${quoted(owner.propertyId)}, ${quoted(owner.personId)}, ${owner.share === null ? "NULL" : quoted(owner.share)}::numeric, ${quoted(owner.startedOn)}::date)`).join(",")};
      ALTER TABLE public.property_owners
        ADD CONSTRAINT property_owners_unarchived_share_required_check
        CHECK (archived_at IS NOT NULL OR (ownership_percent IS NOT NULL AND ownership_percent > 0 AND ownership_percent <= 100))
        NOT VALID;
    `;
    const setup = runSql(setupSql);
    assert.equal(setup.status, 0, setup.stderr);

    const standalone = spawnSync(process.execPath, [script, "--target", "local", "--cutover", "2026-08-01", "--organization", seed.organization.id, "--out", outputPath, "--remediation-manifest-out", remediationPath], {
      cwd: repoRoot, encoding: "utf8", shell: false,
    });
    assert.equal(standalone.status, 3, standalone.stderr);
    const standaloneReport = JSON.parse(await readFile(outputPath, "utf8"));

    const helperSql = `SELECT coalesce(jsonb_agg(jsonb_build_object(
      'organization_id', organization_id, 'property_id', property_id,
      'boundary_date', to_char(boundary_date, 'YYYY-MM-DD'),
      'next_boundary_date', CASE WHEN next_boundary_date IS NULL THEN NULL ELSE to_char(next_boundary_date, 'YYYY-MM-DD') END,
      'issue_code', issue_code, 'property_owner_ids', property_owner_ids,
      'active_owner_count', active_owner_count,
      'ownership_percent_total', to_char(ownership_percent_total, 'FM990.000'),
      'canonical_roster', canonical_roster, 'ownership_roster_hash', ownership_roster_hash
    ) ORDER BY organization_id, property_id, boundary_date, issue_code NULLS FIRST, property_owner_ids), '[]'::jsonb)::text
    FROM app_private.owner_roster_legacy_preflight('2026-08-01') WHERE organization_id = ${quoted(seed.organization.id)};`;
    const helper = runSql(helperSql);
    assert.equal(helper.status, 0, helper.stderr);
    const helperReport = buildReport(JSON.parse(helper.stdout.trim()), "2026-08-01");

    const expectedRows = [...vectors.normalizedRows].sort((left, right) =>
      `${left.organizationId}|${left.propertyId}|${left.boundaryDate}|${left.issueCode ?? ""}|${left.propertyOwnerIds.join(",")}`
        .localeCompare(`${right.organizationId}|${right.propertyId}|${right.boundaryDate}|${right.issueCode ?? ""}|${right.propertyOwnerIds.join(",")}`),
    );
    assert.deepEqual(standaloneReport.rows, expectedRows);
    assert.deepEqual(helperReport.rows, expectedRows);
    assert.equal(standaloneReport.reportHash, vectors.reportHash);
    assert.equal(helperReport.reportHash, vectors.reportHash);
    const remediation = JSON.parse(await readFile(remediationPath, "utf8"));
    const { manifestHash, ...manifestPayload } = remediation;
    assert.equal(manifestHash, sha256(JSON.stringify(manifestPayload)));
    assert.equal(manifestPayload.preflightReportHash, vectors.reportHash);
    assert.equal(manifestPayload.issueRowCount, 4);
  } finally {
    runSql(cleanupSql);
    const restored = runSql(restoreShareConstraintSql);
    assert.equal(restored.status, 0, restored.stderr);
    await rm(outputPath, { force: true });
    await rm(remediationPath, { force: true });
  }
});

test("local preflight is deterministic and reports its read-only transaction", async () => {
  const firstPath = path.join(repoRoot, ".owner-roster-preflight-first.json");
  const secondPath = path.join(repoRoot, ".owner-roster-preflight-second.json");
  try {
    const deterministicOrganization = "f1000000-0000-0000-0000-000000000001";
    const args = ["--target", "local", "--cutover", "2026-08-01", "--organization", deterministicOrganization];
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
        'next_boundary_date', CASE WHEN next_boundary_date IS NULL THEN NULL ELSE to_char(next_boundary_date, 'YYYY-MM-DD') END,
        'issue_code', issue_code,
        'property_owner_ids', property_owner_ids,
        'active_owner_count', active_owner_count,
        'ownership_percent_total', to_char(ownership_percent_total, 'FM990.000'),
        'canonical_roster', canonical_roster,
        'ownership_roster_hash', ownership_roster_hash
      ) ORDER BY organization_id, property_id, boundary_date, issue_code NULLS FIRST, property_owner_ids), '[]'::jsonb)::text
      FROM app_private.owner_roster_legacy_preflight('2026-08-01')
      WHERE organization_id = '${deterministicOrganization}';
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
