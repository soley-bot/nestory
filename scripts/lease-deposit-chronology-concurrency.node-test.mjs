// Run only against CI's repository-configured database or the root runner's
// already-created dedicated disposable local database.
// This script never starts, resets, reloads, or deletes a database/fixture.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import { selectDepositContainer } from "./deposit-candidate-target.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const database = process.env.DEPOSIT_CHRONOLOGY_TEST_DATABASE ?? (isGithubActions ? "postgres" : undefined);
assert.match(database ?? "", /^(postgres|pilot_reset_[a-z0-9_]+)$/,
  "DEPOSIT_CHRONOLOGY_TEST_DATABASE must name the dedicated local database");
const localProject = isGithubActions ? repoRoot : process.env.DEPOSIT_CHRONOLOGY_LOCAL_PROJECT_DIR;
assert.ok(localProject, "DEPOSIT_CHRONOLOGY_LOCAL_PROJECT_DIR must identify the dedicated local Supabase project");
if (isGithubActions) {
  assert.equal(database, "postgres", "CI chronology tests require the repository fixture database");
  assert.ok(!process.env.DEPOSIT_CHRONOLOGY_LOCAL_PROJECT_DIR ||
    path.resolve(process.env.DEPOSIT_CHRONOLOGY_LOCAL_PROJECT_DIR) === repoRoot,
  "CI chronology tests cannot override the repository Supabase project");
}
function execute(command, args, input, options = {}) {
  const result = spawnSync(command, args, {
    input, encoding: "utf8", shell: false, windowsHide: true,
    timeout: 30_000, cwd: repoRoot, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
const { docker, endpoint } = await localRecoveryDocker({ execute });
const config = readFileSync(path.join(localProject, "supabase/config.toml"), "utf8");
const container = selectDepositContainer(config,
  docker(["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"])
    .split(/\r?\n/).filter(Boolean), process.env.SUPABASE_DB_CONTAINER);
if (!isGithubActions) {
  assert.match(container, /^supabase_db_nestory-pilot-reset-[0-9]{8}$/,
    "Chronology concurrency tests require the dedicated Nestory Pilot reset test container");
}
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres",
  "-d", database, "-v", "ON_ERROR_STOP=1"];
const sql = (body) => docker(psqlArgs, body).trim();
const lifecycleInstalled = sql("SELECT to_regprocedure('app_private.assert_financial_lifecycle_isolation()') IS NOT NULL;") === "t";
const organization = "00000000-0000-0000-0000-000000000001";
const actor = "00000000-0000-0000-0000-000000000101";

function session(body, applicationName, hold = false, isolation = "READ COMMITTED", role = "authenticated") {
  const child = spawn("docker", ["--host", endpoint, ...psqlArgs], {
    cwd: repoRoot, shell: false, windowsHide: true,
  });
  const worker = { child, stdout: "", stderr: "", closed: false, applicationName };
  child.stdout.on("data", (chunk) => { worker.stdout += chunk; });
  child.stderr.on("data", (chunk) => { worker.stderr += chunk; });
  worker.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => { worker.closed = true; resolve({ ...worker, status }); });
  });
  child.stdin.write(`BEGIN ISOLATION LEVEL ${isolation};
    SET LOCAL application_name = '${applicationName}';
    SET LOCAL statement_timeout = '20s';
    SET LOCAL idle_in_transaction_session_timeout = '30s';
    SELECT set_config('request.jwt.claim.sub', '${actor}', true);
    SET LOCAL ROLE ${role};
    ${body}
    \\echo CHRONOLOGY_READY
  `);
  if (!hold) child.stdin.end("COMMIT;\n");
  return worker;
}
async function waitUntil(predicate, label, worker) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    if (worker.closed) assert.fail(`${label}: session closed: ${worker.stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

// Before lifecycle installation, prove the chronology version barrier under RR.
// With both migrations installed, lifecycle rejects RR before any financial work.
for (const isolation of lifecycleInstalled ? ["READ COMMITTED"] : ["READ COMMITTED", "REPEATABLE READ"]) {
test(`${isolation}: concurrent backdated refunds cannot overdraw an earlier deposit balance`, async () => {
  const nonce = randomUUID().replaceAll("-", "").slice(0, 16);
  const deposit = randomUUID();
  const account = sql(`SELECT account_id FROM public.finance_account_roles
    WHERE organization_id='${organization}' AND role_code='security_deposits';`);
  assert.match(account, /^[0-9a-f-]{36}$/);
  const command = (type, amount, dateOffset, key) => `SELECT public.record_lease_deposit_event_idempotent(
    '${organization}', '${deposit}', '${account}', '${type}', current_date - ${dateOffset},
    ${amount}, '${key}', '${key}');`;
  const firstKey = `chronology-race-first-${nonce}`;
  const secondKey = `chronology-race-second-${nonce}`;
  sql(`BEGIN;
    SELECT set_config('request.jwt.claim.sub', '${actor}', true);
    INSERT INTO public.lease_deposits(id, organization_id, lease_id, amount, currency, status, created_by, updated_by)
      SELECT '${deposit}', '${organization}', id, 500, 'USD', 'pending', '${actor}', '${actor}'
      FROM public.current_leases WHERE organization_id='${organization}'
        AND primary_tenant_person_id='80000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    ${command("received", 100, 15, `chronology-race-early-${nonce}`)}
    ${command("received", 100, 2, `chronology-race-late-${nonce}`)}
    COMMIT;`);
  assert.equal(sql(`SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id='${deposit}';`), "2");

  const first = session(command("refunded", 60, 10, firstKey), `chronology-first-${nonce}`, true);
  let second;
  try {
    await waitUntil(() => first.stdout.includes("CHRONOLOGY_READY"), "first refund holding its transaction", first);
    second = session(command("refunded", 60, 10, secondKey), `chronology-second-${nonce}`, false, isolation);
    await waitUntil(() => sql(`SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity AS waiting JOIN pg_stat_activity AS holding
        ON holding.pid = ANY(pg_blocking_pids(waiting.pid))
      WHERE waiting.datname='${database}' AND holding.datname='${database}'
        AND waiting.application_name='${second.applicationName}'
        AND holding.application_name='${first.applicationName}');`) === "t",
    "second refund blocked by the first transaction", second);
    first.child.stdin.end("COMMIT;\n");
    const [accepted, rejected] = await Promise.all([first.done, second.done]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.notEqual(rejected.status, 0, "second refund must not commit");
    assert.match(rejected.stderr, isolation === "REPEATABLE READ"
      ? /could not serialize access due to concurrent update/
      : /Deposit event would make historical held balance negative/);
    assert.doesNotMatch(accepted.stderr + rejected.stderr, /deadlock detected|40P01/);
    assert.equal(sql(`SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id='${deposit}';`), "3");
    assert.equal(sql(`SELECT sum(CASE WHEN event_type='received' THEN amount ELSE -amount END)
      FROM public.lease_deposit_events WHERE lease_deposit_id='${deposit}';`), "140.00");
    assert.equal(sql(`SELECT count(*) FROM app_private.financial_idempotency_requests
      WHERE organization_id='${organization}' AND idempotency_key='${secondKey}';`), "0");
    assert.equal(sql(`SELECT amount FROM public.lease_deposits WHERE id='${deposit}';`), "500.00");
  } finally {
    for (const worker of [first, second].filter(Boolean)) {
      if (!worker.closed && !worker.child.stdin.writableEnded) worker.child.stdin.end("ROLLBACK;\n");
    }
    await Promise.all([first.done, ...(second ? [second.done] : [])]);
  }
});
}

test("direct concurrent event backdates serialize before historical balance validation", async () => {
  const deposit = randomUUID();
  const account = sql(`SELECT account_id FROM public.finance_account_roles
    WHERE organization_id='${organization}' AND role_code='security_deposits';`);
  const key = `chronology-edit-${deposit}`;
  const command = (type, amount, offset, reference) => `SELECT public.record_lease_deposit_event_idempotent(
    '${organization}','${deposit}','${account}','${type}',current_date-${offset},${amount},'${reference}','${reference}');`;
  sql(`BEGIN;
    SELECT set_config('request.jwt.claim.sub','${actor}',true);
    INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,created_by,updated_by)
      SELECT '${deposit}','${organization}',id,500,'USD','pending','${actor}','${actor}'
      FROM public.current_leases WHERE organization_id='${organization}'
        AND primary_tenant_person_id='80000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    ${command("received", 100, 15, key + "-early")}
    ${command("received", 100, 2, key + "-late")}
    ${command("refunded", 60, 0, key + "-first")}
    ${command("refunded", 60, 0, key + "-second")}
    COMMIT;`);
  const move = (suffix) => `UPDATE public.lease_deposit_events SET event_date=current_date-10
    WHERE lease_deposit_id='${deposit}' AND reference='${key}-${suffix}';`;
  const first = session(move("first"), `chronology-edit-first-${deposit}`, true, "READ COMMITTED", "postgres");
  let second;
  try {
    await waitUntil(() => first.stdout.includes("CHRONOLOGY_READY"), "first event-date edit", first);
    second = session(move("second"), `chronology-edit-second-${deposit}`, false, "READ COMMITTED", "postgres");
    await waitUntil(() => sql(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity AS waiting JOIN pg_stat_activity AS holding
      ON holding.pid=ANY(pg_blocking_pids(waiting.pid)) WHERE waiting.application_name='${second.applicationName}'
      AND holding.application_name='${first.applicationName}');`) === "t", "second event-date edit waiting on deposit", second);
    first.child.stdin.end("COMMIT;\n");
    const [accepted, rejected] = await Promise.all([first.done, second.done]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Deposit event would make historical held balance negative/);
    assert.doesNotMatch(accepted.stderr + rejected.stderr, /deadlock detected|40P01/);
    assert.equal(sql(`SELECT event_date=current_date-10 FROM public.lease_deposit_events
      WHERE lease_deposit_id='${deposit}' AND reference='${key}-first';`), "t");
    assert.equal(sql(`SELECT event_date=current_date FROM public.lease_deposit_events
      WHERE lease_deposit_id='${deposit}' AND reference='${key}-second';`), "t");
    assert.equal(sql(`SELECT sum(CASE WHEN event_type='received' THEN amount ELSE -amount END)
      FROM public.lease_deposit_events WHERE lease_deposit_id='${deposit}';`), "80.00");
  } finally {
    for (const worker of [first, second].filter(Boolean)) {
      if (!worker.closed && !worker.child.stdin.writableEnded) worker.child.stdin.end("ROLLBACK;\n");
    }
    await Promise.all([first.done, ...(second ? [second.done] : [])]);
  }
});

function createLifecycleFixture() {
  const nonce = randomUUID();
  const code = `LFC-${nonce.slice(0, 8)}`.toUpperCase();
  sql(`BEGIN; SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated;
    DO $$ DECLARE p uuid; tenant uuid; created jsonb; BEGIN
      p := public.create_property_minimal('${organization}',
        (SELECT branch_id FROM public.properties WHERE id='10000000-0000-0000-0000-000000000001'),
        'Chronology lifecycle fixture','${code}','house',NULL,current_date,'${nonce}-property',NULL,NULL,NULL);
      PERFORM public.set_property_rental_structure('${organization}',p,'single_space');
      tenant := public.create_person('${organization}','Chronology lifecycle tenant',NULL,
        'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],(SELECT branch_id FROM public.properties WHERE id=p));
      created := public.create_property_lease('${organization}',p,tenant,current_date-30,current_date+335,
        1100,'USD',1,'monthly','draft',500,'USD','draft','${nonce}-create');
      PERFORM public.transition_lease_lifecycle('${organization}',(created->>'leaseId')::uuid,
        'draft',(created->>'occupancyId')::uuid,'activate',current_date,NULL,
        'Confirmed chronology fixture move-in','${nonce}-activate');
    END $$; COMMIT;`);
  const [deposit, lease] = sql(`SELECT deposit.id::text || '|' || lease.id::text
    FROM public.lease_deposits deposit JOIN public.leases lease ON lease.id=deposit.lease_id
    JOIN public.properties property ON property.id=lease.property_id
    WHERE property.organization_id='${organization}' AND property.code='${code}';`).split("|");
  const occupancy = sql(`SELECT id FROM public.lease_occupancies
    WHERE lease_id='${lease}' AND archived_at IS NULL AND evidence_state='accepted';`);
  const account = sql(`SELECT account_id FROM public.finance_account_roles
    WHERE organization_id='${organization}' AND role_code='security_deposits';`);
  for (const id of [deposit, lease, occupancy, account]) assert.match(id, /^[0-9a-f-]{36}$/);
  return {
    nonce, deposit, lease,
    end: `SELECT public.transition_lease_lifecycle('${organization}','${lease}','active','${occupancy}',
      'end',current_date,NULL,'Confirmed chronology fixture move-out','${nonce}-end');`,
    command: (type, amount, suffix) => `SELECT public.record_lease_deposit_event_idempotent(
      '${organization}','${deposit}','${account}','${type}',current_date,${amount},'${nonce}-${suffix}','${nonce}-${suffix}');`,
  };
}

test("dedicated database: receipt overlapping archive remains recoverable and later receipts are rejected", async () => {
  const fixture = createLifecycleFixture();
  const ended = await session(fixture.end, `chronology-end-${fixture.nonce}`).done;
  assert.equal(ended.status, 0, ended.stderr);
  const archive = session(`SELECT public.archive_lease('${organization}','${fixture.lease}');`,
    `chronology-archive-${fixture.nonce}`, true);
  try {
    await waitUntil(() => archive.stdout.includes("CHRONOLOGY_READY"), "archive holding lease", archive);
    const receipt = await session(fixture.command("received", 50, "overlap"), `chronology-overlap-${fixture.nonce}`).done;
    assert.equal(receipt.status, 0, receipt.stderr);
    archive.child.stdin.end("COMMIT;\n");
    const archived = await archive.done;
    assert.equal(archived.status, 0, archived.stderr);
    const rejected = await session(fixture.command("received", 1, "post-archive"), `chronology-after-${fixture.nonce}`).done;
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Lease deposit not found|Lease not found|Not authorized/);
    const refunded = await session(fixture.command("refunded", 50, "refund"), `chronology-refund-${fixture.nonce}`).done;
    assert.equal(refunded.status, 0, refunded.stderr);
    assert.equal(sql(`SELECT sum(CASE WHEN event_type='received' THEN amount ELSE -amount END)
      FROM public.lease_deposit_events WHERE lease_deposit_id='${fixture.deposit}';`), "0.00");
  } finally {
    if (!archive.closed && !archive.child.stdin.writableEnded) archive.child.stdin.end("ROLLBACK;\n");
    await archive.done;
  }
});

test("dedicated database: deposit receipt completes while lifecycle holds lease before financial month", async () => {
  const fixture = createLifecycleFixture();
  const lifecycle = session(`RESET ROLE; SELECT id FROM public.leases WHERE id='${fixture.lease}' FOR UPDATE;
    SET LOCAL ROLE authenticated;`, `chronology-lease-lock-${fixture.nonce}`, true);
  try {
    await waitUntil(() => lifecycle.stdout.includes("CHRONOLOGY_READY"), "lifecycle lease lock", lifecycle);
    const receipt = await session(fixture.command("received", 50, "lifecycle-receipt"),
      `chronology-lease-receipt-${fixture.nonce}`).done;
    assert.equal(receipt.status, 0, receipt.stderr);
    lifecycle.child.stdin.end(fixture.end + "\nCOMMIT;\n");
    const ended = await lifecycle.done;
    assert.equal(ended.status, 0, ended.stderr);
    assert.doesNotMatch(ended.stderr + receipt.stderr, /deadlock detected|40P01/);
    assert.equal(sql(`SELECT status FROM public.leases WHERE id='${fixture.lease}';`), "ended");
    assert.equal(sql(`SELECT count(*) FROM public.lease_deposit_events
      WHERE reference='${fixture.nonce}-lifecycle-receipt';`), "1");
  } finally {
    if (!lifecycle.closed && !lifecycle.child.stdin.writableEnded) lifecycle.child.stdin.end("ROLLBACK;\n");
    await lifecycle.done;
  }
});

if (lifecycleInstalled) {
  for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"]) {
    test(`${isolation}: direct deposit event writer rejects a stale fixed snapshot`, async () => {
      const deposit = randomUUID();
      const key = `chronology-snapshot-${deposit}`;
      const account = sql(`SELECT account_id FROM public.finance_account_roles
        WHERE organization_id='${organization}' AND role_code='security_deposits';`);
      const receipt = (reference) => `SELECT public.record_lease_deposit_event_idempotent(
        '${organization}','${deposit}','${account}','received',current_date,50,'${reference}','${reference}');`;
      sql(`BEGIN;
        SELECT set_config('request.jwt.claim.sub','${actor}',true);
        INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,created_by,updated_by)
          SELECT '${deposit}','${organization}',id,500,'USD','pending','${actor}','${actor}'
          FROM public.current_leases WHERE organization_id='${organization}'
            AND primary_tenant_person_id='80000000-0000-0000-0000-000000000001';
        SET LOCAL ROLE authenticated;
        ${receipt(key)}
        COMMIT;`);
      const writer = session(`SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id='${deposit}';`,
        `chronology-fixed-${deposit}`, true, isolation, "postgres");
      try {
        await waitUntil(() => writer.stdout.includes("CHRONOLOGY_READY"), "fixed deposit snapshot", writer);
        sql(`BEGIN; SELECT set_config('request.jwt.claim.sub','${actor}',true);
          SET LOCAL ROLE authenticated; ${receipt(key + "-later")} COMMIT;`);
        writer.child.stdin.end(`UPDATE public.lease_deposit_events SET event_date=current_date-1
          WHERE lease_deposit_id='${deposit}' AND reference='${key}'; COMMIT;\n`);
        const result = await writer.done;
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /financial_write_requires_read_committed/);
        assert.equal(sql(`SELECT count(*) FROM public.lease_deposit_events
          WHERE lease_deposit_id='${deposit}' AND event_date=current_date;`), "2");
      } finally {
        if (!writer.closed && !writer.child.stdin.writableEnded) writer.child.stdin.end("ROLLBACK;\n");
        await writer.done;
      }
    });
  }
  for (const enroll of [false, true]) {
    test(`fixed-snapshot writer fails closed with ${enroll ? "newly enrolled" : "unenrolled"} controls`, async () => {
      const org = randomUUID();
      const person = randomUUID();
      sql(`INSERT INTO public.organizations(id,name,slug) VALUES ('${org}','Lifecycle isolation fixture','isolation-${org}');
        INSERT INTO public.people(id,organization_id,display_name) VALUES ('${person}','${org}','Original');`);
      const writer = session(`SELECT count(*) FROM public.people WHERE id='${person}';`,
        `lifecycle-snapshot-${org}`, true, "REPEATABLE READ", "postgres");
      try {
        await waitUntil(() => writer.stdout.includes("CHRONOLOGY_READY"), "repeatable-read snapshot", writer);
        if (enroll) {
          sql(`INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
            VALUES ('${org}',1,'frozen',current_date);`);
        }
        writer.child.stdin.end(`UPDATE public.people SET display_name='Forbidden stale edit' WHERE id='${person}'; COMMIT;\n`);
        const result = await writer.done;
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /financial_write_requires_read_committed/);
        assert.equal(sql(`SELECT display_name FROM public.people WHERE id='${person}';`), "Original");
      } finally {
        if (!writer.closed && !writer.child.stdin.writableEnded) writer.child.stdin.end("ROLLBACK;\n");
        await writer.done;
      }
    });
  }
  test("freeze waits for an in-flight master writer and fences the next write", async () => {
    const org = randomUUID();
    const person = randomUUID();
    sql(`INSERT INTO public.organizations(id,name,slug) VALUES ('${org}','Lifecycle freeze fixture','freeze-${org}');
      INSERT INTO public.people(id,organization_id,display_name) VALUES ('${person}','${org}','Original');`);
    const writer = session(`UPDATE public.people SET display_name='Accepted before freeze' WHERE id='${person}';`,
      `lifecycle-writer-${org}`, true, "READ COMMITTED", "postgres");
    let freezer;
    try {
      await waitUntil(() => writer.stdout.includes("CHRONOLOGY_READY"), "master writer holding shared lock", writer);
      freezer = session(`INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
        VALUES ('${org}',1,'frozen',current_date);`, `lifecycle-freeze-${org}`, false, "READ COMMITTED", "postgres");
      await waitUntil(() => sql(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity AS waiting JOIN pg_stat_activity AS holding
        ON holding.pid=ANY(pg_blocking_pids(waiting.pid)) WHERE waiting.application_name='${freezer.applicationName}'
        AND holding.application_name='${writer.applicationName}');`) === "t", "freeze blocked by in-flight master writer", freezer);
      writer.child.stdin.end("COMMIT;\n");
      const outcomes = await Promise.all([writer.done, freezer.done]);
      for (const result of outcomes) assert.equal(result.status, 0, result.stderr);
      const after = session(`UPDATE public.people SET display_name='Forbidden after freeze' WHERE id='${person}';`,
        `lifecycle-after-${org}`, false, "READ COMMITTED", "postgres");
      const rejected = await after.done;
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /financial_writes_frozen/);
      assert.equal(sql(`SELECT display_name FROM public.people WHERE id='${person}';`), "Accepted before freeze");
    } finally {
      for (const worker of [writer, freezer].filter(Boolean)) {
        if (!worker.closed && !worker.child.stdin.writableEnded) worker.child.stdin.end("ROLLBACK;\n");
      }
      await Promise.all([writer.done, ...(freezer ? [freezer.done] : [])]);
    }
  });
}
if (sql("SELECT to_regprocedure('public.get_financial_report_context(uuid)') IS NOT NULL;") === "t") {
  test("report source revision becomes visible only when source writes commit", async () => {
    const org = randomUUID();
    const person = randomUUID();
    sql(`INSERT INTO public.organizations(id,name,slug) VALUES ('${org}','Report revision fixture','revision-${org}');
      INSERT INTO public.organization_members(organization_id,user_id,role) VALUES ('${org}','${actor}','super_admin');
      INSERT INTO public.people(id,organization_id,display_name) VALUES ('${person}','${org}','Original');`);
    const revision = () => BigInt(sql(`SET request.jwt.claim.sub='${actor}';
      SET ROLE authenticated; SELECT public.get_financial_report_context('${org}')->>'source_revision';`));
    const before = revision();
    const writer = session(`UPDATE public.people SET display_name='Committed revision' WHERE id='${person}';`,
      `report-revision-${org}`, true, "READ COMMITTED", "postgres");
    try {
      await waitUntil(() => writer.stdout.includes("CHRONOLOGY_READY"), "uncommitted source write", writer);
      assert.equal(revision(), before, "uncommitted revision must remain invisible to report reader");
      writer.child.stdin.end("COMMIT;\n");
      const accepted = await writer.done;
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.equal(revision(), before + 1n);
      sql(`BEGIN; UPDATE public.people SET display_name='Rolled back' WHERE id='${person}'; ROLLBACK;`);
      assert.equal(revision(), before + 1n, "rollback must preserve the committed source version");
      assert.equal(sql(`SELECT display_name FROM public.people WHERE id='${person}';`), "Committed revision");
    } finally {
      if (!writer.closed && !writer.child.stdin.writableEnded) writer.child.stdin.end("ROLLBACK;\n");
      await writer.done;
    }
  });
}
