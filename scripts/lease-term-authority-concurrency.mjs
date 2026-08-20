import { spawn, spawnSync } from "node:child_process";

const ids = {
  admin: "f4800000-0000-4000-8000-000000000001",
  organization: "f4800000-0000-4000-8000-000000000002",
  property: "f4800000-0000-4000-8000-000000000003",
  unit: "f4800000-0000-4000-8000-000000000004",
  tenant: "f4800000-0000-4000-8000-000000000005",
  lease: "f4800000-0000-4000-8000-000000000006",
  otherProperty: "f4800000-0000-4000-8000-000000000007",
  otherUnit: "f4800000-0000-4000-8000-000000000008",
  otherLease: "f4800000-0000-4000-8000-000000000009",
  archiveRaceProperty: "f4800000-0000-4000-8000-00000000000a",
  archiveRaceUnit: "f4800000-0000-4000-8000-00000000000b",
};

const container = readOption("--container") ??
  process.env.SUPABASE_DB_CONTAINER ??
  "supabase_db_nestory";
const timeoutMs = 10_000;
const processes = new Set();
let sequence = 0;

assertContainer();

let proofError;
try {
  cleanup();
  fixture();
  await proveConcurrentOverlapFailsClosed();

  cleanup();
  fixture();
  await proveOrganizationMonthSerializesAcrossProperties();

  cleanup();
  fixture();
  prepareDraftAuthority();
  await provePeriodTransitionSerializesTermEdit();

  cleanup();
  fixture();
  await proveArchiveSerializesWithConcurrentLeaseCreation();

  process.stdout.write(
    "PASS lease-term authority: overlapping terms, organization-month writes, month-lock transitions, and scope archives serialize correctly.\n",
  );
} catch (error) {
  proofError = error;
} finally {
  await stopProcesses();
  try {
    cleanup();
  } catch (cleanupError) {
    if (proofError) {
      proofError = new AggregateError(
        [proofError, cleanupError],
        "Lease-term concurrency proof and cleanup both failed.",
      );
    } else {
      throw cleanupError;
    }
  }
}
if (proofError) throw proofError;

async function proveConcurrentOverlapFailsClosed() {
  const first = startPsql(
    authoritativeTermSql(ids.lease, "term-overlap-first", true),
    true,
  );
  await first.waitFor("FIRST_TERM_WRITTEN");

  const second = startPsql(
    authoritativeTermSql(ids.lease, "term-overlap-second", false),
  );
  await waitForLock(second);

  if (second.completed) {
    throw new Error(`Overlapping contender did not wait.\n${second.output}`);
  }

  first.release();
  const [firstResult, secondResult] = await Promise.all([
    first.result,
    second.result,
  ]);
  assertSucceeded("first overlapping term", firstResult);

  if (
    secondResult.code === 0 ||
    !secondResult.output.includes(
      "lease_terms_authoritative_effective_range_excl",
    )
  ) {
    throw new Error(
      `Second overlapping term did not fail through the exclusion authority.\n${secondResult.output}`,
    );
  }

  const count = queryScalar(`
SELECT count(*)
FROM public.lease_terms
WHERE lease_id = '${ids.lease}'::uuid
  AND authority_kind = 'authoritative'
  AND status = 'active';`);
  if (count !== "1") {
    throw new Error(`Expected one authoritative active term, found ${count}.`);
  }
}

async function proveOrganizationMonthSerializesAcrossProperties() {
  const first = startPsql(
    authoritativeTermSql(ids.lease, "term-unrelated-first", true),
    true,
  );
  await first.waitFor("FIRST_TERM_WRITTEN");

  const second = startPsql(
    authoritativeTermSql(ids.otherLease, "term-unrelated-second", false),
  );
  await waitForLock(second);
  if (second.completed) {
    throw new Error(
      `Same-organization month write bypassed financial-month serialization.\n${second.output}`,
    );
  }

  first.release();
  const [firstResult, secondResult] = await Promise.all([
    first.result,
    second.result,
  ]);
  assertSucceeded("held property term", firstResult);
  assertSucceeded("serialized property term", secondResult);

  const count = queryScalar(`
SELECT count(*)
FROM public.lease_terms
WHERE lease_id IN ('${ids.lease}'::uuid, '${ids.otherLease}'::uuid)
  AND authority_kind = 'authoritative'
  AND status = 'active';`);
  if (count !== "2") {
    throw new Error(`Expected two independent authoritative terms, found ${count}.`);
  }
}

async function provePeriodTransitionSerializesTermEdit() {
  const transition = startPsql(
    `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.set_financial_month_lock(
  '${ids.organization}'::uuid,
  '2026-07-01'::date,
  true,
  'Lease-term concurrency proof'
);
\\echo PERIOD_TRANSITION_WRITTEN
`,
    true,
  );
  await transition.waitFor("PERIOD_TRANSITION_WRITTEN");

  const edit = startPsql(
    `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.correct_authoritative_lease_term(
  '${ids.organization}'::uuid,
  '${ids.lease}'::uuid,
  (
    SELECT id
    FROM public.lease_terms
    WHERE lease_id = '${ids.lease}'::uuid
      AND authority_kind = 'authoritative'
      AND status = 'draft'
  ),
  '2026-07-15'::date,
  '2027-06-30'::date,
  1100,
  'USD'::public.currency_code,
  12,
  'monthly',
  'draft',
  'term-period-edit'
);
COMMIT;
`,
  );
  await waitForLock(edit);

  if (edit.completed) {
    throw new Error(`Term edit did not wait for period transition.\n${edit.output}`);
  }

  transition.release();
  const [transitionResult, editResult] = await Promise.all([
    transition.result,
    edit.result,
  ]);
  assertSucceeded("period transition", transitionResult);

  if (
    editResult.code === 0 ||
    !editResult.output.includes("Financial month is locked")
  ) {
    throw new Error(
      `Term edit did not fail against the committed period authority.\n${editResult.output}`,
    );
  }

  const count = queryScalar(`
SELECT count(*)
FROM public.lease_terms
WHERE lease_id = '${ids.lease}'::uuid
  AND authority_kind = 'authoritative'
  AND status = 'draft';`);
  if (count !== "1") {
    throw new Error(`Rejected edit changed draft authority; found ${count} rows.`);
  }
}

async function proveArchiveSerializesWithConcurrentLeaseCreation() {
  const creator = startPsql(
    unitLeaseCreationSql("archive-race-creator-wins", true),
    true,
  );
  await creator.waitFor("OPEN_LEASE_WRITTEN");

  const creatorState = queryScalar(`
SELECT state
FROM pg_catalog.pg_stat_activity
WHERE application_name = '${creator.applicationName}';`);
  if (creatorState !== "idle in transaction") {
    throw new Error(
      `Lease creator did not retain its transaction after the RPC; state=${creatorState}.`,
    );
  }

  const propertyLockXid = queryScalar(`
SELECT xmax::text
FROM public.properties
WHERE id = '${ids.archiveRaceProperty}'::uuid;`);
  if (propertyLockXid === "0") {
    throw new Error("Lease creation did not retain a lock on its parent Property.");
  }

  const archiver = startPsql(`\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
UPDATE public.properties
SET archived_at = statement_timestamp(),
    archived_by = '${ids.admin}'::uuid,
    updated_by = '${ids.admin}'::uuid
WHERE organization_id = '${ids.organization}'::uuid
  AND id = '${ids.archiveRaceProperty}'::uuid;
COMMIT;
`);

  await waitForLock(archiver);
  creator.release();
  const [creatorResult, archiverResult] = await Promise.all([
    creator.result,
    archiver.result,
  ]);
  assertSucceeded("concurrent Lease creation", creatorResult);

  if (
    archiverResult.code === 0 ||
    !archiverResult.output.includes("Property has an open Lease")
  ) {
    throw new Error(
      `Concurrent Property archive did not fail after Lease creation committed.\n${archiverResult.output}`,
    );
  }

  const archivedAt = queryScalar(`
SELECT archived_at IS NULL
FROM public.properties
WHERE id = '${ids.archiveRaceProperty}'::uuid;`);
  if (archivedAt !== "t") {
    throw new Error("Rejected concurrent archive changed the Property record.");
  }

  cleanup();
  fixture();

  const firstArchiver = startPsql(
    `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
UPDATE public.properties
SET archived_at = statement_timestamp(),
    archived_by = '${ids.admin}'::uuid,
    updated_by = '${ids.admin}'::uuid
WHERE organization_id = '${ids.organization}'::uuid
  AND id = '${ids.archiveRaceProperty}'::uuid;
\\echo PROPERTY_ARCHIVED
`,
    true,
  );
  await firstArchiver.waitFor("PROPERTY_ARCHIVED");

  const blockedCreator = startPsql(
    unitLeaseCreationSql("archive-race-archiver-wins", false),
  );
  await waitForLock(blockedCreator);
  firstArchiver.release();
  const [firstArchiverResult, blockedCreatorResult] = await Promise.all([
    firstArchiver.result,
    blockedCreator.result,
  ]);
  assertSucceeded("concurrent Property archive", firstArchiverResult);

  if (
    blockedCreatorResult.code === 0 ||
    !blockedCreatorResult.output.includes("Unit not found under selected property")
  ) {
    throw new Error(
      `Concurrent Lease creation did not fail after Property archive committed.\n${blockedCreatorResult.output}`,
    );
  }

  const leaseCount = queryScalar(`
SELECT count(*)
FROM public.leases
WHERE organization_id = '${ids.organization}'::uuid
  AND property_id = '${ids.archiveRaceProperty}'::uuid;`);
  if (leaseCount !== "0") {
    throw new Error("Rejected concurrent creation left a Lease record behind.");
  }
}

function unitLeaseCreationSql(idempotencyKey, holdOpen) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.create_simplified_unit_lease(
  '${ids.organization}'::uuid,
  '${ids.archiveRaceProperty}'::uuid,
  '${ids.archiveRaceUnit}'::uuid,
  '${ids.tenant}'::uuid,
  '2026-09-01'::date,
  '2027-08-31'::date,
  700,
  'USD'::public.currency_code,
  10,
  'monthly',
  'draft',
  NULL,
  NULL,
  'draft',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', '${ids.tenant}'::uuid,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'archive_race_draft_created',
      'startedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'endedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'reserved',
      'recordSource', 'operator_confirmed',
      'reason', 'archive_race_draft_created',
      'scheduledMoveIn', jsonb_build_object(
        'date', '2026-09-01'::date, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', '2027-08-31'::date, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'participants', '[]'::jsonb
  ),
  '${idempotencyKey}'
);
\\echo OPEN_LEASE_WRITTEN
${holdOpen ? "" : "COMMIT;"}
`;
}

function fixture() {
  runSql(`\\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '${ids.admin}'::uuid,
  'authenticated',
  'authenticated',
  'lease-term-concurrency@example.test',
  extensions.crypt('lease-term-concurrency', extensions.gen_salt('bf')),
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
  'Lease term concurrency',
  'lease-term-concurrency'
);
INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES ('${ids.organization}'::uuid, '${ids.admin}'::uuid, 'super_admin');
INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
VALUES
(
  '${ids.property}'::uuid,
  '${ids.organization}'::uuid,
  'Lease term concurrency property',
  'TERM-CONCURRENCY',
  'apartment',
  'active'
),
(
  '${ids.otherProperty}'::uuid,
  '${ids.organization}'::uuid,
  'Unrelated lease term property',
  'TERM-UNRELATED',
  'apartment',
  'active'
),
(
  '${ids.archiveRaceProperty}'::uuid,
  '${ids.organization}'::uuid,
  'Lease archive race property',
  'ARCHIVE-RACE',
  'apartment',
  'active'
);
INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
VALUES
(
  '${ids.unit}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  'CONCURRENCY-1',
  'vacant',
  1000,
  'USD'
),
(
  '${ids.otherUnit}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.otherProperty}'::uuid,
  'UNRELATED-1',
  'vacant',
  800,
  'USD'
),
(
  '${ids.archiveRaceUnit}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.archiveRaceProperty}'::uuid,
  'ARCHIVE-RACE-1',
  'vacant',
  700,
  'USD'
);
INSERT INTO public.people(id, organization_id, display_name)
VALUES (
  '${ids.tenant}'::uuid,
  '${ids.organization}'::uuid,
  'Lease term concurrency tenant'
);
INSERT INTO public.person_roles(organization_id, person_id, role)
VALUES ('${ids.organization}'::uuid, '${ids.tenant}'::uuid, 'tenant');
SET LOCAL session_replication_role = replica;
INSERT INTO public.leases(
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  status, created_by, updated_by
)
VALUES
(
  '${ids.lease}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.unit}'::uuid,
  '${ids.tenant}'::uuid,
  'active',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
),
(
  '${ids.otherLease}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.otherProperty}'::uuid,
  '${ids.otherUnit}'::uuid,
  '${ids.tenant}'::uuid,
  'active',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
);
SET LOCAL session_replication_role = origin;
COMMIT;`);
}

function prepareDraftAuthority() {
  runSql(`\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
-- The authoritative term writer is intentionally internal-only. Run this
-- concurrency fixture as its postgres owner while retaining the admin actor.
SELECT public.create_authoritative_lease_term(
  '${ids.organization}'::uuid,
  '${ids.lease}'::uuid,
  '2026-07-15'::date,
  '2027-06-30'::date,
  1000,
  'USD'::public.currency_code,
  10,
  'monthly',
  'draft',
  NULL,
  'term-period-base'
);
COMMIT;`);
}

function authoritativeTermSql(leaseId, idempotencyKey, holdOpen) {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
-- Exercise the internal writer's lock behavior as its postgres owner.
SELECT public.create_authoritative_lease_term(
  '${ids.organization}'::uuid,
  '${leaseId}'::uuid,
  '2026-07-15'::date,
  '2027-06-30'::date,
  1000,
  'USD'::public.currency_code,
  10,
  'monthly',
  'active',
  NULL,
  '${idempotencyKey}'
);
${holdOpen ? "\\echo FIRST_TERM_WRITTEN\n" : "COMMIT;\n"}`;
}

function startPsql(sql, holdOpen = false) {
  const applicationName = `nestory-lease-term-concurrency-${++sequence}`;
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
  const waiters = new Set();
  let handle;

  const append = (chunk) => {
    output += chunk.toString();
    for (const waiter of waiters) {
      if (output.includes(waiter.marker)) {
        clearTimeout(waiter.timer);
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

  const result = new Promise((resolve) => {
    child.on("error", (error) => append(`spawn error: ${error.message}\n`));
    child.on("close", (code) => {
      completed = true;
      processes.delete(handle);
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`psql exited before ${waiter.marker}.\n${output}`));
      }
      waiters.clear();
      resolve({ code: code ?? 1, output });
    });
  });

  handle = {
    applicationName,
    get completed() {
      return completed;
    },
    get output() {
      return output;
    },
    result,
    kill: () => child.kill(),
    release() {
      child.stdin.end("COMMIT;\n\\echo TRANSACTION_RELEASED\n");
    },
    waitFor(marker) {
      if (output.includes(marker)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const waiter = {
          marker,
          resolve,
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(new Error(`Timed out waiting for ${marker}.\n${output}`));
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
  };
  processes.add(handle);
  if (holdOpen) child.stdin.write(sql);
  else child.stdin.end(sql);
  return handle;
}

async function waitForLock(handle) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (handle.completed) {
      throw new Error(`Contender exited before lock wait.\n${handle.output}`);
    }
    const waiting = queryScalar(`
SELECT count(*)
FROM pg_catalog.pg_stat_activity
WHERE application_name = '${handle.applicationName}'
  AND state = 'active'
  AND wait_event_type = 'Lock';`);
    if (waiting === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for database lock.\n${handle.output}`);
}

function cleanup() {
  runSql(`\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.people_leases_skip_sync', 'on', true);
DELETE FROM public.activity_logs
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM app_private.financial_idempotency_requests
WHERE organization_id = '${ids.organization}'::uuid;
DELETE FROM public.financial_month_locks
WHERE organization_id = '${ids.organization}'::uuid;
-- Simplified Lease creation writes an immutable billing snapshot. Remove only
-- this isolated fixture's snapshot with triggers disabled before its org row.
SET LOCAL session_replication_role = replica;
DELETE FROM public.lease_billing_terms
WHERE organization_id = '${ids.organization}'::uuid;
SET LOCAL session_replication_role = origin;
ALTER TABLE public.financial_reconciliation_sources
  DISABLE TRIGGER enforce_financial_reconciliation_source_mutation;
DELETE FROM public.financial_reconciliation_sources
WHERE organization_id = '${ids.organization}'::uuid;
ALTER TABLE public.financial_reconciliation_sources
  ENABLE TRIGGER enforce_financial_reconciliation_source_mutation;
DELETE FROM public.organizations
WHERE id = '${ids.organization}'::uuid;
DELETE FROM auth.users
WHERE id = '${ids.admin}'::uuid;
COMMIT;`);
}

async function stopProcesses() {
  const running = [...processes];
  for (const process of running) process.kill();
  await Promise.allSettled(running.map((process) => process.result));
}

function runSql(sql) {
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
    { encoding: "utf8", input: sql, timeout: timeoutMs },
  );
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

function queryScalar(sql) {
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
    { encoding: "utf8", timeout: timeoutMs },
  );
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout.trim();
}

function assertContainer() {
  const result = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Running}}", container],
    { encoding: "utf8", timeout: timeoutMs },
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
