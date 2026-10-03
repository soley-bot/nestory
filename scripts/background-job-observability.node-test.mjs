import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const activationSql = await readFile(new URL("../supabase/migrations/20260818221116_process_scheduled_lease_activations.sql", import.meta.url), "utf8");
const activationProcessorSql = await readFile(new URL("../supabase/migrations/20260820044500_close_draft_cancellation_relationships.sql", import.meta.url), "utf8");
const cashSql = await readFile(new URL("../supabase/migrations/20260914023901_prevent_future_charge_auto_settlement.sql", import.meta.url), "utf8");

test("lease activation records successful rows separately from caught row failures", () => {
  const processor = activationProcessorSql
    .split("CREATE OR REPLACE FUNCTION public.process_due_lease_activations(")[1]
    .split("CREATE OR REPLACE FUNCTION app_private.repair_cancelled_lease_artifacts")[0];
  const [success, failure] = processor.split("EXCEPTION WHEN OTHERS THEN");
  assert.ok(failure, "per-row exception boundary is retained");
  assert.match(success, /SET status = 'processed', processed_at = statement_timestamp\(\),\s*failure_code = NULL, failure_message = NULL/);
  assert.match(success, /v_processed := v_processed \+ 1/);
  assert.match(failure, /SET status = 'failed', failure_code = SQLSTATE,\s*failure_message = left\(SQLERRM, 500\)/);
  assert.match(failure, /v_failed := v_failed \+ 1/);
  assert.match(failure, /RETURN jsonb_build_object\('failed', v_failed, 'processed', v_processed\)/);
  assert.match(success, /schedule\.status = 'pending'/);
  assert.doesNotMatch(failure, /SET status = 'pending'/);
});

test("aggregate cron completion preserves failed row counts alongside processed counts", () => {
  const runner = activationSql.split("CREATE OR REPLACE FUNCTION app_private.run_due_lease_activations")[1];
  assert.match(runner, /v_processed := v_processed \+ coalesce\(\(v_result ->> 'processed'\)::integer, 0\)/);
  assert.match(runner, /v_failed := v_failed \+ coalesce\(\(v_result ->> 'failed'\)::integer, 0\)/);
  assert.match(runner, /RETURN jsonb_build_object\('failed', v_failed, 'processed', v_processed\)/);
});

test("deferred cash clears successful row errors but retains caught row failure codes", () => {
  const [success, failure] = cashSql.split("EXCEPTION WHEN OTHERS THEN");
  assert.ok(failure);
  assert.match(success, /SET last_attempt_at=p_clock,last_error_code=NULL/);
  assert.match(failure, /SET last_attempt_at=p_clock,last_error_code=SQLSTATE/);
  assert.doesNotMatch(failure.split("END;")[0], /DELETE FROM app_private\.deferred_owner_cash/);
});
