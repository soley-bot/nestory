import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const actorId = "00000000-0000-0000-0000-000000000101";
const depositId = "88000000-0000-0000-0000-000000000092";
const replacementId = "88000000-0000-0000-0000-000000000093";
const nonce = randomUUID();
const inventory = spawnSync("docker", ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"], {
  cwd: repoRoot, encoding: "utf8", shell: false,
});
assert.equal(inventory.status, 0, inventory.stderr);
const container = selectLocalDatabaseContainer(repoRoot, inventory.stdout.split(/\r?\n/).filter(Boolean));

function psqlArgs(interactive = false) {
  return ["exec", ...(interactive ? ["-i"] : []), container, "psql", "-X", "-qAt", "-U", "postgres",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
}
function run(sql) {
  const result = spawnSync("docker", [...psqlArgs(), "-c", sql], {
    cwd: repoRoot, encoding: "utf8", shell: false, timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function reloadFixture() {
  const result = spawnSync(process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/load-test-fixture.mjs"],
    { cwd: repoRoot, encoding: "utf8", shell: false, timeout: 90_000 });
  assert.equal(result.status, 0, result.stderr);
}
function session(initialSql) {
  const child = spawn("docker", psqlArgs(true), { cwd: repoRoot, shell: false });
  const value = { child, stdout: "", stderr: "", closed: false };
  child.stdout.on("data", (chunk) => { value.stdout += chunk; });
  child.stderr.on("data", (chunk) => { value.stderr += chunk; });
  value.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => { value.closed = true; resolve({ ...value, status }); });
  });
  child.stdin.write(initialSql + "\n");
  return value;
}
async function waitUntil(predicate, detail, observed) {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    if (observed?.closed) assert.fail("Session closed before " + detail + ": " + observed.stderr);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Timed out waiting for " + detail);
}
function actorSql(body, name, authenticated = true) {
  return `BEGIN;
    SET LOCAL application_name = '${name}';
    SET LOCAL statement_timeout = '15s';
    SET LOCAL idle_in_transaction_session_timeout = '20s';
    SELECT set_config('request.jwt.claim.sub','${actorId}',true);
    ${authenticated ? "SET LOCAL ROLE authenticated;" : ""}
    ${body}`;
}
function receipt(reference) {
  return `SELECT public.record_lease_deposit_event('${organizationId}','${depositId}',
    'received',current_date,50,'${reference}');`;
}

beforeEach(() => {
  reloadFixture();
  run(`INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,created_by,updated_by)
    SELECT '${depositId}','${organizationId}',id,500,'USD','pending','${actorId}','${actorId}'
    FROM public.current_leases WHERE organization_id='${organizationId}'
      AND primary_tenant_person_id='80000000-0000-0000-0000-000000000001';
    INSERT INTO public.finance_accounts(id,organization_id,account_class,account_subtype,display_name,
      use_for_lease_deposits,created_by,updated_by)
    VALUES('${replacementId}','${organizationId}','liability','current_liability',
      'Deposit default concurrency replacement',true,'${actorId}','${actorId}');`);
});
after(reloadFixture);

for (const mode of ["retire", "rebind"]) {
  test(`legacy receipt versus default ${mode} has no account/role deadlock and retries safely`, async () => {
    const originalId = run(`SELECT account_id FROM public.finance_account_roles
      WHERE organization_id='${organizationId}' AND role_code='security_deposits';`);
    assert.match(originalId, /^[0-9a-f-]{36}$/);
    const receiptName = "deposit-default-receipt-" + nonce;
    const retirement = session(actorSql(`
      SELECT id FROM public.finance_accounts WHERE id='${originalId}' FOR UPDATE;
      DO $$ BEGIN RAISE NOTICE 'deposit_default_account_locked'; END $$;`,
    "deposit-default-lifecycle-" + nonce, false));
    let recording;
    try {
      await waitUntil(() => retirement.stderr.includes("deposit_default_account_locked"), "account lock", retirement);
      recording = session(actorSql(receipt("LEGACY-DEFAULT-RACE"), receiptName) + "\nCOMMIT;");
      recording.child.stdin.end();
      await waitUntil(() => run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE application_name='${receiptName}' AND wait_event_type='Lock');`) === "t", "receipt waiting for account", recording);

      // Use the actual checked lifecycle for retirement. The rebind case models
      // an account-first operator rotation that intentionally leaves the old
      // account active, exercising the adapter's post-lock identity recheck.
      const mutation = mode === "retire"
        ? `SET LOCAL ROLE authenticated;
            SELECT public.set_finance_account_archived('${organizationId}','${originalId}',true,'${replacementId}');`
        : `RESET ROLE; UPDATE public.finance_account_roles SET account_id='${replacementId}'
            WHERE organization_id='${organizationId}' AND role_code='security_deposits';`;
      retirement.child.stdin.end(mutation + "\nCOMMIT;\n");
      const [changed, recorded] = await Promise.all([retirement.done, recording.done]);
      assert.doesNotMatch(changed.stderr + recorded.stderr, /40P01|deadlock detected/i);
      assert.equal(changed.status, 0, changed.stderr);
      assert.notEqual(recorded.status, 0, "stale default must not record a receipt");
      assert.match(recorded.stderr, mode === "retire" ? /compatible active deposit liability|default changed/i : /default changed/i);
      assert.equal(run(`SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id='${depositId}';`), "0");

      run(actorSql(receipt("LEGACY-DEFAULT-RETRY"), "deposit-default-retry-" + nonce) + "\nCOMMIT;");
      assert.equal(run(`SELECT liability_account_id::text || '|' || amount::text || '|' ||
        (ledger_entry_id IS NOT NULL)::text FROM public.lease_deposit_events
        WHERE lease_deposit_id='${depositId}';`), replacementId + "|50.00|true");
    } finally {
      for (const active of [retirement, recording].filter(Boolean)) {
        if (!active.closed && !active.child.stdin.writableEnded) active.child.stdin.end("\nROLLBACK;\n");
      }
      await Promise.all([retirement.done, ...(recording ? [recording.done] : [])]);
    }
  });
}
