import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const propertyId = "10000000-0000-0000-0000-000000000001";
const ownerId = "80000000-0000-0000-0000-000000000004";

const selected = spawnSync(
  "docker",
  ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
  { cwd: repoRoot, encoding: "utf8", shell: false },
);
assert.equal(selected.status, 0, selected.stderr);
const container = selectLocalDatabaseContainer(
  repoRoot,
  selected.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
);

function args(sql) {
  return ["exec", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql];
}

function run(sql) {
  const result = spawnSync("docker", args(sql), {
    cwd: repoRoot, encoding: "utf8", shell: false, timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function session(sql) {
  const child = spawn("docker", args(sql), {
    cwd: repoRoot, encoding: "utf8", shell: false,
  });
  const state = { child, closed: false, status: null, stderr: "", stdout: "" };
  child.stdout.on("data", (chunk) => { state.stdout += chunk; });
  child.stderr.on("data", (chunk) => { state.stderr += chunk; });
  state.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => {
      state.closed = true;
      state.status = status;
      resolve(state);
    });
  });
  return state;
}

async function waitFor(state, marker) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (`${state.stdout}\n${state.stderr}`.includes(marker)) return;
    if (state.closed) assert.fail(`session closed before ${marker}: ${state.stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${marker}: ${state.stderr}`);
}

function authenticated(command) {
  return `BEGIN;
    SET LOCAL statement_timeout = '15s';
    SELECT set_config('request.jwt.claim.sub', '${superAdminId}', true);
    SET LOCAL ROLE authenticated;
    ${command}
    COMMIT;`;
}

function reload() {
  const result = spawnSync(process.execPath, ["scripts/load-test-fixture.mjs"], {
    cwd: repoRoot, encoding: "utf8", shell: false, timeout: 40_000,
  });
  assert.equal(result.status, 0, result.stderr);
}

function prepareClosedRevision() {
  run(authenticated(`
    SELECT public.set_financial_month_lock(
      '${organizationId}', date_trunc('month', current_date)::date, true,
      'Owner statement publication race'
    );
    SELECT public.review_owner_opening_balance(
      request.organization_id, request.id, 'reject',
      'Resolve fixture correction before statement close',
      'owner-statement-race-reject-pending'
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '${organizationId}'
      AND request.property_id = '${propertyId}'
      AND request.owner_person_id = '${ownerId}'
      AND request.status = 'submitted';
    SELECT public.close_owner_month(
      '${organizationId}', '${propertyId}', '${ownerId}', 'USD',
      date_trunc('month', current_date)::date,
      'Close for owner statement concurrency proof',
      'owner-statement-race-close-r1'
    );
  `));
  return run(`SELECT current_closed_revision_id
    FROM public.owner_close_series
    WHERE organization_id = '${organizationId}'
      AND property_id = '${propertyId}'
      AND owner_person_id = '${ownerId}'
      AND month_start = date_trunc('month', current_date)::date;`).split(/\r?\n/).at(-1);
}

function removeHarness() {
  run(`
    DROP TRIGGER IF EXISTS test_pause_owner_statement_publication
      ON public.owner_statement_publications;
    DROP TRIGGER IF EXISTS test_pause_owner_statement_artifact
      ON public.owner_statement_artifacts;
    DROP TRIGGER IF EXISTS test_pause_owner_statement_reopen
      ON public.owner_close_revisions;
    DROP FUNCTION IF EXISTS app_private.test_pause_owner_statement_publication();
    DROP FUNCTION IF EXISTS app_private.test_pause_owner_statement_artifact();
    DROP FUNCTION IF EXISTS app_private.test_pause_owner_statement_reopen();
  `);
}

function installHarness() {
  removeHarness();
  run(`
    CREATE FUNCTION app_private.test_pause_owner_statement_publication()
    RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $body$
    BEGIN
      IF current_setting('app.owner_statement_test_pause', true) = 'publication_insert' THEN
        PERFORM set_config('app.owner_statement_test_pause', '', true);
        RAISE NOTICE 'owner_statement_publication_pause_ready';
        PERFORM pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $body$;
    CREATE TRIGGER test_pause_owner_statement_publication
      BEFORE INSERT ON public.owner_statement_publications
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_statement_publication();
    CREATE FUNCTION app_private.test_pause_owner_statement_artifact()
    RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $body$
    BEGIN
      IF current_setting('app.owner_statement_test_pause', true) = 'artifact_insert' THEN
        PERFORM set_config('app.owner_statement_test_pause', '', true);
        RAISE NOTICE 'owner_statement_artifact_pause_ready';
        PERFORM pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $body$;
    CREATE TRIGGER test_pause_owner_statement_artifact
      BEFORE INSERT ON public.owner_statement_artifacts
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_statement_artifact();
    CREATE FUNCTION app_private.test_pause_owner_statement_reopen()
    RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $body$
    BEGIN
      IF current_setting('app.owner_statement_test_pause', true) = 'reopen_revision' THEN
        PERFORM set_config('app.owner_statement_test_pause', '', true);
        RAISE NOTICE 'owner_statement_reopen_pause_ready';
        PERFORM pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $body$;
    CREATE TRIGGER test_pause_owner_statement_reopen
      BEFORE INSERT ON public.owner_close_revisions
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_statement_reopen();
  `);
}

function preparePublishedWithPdf() {
  const revisionId = prepareClosedRevision();
  const published = JSON.parse(run(authenticated(`
    SELECT public.publish_owner_statement(
      '${organizationId}', '${revisionId}', 'owner-statement-race-publish-artifacts'
    )::text;
  `)).split(/\r?\n/).filter(Boolean).at(-1));
  const publicationId = published.publication_id;
  const statementNumber = published.statement_number;
  const seriesId = run(`SELECT owner_close_series_id FROM public.owner_close_revisions
    WHERE id = '${revisionId}';`).split(/\r?\n/).at(-1);
  const pdfPath = `${organizationId}/${publicationId}/pdf/owner-statement-${statementNumber}.pdf`;
  const xlsxPath = `${organizationId}/${publicationId}/xlsx/owner-statement-${statementNumber}.xlsx`;
  run(`INSERT INTO storage.objects (bucket_id, name) VALUES
    ('owner-statements', '${pdfPath}'), ('owner-statements', '${xlsxPath}');`);
  run(authenticated(`SELECT public.register_owner_statement_artifact(
    '${organizationId}', '${publicationId}', 'pdf', '${pdfPath}', repeat('1', 64), 4,
    'owner-statement-race-register-pdf'
  );`));
  return { publicationId, revisionId, seriesId, xlsxPath };
}

beforeEach(() => {
  reload();
  installHarness();
});

after(() => {
  try { removeHarness(); } catch { /* database may already be reset */ }
});

test("same actor/key/payload concurrent publish returns one publication ID", async () => {
  const revisionId = prepareClosedRevision();
  const command = (pause) => authenticated(`
    ${pause ? "SELECT set_config('app.owner_statement_test_pause', 'publication_insert', true);" : ""}
    SELECT public.publish_owner_statement(
      '${organizationId}', '${revisionId}', 'owner-statement-race-publish-r1'
    )->>'publication_id';
  `);
  const first = session(command(true));
  await waitFor(first, "owner_statement_publication_pause_ready");
  const second = session(command(false));
  const [a, b] = await Promise.all([first.done, second.done]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  const firstId = a.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean).at(-1);
  const secondId = b.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean).at(-1);
  assert.equal(firstId, secondId);
  assert.equal(run(`SELECT count(*) FROM public.owner_statement_publications
    WHERE owner_close_revision_id = '${revisionId}';`).split(/\r?\n/).at(-1), "1");
  assert.equal(run(`SELECT count(*) FROM app_private.financial_idempotency_requests
    WHERE operation = 'publish_owner_statement' AND status = 'pending';`).split(/\r?\n/).at(-1), "0");
});

test("same actor/key/payload concurrent artifact registration returns one artifact ID", async () => {
  const fixture = preparePublishedWithPdf();
  const command = (pause) => authenticated(`
    ${pause ? "SELECT set_config('app.owner_statement_test_pause', 'artifact_insert', true);" : ""}
    SELECT public.register_owner_statement_artifact(
      '${organizationId}', '${fixture.publicationId}', 'xlsx', '${fixture.xlsxPath}',
      repeat('2', 64), 5, 'owner-statement-race-register-xlsx'
    )->>'artifact_id';
  `);
  const first = session(command(true));
  await waitFor(first, "owner_statement_artifact_pause_ready");
  const second = session(command(false));
  const [a, b] = await Promise.all([first.done, second.done]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  const ids = [a, b].map((state) => state.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean).at(-1));
  assert.equal(ids[0], ids[1]);
  assert.equal(run(`SELECT count(*) FROM public.owner_statement_artifacts
    WHERE publication_id = '${fixture.publicationId}' AND format = 'xlsx';`).split(/\r?\n/).at(-1), "1");
  assert.equal(run(`SELECT count(*) FROM app_private.financial_idempotency_requests
    WHERE operation = 'register_owner_statement_artifact' AND status = 'pending';`).split(/\r?\n/).at(-1), "0");
});

test("register-first completion serializes reopen and both commands succeed", async () => {
  const fixture = preparePublishedWithPdf();
  const register = session(authenticated(`
    SELECT set_config('app.owner_statement_test_pause', 'artifact_insert', true);
    SELECT public.register_owner_statement_artifact(
      '${organizationId}', '${fixture.publicationId}', 'xlsx', '${fixture.xlsxPath}',
      repeat('2', 64), 5, 'owner-statement-race-register-first-xlsx'
    );
  `));
  await waitFor(register, "owner_statement_artifact_pause_ready");
  const reopen = session(authenticated(`SELECT public.reopen_owner_month(
    '${organizationId}', '${fixture.seriesId}', 'Reopen after retained artifacts',
    'owner-statement-race-register-first-reopen'
  );`));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(reopen.closed, false, "reopen must wait behind artifact registration scope locks");
  const [a, b] = await Promise.all([register.done, reopen.done]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(run(`SELECT count(*) FROM app_private.financial_idempotency_requests
    WHERE status = 'pending' AND operation IN ('register_owner_statement_artifact','reopen_owner_month');`).split(/\r?\n/).at(-1), "0");
});

test("reopen-first loses atomically while the waiting registration completes", async () => {
  const fixture = preparePublishedWithPdf();
  const reopen = session(authenticated(`
    SELECT set_config('app.owner_statement_test_pause', 'reopen_revision', true);
    SELECT public.reopen_owner_month(
      '${organizationId}', '${fixture.seriesId}', 'Reopen before retained Excel',
      'owner-statement-race-reopen-first'
    );
  `));
  await waitFor(reopen, "owner_statement_reopen_pause_ready");
  const register = session(authenticated(`SELECT public.register_owner_statement_artifact(
    '${organizationId}', '${fixture.publicationId}', 'xlsx', '${fixture.xlsxPath}',
    repeat('2', 64), 5, 'owner-statement-race-reopen-first-xlsx'
  );`));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(register.closed, false, "registration must wait behind reopen scope locks");
  const [a, b] = await Promise.all([reopen.done, register.done]);
  assert.notEqual(a.status, 0);
  assert.match(a.stderr, /owner_statement_artifacts_incomplete/);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(run(`SELECT state FROM public.owner_close_series WHERE id = '${fixture.seriesId}';`).split(/\r?\n/).at(-1), "closed");
  assert.equal(run(`SELECT count(*) FROM public.owner_close_revisions
    WHERE owner_close_series_id = '${fixture.seriesId}' AND status = 'preparing';`).split(/\r?\n/).at(-1), "0");
  assert.equal(run(`SELECT count(*) FROM app_private.financial_idempotency_requests
    WHERE status = 'pending' AND operation IN ('register_owner_statement_artifact','reopen_owner_month');`).split(/\r?\n/).at(-1), "0");
});
