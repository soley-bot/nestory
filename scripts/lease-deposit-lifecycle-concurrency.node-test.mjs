import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true", "Deposit concurrency fixtures require a disposable GitHub Actions runner.");
const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const actorId = "00000000-0000-0000-0000-000000000101";
const nonce = randomUUID();
const inventory = spawnSync("docker", ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"], {
  cwd: repoRoot, encoding: "utf8", shell: false,
});
assert.equal(inventory.status, 0, inventory.stderr);
const container = selectLocalDatabaseContainer(repoRoot, inventory.stdout.split(/\r?\n/).filter(Boolean));
let depositId;
let accountId;
let leaseId;
let occupancyId;

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
function actorSql(body, name) {
  return `BEGIN;
    SET LOCAL application_name = '${name}';
    SET LOCAL statement_timeout = '20s';
    SET LOCAL idle_in_transaction_session_timeout = '30s';
    SELECT set_config('request.jwt.claim.sub','${actorId}',true);
    SET LOCAL ROLE authenticated;
    ${body}`;
}
function command(type, amount, key) {
  return `SELECT public.record_lease_deposit_event_idempotent('${organizationId}','${depositId}',
    '${accountId}','${type}',current_date,${amount},'${key}','${key}');`;
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
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    if (observed?.closed) assert.fail("Session closed before " + detail + ": " + observed.stderr);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Timed out waiting for " + detail);
}
function eventIdentity(output) {
  return output.trim().split(/\r?\n/).filter((line) => /^[0-9a-f-]{36}$/.test(line)).at(-1);
}

beforeEach(() => {
  reloadFixture();
  run(actorSql(`DO $$ DECLARE p uuid; tenant uuid; created jsonb; BEGIN
    p := public.create_property_minimal('${organizationId}',
      (SELECT branch_id FROM public.properties WHERE id='10000000-0000-0000-0000-000000000001'),
      'Deposit concurrency fixture','DCSAFE','house',NULL,current_date,'deposit-concurrency-property',NULL,NULL,NULL);
    PERFORM public.set_property_rental_structure('${organizationId}',p,'single_space');
    tenant := public.create_person('${organizationId}','Deposit concurrency tenant',NULL,
      'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],
      (SELECT branch_id FROM public.properties WHERE id=p));
    created := public.create_property_lease('${organizationId}',p,
      tenant,current_date-30,current_date+335,
      1100,'USD',1,'monthly','draft',500,'USD','draft','deposit-concurrency-create');
    PERFORM public.transition_lease_lifecycle('${organizationId}',(created->>'leaseId')::uuid,
      'draft',(created->>'occupancyId')::uuid,'activate',current_date,NULL,
      'Confirmed deposit concurrency fixture move-in','deposit-concurrency-activate');
  END $$;`, "deposit-setup-" + nonce) + "\nCOMMIT;");
  const scope = run(`SELECT deposit.id::text || '|' || lease.id::text FROM public.lease_deposits deposit
    JOIN public.leases lease ON lease.id=deposit.lease_id JOIN public.properties property ON property.id=lease.property_id
    WHERE property.organization_id='${organizationId}' AND property.code='DCSAFE';`).split("|");
  [depositId, leaseId] = scope;
  occupancyId = run(`SELECT id FROM public.lease_occupancies WHERE lease_id='${leaseId}' AND archived_at IS NULL AND evidence_state='accepted';`);
  accountId = run(`SELECT account_id FROM public.finance_account_roles
    WHERE organization_id='${organizationId}' AND role_code='security_deposits';`);
  for (const id of [depositId, leaseId, accountId, occupancyId]) assert.match(id, /^[0-9a-f-]{36}$/);
});
after(reloadFixture);

function endLease() {
  return `SELECT public.transition_lease_lifecycle('${organizationId}','${leaseId}',
    'active','${occupancyId}','end',current_date,NULL,
    'Confirmed deposit concurrency fixture move-out','deposit-concurrency-end');`;
}

async function race(firstSql, secondSql, release = "COMMIT", secondShouldSucceed = true) {
  const name = "deposit-retry-" + randomUUID();
  const first = session(actorSql(firstSql + "\nDO $$ BEGIN RAISE NOTICE 'deposit_safety_posted'; END $$;", "deposit-first-" + nonce));
  let second;
  try {
    await waitUntil(() => first.stderr.includes("deposit_safety_posted"), "first transaction financial writes", first);
    second = session(actorSql(secondSql, name) + "\nCOMMIT;");
    second.child.stdin.end();
    await waitUntil(() => run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE application_name='${name}' AND wait_event_type='Lock');`) === "t", "retry blocked on transaction", second);
    first.child.stdin.end(release + ";\n");
    const [original, retried] = await Promise.all([first.done, second.done]);
    assert.doesNotMatch(original.stderr + retried.stderr, /40P01|deadlock detected/i);
    assert.equal(original.status, 0, original.stderr);
    if (secondShouldSucceed) assert.equal(retried.status, 0, retried.stderr);
    else assert.notEqual(retried.status, 0, "conflicting request must fail");
    return { original, retried };
  } finally {
    for (const active of [first, second].filter(Boolean)) {
      if (!active.closed && !active.child.stdin.writableEnded) active.child.stdin.end("\nROLLBACK;\n");
    }
    await Promise.all([first.done, ...(second ? [second.done] : [])]);
  }
}

for (const type of ["received", "refunded"]) {
  for (const release of ["COMMIT", "ROLLBACK"]) {
    test(`${type} concurrent identical retry survives original ${release.toLowerCase()}`, async () => {
      if (type === "refunded") run(actorSql(command("received", 100, "deposit-seed-receipt"), "deposit-seed-" + nonce) + "\nCOMMIT;");
      const key = "deposit-concurrent-" + type;
      const request = command(type, 50, key);
      const { original, retried } = await race(request, request, release);
      const originalId = eventIdentity(original.stdout);
      const retryId = eventIdentity(retried.stdout);
      assert.match(retryId, /^[0-9a-f-]{36}$/);
      if (release === "COMMIT") assert.equal(originalId, retryId);
      else assert.notEqual(originalId, retryId);
      assert.equal(run(`SELECT count(*) FROM public.lease_deposit_events WHERE reference='${key}';`), "1");
      assert.equal(run(`SELECT count(*) FROM public.ledger_entries WHERE source_type='deposit_event' AND source_id='${retryId}';`), "1");
      assert.equal(run(`SELECT count(*) FROM public.activity_logs WHERE action='lease_deposit_event_recorded' AND new_values->>'eventId'='${retryId}';`), "1");
      assert.equal(run(`SELECT count(*) FROM app_private.financial_idempotency_requests
        WHERE operation='record_lease_deposit_event' AND idempotency_key='${key}' AND status='completed';`), "1");
      const lostResponseRetry = run(actorSql(request, "deposit-lost-response-" + nonce) + "\nCOMMIT;");
      assert.equal(eventIdentity(lostResponseRetry), retryId);
    });
  }
  test(`${type} concurrent conflicting payload preserves the committed event`, async () => {
    if (type === "refunded") run(actorSql(command("received", 100, "deposit-seed-receipt"), "deposit-seed-" + nonce) + "\nCOMMIT;");
    const key = "deposit-conflict-" + type;
    const { retried } = await race(command(type, 50, key), command(type, 51, key), "COMMIT", false);
    assert.match(retried.stderr, /Conflicting financial idempotency request/);
    assert.equal(run(`SELECT amount FROM public.lease_deposit_events WHERE reference='${key}';`), "50.00");
  });
}

test("different archived refund keys cannot overspend held custody", async () => {
  run(actorSql(command("received", 100, "deposit-archive-seed") + `
    ${endLease()}
    SELECT public.archive_lease('${organizationId}','${leaseId}');`, "deposit-archive-" + nonce) + "\nCOMMIT;");
  const { retried } = await race(command("refunded", 80, "deposit-archive-refund-first"),
    command("refunded", 80, "deposit-archive-refund-second"), "COMMIT", false);
  assert.match(retried.stderr, /exceeds held deposit balance/);
  assert.equal(run(`SELECT sum(CASE WHEN event_type='received' THEN amount ELSE -amount END)
    FROM public.lease_deposit_events WHERE lease_deposit_id='${depositId}';`), "20.00");
});

test("receipt overlapping archive remains recoverable and later receipts are rejected", async () => {
  run(actorSql(endLease(), "deposit-end-" + nonce) + "\nCOMMIT;");
  const archive = session(actorSql(`SELECT public.archive_lease('${organizationId}','${leaseId}');
    DO $$ BEGIN RAISE NOTICE 'deposit_archive_written'; END $$;`, "deposit-archive-" + nonce));
  try {
    await waitUntil(() => archive.stderr.includes("deposit_archive_written"), "archive transaction", archive);
    run(actorSql(command("received", 50, "deposit-overlap-receipt"), "deposit-overlap-" + nonce) + "\nCOMMIT;");
    archive.child.stdin.end("COMMIT;\n");
    const result = await archive.done;
    assert.equal(result.status, 0, result.stderr);
    const fresh = session(actorSql(command("received", 1, "deposit-post-archive-receipt"), "deposit-post-archive-" + nonce) + "\nCOMMIT;");
    fresh.child.stdin.end();
    const rejected = await fresh.done;
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Lease deposit not found|Lease not found|Not authorized/);
    run(actorSql(command("refunded", 50, "deposit-overlap-refund"), "deposit-overlap-refund-" + nonce) + "\nCOMMIT;");
    assert.equal(run(`SELECT sum(CASE WHEN event_type='received' THEN amount ELSE -amount END)
      FROM public.lease_deposit_events WHERE lease_deposit_id='${depositId}';`), "0.00");
  } finally {
    if (!archive.closed && !archive.child.stdin.writableEnded) archive.child.stdin.end("ROLLBACK;\n");
    await archive.done;
  }
});

test("deposit receipt completes while lifecycle holds the lease before its financial month", async () => {
  const lifecycle = session(actorSql(`RESET ROLE;
    SELECT id FROM public.leases WHERE id='${leaseId}' FOR UPDATE;
    SET LOCAL ROLE authenticated;
    DO $$ BEGIN RAISE NOTICE 'deposit_lifecycle_lease_locked'; END $$;`, "deposit-lifecycle-" + nonce));
  try {
    await waitUntil(() => lifecycle.stderr.includes("deposit_lifecycle_lease_locked"), "lifecycle lease lock", lifecycle);
    run(actorSql(command("received", 50, "deposit-lifecycle-receipt"), "deposit-lifecycle-receipt-" + nonce) + "\nCOMMIT;");
    lifecycle.child.stdin.end(endLease() + "\nCOMMIT;\n");
    const result = await lifecycle.done;
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /deadlock detected/i);
    assert.equal(run(`SELECT status FROM public.leases WHERE id='${leaseId}';`), "ended");
    assert.equal(run(`SELECT count(*) FROM public.lease_deposit_events WHERE reference='deposit-lifecycle-receipt';`), "1");
  } finally {
    if (!lifecycle.closed && !lifecycle.child.stdin.writableEnded) lifecycle.child.stdin.end("ROLLBACK;\n");
    await lifecycle.done;
  }
});
