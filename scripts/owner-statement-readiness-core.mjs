import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertRecoverySource, RECOVERY_PROJECT, RECOVERY_CONTAINER } from "./ips-readiness-recovery-core.mjs";

export const statementTarget = Object.freeze({
  project: RECOVERY_PROJECT, container: RECOVERY_CONTAINER,
  api: "http://127.0.0.1:59321", app: "http://127.0.0.1:59330",
  organization: "00000000-0000-0000-0000-000000000001",
});

export function requireStatementPassword(env) {
  const supplied = env.NESTORY_TEST_PASSWORD;
  if (typeof supplied !== "string" || supplied.trim().length === 0) {
    throw new Error("NESTORY_TEST_PASSWORD must be supplied for the local baseline account.");
  }
  return supplied;
}

export function verifyStatementTarget({ cwd, config, manifest, fixtureHash, status, env, now }) {
  assert.match(cwd.replaceAll("\\", "/"), /\/ips-production-readiness-20261014$/);
  assert.equal(env.IPS_LOCAL_HANDOFF, statementTarget.project);
  assert.equal(env.IPS_OWNER_STATEMENT_HANDOFF, statementTarget.project);
  assert.equal(env.SUPABASE_DB_CONTAINER, statementTarget.container);
  assert.equal(env.NESTORY_BASE_URL, statementTarget.app);
  assert.equal(status.API_URL, statementTarget.api);
  assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, "Local API credentials missing");
  assert.match(config, /^\[api\][\s\S]*?^port = 59321\s*$/m);
  assertRecoverySource({ config, manifest, fixtureHash, now, explicitContainer: env.SUPABASE_DB_CONTAINER });
}

export function exactCents(value) {
  const match = String(value).match(/^(-?)(\d+)\.(\d{2})$/);
  assert.ok(match, "Noncanonical statement amount");
  return (BigInt(match[2]) * 100n + BigInt(match[3])) * (match[1] ? -1n : 1n);
}

export function reconcileFreshStatement(model, revision) {
  const movement = revision === 1 ? "0.00" : "-25.00";
  const closing = revision === 1 ? "1000.00" : "975.00";
  assert.deepEqual(model.components.map(row => ({ component: row.component,
    opening: row.opening_amount, movement: row.movement_amount, closing: row.closing_amount })), [
    { component: "ips_held_owner_cash", opening: "1000.00", movement, closing },
    { component: "owner_due_to_ips", opening: "200.00", movement: "0.00", closing: "200.00" },
    { component: "ips_due_to_owner", opening: "0.00", movement: "0.00", closing: "0.00" },
    { component: "security_deposit_custody", opening: "0.00", movement: "0.00", closing: "0.00" },
  ]);
  for (const row of model.components) assert.equal(exactCents(row.opening_amount) + exactCents(row.movement_amount), exactCents(row.closing_amount));
  assert.equal(model.lines.length, revision === 1 ? 8 : 9);
  assert.equal(model.lines.reduce((sum, row) => sum + row.sources.length, 0), model.lines.length);
}

export function verifyStatementArtifact(bytes, artifact) {
  assert.ok(["pdf", "xlsx"].includes(artifact.format));
  assert.equal(bytes.length, Number(artifact.size_bytes));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
  if (artifact.format === "pdf") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  else assert.equal(bytes.subarray(0, 2).toString(), "PK");
}
