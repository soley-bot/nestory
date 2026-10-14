import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { FIXTURE_USERS } from "./ips-readiness-recovery-core.mjs";
import { statementTarget, verifyStatementTarget, reconcileFreshStatement, verifyStatementArtifact } from "./owner-statement-readiness-core.mjs";

const input = () => ({ cwd: "D:/nestory/.worktrees/ips-production-readiness-20261014",
  config: `project_id = "${statementTarget.project}"\n[api]\nport = 59321\n`, fixtureHash: "a".repeat(64),
  manifest: { project: statementTarget.project, sourceKind: "fresh-reset-plus-committed-synthetic-baseline",
    containerId: "b".repeat(64), fixtureSha256: "a".repeat(64), loadedAt: "2026-10-14T13:00:00.000Z",
    organizationIds: [statementTarget.organization], authUserIds: FIXTURE_USERS },
  status: { API_URL: statementTarget.api, ANON_KEY: "synthetic", SERVICE_ROLE_KEY: "synthetic" },
  env: { IPS_LOCAL_HANDOFF: statementTarget.project, IPS_OWNER_STATEMENT_HANDOFF: statementTarget.project,
    SUPABASE_DB_CONTAINER: statementTarget.container, NESTORY_BASE_URL: statementTarget.app },
  now: Date.parse("2026-10-14T13:30:00.000Z") });

test("official statement guard accepts only the current fixed readiness source", () => {
  verifyStatementTarget(input());
  for (const field of ["IPS_LOCAL_HANDOFF", "IPS_OWNER_STATEMENT_HANDOFF", "SUPABASE_DB_CONTAINER", "NESTORY_BASE_URL"]) {
    const value = input(); value.env[field] = "other-stack";
    assert.throws(() => verifyStatementTarget(value));
  }
});
test("official statement guard rejects stale source, changed container manifest and another API", () => {
  for (const alter of [value => { value.now += 3 * 60 * 60_000; }, value => { value.manifest.containerId = "invalid"; },
    value => { value.status.API_URL = "http://127.0.0.1:54321"; }, value => { value.fixtureHash = "c".repeat(64); },
    value => { value.config = value.config.replace("59321", "54321"); }]) {
    const value = input(); alter(value); assert.throws(() => verifyStatementTarget(value));
  }
});
test("official statement reconciliation checks every component and exact movement", () => {
  const model = { components: [
    { component: "ips_held_owner_cash", opening_amount: "1000.00", movement_amount: "-25.00", closing_amount: "975.00" },
    { component: "owner_due_to_ips", opening_amount: "200.00", movement_amount: "0.00", closing_amount: "200.00" },
    { component: "ips_due_to_owner", opening_amount: "0.00", movement_amount: "0.00", closing_amount: "0.00" },
    { component: "security_deposit_custody", opening_amount: "0.00", movement_amount: "0.00", closing_amount: "0.00" },
  ], lines: Array.from({ length: 9 }, () => ({ sources: [{}] })) };
  reconcileFreshStatement(model, 2);
  model.components[0].closing_amount = "1000.00";
  assert.throws(() => reconcileFreshStatement(model, 2));
});
test("retained artifact evidence verifies format, length and actual byte hash", () => {
  const bytes = Buffer.from("%PDF-synthetic");
  const artifact = { format: "pdf", size_bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  verifyStatementArtifact(bytes, artifact);
  assert.throws(() => verifyStatementArtifact(Buffer.from("%PDF-corrupted"), artifact));
});
