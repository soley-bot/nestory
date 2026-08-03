import { spawn, spawnSync } from "node:child_process";

const fixture = {
  adminId: "f3700000-0000-4000-8000-000000000001",
  bookId: "f3700000-0000-4000-8000-000000000005",
  secondBookId: "f3700000-0000-4000-8000-000000000006",
  organizationId: "f3700000-0000-4000-8000-000000000002",
  otherOrganizationId: "f3700000-0000-4000-8000-000000000007",
  otherOrganizationPropertyId: "f3700000-0000-4000-8000-000000000008",
  otherPropertyId: "f3700000-0000-4000-8000-000000000004",
  propertyId: "f3700000-0000-4000-8000-000000000003",
};

const markerTimeoutMs = 10_000;
let psqlProcessSequence = 0;
const startedPsqlProcesses = new Set();

export async function runFinancialAuthorityConcurrency(system) {
  const options = parseOptions(process.argv.slice(2));
  const requestedScenario = options.get("scenario") ?? "all";
  const requestedRow =
    options.get("row") ?? (requestedScenario === "all" ? "all" : "existing");
  const container =
    options.get("container") ??
    process.env.SUPABASE_DB_CONTAINER ??
    "supabase_db_nestory";

  if (
    ![
      "all",
      "source-first",
      "transition-first",
      "unlock",
      "isolation",
      "multiple-books",
    ].includes(requestedScenario)
  ) {
    throw new Error(
      "Expected --scenario all, source-first, transition-first, unlock, isolation, or multiple-books.",
    );
  }
  if (requestedScenario === "multiple-books" && system !== "accounting") {
    throw new Error("The multiple-books scenario applies only to accounting.");
  }
  if (!["all", "existing", "absent"].includes(requestedRow)) {
    throw new Error("Expected --row all, existing, or absent.");
  }

  assertContainer(container);
  const cases = scenarioCases(system, requestedScenario, requestedRow);
  cleanupFixture(container);
  try {
    for (const testCase of cases) {
      runSql(container, fixtureSql(system, testCase.rowState));
      try {
        if (testCase.scenario === "source-first") {
          await proveSourceFirst({ container, system });
        } else if (testCase.scenario === "transition-first") {
          await proveTransitionFirst({ container, system });
        } else if (testCase.scenario === "unlock") {
          await proveUnlock({ container, system });
        } else if (testCase.scenario === "isolation") {
          await proveIsolation({ container, system });
        } else {
          await proveMultipleBooks({ container });
        }
      } finally {
        await cleanupStartedPsqlProcesses();
        cleanupFixture(container);
      }

      process.stdout.write(
        `PASS ${system} ${testCase.scenario} ${testCase.rowState}: transaction authority serialized correctly.\n`,
      );
    }
  } finally {
    await cleanupStartedPsqlProcesses();
    cleanupFixture(container);
  }

  process.stdout.write(
    `PASS ${system} complete harness: ${cases.length} scenarios; fixtures and child processes cleaned.\n`,
  );
}

function scenarioCases(system, requestedScenario, requestedRow) {
  if (requestedScenario !== "all") {
    const rowStates =
      requestedRow === "all" ? ["existing", "absent"] : [requestedRow];
    return rowStates.map((rowState) => ({
      rowState,
      scenario: requestedScenario,
    }));
  }

  const cases = [];
  for (const scenario of ["source-first", "transition-first", "unlock"]) {
    for (const rowState of ["existing", "absent"]) {
      cases.push({ rowState, scenario });
    }
  }
  cases.push({ rowState: "existing", scenario: "isolation" });
  if (system === "accounting") {
    cases.push({ rowState: "existing", scenario: "multiple-books" });
  }
  return cases;
}

async function proveSourceFirst({ container, system }) {
  const source = startPsql(
    container,
    sourceSql({
      holdOpen: true,
      marker: "SOURCE_AUTHORITY_ACQUIRED",
    }),
    { holdOpen: true },
  );
  await source.waitFor("SOURCE_AUTHORITY_ACQUIRED");
  if (
    process.env.FINANCE_AUTHORITY_TEST_FORCE_FAILURE_AFTER_MARKER === "1"
  ) {
    throw new Error(
      "Forced authority-concurrency failure after the source marker.",
    );
  }

  const transition = startPsql(container, transitionSql(system, false));
  await waitForDatabaseLock(container, transition);

  if (
    transition.output.includes("TRANSITION_MUTATED") ||
    transition.completed
  ) {
    source.release();
    await Promise.all([source.result, transition.result]);
    throw new Error(
      `${system} transition did not wait for the already-running source transaction.\n${transition.output}`,
    );
  }

  source.release();
  const [sourceResult, transitionResult] = await Promise.all([
    source.result,
    transition.result,
  ]);
  assertSucceeded("source", sourceResult);
  assertSucceeded(`${system} transition`, transitionResult);
  if (!transitionResult.output.includes("TRANSITION_MUTATED")) {
    throw new Error(`${system} transition never completed its mutation.`);
  }
}

async function proveTransitionFirst({ container, system }) {
  const transition = startPsql(container, transitionSql(system, true), {
    holdOpen: true,
  });
  await transition.waitFor("TRANSITION_MUTATED");

  const source = startPsql(
    container,
    sourceSql({ marker: "SOURCE_AUTHORITY_ACQUIRED" }),
  );
  await waitForDatabaseLock(container, source);

  if (source.output.includes("SOURCE_AUTHORITY_ACQUIRED") || source.completed) {
    transition.release();
    await Promise.all([transition.result, source.result]);
    throw new Error(
      `Source did not wait for the already-running ${system} transition.\n${source.output}`,
    );
  }

  transition.release();
  const [transitionResult, sourceResult] = await Promise.all([
    transition.result,
    source.result,
  ]);
  assertSucceeded(`${system} transition`, transitionResult);
  if (sourceResult.code === 0) {
    throw new Error(
      `Source succeeded after the ${system} transition committed a lock.\n${sourceResult.output}`,
    );
  }
  const expected =
    system === "ledger"
      ? "Organization Ledger period is locked"
      : "Accounting book period is locked";
  if (!sourceResult.output.includes(expected)) {
    throw new Error(
      `Source failed without the expected post-wait authority rejection "${expected}".\n${sourceResult.output}`,
    );
  }
}

async function proveUnlock({ container, system }) {
  runSql(
    container,
    system === "ledger"
      ? `UPDATE public.ledger_period_locks
SET locked_at = pg_catalog.now(),
    locked_by = '${fixture.adminId}'::uuid
WHERE organization_id = '${fixture.organizationId}'::uuid
  AND period_start = '2026-07-01'::date;`
      : `UPDATE public.accounting_periods
SET status = 'locked',
    locked_at = pg_catalog.now(),
    locked_by = '${fixture.adminId}'::uuid
WHERE book_id = '${fixture.bookId}'::uuid
  AND period_start = '2026-07-01'::date;`,
  );

  const transition = startPsql(
    container,
    transitionSql(system, true, { locked: false }),
    { holdOpen: true },
  );
  await transition.waitFor("TRANSITION_MUTATED");
  const source = startPsql(
    container,
    sourceSql({ marker: "SOURCE_AUTHORITY_ACQUIRED" }),
  );
  await waitForDatabaseLock(container, source);

  if (source.output.includes("SOURCE_AUTHORITY_ACQUIRED") || source.completed) {
    transition.release();
    await Promise.all([transition.result, source.result]);
    throw new Error(
      `Source did not wait for the already-running ${system} unlock transition.\n${source.output}`,
    );
  }

  transition.release();
  const [transitionResult, sourceResult] = await Promise.all([
    transition.result,
    source.result,
  ]);
  assertSucceeded(`${system} unlock transition`, transitionResult);
  assertSucceeded("source after unlock", sourceResult);
  if (!sourceResult.output.includes("SOURCE_AUTHORITY_ACQUIRED")) {
    throw new Error("Source did not resume after the unlock committed.");
  }
}

async function proveIsolation({ container, system }) {
  const transition = startPsql(container, transitionSql(system, true), {
    holdOpen: true,
  });
  await transition.waitFor("TRANSITION_MUTATED");
  const independentSources = [
    {
      marker: "OTHER_ORGANIZATION_SOURCE_ACQUIRED",
      process: startPsql(
        container,
        sourceSql({
          marker: "OTHER_ORGANIZATION_SOURCE_ACQUIRED",
          organizationId: fixture.otherOrganizationId,
          propertyId: fixture.otherOrganizationPropertyId,
        }),
      ),
    },
    {
      marker: "OTHER_MONTH_SOURCE_ACQUIRED",
      process: startPsql(
        container,
        sourceSql({
          effectiveDate: "2026-08-15",
          marker: "OTHER_MONTH_SOURCE_ACQUIRED",
        }),
      ),
    },
  ];

  for (const source of independentSources) {
    await source.process.waitFor(source.marker);
    if (transition.completed) {
      await Promise.all([
        transition.result,
        ...independentSources.map((candidate) => candidate.process.result),
      ]);
      throw new Error(
        `An unrelated source waited for the ${system} transition to commit.\n${source.process.output}`,
      );
    }
  }
  const independentResults = await Promise.all(
    independentSources.map((source) => source.process.result),
  );
  for (const result of independentResults) {
    assertSucceeded("unrelated source", result);
  }
  if (transition.completed) {
    throw new Error(
      `${system} transition exited before the parent release handshake.\n${transition.output}`,
    );
  }
  transition.release();
  assertSucceeded(`${system} transition`, await transition.result);

  runSql(
    container,
    `UPDATE public.ledger_period_locks
SET locked_at = NULL, locked_by = NULL, reason = NULL
WHERE organization_id = '${fixture.organizationId}'::uuid
  AND period_start = '2026-07-01'::date;
UPDATE public.accounting_periods
SET status = 'open', locked_at = NULL, locked_by = NULL, lock_reason = NULL
WHERE organization_id = '${fixture.organizationId}'::uuid
  AND period_start = '2026-07-01'::date;`,
  );

  const firstPropertySource = startPsql(
    container,
    sourceSql({
      holdOpen: true,
      marker: "FIRST_PROPERTY_SOURCE_ACQUIRED",
    }),
    { holdOpen: true },
  );
  await firstPropertySource.waitFor("FIRST_PROPERTY_SOURCE_ACQUIRED");
  const secondPropertySource = startPsql(
    container,
    sourceSql({
      marker: "SECOND_PROPERTY_SOURCE_ACQUIRED",
      propertyId: fixture.otherPropertyId,
    }),
  );
  await secondPropertySource.waitFor("SECOND_PROPERTY_SOURCE_ACQUIRED");
  if (firstPropertySource.completed) {
    await Promise.all([
      firstPropertySource.result,
      secondPropertySource.result,
    ]);
    throw new Error(
      `The second property source waited for the first source transaction to commit.\n${secondPropertySource.output}`,
    );
  }
  firstPropertySource.release();
  const [firstResult, secondResult] = await Promise.all([
    firstPropertySource.result,
    secondPropertySource.result,
  ]);
  assertSucceeded("first property source", firstResult);
  assertSucceeded("second property source", secondResult);
}

async function proveMultipleBooks({ container }) {
  const firstTransition = startPsql(
    container,
    transitionSql("accounting", true, { bookId: fixture.bookId }),
    { holdOpen: true },
  );
  await firstTransition.waitFor("TRANSITION_MUTATED");
  const secondTransition = startPsql(
    container,
    transitionSql("accounting", false, {
      bookId: fixture.secondBookId,
    }),
  );
  await waitForDatabaseLock(container, secondTransition);
  if (
    secondTransition.output.includes("TRANSITION_MUTATED") ||
    secondTransition.completed
  ) {
    firstTransition.release();
    await Promise.all([firstTransition.result, secondTransition.result]);
    throw new Error(
      `Second client-book transition did not share the currency/month authority.\n${secondTransition.output}`,
    );
  }

  firstTransition.release();
  const [firstResult, secondResult] = await Promise.all([
    firstTransition.result,
    secondTransition.result,
  ]);
  assertSucceeded("first client-book transition", firstResult);
  assertSucceeded("second client-book transition", secondResult);

  const sourceResult = await startPsql(
    container,
    sourceSql({ marker: "SOURCE_AUTHORITY_ACQUIRED" }),
  ).result;
  if (
    sourceResult.code === 0 ||
    !sourceResult.output.includes("Accounting book period is locked")
  ) {
    throw new Error(
      `Multiple active client books did not block the source deterministically.\n${sourceResult.output}`,
    );
  }
}

function fixtureSql(system, rowState) {
  const absentTarget =
    rowState === "existing"
      ? ""
      : system === "ledger"
        ? `DELETE FROM public.ledger_period_locks
WHERE organization_id = '${fixture.organizationId}'::uuid
  AND period_start = '2026-07-01'::date;`
        : `DELETE FROM public.accounting_periods
WHERE book_id = '${fixture.bookId}'::uuid
  AND period_start = '2026-07-01'::date;`;

  return `\\set ON_ERROR_STOP on
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '${fixture.adminId}'::uuid,
  'authenticated',
  'authenticated',
  'authority-concurrency@example.test',
  extensions.crypt('authority-concurrency', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}',
  now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '${fixture.organizationId}'::uuid,
  'Authority concurrency organization',
  'authority-concurrency'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '${fixture.otherOrganizationId}'::uuid,
  'Other authority concurrency organization',
  'other-authority-concurrency'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (
  '${fixture.organizationId}'::uuid,
  '${fixture.adminId}'::uuid,
  'admin'
)
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status
) VALUES (
  '${fixture.propertyId}'::uuid,
  '${fixture.organizationId}'::uuid,
  'Authority concurrency property',
  'AUTH-CONCURRENCY',
  'apartment',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status
) VALUES
(
  '${fixture.otherPropertyId}'::uuid,
  '${fixture.organizationId}'::uuid,
  'Other authority concurrency property',
  'AUTH-CONCURRENCY-OTHER',
  'apartment',
  'active'
),
(
  '${fixture.otherOrganizationPropertyId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid,
  'Cross organization concurrency property',
  'AUTH-CONCURRENCY-CROSS',
  'apartment',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounting_books (
  id, organization_id, book_type, name, currency, is_default
) VALUES (
  '${fixture.bookId}'::uuid,
  '${fixture.organizationId}'::uuid,
  'client',
  'Authority concurrency client book',
  'USD',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounting_books (
  id, organization_id, book_type, name, currency, is_default
) VALUES (
  '${fixture.secondBookId}'::uuid,
  '${fixture.organizationId}'::uuid,
  'client',
  'Second authority concurrency client book',
  'USD',
  false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ledger_period_locks (
  organization_id, period_start, locked_at, locked_by, reason
) VALUES (
  '${fixture.organizationId}'::uuid, '2026-07-01'::date, NULL, NULL, NULL
)
ON CONFLICT (organization_id, period_start) DO UPDATE
SET locked_at = NULL, locked_by = NULL, reason = NULL;

INSERT INTO public.accounting_periods (
  organization_id, book_id, period_start, status
) VALUES
(
  '${fixture.organizationId}'::uuid,
  '${fixture.bookId}'::uuid,
  '2026-07-01'::date,
  'open'
),
(
  '${fixture.organizationId}'::uuid,
  '${fixture.secondBookId}'::uuid,
  '2026-07-01'::date,
  'open'
)
ON CONFLICT (book_id, period_start) DO UPDATE
SET status = 'open', locked_at = NULL, locked_by = NULL, lock_reason = NULL;

${absentTarget}
`;
}

function transitionSql(
  system,
  holdOpen,
  {
    bookId = fixture.bookId,
    locked = true,
    organizationId = fixture.organizationId,
    periodStart = "2026-07-01",
  } = {},
) {
  const call =
    system === "ledger"
      ? `SELECT public.set_ledger_period_lock(
  '${organizationId}'::uuid,
  '${periodStart}'::date,
  ${locked},
  'Concurrency regression'
);`
      : `SELECT public.set_accounting_period_lock(
  '${organizationId}'::uuid,
  '${bookId}'::uuid,
  '${periodStart}'::date,
  ${locked},
  'Concurrency regression'
);`;

  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config(
  'request.jwt.claim.sub',
  '${fixture.adminId}',
  true
);
SET LOCAL ROLE authenticated;
${call}
\\echo TRANSITION_MUTATED
${holdOpen ? "" : "COMMIT;\n\\echo TRANSITION_COMMITTED"}
`;
}

function sourceSql({
  currency = "USD",
  effectiveDate = "2026-07-15",
  holdOpen = false,
  marker,
  organizationId = fixture.organizationId,
  propertyId = fixture.propertyId,
}) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT app_private.lock_open_property_reporting_period(
  '${organizationId}'::uuid,
  '${propertyId}'::uuid,
  '${currency}'::public.currency_code,
  '${effectiveDate}'::date
);
\\echo ${marker}
${holdOpen ? "" : "COMMIT;\n\\echo SOURCE_COMMITTED"}
`;
}

function startPsql(container, sql, { holdOpen = false } = {}) {
  const applicationName =
    `nestory-financial-authority-concurrency-${++psqlProcessSequence}`;
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
  let output = "";
  let completed = false;
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

  let processHandle;
  const result = new Promise((resolveResult) => {
    child.on("error", (error) => {
      append(`psql spawn error: ${error.message}\n`);
    });
    child.on("close", (code) => {
      completed = true;
      startedPsqlProcesses.delete(processHandle);
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(
          new Error(
            `psql exited before marker ${waiter.marker} (code ${code}).\n${output}`,
          ),
        );
      }
      waiters.clear();
      resolveResult({ code: code ?? 1, output });
    });
  });
  child.stdin.on("error", (error) => {
    append(`psql stdin error: ${error.message}\n`);
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
        throw new Error("Cannot release a psql process that is not held open.");
      }
      if (released || completed) {
        throw new Error("Held psql process was already released or completed.");
      }
      released = true;
      const releaseSql = "COMMIT;\n\\echo TRANSACTION_RELEASED\n";
      child.stdin.end(releaseSql);
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
              new Error(
                `Timed out waiting for marker ${marker}.\n${output}`,
              ),
            );
          }, markerTimeoutMs),
        };
        waiters.add(waiter);
      });
    },
  };
  startedPsqlProcesses.add(processHandle);
  if (holdOpen) {
    child.stdin.write(sql);
  } else {
    child.stdin.end(sql);
  }
  return processHandle;
}

async function waitForDatabaseLock(container, processHandle) {
  const deadline = Date.now() + markerTimeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.completed) {
      throw new Error(
        `psql contender ${processHandle.applicationName} exited before reaching a database lock wait.\n${processHandle.output}`,
      );
    }

    const waiting = queryScalar(
      container,
      `SELECT count(*)
FROM pg_catalog.pg_stat_activity
WHERE application_name = '${processHandle.applicationName}'
  AND state = 'active'
  AND wait_event_type = 'Lock';`,
    );
    if (waiting === "1") {
      return;
    }
    await delay(50);
  }

  throw new Error(
    `Timed out waiting for contender ${processHandle.applicationName} to reach a database lock wait.\n${processHandle.output}`,
  );
}

async function cleanupStartedPsqlProcesses() {
  const running = [...startedPsqlProcesses];
  for (const processHandle of running) {
    processHandle.kill();
  }
  await Promise.allSettled(
    running.map((processHandle) => processHandle.result),
  );
}

function cleanupFixture(container) {
  runSql(
    container,
    `\\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config(
  'app.financial_authority_period_context',
  'on',
  true
);
DELETE FROM public.activity_logs
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
ALTER TABLE public.property_reporting_periods
  DISABLE TRIGGER enforce_property_period_mutation_context;
DELETE FROM public.property_reporting_periods
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
ALTER TABLE public.property_reporting_periods
  ENABLE TRIGGER enforce_property_period_mutation_context;
DELETE FROM public.ledger_period_locks
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
DELETE FROM public.accounting_periods
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
DELETE FROM public.accounting_books
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
ALTER TABLE public.financial_reconciliation_sources
  DISABLE TRIGGER enforce_financial_reconciliation_source_mutation;
DELETE FROM public.financial_reconciliation_sources
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
ALTER TABLE public.financial_reconciliation_sources
  ENABLE TRIGGER enforce_financial_reconciliation_source_mutation;
DELETE FROM public.properties
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
DELETE FROM public.organization_members
WHERE organization_id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
DELETE FROM public.organizations
WHERE id IN (
  '${fixture.organizationId}'::uuid,
  '${fixture.otherOrganizationId}'::uuid
);
DELETE FROM auth.users
WHERE id = '${fixture.adminId}'::uuid;

DO $cleanup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id IN (
      '${fixture.organizationId}'::uuid,
      '${fixture.otherOrganizationId}'::uuid
    )
  ) OR EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = '${fixture.adminId}'::uuid
  ) THEN
    RAISE EXCEPTION 'Authority concurrency fixtures remain after cleanup';
  END IF;
END;
$cleanup$;
COMMIT;`,
  );
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
    { encoding: "utf8", input: sql },
  );
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `Fixture SQL failed.\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
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
    { encoding: "utf8" },
  );
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `Database lock-state query failed.\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result.stdout.trim();
}

function assertContainer(container) {
  const result = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Running}}", container],
    { encoding: "utf8" },
  );
  if ((result.status ?? 1) !== 0 || result.stdout.trim() !== "true") {
    throw new Error(
      `Local Supabase database container ${container} is not running.`,
    );
  }
}

function assertSucceeded(label, result) {
  if (result.code !== 0) {
    throw new Error(`${label} failed.\n${result.output}`);
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function parseOptions(arguments_) {
  const options = new Map();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument.startsWith("--")) {
      continue;
    }
    options.set(argument.slice(2), arguments_[index + 1]);
    index += 1;
  }
  return options;
}
