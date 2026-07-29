import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ids = {
  admin: "f4900000-0000-4000-8000-000000000001",
  organization: "f4900000-0000-4000-8000-000000000002",
  property: "f4900000-0000-4000-8000-000000000003",
  unit: "f4900000-0000-4000-8000-000000000004",
  tenant: "f4900000-0000-4000-8000-000000000005",
  unrelatedPerson: "f4900000-0000-4000-8000-000000000006",
};

const markerTimeoutMs = 10_000;
const startedProcesses = new Set();
let processSequence = 0;

export function evaluateArchiveAttempt(result) {
  if (result.code === 0) {
    throw new Error(
      `The active Person archive unexpectedly succeeded.\n${result.output}`,
    );
  }

  if (
    !result.output.match(
      /DETAIL:\s+relationship_transition_required(?:\r?\n|$)/,
    )
  ) {
    throw new Error(
      `The active Person archive did not return relationship_transition_required.\n${result.output}`,
    );
  }

  return {
    detail: "relationship_transition_required",
    outcome: "blocked",
  };
}

export function evaluateUnrelatedArchive(result) {
  if (
    result.code !== 0 ||
    !result.output.includes("UNRELATED_PERSON_ARCHIVED")
  ) {
    throw new Error(
      `The unrelated Person archive failed.\n${result.output}`,
    );
  }

  return { outcome: "archived" };
}

export function evaluateCreateAgainstArchivedPerson(result) {
  if (result.code === 0) {
    throw new Error(
      `Lease creation unexpectedly succeeded for an archived Person.\n${result.output}`,
    );
  }

  if (
    !result.output.match(
      /ERROR:\s+An active Tenant role is required for (?:the exact primary Tenant|the primary tenant)(?:\r?\n|$)/,
    )
  ) {
    throw new Error(
      `Lease creation did not return the active Tenant rejection after Person archival.\n${result.output}`,
    );
  }

  return {
    outcome: "blocked",
    reason: "active_tenant_required",
  };
}

async function main() {
  const container =
    readOption("--container") ??
    process.env.SUPABASE_DB_CONTAINER ??
    "supabase_db_nestory";

  assertContainer(container);

  let proofError;
  try {
    cleanup(container);
    fixture(container);
    await proveCreateVsPersonArchive(container);

    cleanup(container);
    fixture(container);
    await provePersonArchiveVsCreate(container);

    cleanup(container);
    fixture(container);
    await proveUnrelatedPersonIsNotGloballyBlocked(container);

    process.stdout.write(
      "PASS lease-history integrity: checked creation serialized active-Person archive, returned relationship_transition_required, waited behind a held Person archive before rejecting the archived Person, and did not globally block an unrelated Person archive.\n",
    );
  } catch (error) {
    proofError = error;
  } finally {
    await stopProcesses();
    try {
      cleanup(container);
    } catch (cleanupError) {
      if (proofError) {
        proofError = new AggregateError(
          [proofError, cleanupError],
          "Lease-history concurrency proof and cleanup both failed.",
        );
      } else {
        proofError = cleanupError;
      }
    }
  }

  if (proofError) {
    throw proofError;
  }
}

async function proveCreateVsPersonArchive(container) {
  const creation = startPsql(
    container,
    checkedLeaseCreationSql("LEASE_CREATED_UNCOMMITTED"),
    { holdOpen: true },
  );
  await creation.waitFor("LEASE_CREATED_UNCOMMITTED");

  const archive = startPsql(
    container,
    archivePersonSql(ids.tenant, "ACTIVE_PERSON_ARCHIVED"),
  );

  try {
    await waitForDatabaseLock(container, archive, creation);
  } catch (error) {
    creation.release();
    await Promise.allSettled([creation.result, archive.result]);
    throw error;
  }

  if (archive.completed) {
    creation.release();
    await Promise.allSettled([creation.result, archive.result]);
    throw new Error(
      `The active Person archive exited before the checked creation committed.\n${archive.output}`,
    );
  }

  creation.release();
  const [creationResult, archiveResult] = await Promise.all([
    creation.result,
    archive.result,
  ]);

  assertSucceeded("checked Lease creation", creationResult);
  evaluateArchiveAttempt(archiveResult);

  const personArchiveState = queryScalar(
    container,
    `SELECT archived_at IS NULL
FROM public.people
WHERE id = '${ids.tenant}'::uuid
  AND organization_id = '${ids.organization}'::uuid;`,
  );
  if (personArchiveState !== "t") {
    throw new Error("Rejected archive did not leave the active Person intact.");
  }

  const historyCount = queryScalar(
    container,
    `SELECT
  (SELECT count(*)
   FROM public.lease_parties
   WHERE organization_id = '${ids.organization}'::uuid
     AND person_id = '${ids.tenant}'::uuid
     AND archived_at IS NULL)::text
  || ':'
  || (SELECT count(*)
      FROM public.lease_occupancies
      WHERE organization_id = '${ids.organization}'::uuid
        AND archived_at IS NULL)::text;`,
  );
  if (historyCount !== "1:1") {
    throw new Error(
      `Expected exactly one preserved party and occupancy fact, found ${historyCount}.`,
    );
  }
}

async function provePersonArchiveVsCreate(container) {
  const personIsEligible = queryScalar(
    container,
    `SELECT (
  people.archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.person_roles AS roles
    WHERE roles.organization_id = people.organization_id
      AND roles.person_id = people.id
      AND roles.role = 'tenant'
      AND roles.status = 'active'
      AND roles.archived_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.leases AS leases
    WHERE leases.organization_id = people.organization_id
      AND leases.primary_tenant_person_id = people.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.lease_parties AS parties
    WHERE parties.organization_id = people.organization_id
      AND parties.person_id = people.id
  )
)::text
FROM public.people AS people
WHERE people.id = '${ids.tenant}'::uuid
  AND people.organization_id = '${ids.organization}'::uuid;`,
  );
  if (personIsEligible !== "true") {
    throw new Error(
      "Reverse-order fixture is not an active, tenant-role Person without Lease history.",
    );
  }

  const archive = startPsql(
    container,
    archivePersonBeforeCommitSql(
      ids.tenant,
      "PERSON_ARCHIVED_UNCOMMITTED",
    ),
    { holdOpen: true },
  );
  await archive.waitFor("PERSON_ARCHIVED_UNCOMMITTED");

  const creation = startPsql(
    container,
    checkedLeaseCreationSql("ARCHIVED_PERSON_LEASE_CREATED", {
      commit: true,
    }),
  );

  try {
    await waitForDatabaseLock(container, creation, archive);
  } catch (error) {
    archive.release();
    await Promise.allSettled([archive.result, creation.result]);
    throw error;
  }

  if (creation.completed) {
    archive.release();
    await Promise.allSettled([archive.result, creation.result]);
    throw new Error(
      `Checked Lease creation exited before the Person archive committed.\n${creation.output}`,
    );
  }

  archive.release();
  const [archiveResult, creationResult] = await Promise.all([
    archive.result,
    creation.result,
  ]);

  assertSucceeded("held Person archive", archiveResult);
  evaluateCreateAgainstArchivedPerson(creationResult);

  const persistedState = queryScalar(
    container,
    `SELECT
  (SELECT (archived_at IS NOT NULL)::text
   FROM public.people
   WHERE id = '${ids.tenant}'::uuid
     AND organization_id = '${ids.organization}'::uuid)
  || ':'
  || (SELECT count(*)
      FROM public.leases
      WHERE organization_id = '${ids.organization}'::uuid
        AND primary_tenant_person_id = '${ids.tenant}'::uuid)::text
  || ':'
  || (SELECT count(*)
      FROM public.lease_parties
      WHERE organization_id = '${ids.organization}'::uuid
        AND person_id = '${ids.tenant}'::uuid)::text
  || ':'
  || (SELECT count(*)
      FROM public.lease_occupancies
      WHERE organization_id = '${ids.organization}'::uuid)::text;`,
  );
  if (persistedState !== "true:0:0:0") {
    throw new Error(
      `Expected archived Person and no partial Lease history, found ${persistedState}.`,
    );
  }
}

async function proveUnrelatedPersonIsNotGloballyBlocked(container) {
  const creation = startPsql(
    container,
    checkedLeaseCreationSql("UNRELATED_CONTROL_LEASE_CREATED"),
    { holdOpen: true },
  );
  await creation.waitFor("UNRELATED_CONTROL_LEASE_CREATED");

  const unrelatedArchive = startPsql(
    container,
    archivePersonSql(
      ids.unrelatedPerson,
      "UNRELATED_PERSON_ARCHIVED",
    ),
  );

  let unrelatedResult;
  try {
    unrelatedResult = await withTimeout(
      unrelatedArchive.result,
      "The unrelated Person archive waited on a different Person identity.",
    );
  } catch (error) {
    creation.release();
    await Promise.allSettled([creation.result, unrelatedArchive.result]);
    throw error;
  }

  if (creation.completed) {
    throw new Error(
      `Checked creation exited before the explicit release handshake.\n${creation.output}`,
    );
  }

  evaluateUnrelatedArchive(unrelatedResult);
  creation.release();
  assertSucceeded("held checked Lease creation", await creation.result);

  const unrelatedWasArchived = queryScalar(
    container,
    `SELECT archived_at IS NOT NULL
FROM public.people
WHERE id = '${ids.unrelatedPerson}'::uuid
  AND organization_id = '${ids.organization}'::uuid;`,
  );
  if (unrelatedWasArchived !== "t") {
    throw new Error("The unrelated Person archive did not persist.");
  }

  const tenantRemainsActive = queryScalar(
    container,
    `SELECT archived_at IS NULL
FROM public.people
WHERE id = '${ids.tenant}'::uuid
  AND organization_id = '${ids.organization}'::uuid;`,
  );
  if (tenantRemainsActive !== "t") {
    throw new Error("The checked Lease tenant was unexpectedly archived.");
  }
}

function fixture(container) {
  runSql(
    container,
    `\\set ON_ERROR_STOP on
BEGIN;
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
  'lease-history-concurrency@example.test',
  extensions.crypt('lease-history-concurrency', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  '${ids.organization}'::uuid,
  'Lease history concurrency',
  'lease-history-concurrency'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES ('${ids.organization}'::uuid, '${ids.admin}'::uuid, 'admin');

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
) VALUES (
  '${ids.property}'::uuid,
  '${ids.organization}'::uuid,
  'Lease history concurrency property',
  'LEASE-HISTORY-CONCURRENCY',
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
  'LH-CONCURRENCY-1',
  'vacant',
  1000,
  'USD'
);

INSERT INTO public.people(id, organization_id, display_name)
VALUES
(
  '${ids.tenant}'::uuid,
  '${ids.organization}'::uuid,
  'Lease history concurrency tenant'
),
(
  '${ids.unrelatedPerson}'::uuid,
  '${ids.organization}'::uuid,
  'Lease history unrelated Person'
);

INSERT INTO public.person_roles(organization_id, person_id, role)
VALUES ('${ids.organization}'::uuid, '${ids.tenant}'::uuid, 'tenant');
COMMIT;`,
  );
}

function checkedLeaseCreationSql(marker, { commit = false } = {}) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.create_lease_with_authoritative_term(
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.unit}'::uuid,
  '${ids.tenant}'::uuid,
  current_date - 10,
  current_date + 355,
  1000,
  'USD'::public.currency_code,
  5,
  'monthly',
  'active',
  NULL,
  NULL,
  'active',
  'tb01-concurrency-create'
);
\\echo ${marker}
${commit ? "COMMIT;" : ""}
`;
}

function archivePersonBeforeCommitSql(personId, marker) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.archive_person(
  '${ids.organization}'::uuid,
  '${personId}'::uuid
);
\\echo ${marker}
`;
}

function archivePersonSql(personId, marker) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.archive_person(
  '${ids.organization}'::uuid,
  '${personId}'::uuid
);
COMMIT;
\\echo ${marker}
`;
}

function startPsql(container, sql, { holdOpen = false } = {}) {
  const applicationName =
    `nestory-lease-history-concurrency-${++processSequence}`;
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
    child.stdin.end(sql);
  }
  return processHandle;
}

async function waitForDatabaseLock(
  container,
  processHandle,
  blockerHandle,
) {
  const deadline = Date.now() + markerTimeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.completed) {
      throw new Error(
        `Concurrency contender exited before reaching a lock wait.\n${processHandle.output}`,
      );
    }

    const waiting = queryScalar(
      container,
      `SELECT count(*)
FROM pg_catalog.pg_stat_activity AS contender
JOIN pg_catalog.pg_stat_activity AS blocker
  ON blocker.pid = ANY (
    pg_catalog.pg_blocking_pids(contender.pid)
  )
WHERE contender.application_name = '${processHandle.applicationName}'
  AND blocker.application_name = '${blockerHandle.applicationName}'
  AND contender.state = 'active'
  AND contender.wait_event_type = 'Lock';`,
    );
    if (waiting === "1") {
      return;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }

  throw new Error(
    `Timed out waiting for the expected Person-row blocker.\n${processHandle.output}`,
  );
}

function cleanup(container) {
  runSql(
    container,
    `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.people_leases_skip_sync', 'on', true);
DELETE FROM public.activity_logs
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM app_private.financial_idempotency_requests
WHERE organization_id = '${ids.organization}'::uuid;
ALTER TABLE public.property_reporting_periods
  DISABLE TRIGGER enforce_property_period_mutation_context;
DELETE FROM public.property_reporting_periods
WHERE organization_id = '${ids.organization}'::uuid;
ALTER TABLE public.property_reporting_periods
  ENABLE TRIGGER enforce_property_period_mutation_context;
DELETE FROM public.ledger_period_locks
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
    RAISE EXCEPTION 'Lease-history concurrency fixtures remain after cleanup';
  END IF;
END;
$cleanup$;`,
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

function assertSucceeded(label, result) {
  if (result.code !== 0) {
    throw new Error(`${label} failed.\n${result.output}`);
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function withTimeout(promise, message) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(
      () => rejectPromise(new Error(message)),
      markerTimeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolvePromise(value);
      },
      (error) => {
        clearTimeout(timeout);
        rejectPromise(error);
      },
    );
  });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
