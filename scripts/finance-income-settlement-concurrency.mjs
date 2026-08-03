import { spawn, spawnSync } from "node:child_process";

const ids = {
  admin: "f5100000-0000-4000-8000-000000000001",
  organization: "f5100000-0000-4000-8000-000000000002",
  property: "f5100000-0000-4000-8000-000000000003",
  unit: "f5100000-0000-4000-8000-000000000004",
  tenant: "f5100000-0000-4000-8000-000000000005",
  lease: "f5100000-0000-4000-8000-000000000006",
  income: "f5100000-0000-4000-8000-000000000007",
  reconciliationSource: "f5100000-0000-4000-8000-000000000008",
};

const markerTimeoutMs = 10_000;
const startedProcesses = new Set();
let processSequence = 0;

async function main() {
  const container =
    readOption("--container") ??
    process.env.SUPABASE_DB_CONTAINER ??
    "supabase_db_nestory";

  assertContainer(container);

  let proofError;
  try {
    await runScenario(
      container,
      "receipt-versus-receipt",
      proveReceiptVersusReceipt,
    );
    await runScenario(container, "receipt-retry", proveReceiptRetry);
    await runScenario(container, "reversal-retry", proveReversalRetry);
    await runScenario(
      container,
      "receipt-first-versus-close",
      proveReceiptFirstVersusClose,
    );
    await runScenario(
      container,
      "close-first-versus-receipt",
      proveCloseFirstVersusReceipt,
    );
    await runScenario(
      container,
      "reversal-first-versus-close",
      proveReversalFirstVersusClose,
    );
    await runScenario(
      container,
      "close-first-versus-reversal",
      proveCloseFirstVersusReversal,
    );

    process.stdout.write(
      "PASS Plan 05 income-settlement concurrency: competing receipts, payload-idempotent receipt and reversal retries, and both receipt/reversal close orderings serialized without partial effects or deadlocks.\n",
    );
  } catch (error) {
    proofError = error;
  } finally {
    await stopProcesses();
    try {
      cleanup(container);
    } catch (cleanupError) {
      proofError = proofError
        ? new AggregateError(
            [proofError, cleanupError],
            "Plan 05 concurrency proof and cleanup both failed.",
          )
        : cleanupError;
    }
  }

  if (proofError) {
    throw proofError;
  }
}

async function runScenario(container, label, proof) {
  cleanup(container);
  fixture(container);
  try {
    await proof(container);
    process.stdout.write(`PASS ${label}\n`);
  } finally {
    await stopProcesses();
    cleanup(container);
  }
}

async function proveReceiptVersusReceipt(container) {
  const first = startPsql(
    container,
    receiptSql({
      amount: 200,
      idempotencyKey: "plan05-race-first",
      marker: "FIRST_RECEIPT_READY",
    }),
    { holdOpen: true },
  );
  await first.waitFor("FIRST_RECEIPT_READY");

  const second = startPsql(
    container,
    receiptSql({
      amount: 200,
      idempotencyKey: "plan05-race-second",
      marker: "SECOND_RECEIPT_READY",
    }),
  );
  await waitForDatabaseLock(container, second, first);
  first.release();

  const [firstResult, secondResult] = await Promise.all([
    first.result,
    second.result,
  ]);
  assertSucceeded("first competing receipt", firstResult);
  assertFailedWith(
    "second competing receipt",
    secondResult,
    "Receipt allocation exceeds open balance",
  );

  assertSettlementCounts(container, {
    amountReceived: 200,
    allocations: 1,
    journals: 1,
    ledgerEntries: 1,
    receipts: 1,
  });
}

async function proveReceiptRetry(container) {
  const first = startPsql(
    container,
    receiptSql({
      amount: 100,
      idempotencyKey: "plan05-receipt-retry",
      marker: "FIRST_RECEIPT_RETRY_READY",
    }),
    { holdOpen: true },
  );
  await first.waitFor("FIRST_RECEIPT_RETRY_READY");

  const retry = startPsql(
    container,
    receiptSql({
      amount: 100,
      idempotencyKey: "plan05-receipt-retry",
      marker: "SECOND_RECEIPT_RETRY_READY",
    }),
  );
  await waitForDatabaseLock(container, retry, first);
  first.release();

  const [firstResult, retryResult] = await Promise.all([
    first.result,
    retry.result,
  ]);
  assertSucceeded("first receipt request", firstResult);
  assertSucceeded("same-key receipt retry", retryResult);
  assertSameIdentity(
    "receipt retry",
    firstResult.output,
    retryResult.output,
  );

  assertSettlementCounts(container, {
    amountReceived: 100,
    allocations: 1,
    journals: 1,
    ledgerEntries: 1,
    receipts: 1,
  });
}

async function proveReversalRetry(container) {
  const receiptId = createReceipt(container, {
    amount: 100,
    idempotencyKey: "plan05-reversal-retry-source",
  });
  const first = startPsql(
    container,
    reversalSql({
      idempotencyKey: "plan05-reversal-retry",
      marker: "FIRST_REVERSAL_RETRY_READY",
      receiptId,
    }),
    { holdOpen: true },
  );
  await first.waitFor("FIRST_REVERSAL_RETRY_READY");

  const retry = startPsql(
    container,
    reversalSql({
      idempotencyKey: "plan05-reversal-retry",
      marker: "SECOND_REVERSAL_RETRY_READY",
      receiptId,
    }),
  );
  await waitForDatabaseLock(container, retry, first);
  first.release();

  const [firstResult, retryResult] = await Promise.all([
    first.result,
    retry.result,
  ]);
  assertSucceeded("first reversal request", firstResult);
  assertSucceeded("same-key reversal retry", retryResult);
  assertSameIdentity(
    "reversal retry",
    firstResult.output,
    retryResult.output,
  );

  assertSettlementCounts(container, {
    amountReceived: 0,
    allocations: 2,
    journals: 2,
    ledgerEntries: 2,
    receipts: 2,
  });
}

async function proveReceiptFirstVersusClose(container) {
  const receipt = startPsql(
    container,
    receiptSql({
      amount: 100,
      idempotencyKey: "plan05-receipt-before-close",
      marker: "RECEIPT_BEFORE_CLOSE_READY",
    }),
    { holdOpen: true },
  );
  await receipt.waitFor("RECEIPT_BEFORE_CLOSE_READY");

  const close = startPsql(
    container,
    closeSql({ marker: "CLOSE_AFTER_RECEIPT_READY" }),
  );
  await waitForDatabaseLock(container, close, receipt);
  receipt.release();

  const [receiptResult, closeResult] = await Promise.all([
    receipt.result,
    close.result,
  ]);
  assertSucceeded("receipt before close", receiptResult);
  assertSucceeded("close after receipt", closeResult);
  assertPeriodState(container, "closed");
  assertSettlementCounts(container, {
    amountReceived: 100,
    allocations: 1,
    journals: 1,
    ledgerEntries: 1,
    receipts: 1,
  });
}

async function proveCloseFirstVersusReceipt(container) {
  const close = startPsql(
    container,
    closeSql({ marker: "CLOSE_BEFORE_RECEIPT_READY" }),
    { holdOpen: true },
  );
  await close.waitFor("CLOSE_BEFORE_RECEIPT_READY");

  const receipt = startPsql(
    container,
    receiptSql({
      amount: 100,
      idempotencyKey: "plan05-receipt-after-close",
      marker: "RECEIPT_AFTER_CLOSE_READY",
    }),
  );
  await waitForDatabaseLock(container, receipt, close);
  close.release();

  const [closeResult, receiptResult] = await Promise.all([
    close.result,
    receipt.result,
  ]);
  assertSucceeded("close before receipt", closeResult);
  assertFailedWith(
    "receipt after close",
    receiptResult,
    "Income settlement period is not open",
  );
  assertPeriodState(container, "closed");
  assertSettlementCounts(container, {
    amountReceived: 0,
    allocations: 0,
    journals: 0,
    ledgerEntries: 0,
    receipts: 0,
  });
}

async function proveReversalFirstVersusClose(container) {
  const receiptId = createReceipt(container, {
    amount: 100,
    idempotencyKey: "plan05-reversal-before-close-source",
  });
  const reversal = startPsql(
    container,
    reversalSql({
      idempotencyKey: "plan05-reversal-before-close",
      marker: "REVERSAL_BEFORE_CLOSE_READY",
      receiptId,
    }),
    { holdOpen: true },
  );
  await reversal.waitFor("REVERSAL_BEFORE_CLOSE_READY");

  const close = startPsql(
    container,
    closeSql({ marker: "CLOSE_AFTER_REVERSAL_READY" }),
  );
  await waitForDatabaseLock(container, close, reversal);
  reversal.release();

  const [reversalResult, closeResult] = await Promise.all([
    reversal.result,
    close.result,
  ]);
  assertSucceeded("reversal before close", reversalResult);
  assertSucceeded("close after reversal", closeResult);
  assertPeriodState(container, "closed");
  assertSettlementCounts(container, {
    amountReceived: 0,
    allocations: 2,
    journals: 2,
    ledgerEntries: 2,
    receipts: 2,
  });
}

async function proveCloseFirstVersusReversal(container) {
  const receiptId = createReceipt(container, {
    amount: 100,
    idempotencyKey: "plan05-close-before-reversal-source",
  });
  const close = startPsql(
    container,
    closeSql({ marker: "CLOSE_BEFORE_REVERSAL_READY" }),
    { holdOpen: true },
  );
  await close.waitFor("CLOSE_BEFORE_REVERSAL_READY");

  const reversal = startPsql(
    container,
    reversalSql({
      idempotencyKey: "plan05-reversal-after-close",
      marker: "REVERSAL_AFTER_CLOSE_READY",
      receiptId,
    }),
  );
  await waitForDatabaseLock(container, reversal, close);
  close.release();

  const [closeResult, reversalResult] = await Promise.all([
    close.result,
    reversal.result,
  ]);
  assertSucceeded("close before reversal", closeResult);
  assertFailedWith(
    "reversal after close",
    reversalResult,
    "Income settlement period is not open",
  );
  assertPeriodState(container, "closed");
  assertSettlementCounts(container, {
    amountReceived: 100,
    allocations: 1,
    journals: 1,
    ledgerEntries: 1,
    receipts: 1,
  });
}

function createReceipt(container, { amount, idempotencyKey }) {
  const result = runPsql(
    container,
    receiptSql({
      amount,
      idempotencyKey,
      marker: "FIXTURE_RECEIPT_READY",
    }),
  );
  return extractIdentity(result.output).receiptId;
}

function receiptSql({ amount, idempotencyKey, marker }) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '${ids.admin}',
  true
);
SET LOCAL ROLE authenticated;
SELECT
  result->>'receipt_id' AS receipt_id,
  result->>'allocation_id' AS allocation_id
FROM (
  SELECT public.record_finance_receipt_v2(
    '${ids.organization}'::uuid,
    '${ids.income}'::uuid,
    ${amount}::numeric,
    '2026-07-10'::date,
    '${ids.reconciliationSource}'::uuid,
    'Plan 05 concurrency',
    '${idempotencyKey}'
  ) AS result
) AS request
\\gset
\\echo ${marker}|:receipt_id|:allocation_id
`;
}

function reversalSql({ idempotencyKey, marker, receiptId }) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '${ids.admin}',
  true
);
SET LOCAL ROLE authenticated;
SELECT
  result->>'receipt_id' AS receipt_id,
  result->>'allocation_id' AS allocation_id
FROM (
  SELECT public.reverse_finance_receipt_v2(
    '${ids.organization}'::uuid,
    '${receiptId}'::uuid,
    '2026-07-10'::date,
    '${ids.reconciliationSource}'::uuid,
    'Plan 05 concurrency reversal',
    '${idempotencyKey}'
  ) AS result
) AS request
\\gset
\\echo ${marker}|:receipt_id|:allocation_id
`;
}

function closeSql({ marker }) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT app_private.lock_property_reporting_period(
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  'USD'::public.currency_code,
  '2026-07-10'::date
) AS reporting_period_id
\\gset
SELECT pg_catalog.set_config(
  'app.financial_authority_period_context',
  'on',
  true
);
UPDATE public.property_reporting_periods
SET lifecycle_status = 'closed',
    updated_at = pg_catalog.now(),
    updated_by = '${ids.admin}'::uuid
WHERE id = :'reporting_period_id'::uuid;
\\echo ${marker}
`;
}

function fixture(container) {
  runSql(
    container,
    `\\set ON_ERROR_STOP on
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '${ids.admin}'::uuid,
  'authenticated',
  'authenticated',
  'plan05-concurrency@example.test',
  extensions.crypt('plan05-concurrency', extensions.gen_salt('bf')),
  pg_catalog.now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  '${ids.organization}'::uuid,
  'Plan 05 concurrency organization',
  'plan05-concurrency'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  '${ids.organization}'::uuid,
  '${ids.admin}'::uuid,
  'admin'
);

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
) VALUES (
  '${ids.property}'::uuid,
  '${ids.organization}'::uuid,
  'Plan 05 concurrency property',
  'P05-CONCURRENCY',
  'apartment',
  'active'
);

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
) VALUES (
  '${ids.unit}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  'P05-C1',
  'occupied',
  300,
  'USD'
);

INSERT INTO public.people(id, organization_id, display_name)
VALUES (
  '${ids.tenant}'::uuid,
  '${ids.organization}'::uuid,
  'Plan 05 concurrency tenant'
);

INSERT INTO public.person_roles(organization_id, person_id, role)
VALUES (
  '${ids.organization}'::uuid,
  '${ids.tenant}'::uuid,
  'tenant'
);

INSERT INTO public.leases(
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  tenant_name, lease_start_date, lease_end_date, monthly_rent_amount,
  monthly_rent_currency, deposit_amount, deposit_currency, status
) VALUES (
  '${ids.lease}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.unit}'::uuid,
  '${ids.tenant}'::uuid,
  'Plan 05 concurrency tenant',
  '2026-01-01',
  '2026-12-31',
  300,
  'USD'::public.currency_code,
  100,
  'USD'::public.currency_code,
  'active'
);

INSERT INTO public.finance_income_items(
  id, organization_id, property_id, unit_id, lease_id, payer_person_id,
  income_type, payer_label, due_date, amount_due, currency, status
) VALUES (
  '${ids.income}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.unit}'::uuid,
  '${ids.lease}'::uuid,
  '${ids.tenant}'::uuid,
  'rent',
  'Plan 05 concurrency tenant',
  '2026-07-01'::date,
  300,
  'USD'::public.currency_code,
  'open'
);

SELECT app_private.ensure_accounting_books_and_accounts(
  '${ids.organization}'::uuid,
  'USD'::public.currency_code
);

INSERT INTO public.financial_reconciliation_sources(
  id, organization_id, property_id, currency, code, display_name,
  source_kind, scope_kind, masked_reference, created_by
)
SELECT
  '${ids.reconciliationSource}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  'USD'::public.currency_code,
  'P05CONCURRENCY',
  'Plan 05 concurrency bank',
  'bank',
  'property_dedicated',
  '****5105',
  '${ids.admin}'::uuid
FROM (
  SELECT pg_catalog.set_config(
    'app.financial_reconciliation_source_context',
    'on',
    true
  )
) AS reconciliation_context
WHERE reconciliation_context.set_config = 'on';
`,
  );
}

function cleanup(container) {
  runSql(
    container,
    `\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica;
DELETE FROM public.finance_receipt_allocation_journals
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.accounting_journal_lines
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.finance_receipt_allocations
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.finance_receipts
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.accounting_journal_entries
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.ledger_entries
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.property_close_revisions
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.property_reporting_periods
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.financial_reconciliation_sources
WHERE organization_id = '${ids.organization}'::uuid;
SET LOCAL session_replication_role = origin;

SELECT pg_catalog.set_config('app.people_leases_skip_sync', 'on', true);
DELETE FROM public.activity_logs
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM app_private.financial_idempotency_requests
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM app_private.finance_income_settlement_policies
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.ledger_period_locks
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.accounting_periods
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.accounting_accounts
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.accounting_books
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.finance_income_items
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.organizations
WHERE id = '${ids.organization}'::uuid;
DELETE FROM auth.users
WHERE id = '${ids.admin}'::uuid;
COMMIT;

DO $cleanup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = '${ids.organization}'::uuid
  ) OR EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = '${ids.admin}'::uuid
  ) THEN
    RAISE EXCEPTION 'Plan 05 concurrency fixtures remain after cleanup';
  END IF;
END;
$cleanup$;`,
  );
}

function assertSettlementCounts(
  container,
  { amountReceived, allocations, journals, ledgerEntries, receipts },
) {
  const result = queryScalar(
    container,
    `SELECT pg_catalog.concat_ws(
  ':',
  income.amount_received,
  (
    SELECT pg_catalog.count(*)
    FROM public.finance_receipts AS receipt
    WHERE receipt.organization_id = income.organization_id
      AND receipt.settlement_contract_version = 'plan05.v1'
  ),
  (
    SELECT pg_catalog.count(*)
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.organization_id = income.organization_id
      AND allocation.settlement_contract_version = 'plan05.v1'
  ),
  (
    SELECT pg_catalog.count(*)
    FROM public.ledger_entries AS ledger
    WHERE ledger.organization_id = income.organization_id
      AND ledger.source_type = 'receipt_allocation'
  ),
  (
    SELECT pg_catalog.count(*)
    FROM public.finance_receipt_allocation_journals AS link
    WHERE link.organization_id = income.organization_id
  )
)
FROM public.finance_income_items AS income
WHERE income.id = '${ids.income}'::uuid;`,
  );
  const [
    actualAmount,
    actualReceipts,
    actualAllocations,
    actualLedgerEntries,
    actualJournals,
  ] = result.split(":").map(Number);

  const expected = {
    allocations,
    amountReceived,
    journals,
    ledgerEntries,
    receipts,
  };
  const actual = {
    allocations: actualAllocations,
    amountReceived: actualAmount,
    journals: actualJournals,
    ledgerEntries: actualLedgerEntries,
    receipts: actualReceipts,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Settlement effects did not match the expected atomic state.\nExpected ${JSON.stringify(expected)}\nActual ${JSON.stringify(actual)}`,
    );
  }
}

function assertPeriodState(container, expected) {
  const actual = queryScalar(
    container,
    `SELECT lifecycle_status
FROM public.property_reporting_periods
WHERE organization_id = '${ids.organization}'::uuid
  AND property_id = '${ids.property}'::uuid
  AND currency = 'USD'::public.currency_code
  AND period_start = '2026-07-01'::date;`,
  );
  if (actual !== expected) {
    throw new Error(
      `Expected property reporting period ${expected}, found ${actual || "missing"}.`,
    );
  }
}

function assertSameIdentity(label, firstOutput, retryOutput) {
  const first = extractIdentity(firstOutput);
  const retry = extractIdentity(retryOutput);
  if (
    first.receiptId !== retry.receiptId ||
    first.allocationId !== retry.allocationId
  ) {
    throw new Error(
      `${label} returned different source identities.\nFirst ${JSON.stringify(first)}\nRetry ${JSON.stringify(retry)}`,
    );
  }
}

function extractIdentity(output) {
  const match = output.match(
    /[A-Z_]+\|([0-9a-f-]{36})\|([0-9a-f-]{36})/i,
  );
  if (!match) {
    throw new Error(`Settlement result identity was not emitted.\n${output}`);
  }
  return { allocationId: match[2], receiptId: match[1] };
}

function assertFailedWith(label, result, expectedMessage) {
  if (result.code === 0 || !result.output.includes(expectedMessage)) {
    throw new Error(
      `${label} did not fail with "${expectedMessage}".\n${result.output}`,
    );
  }
  if (result.output.includes("deadlock detected")) {
    throw new Error(`${label} deadlocked.\n${result.output}`);
  }
}

function assertSucceeded(label, result) {
  if (result.code !== 0) {
    throw new Error(`${label} failed.\n${result.output}`);
  }
}

function startPsql(container, sql, { holdOpen = false } = {}) {
  const applicationName =
    `nestory-plan05-income-concurrency-${++processSequence}`;
  const child = spawn(
    "docker",
    [
      "exec",
      "-e",
      `PGAPPNAME=${applicationName}`,
      "-i",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  let completed = false;
  let output = "";
  let released = false;
  const waiters = new Set();

  const append = (chunk) => {
    output += chunk.toString();
    for (const waiter of waiters) {
      if (output.includes(waiter.marker)) {
        clearTimeout(waiter.timeout);
        waiters.delete(waiter);
        waiter.resolve();
      }
    }
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.stdin.on("error", (error) => {
    append(`stdin error: ${error.message}\n`);
  });

  let processHandle;
  const result = new Promise((resolveResult) => {
    child.on("error", (error) => {
      append(`spawn error: ${error.message}\n`);
    });
    child.on("close", (code) => {
      completed = true;
      startedProcesses.delete(processHandle);
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(
          new Error(
            `psql exited before marker ${waiter.marker}.\n${output}`,
          ),
        );
      }
      waiters.clear();
      resolveResult({ code: code ?? 1, output });
    });
  });

  processHandle = {
    applicationName,
    get completed() {
      return completed;
    },
    get output() {
      return output;
    },
    result,
    kill() {
      if (!completed) {
        child.kill();
      }
    },
    release() {
      if (!holdOpen) {
        throw new Error("Cannot release a process that is not held open.");
      }
      if (released || completed) {
        throw new Error("Held process was already released or completed.");
      }
      released = true;
      child.stdin.end("COMMIT;\n\\echo TRANSACTION_RELEASED\n");
    },
    waitFor(marker) {
      if (output.includes(marker)) {
        return Promise.resolve();
      }
      return new Promise((resolveWait, rejectWait) => {
        const waiter = {
          marker,
          reject: rejectWait,
          resolve: resolveWait,
          timeout: setTimeout(() => {
            waiters.delete(waiter);
            rejectWait(
              new Error(`Timed out waiting for ${marker}.\n${output}`),
            );
          }, markerTimeoutMs),
        };
        waiters.add(waiter);
      });
    },
  };

  startedProcesses.add(processHandle);
  if (holdOpen) {
    child.stdin.write(sql);
  } else {
    child.stdin.end(`${sql}COMMIT;\n`);
  }
  return processHandle;
}

async function waitForDatabaseLock(
  container,
  contender,
  blocker,
) {
  const deadline = Date.now() + markerTimeoutMs;
  while (Date.now() < deadline) {
    if (contender.completed) {
      throw new Error(
        `Concurrency contender exited before reaching a lock wait.\n${contender.output}`,
      );
    }

    const waiting = queryScalar(
      container,
      `SELECT pg_catalog.count(*)
FROM pg_catalog.pg_stat_activity AS contender
JOIN pg_catalog.pg_stat_activity AS blocker
  ON blocker.pid = ANY (
    pg_catalog.pg_blocking_pids(contender.pid)
  )
WHERE contender.application_name = '${contender.applicationName}'
  AND blocker.application_name = '${blocker.applicationName}'
  AND contender.state = 'active'
  AND contender.wait_event_type = 'Lock';`,
    );
    if (waiting === "1") {
      return;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }

  throw new Error(
    `Timed out waiting for the expected Plan 05 lock.\n${contender.output}`,
  );
}

async function stopProcesses() {
  const running = [...startedProcesses];
  for (const processHandle of running) {
    processHandle.kill();
  }
  await Promise.allSettled(
    running.map((processHandle) => processHandle.result),
  );
}

function runPsql(container, sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    {
      encoding: "utf8",
      input: `${sql}COMMIT;\n`,
      timeout: markerTimeoutMs,
    },
  );
  const normalized = {
    code: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
  assertSucceeded("fixture settlement", normalized);
  return normalized;
}

function runSql(container, sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { encoding: "utf8", input: sql, timeout: markerTimeoutMs },
  );
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

function queryScalar(container, sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      sql,
    ],
    { encoding: "utf8", timeout: markerTimeoutMs },
  );
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout.trim();
}

function assertContainer(container) {
  if (!/^[A-Za-z0-9_.-]+$/.test(container)) {
    throw new Error("Supabase database container name is invalid.");
  }
  const result = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Running}}", container],
    { encoding: "utf8", timeout: markerTimeoutMs },
  );
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0 || result.stdout.trim() !== "true") {
    throw new Error(`Local Supabase container ${container} is not running.`);
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

await main();
