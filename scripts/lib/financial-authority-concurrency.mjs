import { spawn, spawnSync } from "node:child_process";

const fixture = {
  adminId: "10000000-0000-0000-0000-000000000001",
  bookId: "10000000-0000-0000-0000-000000000005",
  secondBookId: "10000000-0000-0000-0000-000000000006",
  organizationId: "10000000-0000-0000-0000-000000000002",
  otherOrganizationId: "10000000-0000-0000-0000-000000000007",
  otherOrganizationPropertyId: "10000000-0000-0000-0000-000000000008",
  otherPropertyId: "10000000-0000-0000-0000-000000000004",
  propertyId: "10000000-0000-0000-0000-000000000003",
};

const markerTimeoutMs = 10_000;
const holdSeconds = 1.5;

export async function runFinancialAuthorityConcurrency(system) {
  const options = parseOptions(process.argv.slice(2));
  const scenario = options.get("scenario") ?? "source-first";
  const rowState = options.get("row") ?? "existing";
  const container =
    options.get("container") ?? "supabase_db_nestory-finance-inventory";

  if (
    ![
      "source-first",
      "transition-first",
      "unlock",
      "isolation",
      "multiple-books",
    ].includes(scenario)
  ) {
    throw new Error(
      "Expected --scenario source-first, transition-first, unlock, isolation, or multiple-books.",
    );
  }
  if (scenario === "multiple-books" && system !== "accounting") {
    throw new Error("The multiple-books scenario applies only to accounting.");
  }
  if (!["existing", "absent"].includes(rowState)) {
    throw new Error("Expected --row existing or --row absent.");
  }

  assertContainer(container);
  runSql(container, fixtureSql(system, rowState));

  if (scenario === "source-first") {
    await proveSourceFirst({ container, system });
  } else if (scenario === "transition-first") {
    await proveTransitionFirst({ container, system });
  } else if (scenario === "unlock") {
    await proveUnlock({ container, system });
  } else if (scenario === "isolation") {
    await proveIsolation({ container, system });
  } else {
    await proveMultipleBooks({ container });
  }

  process.stdout.write(
    `PASS ${system} ${scenario} ${rowState}: transaction authority serialized correctly.\n`,
  );
}

async function proveSourceFirst({ container, system }) {
  const source = startPsql(
    container,
    sourceSql({
      holdOpen: true,
      marker: "SOURCE_AUTHORITY_ACQUIRED",
    }),
  );
  await source.waitFor("SOURCE_AUTHORITY_ACQUIRED");

  const transition = startPsql(container, transitionSql(system, false));
  await delay(300);

  if (
    transition.output.includes("TRANSITION_MUTATED") ||
    transition.completed
  ) {
    await Promise.all([source.result, transition.result]);
    throw new Error(
      `${system} transition did not wait for the already-running source transaction.\n${transition.output}`,
    );
  }

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
  const transition = startPsql(container, transitionSql(system, true));
  await transition.waitFor("TRANSITION_MUTATED");

  const source = startPsql(
    container,
    sourceSql({ marker: "SOURCE_AUTHORITY_ACQUIRED" }),
  );
  await delay(300);

  if (source.output.includes("SOURCE_AUTHORITY_ACQUIRED") || source.completed) {
    await Promise.all([transition.result, source.result]);
    throw new Error(
      `Source did not wait for the already-running ${system} transition.\n${source.output}`,
    );
  }

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
  );
  await transition.waitFor("TRANSITION_MUTATED");
  const source = startPsql(
    container,
    sourceSql({ marker: "SOURCE_AUTHORITY_ACQUIRED" }),
  );
  await delay(300);

  if (source.output.includes("SOURCE_AUTHORITY_ACQUIRED") || source.completed) {
    await Promise.all([transition.result, source.result]);
    throw new Error(
      `Source did not wait for the already-running ${system} unlock transition.\n${source.output}`,
    );
  }

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
  if (system === "accounting") {
    runSql(
      container,
      "ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS 'EUR';",
    );
  }

  const transition = startPsql(container, transitionSql(system, true));
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
  if (system === "accounting") {
    independentSources.push({
      marker: "OTHER_CURRENCY_SOURCE_ACQUIRED",
      process: startPsql(
        container,
        sourceSql({
          currency: "EUR",
          marker: "OTHER_CURRENCY_SOURCE_ACQUIRED",
        }),
      ),
    });
  }

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
  const independentResults = await Promise.all([
    transition.result,
    ...independentSources.map((source) => source.process.result),
  ]);
  for (const [index, result] of independentResults.entries()) {
    assertSucceeded(
      index === 0 ? `${system} transition` : "unrelated source",
      result,
    );
  }

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
  );
  await firstTransition.waitFor("TRANSITION_MUTATED");
  const secondTransition = startPsql(
    container,
    transitionSql("accounting", false, {
      bookId: fixture.secondBookId,
    }),
  );
  await delay(300);
  if (
    secondTransition.output.includes("TRANSITION_MUTATED") ||
    secondTransition.completed
  ) {
    await Promise.all([firstTransition.result, secondTransition.result]);
    throw new Error(
      `Second client-book transition did not share the currency/month authority.\n${secondTransition.output}`,
    );
  }

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
${holdOpen ? `SELECT pg_catalog.pg_sleep(${holdSeconds});` : ""}
COMMIT;
\\echo TRANSITION_COMMITTED
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
${holdOpen ? `SELECT pg_catalog.pg_sleep(${holdSeconds});` : ""}
COMMIT;
\\echo SOURCE_COMMITTED
`;
}

function startPsql(container, sql) {
  const child = spawn(
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
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "";
  let completed = false;
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
  child.stdin.end(sql);

  const result = new Promise((resolveResult) => {
    child.on("close", (code) => {
      completed = true;
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(
          new Error(
            `psql exited before marker ${waiter.marker} (code ${code}).\n${output}`,
          ),
        );
      }
      waiters.clear();
      resolveResult({ code, output });
    });
  });

  return {
    get completed() {
      return completed;
    },
    get output() {
      return output;
    },
    result,
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
