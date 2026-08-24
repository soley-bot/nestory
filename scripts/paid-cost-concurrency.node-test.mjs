import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const financeManagerId = "00000000-0000-0000-0000-000000000701";
const financeMemberId = "00000000-0000-0000-0000-000000000801";
const closePropertyId = "10000000-0000-0000-0000-000000000004";
const closeOwnerId = "80000000-0000-0000-0000-000000000014";
const vendorId = "80000000-0000-0000-0000-000000000006";
const runNonce = randomUUID();

function databaseContainer() {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  return selectLocalDatabaseContainer(
    repoRoot,
    result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
}

const container = databaseContainer();

function psqlArgs(sql) {
  return [
    "exec",
    container,
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ];
}

function run(sql) {
  const result = spawnSync("docker", psqlArgs(sql), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function spawnSession(sql) {
  const child = spawn("docker", psqlArgs(sql), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  const session = { child, stdout: "", stderr: "", status: null, closed: false };
  child.stdout.on("data", (chunk) => { session.stdout += chunk; });
  child.stderr.on("data", (chunk) => { session.stderr += chunk; });
  session.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => {
      session.status = status;
      session.closed = true;
      resolve(session);
    });
  });
  return session;
}

async function waitForMarker(session, marker, timeoutMs = 10_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (`${session.stdout}\n${session.stderr}`.includes(marker)) return;
    if (session.closed) {
      assert.fail(`session closed before ${marker}: ${session.stdout}\n${session.stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${marker}: ${session.stdout}\n${session.stderr}`);
}

function reloadFixture() {
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/load-test-fixture.mjs"],
    { cwd: repoRoot, encoding: "utf8", shell: false, timeout: 90_000 },
  );
  assert.equal(result.status, 0, result.stderr);
}

function actorSql(actorId, body, pause = "") {
  return `BEGIN;
    SET LOCAL statement_timeout = '20s';
    SELECT pg_catalog.set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    ${pause ? `SELECT pg_catalog.set_config('app.paid_cost_test_pause', '${pause}', true);` : ""}
    ${body}
    COMMIT;`;
}

export function selectCompleteSubmissionScope(output) {
  const complete = output.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [submissionId, propertyId, unitId, sourceId, documentId] = line.split("|");
      return { documentId, propertyId, sourceId, submissionId, unitId };
    })
    .filter(({ documentId, propertyId, sourceId, submissionId }) =>
      documentId && propertyId && sourceId && submissionId);
  assert.equal(
    complete.length,
    1,
    `expected exactly one complete paid-cost scope, found ${complete.length}`,
  );
  return complete[0];
}

function submissionScope(reference = "GDN-PUMP-2088") {
  return selectCompleteSubmissionScope(run(`
    SELECT submission.id::text || '|' || submission.property_id::text || '|' ||
      coalesce(submission.unit_id::text, '') || '|' ||
      coalesce(submission.reconciliation_source_id::text, '') || '|' ||
      coalesce(submission.supporting_document_id::text, '')
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = '${organizationId}'
      AND submission.source_type = 'general'
      AND submission.reference = '${reference}'
    ORDER BY submission.id;
  `));
}

function registerRaceEvidence(label, propertyId) {
  const bytes = Buffer.from(
    `Track 6 race evidence: ${label}:${runNonce}`,
    "utf8",
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${organizationId}/paid-cost-evidence/races/${hash}.pdf`;
  const result = JSON.parse(run(`
    WITH object AS (
      INSERT INTO storage.objects (bucket_id, name, version, metadata)
      VALUES (
        'nestory-documents',
        '${storagePath}',
        pg_catalog.gen_random_uuid()::text,
        pg_catalog.jsonb_build_object(
          'mimetype', 'application/pdf',
          'size', ${bytes.byteLength}
        )
      )
      RETURNING id, version
    )
    SELECT public.register_paid_cost_evidence_verified(
      '${organizationId}',
      '${financeMemberId}',
      '${propertyId}',
      'track6-race-${label}.pdf',
      '${storagePath}',
      'application/pdf',
      ${bytes.byteLength},
      '${hash}',
      object.id,
      object.version,
      'track6-race-evidence-${hash.slice(0, 16)}'
    )
    FROM object;
  `));
  return result.document_id;
}

function closeMonth() {
  return run(`SELECT (date_trunc('month', current_date) + interval '24 months')::date;`);
}

function removePauseHarness() {
  run(`
    DROP TRIGGER IF EXISTS test_pause_paid_cost_submission ON public.expense_submissions;
    DROP TRIGGER IF EXISTS test_pause_paid_cost_adjustment ON public.expense_customer_adjustments;
    DROP TRIGGER IF EXISTS test_pause_paid_cost_document ON public.documents;
    DROP TRIGGER IF EXISTS test_pause_paid_cost_allocation ON public.owner_event_allocation_sets;
    DROP FUNCTION IF EXISTS app_private.test_pause_paid_cost_write();
  `);
}

function installPauseHarness() {
  removePauseHarness();
  run(`
    CREATE FUNCTION app_private.test_pause_paid_cost_write()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $pause$
    DECLARE
      v_pause text := pg_catalog.current_setting('app.paid_cost_test_pause', true);
      v_row jsonb := pg_catalog.to_jsonb(NEW);
    BEGIN
      IF v_pause = 'duplicate_submit'
          AND TG_TABLE_NAME = 'expense_submissions'
          AND TG_OP = 'INSERT'
          AND v_row->>'reference' = 'TRACK6-RACE-DUPLICATE' THEN
        PERFORM pg_catalog.set_config('app.paid_cost_test_pause', '', true);
        RAISE NOTICE 'paid_cost_duplicate_submit_ready';
        PERFORM pg_catalog.pg_sleep(2);
      ELSIF v_pause = 'review_update'
          AND TG_TABLE_NAME = 'expense_submissions'
          AND TG_OP = 'UPDATE'
          AND v_row->>'status' = 'approved' THEN
        PERFORM pg_catalog.set_config('app.paid_cost_test_pause', '', true);
        RAISE NOTICE 'paid_cost_review_update_ready';
        PERFORM pg_catalog.pg_sleep(2);
      ELSIF v_pause = 'reversal_insert'
          AND TG_TABLE_NAME = 'expense_customer_adjustments'
          AND TG_OP = 'INSERT' THEN
        PERFORM pg_catalog.set_config('app.paid_cost_test_pause', '', true);
        RAISE NOTICE 'paid_cost_reversal_insert_ready';
        PERFORM pg_catalog.pg_sleep(2);
      ELSIF v_pause = 'evidence_insert'
          AND TG_TABLE_NAME = 'documents'
          AND TG_OP = 'INSERT'
          AND v_row->>'file_name' = 'track6-race-evidence.pdf' THEN
        PERFORM pg_catalog.set_config('app.paid_cost_test_pause', '', true);
        RAISE NOTICE 'paid_cost_evidence_insert_ready';
        PERFORM pg_catalog.pg_sleep(2);
      ELSIF v_pause = 'allocation_insert'
          AND TG_TABLE_NAME = 'owner_event_allocation_sets'
          AND TG_OP = 'INSERT'
          AND v_row->>'source_type' = 'owner_paid_cost' THEN
        PERFORM pg_catalog.set_config('app.paid_cost_test_pause', '', true);
        RAISE NOTICE 'paid_cost_allocation_insert_ready';
        PERFORM pg_catalog.pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $pause$;

    CREATE TRIGGER test_pause_paid_cost_submission
      AFTER INSERT OR UPDATE ON public.expense_submissions
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_paid_cost_write();
    CREATE TRIGGER test_pause_paid_cost_adjustment
      AFTER INSERT ON public.expense_customer_adjustments
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_paid_cost_write();
    CREATE TRIGGER test_pause_paid_cost_document
      AFTER INSERT ON public.documents
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_paid_cost_write();
    CREATE TRIGGER test_pause_paid_cost_allocation
      AFTER INSERT ON public.owner_event_allocation_sets
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_paid_cost_write();
  `);
}

before(installPauseHarness);
beforeEach(reloadFixture);
after(() => {
  removePauseHarness();
  reloadFixture();
});

test("selects the complete paid-cost scope when a legacy reference is reused", () => {
  assert.equal(typeof selectCompleteSubmissionScope, "function");
  assert.deepEqual(
    selectCompleteSubmissionScope([
      "incomplete|property-a|unit-a||document-a",
      "complete|property-b|unit-b|source-b|document-b",
    ].join("\n")),
    {
      documentId: "document-b",
      propertyId: "property-b",
      sourceId: "source-b",
      submissionId: "complete",
      unitId: "unit-b",
    },
  );
});

test("duplicate submit returns one exact actor-bound paid-cost identity", async () => {
  const scope = submissionScope();
  const documentId = registerRaceEvidence("duplicate-submit", scope.propertyId);
  const body = `SELECT public.submit_expense(
    '${organizationId}', '${scope.propertyId}', '${scope.unitId}', 'general', NULL,
    'other', 'Race Vendor', current_date - 1, 12.00, 0.00, 'USD', 'owner',
    NULL, '${scope.sourceId}', '${documentId}', '${vendorId}',
    'TRACK6-RACE-DUPLICATE', 'track6-race-duplicate-submit'
  );`;
  const first = spawnSession(actorSql(financeMemberId, body, "duplicate_submit"));
  await waitForMarker(first, "paid_cost_duplicate_submit_ready");
  const startedAt = performance.now();
  const second = spawnSession(actorSql(financeMemberId, body));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.ok(elapsedMs >= 1_500, `duplicate submit waited only ${elapsedMs.toFixed(0)}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /40P01|deadlock detected/i);
  assert.equal(
    run(`SELECT count(*)::text || '|' || count(DISTINCT id)::text
      FROM public.expense_submissions WHERE reference='TRACK6-RACE-DUPLICATE';`),
    "1|1",
  );
});

test("one evidence identity cannot fund two concurrent paid costs", async () => {
  const scope = submissionScope();
  const documentId = registerRaceEvidence("conflicting-submit", scope.propertyId);
  const firstBody = `SELECT public.submit_expense(
    '${organizationId}', '${scope.propertyId}', '${scope.unitId}', 'general', NULL,
    'other', 'Race Vendor', current_date - 1, 12.00, 0.00, 'USD', 'owner',
    NULL, '${scope.sourceId}', '${documentId}', '${vendorId}',
    'TRACK6-RACE-DUPLICATE', 'track6-race-evidence-first'
  );`;
  const secondBody = `SELECT public.submit_expense(
    '${organizationId}', '${scope.propertyId}', '${scope.unitId}', 'general', NULL,
    'other', 'Other Race Vendor', current_date - 1, 13.00, 0.00, 'USD', 'owner',
    NULL, '${scope.sourceId}', '${documentId}', '${vendorId}',
    'TRACK6-RACE-DUPLICATE-CONFLICT', 'track6-race-evidence-second'
  );`;
  const first = spawnSession(actorSql(financeMemberId, firstBody, "duplicate_submit"));
  await waitForMarker(first, "paid_cost_duplicate_submit_ready");
  const startedAt = performance.now();
  const second = spawnSession(actorSql(financeMemberId, secondBody));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.notEqual(secondResult.status, 0, "conflicting evidence reuse unexpectedly succeeded");
  assert.match(secondResult.stderr, /paid_cost_evidence_already_used/);
  assert.ok(elapsedMs >= 1_500, `evidence reuse loser waited only ${elapsedMs.toFixed(0)}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /40P01|deadlock detected/i);
  assert.equal(
    run(`SELECT count(*)::text FROM public.expense_submissions
      WHERE supporting_document_id='${documentId}';`),
    "1",
  );
  assert.equal(
    run(`SELECT count(*)::text FROM app_private.financial_idempotency_requests
      WHERE idempotency_key='track6-race-evidence-second';`),
    "0",
  );
});

test("approve versus reject serializes to one Finance decision", async () => {
  const scope = submissionScope();
  const approve = `SELECT public.review_expense('${organizationId}', '${scope.submissionId}',
    'approve', 'Race approval verified', 'track6-race-review-approve', NULL);`;
  const reject = `SELECT public.review_expense('${organizationId}', '${scope.submissionId}',
    'reject', 'Race rejection reason', 'track6-race-review-reject', NULL);`;
  const first = spawnSession(actorSql(financeManagerId, approve, "review_update"));
  await waitForMarker(first, "paid_cost_review_update_ready");
  const startedAt = performance.now();
  const second = spawnSession(actorSql(financeManagerId, reject));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.notEqual(secondResult.status, 0, "reject unexpectedly won after approval");
  assert.match(secondResult.stderr, /Only a submitted expense can be reviewed|changed during review/);
  assert.ok(elapsedMs >= 1_500, `review loser waited only ${elapsedMs.toFixed(0)}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /40P01|deadlock detected/i);
  assert.equal(
    run(`SELECT status || '|' || (approved_payment_id IS NOT NULL)::text
      FROM public.expense_submissions WHERE id='${scope.submissionId}';`),
    "approved|true",
  );
});

test("approve versus reversal does not reverse an uncommitted approval", async () => {
  const scope = submissionScope();
  const approve = `SELECT public.review_expense('${organizationId}', '${scope.submissionId}',
    'approve', 'Race approval verified', 'track6-race-boundary-approve', NULL);`;
  const reversal = `SELECT public.reverse_expense('${organizationId}', '${scope.submissionId}',
    current_date, 'Race reversal boundary', 'track6-race-boundary-reverse');`;
  const first = spawnSession(actorSql(financeManagerId, approve, "review_update"));
  await waitForMarker(first, "paid_cost_review_update_ready");
  const second = spawnSession(actorSql(superAdminId, reversal));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.notEqual(secondResult.status, 0, "reversal observed an uncommitted approval");
  assert.match(secondResult.stderr, /Only an approved expense can be reversed|changed during reversal/);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /40P01|deadlock detected/i);
  assert.equal(
    run(`SELECT status || '|' || count(adjustment.id)::text
      FROM public.expense_submissions AS submission
      LEFT JOIN public.expense_customer_adjustments AS adjustment
        ON adjustment.submission_id=submission.id
      WHERE submission.id='${scope.submissionId}' GROUP BY submission.status;`),
    "approved|0",
  );
});

test("reversal versus resubmit serializes append-only correction", async () => {
  const scope = submissionScope();
  const documentId = registerRaceEvidence("correction-resubmit", scope.propertyId);
  run(actorSql(financeManagerId, `SELECT public.review_expense('${organizationId}',
    '${scope.submissionId}', 'approve', 'Prepare correction race',
    'track6-race-correction-approve', NULL);`));
  const reversal = `SELECT public.reverse_expense('${organizationId}', '${scope.submissionId}',
    current_date, 'Correct amount by reversal', 'track6-race-correction-reverse');`;
  const resubmit = `SELECT public.submit_expense(
    '${organizationId}', '${scope.propertyId}', '${scope.unitId}', 'general', NULL,
    'repairs_maintenance', 'Khmer Home Services', current_date - 2, 200.00, 20.00,
    'USD', 'owner', NULL, '${scope.sourceId}', '${documentId}', '${vendorId}',
    'TRACK6-RACE-CORRECTED', 'track6-race-correction-resubmit'
  );`;
  const first = spawnSession(actorSql(superAdminId, reversal, "reversal_insert"));
  await waitForMarker(first, "paid_cost_reversal_insert_ready");
  const startedAt = performance.now();
  const second = spawnSession(actorSql(financeMemberId, resubmit));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.ok(elapsedMs >= 1_500, `resubmit waited only ${elapsedMs.toFixed(0)}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /40P01|deadlock detected/i);
  assert.equal(
    run(`SELECT string_agg(reference || ':' || status, ',' ORDER BY reference)
      FROM public.expense_submissions
      WHERE id='${scope.submissionId}' OR reference='TRACK6-RACE-CORRECTED';`),
    "GDN-PUMP-2088:reversed,TRACK6-RACE-CORRECTED:submitted",
  );
});

test("evidence registration versus mutation retains verified bytes", async () => {
  const runtime = localRuntime();
  const service = createClient(runtime.apiUrl, runtime.serviceRoleKey, authOptions());
  const admin = createClient(runtime.apiUrl, runtime.anonKey, authOptions());
  const signedIn = await admin.auth.signInWithPassword({
    email: "nestory@gmail.com",
    password: "123456789",
  });
  assert.equal(signedIn.error, null, signedIn.error?.message);
  const bytes = new TextEncoder().encode(
    `track6 registration mutation race bytes:${runNonce}`,
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${organizationId}/paid-cost-evidence/${hash}`;
  const uploaded = await service.storage.from("nestory-documents").upload(
    storagePath,
    bytes,
    { contentType: "application/pdf", upsert: false },
  );
  if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) {
    assert.fail(uploaded.error.message);
  }
  const object = await service.rpc("get_paid_cost_evidence_object", {
    p_actor_id: financeMemberId,
    p_organization_id: organizationId,
    p_property_id: closePropertyId,
    p_storage_path: storagePath,
  });
  assert.equal(object.error, null, object.error?.message);
  const identity = object.data;
  const register = `SELECT pg_catalog.set_config('app.paid_cost_test_pause', 'evidence_insert', true);
    SET LOCAL ROLE service_role;
    SELECT public.register_paid_cost_evidence_verified(
      '${organizationId}', '${financeMemberId}', '${closePropertyId}',
      'track6-race-evidence.pdf', '${storagePath}', 'application/pdf',
      ${bytes.byteLength}, '${hash}', '${identity.storage_object_id}',
      '${identity.storage_object_version}',
      'track6-race-evidence-register-${hash.slice(0, 16)}'
    );`;
  const first = spawnSession(`BEGIN; SET LOCAL statement_timeout='20s'; ${register} COMMIT;`);
  await waitForMarker(first, "paid_cost_evidence_insert_ready");
  const mutation = await admin.storage.from("nestory-documents").update(
    storagePath,
    new TextEncoder().encode("mutated"),
    { contentType: "application/pdf", upsert: false },
  );
  const firstResult = await first.done;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.ok(mutation.error, "authenticated mutation unexpectedly succeeded");
  const retained = await service.storage.from("nestory-documents").download(storagePath);
  assert.equal(retained.error, null, retained.error?.message);
  const retainedBytes = new Uint8Array(await retained.data.arrayBuffer());
  assert.equal(createHash("sha256").update(retainedBytes).digest("hex"), hash);
  assert.equal(
    run(`SELECT count(*)::text FROM public.documents
      WHERE storage_path='${storagePath}' AND content_sha256='${hash}';`),
    "1",
  );
});

test("source versus close serializes and blocks an incomplete close", async () => {
  const month = closeMonth();
  const scope = submissionScope("TRACK6-OWNER-APPROVED");
  const documentId = registerRaceEvidence("source-close", closePropertyId);
  run(actorSql(superAdminId, `SELECT public.set_financial_month_lock(
    '${organizationId}', '${month}', false, 'Prepare Track 6 source-close race');`));
  const pending = run(actorSql(financeMemberId, `SELECT public.submit_expense(
    '${organizationId}', '${closePropertyId}', NULL, 'general', NULL, 'other',
    'Source Close Race Vendor', '${month}'::date + 11, 1.00, 0.00, 'USD', 'owner',
    NULL, '${scope.sourceId}', '${documentId}', '${vendorId}',
    'TRACK6-RACE-SOURCE-CLOSE', 'track6-race-source-close-submit'
  );`));
  const pendingId = JSON.parse(pending.split(/\r?\n/).filter(Boolean).at(-1)).submission_id;
  const approve = `SELECT public.review_expense('${organizationId}',
    '${pendingId}', 'approve', 'Race paid-cost source against close',
    'track6-race-source-close-approve', NULL);`;
  const close = `SELECT public.set_financial_month_lock('${organizationId}', '${month}',
    true, 'Run Track 6 source-close race');
    SELECT public.close_owner_month('${organizationId}', '${closePropertyId}',
    '${closeOwnerId}', 'USD', '${month}', 'Source-close race close',
    'track6-race-source-close-close');`;
  const first = spawnSession(actorSql(financeManagerId, approve, "review_update"));
  await waitForMarker(first, "paid_cost_review_update_ready");
  const startedAt = performance.now();
  const second = spawnSession(actorSql(superAdminId, close));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.notEqual(secondResult.status, 0, "close unexpectedly accepted a stale period");
  assert.match(secondResult.stderr, /owner_close_blocked|source_allocation_incomplete|stale/);
  assert.ok(elapsedMs >= 1_500, `close waited only ${elapsedMs.toFixed(0)}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /40P01|deadlock detected/i);
  assert.equal(
    run(`SELECT status || '|' || coalesce(stale_reason, '') FROM public.owner_balance_periods
      WHERE property_id='${closePropertyId}' AND owner_person_id='${closeOwnerId}'
        AND month_start='${month}';`),
    "ready|",
  );
  assert.equal(
    run(`SELECT count(*)::text
      FROM public.expense_submissions AS submission
      WHERE submission.id='${pendingId}'
        AND submission.status='approved'
        AND NOT EXISTS (
          SELECT 1 FROM public.owner_event_allocation_sets AS allocation_set
          WHERE allocation_set.organization_id=submission.organization_id
            AND allocation_set.source_type='owner_paid_cost'
            AND allocation_set.source_line_id=submission.approved_responsibility_id
        );`),
    "1",
  );
  assert.equal(
    run(`SELECT count(*)::text FROM app_private.financial_idempotency_requests
      WHERE organization_id='${organizationId}' AND status='pending';`),
    "0",
  );
});

function authOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  };
}

function localRuntime() {
  const result = spawnSync(
    process.platform === "win32" ? "cmd.exe" : path.join(repoRoot, "node_modules", ".bin", "supabase"),
    process.platform === "win32"
      ? ["/d", "/s", "/c", "node_modules\\.bin\\supabase.cmd status -o env"]
      : ["status", "-o", "env"],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  const values = Object.fromEntries(result.stdout.split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/"$/, "")]));
  const apiUrl = values.API_URL;
  const anonKey = values.ANON_KEY ?? values.PUBLISHABLE_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY ?? values.SECRET_KEY;
  assert.ok(apiUrl && anonKey && serviceRoleKey, "local Supabase runtime unavailable");
  assert.match(new URL(apiUrl).hostname, /^(127\.0\.0\.1|localhost)$/);
  return { anonKey, apiUrl, serviceRoleKey };
}
