// Run only against the dedicated local database or the disposable CI project.
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
const localProject = process.env.FINANCIAL_REVISION_LOCAL_PROJECT_DIR;
let database;
if (localProject) {
  database = process.env.FINANCIAL_REVISION_TEST_DATABASE;
  assert.match(database ?? "", /^(postgres|pilot_reset_[a-z0-9_]+)$/,
    "FINANCIAL_REVISION_TEST_DATABASE must name the dedicated local database");
} else {
  assert.equal(process.env.GITHUB_ACTIONS, "true",
    "Outside disposable CI, FINANCIAL_REVISION_LOCAL_PROJECT_DIR must identify the dedicated local project");
  assert.equal(process.env.FINANCIAL_REVISION_TEST_DATABASE, undefined,
    "CI revision tests cannot override the configured project database");
  database = "postgres";
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
const config = readFileSync(path.join(localProject ?? repoRoot, "supabase/config.toml"), "utf8");
const container = selectDepositContainer(config,
  docker(["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"])
    .split(/\r?\n/).filter(Boolean), process.env.SUPABASE_DB_CONTAINER);
if (localProject) {
  assert.match(container, /^supabase_db_nestory-pilot-reset-[0-9]{8}$/,
    "Local revision concurrency tests require the dedicated Nestory Pilot reset test container");
}
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres",
  "-d", database, "-v", "ON_ERROR_STOP=1"];
const sql = (body) => docker(psqlArgs, body).trim();
const actor = "00000000-0000-0000-0000-000000000101";

function fixture() {
  const org = randomUUID();
  const people = [randomUUID(), randomUUID()];
  sql(`BEGIN;
    INSERT INTO public.organizations(id,name,slug) VALUES ('${org}','Report concurrency fixture','revision-${org}');
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES ('${org}','${actor}','super_admin');
    INSERT INTO public.people(id,organization_id,display_name) VALUES
      ('${people[0]}','${org}','Original first'), ('${people[1]}','${org}','Original second');
    COMMIT;`);
  const revision = () => BigInt(sql(`SET request.jwt.claim.sub='${actor}';
    SET ROLE authenticated; SELECT public.get_financial_report_context('${org}')->>'source_revision';`));
  return { org, people, revision };
}
function session(body, applicationName) {
  const child = spawn("docker", ["--host", endpoint, ...psqlArgs], {
    cwd: repoRoot, shell: false, windowsHide: true,
  });
  const worker = { child, stdout: "", stderr: "", closed: false };
  child.stdout.on("data", (chunk) => { worker.stdout += chunk; });
  child.stderr.on("data", (chunk) => { worker.stderr += chunk; });
  worker.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => { worker.closed = true; resolve({ ...worker, status }); });
  });
  child.stdin.write(`BEGIN;
    SET LOCAL application_name='${applicationName}';
    SET LOCAL statement_timeout='10s';
    SET LOCAL idle_in_transaction_session_timeout='30s';
    SELECT 'REPORT_TXID=' || pg_catalog.txid_current();
    ${body}
    \\echo REPORT_REVISION_READY
  `);
  return worker;
}
async function waitReady(worker) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (worker.stdout.includes("REPORT_REVISION_READY")) return;
    if (worker.closed) assert.fail(`Source writer closed: ${worker.stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for source writer: ${worker.stderr}`);
}

test("independent source writers commit out of txid order without blocking or losing a revision", async () => {
  const { org, people, revision } = fixture();
  const before = revision();
  const older = session(`UPDATE public.people SET display_name='Older writer' WHERE id='${people[0]}';`, `report-older-${org}`);
  let newer;
  try {
    await waitReady(older);
    assert.equal(revision(), before, "uncommitted source entries remain invisible");
    newer = session(`UPDATE public.people SET display_name='Newer writer' WHERE id='${people[1]}';`, `report-newer-${org}`);
    newer.child.stdin.end("COMMIT;\n");
    // Deliberately do not release older: a shared revision counter would block
    // this unrelated source write and fail its bounded statement timeout.
    const newerResult = await newer.done;
    assert.equal(newerResult.status, 0, newerResult.stderr);
    const olderTxid = BigInt(older.stdout.match(/REPORT_TXID=(\d+)/)[1]);
    const newerTxid = BigInt(newerResult.stdout.match(/REPORT_TXID=(\d+)/)[1]);
    assert.ok(olderTxid < newerTxid, "the held writer must have the earlier transaction ID");
    assert.equal(revision(), before + 1n, "newer committed transaction advances the source stamp");
    older.child.stdin.end(`UPDATE public.people SET display_name='Older writer second change' WHERE id='${people[0]}'; COMMIT;\n`);
    const olderResult = await older.done;
    assert.equal(olderResult.status, 0, olderResult.stderr);
    assert.equal(revision(), before + 2n, "later commit of older txid is counted once despite multiple writes");
    assert.doesNotMatch(olderResult.stderr + newerResult.stderr, /deadlock detected|40P01/);
  } finally {
    if (!older.closed && !older.child.stdin.writableEnded) older.child.stdin.end("ROLLBACK;\n");
    await Promise.all([older.done, ...(newer ? [newer.done] : [])]);
  }
});

test("rolled-back transactions and savepoints cannot publish a source revision", async () => {
  const { org, people, revision } = fixture();
  const before = revision();
  const writer = session(`UPDATE public.people SET display_name='Aborted change' WHERE id='${people[0]}';`, `report-abort-${org}`);
  try {
    await waitReady(writer);
    assert.equal(revision(), before);
    writer.child.stdin.end("ROLLBACK;\n");
    const result = await writer.done;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(revision(), before, "aborted transaction does not advance the stamp");
    sql(`BEGIN; SAVEPOINT abandoned;
      UPDATE public.people SET display_name='Aborted savepoint' WHERE id='${people[0]}';
      ROLLBACK TO SAVEPOINT abandoned; COMMIT;`);
    assert.equal(revision(), before, "committing after rolled-back source work does not publish an entry");
    sql(`BEGIN; SAVEPOINT abandoned;
      UPDATE public.people SET display_name='Aborted savepoint' WHERE id='${people[0]}';
      ROLLBACK TO SAVEPOINT abandoned;
      UPDATE public.people SET display_name='Kept change' WHERE id='${people[1]}'; COMMIT;`);
    assert.equal(revision(), before + 1n, "a later surviving write in the same transaction still publishes an entry");
    assert.equal(sql(`SELECT display_name FROM public.people WHERE id='${people[0]}';`), "Original first");
  } finally {
    if (!writer.closed && !writer.child.stdin.writableEnded) writer.child.stdin.end("ROLLBACK;\n");
    await writer.done;
  }
});

async function waitBlocked(waiting, holdingName) {
  const deadline = performance.now() + 8_000;
  while (performance.now() < deadline) {
    if (sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity h
      ON h.pid=ANY(pg_blocking_pids(w.pid)) WHERE w.application_name='${waiting.applicationName}'
      AND h.application_name='${holdingName}');`) === "t") return;
    if (waiting.closed) assert.fail(`Expected blocked session closed: ${waiting.stderr}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for ${waiting.applicationName} to block`);
}

test("revision append does not invert organization and account locks", async () => {
  const org = randomUUID();
  sql(`BEGIN; INSERT INTO public.organizations(id,name,slug)
    VALUES ('${org}','Revision parent lock fixture','revision-${org}');
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES ('${org}','${actor}','super_admin');
    SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated;
    SELECT public.create_finance_account('${org}','equity','equity','Revision lock parent',NULL,NULL,NULL,NULL,false,false,false);
    COMMIT;`);
  const account = sql(`SELECT id FROM public.finance_accounts WHERE organization_id='${org}' AND display_name='Revision lock parent';`);
  assert.match(account, /^[0-9a-f-]{36}$/);
  const holderName = `revision-account-holder-${org}`;
  const holder = session(`SELECT set_config('request.jwt.claim.sub','${actor}',true);
    SELECT id FROM public.finance_accounts WHERE id='${account}' FOR UPDATE;`, holderName);
  let creator;
  try {
    await waitReady(holder);
    const creatorName = `revision-child-creator-${org}`;
    creator = session(`SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated;
      SELECT public.create_finance_account('${org}','equity','equity','Revision lock child',NULL,NULL,
        '${account}',NULL,false,false,false);`, creatorName);
    creator.applicationName = creatorName;
    creator.child.stdin.end("COMMIT;\n");
    // The child creator holds the organization first and waits for its parent
    // account. Restoring that account must not acquire the organization again
    // through the private revision entry's foreign key.
    await waitBlocked(creator, holderName);
    holder.child.stdin.end(`SET LOCAL ROLE authenticated;
      SELECT public.set_finance_account_archived('${org}','${account}',false,NULL); COMMIT;\n`);
    const outcomes = await Promise.all([holder.done, creator.done]);
    for (const result of outcomes) assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(outcomes.map(result => result.stderr).join("\n"), /deadlock detected|40P01|statement timeout/);
    assert.equal(sql(`SELECT count(*) FROM public.finance_accounts
      WHERE organization_id='${org}' AND parent_account_id='${account}' AND archived_at IS NULL;`), "1");
  } finally {
    for (const worker of [holder, creator].filter(Boolean)) {
      if (!worker.closed && !worker.child.stdin.writableEnded) worker.child.stdin.end("ROLLBACK;\n");
    }
    await Promise.all([holder.done, ...(creator ? [creator.done] : [])]);
  }
});

for (const sourceAction of ["UPDATE", "DELETE"]) {
test(`organization deletion waits for a source ${sourceAction} and removes every revision entry`, async () => {
  const org = randomUUID();
  const person = randomUUID();
  // Avoid finance seed dependencies so the workspace can be deleted. Return to
  // ordinary trigger mode before creating or modifying every tested source.
  sql(`BEGIN; SET LOCAL session_replication_role=replica;
    INSERT INTO public.organizations(id,name,slug) VALUES ('${org}','Revision lifetime fixture','lifetime-${org}');
    SET LOCAL session_replication_role=origin;
    INSERT INTO public.people(id,organization_id,display_name) VALUES ('${person}','${org}','Original'); COMMIT;`);
  const before = BigInt(sql(`SELECT coalesce(sum(revision),0) FROM app_private.financial_report_source_revisions WHERE organization_id='${org}';`));
  assert.ok(before > 0n);
  const holderName = `revision-lifetime-writer-${org}`;
  const heldWrite = sourceAction === "UPDATE"
    ? `UPDATE public.people SET display_name='Last committed name' WHERE id='${person}';`
    : `DELETE FROM public.people WHERE id='${person}';`;
  const holder = session(heldWrite, holderName);
  let deleter;
  try {
    await waitReady(holder);
    const deleteName = `revision-lifetime-delete-${org}`;
    deleter = session(`DELETE FROM public.organizations WHERE id='${org}';`, deleteName);
    deleter.applicationName = deleteName;
    deleter.child.stdin.end("COMMIT;\n");
    await waitBlocked(deleter, holderName);
    holder.child.stdin.end("COMMIT;\n");
    const outcomes = await Promise.all([holder.done, deleter.done]);
    for (const result of outcomes) assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(outcomes.map(result => result.stderr).join("\n"), /deadlock detected|40P01|statement timeout/);
    assert.equal(sql(`SELECT count(*) FROM public.organizations WHERE id='${org}';`), "0");
    assert.equal(sql(`SELECT count(*) FROM public.people WHERE organization_id='${org}';`), "0");
    assert.equal(sql(`SELECT count(*) FROM app_private.financial_report_source_revisions WHERE organization_id='${org}';`), "0");
    sql(`UPDATE public.people SET display_name='Cannot recreate revision' WHERE id='${person}';`);
    assert.equal(sql(`SELECT count(*) FROM app_private.financial_report_source_revisions WHERE organization_id='${org}';`), "0");
  } finally {
    for (const worker of [holder, deleter].filter(Boolean)) {
      if (!worker.closed && !worker.child.stdin.writableEnded) worker.child.stdin.end("ROLLBACK;\n");
    }
    await Promise.all([holder.done, ...(deleter ? [deleter.done] : [])]);
  }
});
}
