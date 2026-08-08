import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ids = {
  admin: "f4920000-0000-4000-8000-000000000001",
  organization: "f4920000-0000-4000-8000-000000000002",
  property: "f4920000-0000-4000-8000-000000000003",
  relationshipUnit: "f4920000-0000-4000-8000-000000000004",
  occupancyRaceUnit: "f4920000-0000-4000-8000-000000000005",
  tenantA: "f4920000-0000-4000-8000-000000000006",
  tenantB: "f4920000-0000-4000-8000-000000000007",
  occupant: "f4920000-0000-4000-8000-000000000008",
  partyA: "f4920000-0000-4000-8000-000000000009",
  partyB: "f4920000-0000-4000-8000-000000000010",
  participantA: "f4920000-0000-4000-8000-000000000011",
  participantB: "f4920000-0000-4000-8000-000000000012",
  occupancyA: "f4920000-0000-4000-8000-000000000013",
  occupancyB: "f4920000-0000-4000-8000-000000000014",
  occupancyLeaseA: "f4920000-0000-4000-8000-000000000015",
  occupancyLeaseB: "f4920000-0000-4000-8000-000000000016",
  participantRaceUnit: "f4920000-0000-4000-8000-000000000017",
  participantLeaseB: "f4920000-0000-4000-8000-000000000018",
  participantPartyB: "f4920000-0000-4000-8000-000000000019",
  participantOccupancyB: "f4920000-0000-4000-8000-000000000020",
  importDoubleRun: "f4920000-0000-4000-8000-000000000025",
  importDoubleRow: "f4920000-0000-4000-8000-000000000026",
};

const markerTimeoutMs = 10_000;
const startedProcesses = new Set();
let processSequence = 0;

export function evaluateAcceptedRangeRace(first, second) {
  const results = [first, second];
  const committed = results.filter((result) => result.code === 0);
  const rejected = results.filter((result) => result.code !== 0);

  if (committed.length !== 1 || rejected.length !== 1) {
    throw new Error(
      "Expected exactly one accepted relationship to commit and one contender to fail.",
    );
  }

  if (!rejected[0].output.match(/ERROR:\s+23P01:/)) {
    throw new Error(
      `Expected the losing contender to return SQLSTATE 23P01.\n${rejected[0].output}`,
    );
  }

  return {
    committed: 1,
    rejected: 1,
    sqlstate: "23P01",
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

    await proveBackendTeardown(container);
    await provePartyRace(container);
    await proveParticipantRace(container);
    await proveOccupancyRace(container);
    await proveAtomicCommitFirstRestageRace(container);
    await proveAtomicStageFirstCommitRace(container);
    await proveLeaseImportDoubleCommit(container);

    process.stdout.write(
      "PASS TB-02 relationship and Lease-import concurrency: accepted relationship ranges, atomic restage-versus-commit claim locking, and duplicate commit replay serialized across two sessions.\n",
    );
  } catch (error) {
    proofError = error;
  } finally {
    await stopProcesses(container);
    try {
      cleanup(container);
    } catch (cleanupError) {
      if (proofError) {
        proofError = new AggregateError(
          [proofError, cleanupError],
          "TB-02 concurrency proof and cleanup both failed.",
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

async function proveBackendTeardown(container) {
  const held = startPsql(
    container,
    `\\set ON_ERROR_STOP on
BEGIN;
SELECT pg_backend_pid();
\\echo TEARDOWN_BACKEND_HELD
`,
    { holdOpen: true },
  );
  await held.waitFor("TEARDOWN_BACKEND_HELD");

  const teardown = await stopProcesses(container);

  if (teardown.terminatedBackends !== 1) {
    throw new Error(
      `Teardown expected one in-container pg_terminate_backend success, found ${teardown.terminatedBackends}.`,
    );
  }

  assertScalar(
    container,
    `SELECT count(*)::text
FROM pg_stat_activity
WHERE application_name = '${held.applicationName}';`,
    "0",
    "teardown backend count",
  );
}

async function provePartyRace(container) {
  const first = startPsql(
    container,
    insertAcceptedPartySql(ids.partyA, "PARTY_FIRST_INSERTED"),
    { holdOpen: true },
  );
  await first.waitFor("PARTY_FIRST_INSERTED");

  const second = startPsql(
    container,
    insertAcceptedPartySql(ids.partyB, "PARTY_SECOND_COMMITTED", {
      commit: true,
    }),
  );

  await assertWaitsBehind(container, second, first, "party exclusion");
  first.release();

  const results = await Promise.all([first.result, second.result]);
  evaluateAcceptedRangeRace(...results);
  assertScalar(
    container,
    `SELECT count(*)::text
FROM public.lease_parties
WHERE organization_id = '${ids.organization}'::uuid
  AND person_id = '${ids.occupant}'::uuid
  AND party_role = 'authorized_occupant'
  AND evidence_state = 'accepted'
  AND lease_id = (
    SELECT id
    FROM public.leases
    WHERE organization_id = '${ids.organization}'::uuid
      AND unit_id = '${ids.relationshipUnit}'::uuid
  );`,
    "1",
    "accepted authorized-occupant party winner",
  );
}

async function proveParticipantRace(container) {
  assertScalar(
    container,
    `SELECT
  evidence_state
  || ':' || business_lifecycle
  || ':' || coalesce(actual_effective_range::text, 'NULL')
FROM public.lease_occupancies
WHERE organization_id = '${ids.organization}'::uuid
  AND unit_id = '${ids.relationshipUnit}'::uuid;`,
    "accepted:occupied:[2027-01-01,2028-01-01)",
    "accepted actual-occupancy containment fixture",
  );

  const first = startPsql(
    container,
    insertAcceptedParticipantSql(
      ids.participantA,
      ids.relationshipUnit,
      ids.partyA,
      "2027-03-01",
      "2027-09-30",
      "PARTICIPANT_FIRST_INSERTED",
    ),
    { holdOpen: true },
  );
  await first.waitFor("PARTICIPANT_FIRST_INSERTED");

  const second = startPsql(
    container,
    insertAcceptedParticipantSql(
      ids.participantB,
      ids.participantRaceUnit,
      ids.participantPartyB,
      "2027-09-30",
      "2027-11-30",
      "PARTICIPANT_SECOND_COMMITTED",
      { commit: true },
    ),
  );

  await assertWaitsBehind(
    container,
    second,
    first,
    "participant advisory/exclusion",
  );
  first.release();

  const results = await Promise.all([first.result, second.result]);
  evaluateAcceptedRangeRace(...results);
  assertScalar(
    container,
    `SELECT count(*)::text
FROM public.lease_occupancy_participants
JOIN public.lease_parties
  ON lease_parties.organization_id =
    lease_occupancy_participants.organization_id
  AND lease_parties.id =
    lease_occupancy_participants.lease_party_id
WHERE lease_occupancy_participants.organization_id =
    '${ids.organization}'::uuid
  AND lease_parties.person_id = '${ids.occupant}'::uuid
  AND lease_occupancy_participants.evidence_state = 'accepted';`,
    "1",
    "accepted cross-party/cross-Unit same-day participant winner",
  );
}

async function proveOccupancyRace(container) {
  const first = startPsql(
    container,
    insertAcceptedOccupancySql(
      ids.occupancyA,
      ids.occupancyLeaseA,
      "OCCUPANCY_FIRST_CREATED",
    ),
    { holdOpen: true },
  );
  await first.waitFor("OCCUPANCY_FIRST_CREATED");

  const second = startPsql(
    container,
    insertAcceptedOccupancySql(
      ids.occupancyB,
      ids.occupancyLeaseB,
      "OCCUPANCY_SECOND_COMMITTED",
      { commit: true },
    ),
  );

  await assertWaitsBehind(container, second, first, "same-Unit occupancy");
  first.release();

  const results = await Promise.all([first.result, second.result]);
  evaluateAcceptedRangeRace(...results);
  assertScalar(
    container,
    `SELECT count(*)::text
FROM public.lease_occupancies
WHERE organization_id = '${ids.organization}'::uuid
  AND unit_id = '${ids.occupancyRaceUnit}'::uuid
  AND evidence_state = 'accepted';`,
    "1",
    "accepted same-Unit occupancy winner",
  );
}

async function proveLeaseImportDoubleCommit(container) {
  const firstCommit = startPsql(
    container,
    leaseImportCommitSql(
      ids.importDoubleRun,
      "IMPORT_FIRST_COMMIT_HELD",
      { holdTransaction: true },
    ),
    { holdOpen: true },
  );
  await firstCommit.waitFor("IMPORT_FIRST_COMMIT_HELD");

  const secondCommit = startPsql(
    container,
    leaseImportCommitSql(
      ids.importDoubleRun,
      "IMPORT_SECOND_COMMIT_FINISHED",
    ),
  );
  await assertWaitsBehind(
    container,
    secondCommit,
    firstCommit,
    "Lease import duplicate commit",
  );
  firstCommit.release();

  const [firstResult, secondResult] = await Promise.all([
    firstCommit.result,
    secondCommit.result,
  ]);

  if (firstResult.code !== 0) {
    throw new Error(
      `Expected the first Lease import commit to succeed.\n${firstResult.output}`,
    );
  }
  if (
    secondResult.code === 0
    || !secondResult.output.match(/ERROR:\s+22023:/)
  ) {
    throw new Error(
      `Expected the second Lease import commit to fail with 22023.\n${secondResult.output}`,
    );
  }

  assertScalar(
    container,
    `SELECT runs.status || ':' || count(logs.id)::text
FROM public.import_runs AS runs
LEFT JOIN public.activity_logs AS logs
  ON logs.organization_id = runs.organization_id
  AND logs.entity_type = 'import'
  AND logs.entity_id = runs.id
  AND logs.action = 'generic_import_committed'
WHERE runs.id = '${ids.importDoubleRun}'::uuid
GROUP BY runs.status;`,
    "failed:1",
    "single terminal Lease import activity after duplicate commit",
  );
}

async function proveAtomicCommitFirstRestageRace(container) {
  const originalRunId = queryScalar(
    container,
    "SELECT id::text "
      + "FROM public.import_runs "
      + "WHERE organization_id = '" + ids.organization + "'::uuid "
      + "AND source_file_name = 'tb02-atomic-claim-race.csv';",
  );

  const commit = startPsql(
    container,
    leaseImportCommitSql(
      originalRunId,
      "ATOMIC_CLAIM_COMMIT_HELD",
      { holdTransaction: true },
    ),
    { holdOpen: true },
  );
  await commit.waitFor("ATOMIC_CLAIM_COMMIT_HELD");

  const restage = startPsql(
    container,
    atomicClaimRestageSql("ATOMIC_CLAIM_RESTAGE_FINISHED"),
  );
  await assertWaitsBehind(
    container,
    restage,
    commit,
    "atomic import claim restage behind commit",
  );

  commit.release();
  assertBothSucceeded(
    await Promise.all([commit.result, restage.result]),
    "atomic import claim restage versus commit",
  );

  assertScalar(
    container,
    "SELECT count(*)::text || ':' "
      + "|| bool_and(runs.id = '" + originalRunId + "'::uuid)::text || ':' "
      + "|| min(runs.status) || ':' "
      + "|| min(rows.row_status) || ':' "
      + "|| min(rows.normalized_data::text) "
      + "FROM public.import_runs AS runs "
      + "JOIN public.import_rows AS rows "
      + "ON rows.organization_id = runs.organization_id "
      + "AND rows.import_run_id = runs.id "
      + "WHERE runs.organization_id = '" + ids.organization + "'::uuid "
      + "AND runs.source_file_name = 'tb02-atomic-claim-race.csv';",
    "1:true:failed:failed:{}",
    "commit-first atomic claim keeps one immutable terminal snapshot",
  );
}

function atomicClaimRestageSql(marker) {
  return [
    "\\set ON_ERROR_STOP on",
    "\\set VERBOSITY verbose",
    "BEGIN;",
    "SELECT set_config('request.jwt.claim.sub', '" + ids.admin + "', true);",
    "SET LOCAL ROLE authenticated;",
    "SELECT public.stage_import_run_v1(",
    "  '" + ids.organization + "'::uuid,",
    "  'leases',",
    "  'tb02-atomic-claim-race.csv',",
    "  99::bigint,",
    "  'text/csv',",
    "  '[\"unit\"]'::jsonb,",
    "  '{\"unitId\":\"unit\"}'::jsonb,",
    "  '[{",
    "    \"source_row_number\": 2,",
    "    \"row_status\": \"warning\",",
    "    \"action_label\": \"Create changed snapshot\",",
    "    \"raw_data\": {\"unit\":\"atomic-race\"},",
    "    \"normalized_data\": {\"propertyId\":\"changed-reference\"},",
    "    \"issues\": [{\"level\":\"warning\",\"message\":\"changed snapshot\"}]",
    "  }]'::jsonb",
    ");",
    "\\echo " + marker,
    "COMMIT;",
    "",
  ].join("\n");
}

async function proveAtomicStageFirstCommitRace(container) {
  const originalRunId = queryScalar(
    container,
    "SELECT id::text "
      + "FROM public.import_runs "
      + "WHERE organization_id = '" + ids.organization + "'::uuid "
      + "AND source_file_name = 'tb02-atomic-stage-first.csv';",
  );

  const restage = startPsql(
    container,
    atomicStageFirstRestageSql("ATOMIC_STAGE_FIRST_HELD"),
    { holdOpen: true },
  );
  await restage.waitFor("ATOMIC_STAGE_FIRST_HELD");

  const commit = startPsql(
    container,
    leaseImportCommitSql(
      originalRunId,
      "ATOMIC_STAGE_FIRST_COMMIT_FINISHED",
    ),
  );
  await assertWaitsBehind(
    container,
    commit,
    restage,
    "atomic import old-run commit behind staged replacement",
  );

  restage.release();
  const [restageResult, commitResult] = await Promise.all([
    restage.result,
    commit.result,
  ]);
  if (restageResult.code !== 0) {
    throw new Error(
      "Expected atomic staged replacement to commit.\n" + restageResult.output,
    );
  }
  if (
    commitResult.code === 0
    || !commitResult.output.match(/ERROR:\s+23503:/)
  ) {
    throw new Error(
      "Expected old-run commit to fail safely after replacement.\n"
        + commitResult.output,
    );
  }

  assertScalar(
    container,
    "SELECT count(*)::text || ':' "
      + "|| bool_and(runs.id <> '" + originalRunId + "'::uuid)::text || ':' "
      + "|| min(runs.status) || ':' "
      + "|| min(runs.total_rows)::text || ':' "
      + "|| min(runs.ready_rows)::text || ':' "
      + "|| min(rows.row_status) || ':' "
      + "|| min(rows.normalized_data ->> 'propertyId') "
      + "FROM public.import_runs AS runs "
      + "JOIN public.import_rows AS rows "
      + "ON rows.organization_id = runs.organization_id "
      + "AND rows.import_run_id = runs.id "
      + "WHERE runs.organization_id = '" + ids.organization + "'::uuid "
      + "AND runs.source_file_name = 'tb02-atomic-stage-first.csv';",
    "1:true:staged:1:1:warning:stage-first-new",
    "stage-first claim keeps one complete replacement snapshot",
  );
}

function atomicStageFirstRestageSql(marker) {
  return [
    "\\set ON_ERROR_STOP on",
    "\\set VERBOSITY verbose",
    "BEGIN;",
    "SELECT set_config('request.jwt.claim.sub', '" + ids.admin + "', true);",
    "SET LOCAL ROLE authenticated;",
    "SELECT public.stage_import_run_v1(",
    "  '" + ids.organization + "'::uuid,",
    "  'leases',",
    "  'tb02-atomic-stage-first.csv',",
    "  77::bigint,",
    "  'text/csv',",
    "  '[\"unit\"]'::jsonb,",
    "  '{\"unitId\":\"unit\"}'::jsonb,",
    "  '[{",
    "    \"source_row_number\": 2,",
    "    \"row_status\": \"warning\",",
    "    \"action_label\": \"Create changed snapshot\",",
    "    \"raw_data\": {\"unit\":\"stage-first\"},",
    "    \"normalized_data\": {\"propertyId\":\"stage-first-new\"},",
    "    \"issues\": [{\"level\":\"warning\",\"message\":\"changed snapshot\"}]",
    "  }]'::jsonb",
    ");",
    "\\echo " + marker,
    "",
  ].join("\n");
}

function leaseImportCommitSql(
  importRunId,
  marker,
  { holdTransaction = false } = {},
) {
  return `\\set ON_ERROR_STOP on
\\set VERBOSITY verbose
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.commit_generic_import_run(
  '${importRunId}'::uuid,
  '${ids.organization}'::uuid
);
\\echo ${marker}
${holdTransaction ? "" : "COMMIT;"}
`;
}

function assertBothSucceeded(results, label) {
  const failed = results.find((result) => result.code !== 0);
  if (failed) {
    throw new Error(`${label} expected both sessions to succeed.\n${failed.output}`);
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
  'tb02-concurrency@example.test',
  extensions.crypt('tb02-concurrency', extensions.gen_salt('bf')),
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
  'TB-02 relationship concurrency',
  'tb02-relationship-concurrency'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES ('${ids.organization}'::uuid, '${ids.admin}'::uuid, 'admin');

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
) VALUES (
  '${ids.property}'::uuid,
  '${ids.organization}'::uuid,
  'TB-02 concurrency property',
  'TB02-CONCURRENCY',
  'apartment',
  'active'
);

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
) VALUES
(
  '${ids.relationshipUnit}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  'TB02-RELATIONSHIP',
  'vacant',
  1000,
  'USD'
),
(
  '${ids.occupancyRaceUnit}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  'TB02-OCCUPANCY-RACE',
  'vacant',
  1000,
  'USD'
),
(
  '${ids.participantRaceUnit}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  'TB02-PARTICIPANT-RACE',
  'vacant',
  1000,
  'USD'
);

INSERT INTO public.people(
  id, organization_id, display_name, party_type
) VALUES
(
  '${ids.tenantA}'::uuid,
  '${ids.organization}'::uuid,
  'TB-02 tenant A',
  'individual'
),
(
  '${ids.tenantB}'::uuid,
  '${ids.organization}'::uuid,
  'TB-02 tenant B',
  'individual'
),
(
  '${ids.occupant}'::uuid,
  '${ids.organization}'::uuid,
  'TB-02 authorized occupant',
  'individual'
);

INSERT INTO public.person_roles(organization_id, person_id, role)
VALUES
  ('${ids.organization}'::uuid, '${ids.tenantA}'::uuid, 'tenant'),
  ('${ids.organization}'::uuid, '${ids.tenantB}'::uuid, 'tenant');

SELECT set_config('request.jwt.claim.sub', '${ids.admin}', true);
SET LOCAL ROLE authenticated;
SELECT public.create_lease_with_relationships(
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.relationshipUnit}'::uuid,
  '${ids.tenantA}'::uuid,
  DATE '2027-01-01',
  DATE '2027-12-31',
  1000,
  'USD'::public.currency_code,
  5,
  'monthly',
  'upcoming',
  NULL,
  NULL,
  'active',
  $payload$
  {
    "primaryParty": {
      "personId": "${ids.tenantA}",
      "lifecycle": "effective",
      "recordSource": "operator_confirmed",
      "reason": "tb02_concurrency_fixture",
      "startedOn": {
        "date": "2027-01-01",
        "kind": "known",
        "confidence": "confirmed"
      },
      "endedOn": {
        "date": "2027-12-31",
        "kind": "known",
        "confidence": "confirmed"
      }
    },
    "occupancy": {
      "lifecycle": "occupied",
      "recordSource": "operator_confirmed",
      "reason": "tb02_concurrency_fixture",
      "scheduledMoveIn": {
        "date": "2027-01-01",
        "kind": "known",
        "confidence": "confirmed"
      },
      "scheduledMoveOut": {
        "date": "2027-12-31",
        "kind": "known",
        "confidence": "confirmed"
      },
      "actualMoveIn": {
        "date": "2027-01-01",
        "kind": "known",
        "confidence": "confirmed"
      },
      "actualMoveOut": {
        "date": "2027-12-31",
        "kind": "known",
        "confidence": "confirmed"
      }
    },
    "participants": []
  }
  $payload$::jsonb,
  'tb02-concurrency-fixture'
);
RESET ROLE;
SELECT set_config('app.people_leases_skip_sync', 'on', true);
INSERT INTO public.leases(
  id,
  organization_id,
  property_id,
  unit_id,
  tenant_name,
  primary_tenant_person_id,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
  status,
  created_by,
  updated_by
)
VALUES
(
  '${ids.occupancyLeaseA}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.occupancyRaceUnit}'::uuid,
  'TB-02 tenant A',
  '${ids.tenantA}'::uuid,
  DATE '2028-01-01',
  DATE '2028-12-31',
  1000,
  'USD',
  'draft',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
),
(
  '${ids.occupancyLeaseB}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.occupancyRaceUnit}'::uuid,
  'TB-02 tenant B',
  '${ids.tenantB}'::uuid,
  DATE '2028-01-01',
  DATE '2028-12-31',
  1000,
  'USD',
  'draft',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
),
(
  '${ids.participantLeaseB}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.property}'::uuid,
  '${ids.participantRaceUnit}'::uuid,
  'TB-02 tenant B',
  '${ids.tenantB}'::uuid,
  DATE '2027-01-01',
  DATE '2027-12-31',
  1000,
  'USD',
  'draft',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
);

SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v2',
  true
);

INSERT INTO public.lease_parties(
  id,
  organization_id,
  lease_id,
  person_id,
  party_role,
  is_primary,
  started_on,
  ended_on,
  evidence_state,
  business_lifecycle,
  record_source,
  started_on_kind,
  started_on_confidence,
  ended_on_kind,
  ended_on_confidence,
  evidence_recorded_by,
  evidence_reason,
  created_by,
  updated_by
)
VALUES (
  '${ids.participantPartyB}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.participantLeaseB}'::uuid,
  '${ids.occupant}'::uuid,
  'authorized_occupant',
  false,
  DATE '2027-01-01',
  DATE '2027-12-31',
  'accepted',
  'effective',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  '${ids.admin}'::uuid,
  'tb02_participant_cross_unit_fixture',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
);

INSERT INTO public.lease_occupancies(
  id,
  organization_id,
  lease_id,
  property_id,
  unit_id,
  status,
  scheduled_move_in_date,
  scheduled_move_out_date,
  evidence_state,
  business_lifecycle,
  record_source,
  scheduled_move_in_kind,
  scheduled_move_in_confidence,
  scheduled_move_out_kind,
  scheduled_move_out_confidence,
  actual_move_in_kind,
  actual_move_in_confidence,
  actual_move_out_kind,
  actual_move_out_confidence,
  notice_kind,
  notice_confidence,
  evidence_recorded_by,
  evidence_reason,
  created_by,
  updated_by
)
VALUES (
  '${ids.participantOccupancyB}'::uuid,
  '${ids.organization}'::uuid,
  '${ids.participantLeaseB}'::uuid,
  '${ids.property}'::uuid,
  '${ids.participantRaceUnit}'::uuid,
  'reserved',
  DATE '2027-01-01',
  DATE '2027-12-31',
  'accepted',
  'reserved',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  '${ids.admin}'::uuid,
  'tb02_participant_cross_unit_fixture',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
);

SELECT set_config(
  'app.atomic_import_write_context',
  jsonb_build_object(
    'operation', 'stage-v1',
    'organizationId', '${ids.organization}'::uuid,
    'sourceClaimHash',
      encode(extensions.digest('${ids.importDoubleRun}', 'sha256'), 'hex'),
    'runId', '${ids.importDoubleRun}'::uuid
  )::text,
  true
);

INSERT INTO public.import_runs(
  id, organization_id, import_type, status, source_file_name,
  total_rows, ready_rows, warning_rows, error_rows,
  source_claim_hash, snapshot_hash, created_by, updated_by
)
VALUES (
  '${ids.importDoubleRun}'::uuid,
  '${ids.organization}'::uuid,
  'leases',
  'staged',
  'tb02-concurrency-double.csv',
  1,
  1,
  0,
  0,
  encode(extensions.digest('${ids.importDoubleRun}', 'sha256'), 'hex'),
  encode(extensions.digest('snapshot:${ids.importDoubleRun}', 'sha256'), 'hex'),
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
);

INSERT INTO public.import_rows(
  id, import_run_id, organization_id, source_row_number, row_status,
  action_label, raw_data, normalized_data, issues, error_message
)
VALUES (
  '${ids.importDoubleRow}'::uuid,
  '${ids.importDoubleRun}'::uuid,
  '${ids.organization}'::uuid,
  1,
  'ready',
  'Create',
  '{"unit":"atomic-double"}',
  '{}',
  '[]',
  NULL
);

SELECT set_config('app.atomic_import_write_context', '', true);

SET LOCAL ROLE authenticated;
SELECT public.stage_import_run_v1(
  '${ids.organization}'::uuid,
  'leases',
  'tb02-atomic-claim-race.csv',
  42::bigint,
  'text/csv',
  '["unit"]'::jsonb,
  '{"unitId":"unit"}'::jsonb,
  '[{
    "source_row_number": 2,
    "row_status": "ready",
    "action_label": "Create",
    "raw_data": {"unit":"atomic-race"},
    "normalized_data": {},
    "issues": []
  }]'::jsonb
);

SELECT public.stage_import_run_v1(
  '${ids.organization}'::uuid,
  'leases',
  'tb02-atomic-stage-first.csv',
  55::bigint,
  'text/csv',
  '["unit"]'::jsonb,
  '{"unitId":"unit"}'::jsonb,
  '[{
    "source_row_number": 2,
    "row_status": "ready",
    "action_label": "Create",
    "raw_data": {"unit":"stage-first"},
    "normalized_data": {},
    "issues": []
  }]'::jsonb
);
RESET ROLE;
COMMIT;`,
  );
}

function insertAcceptedPartySql(id, marker, { commit = false } = {}) {
  return `\\set ON_ERROR_STOP on
\\set VERBOSITY verbose
BEGIN;
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v2',
  true
);
INSERT INTO public.lease_parties(
  id,
  organization_id,
  lease_id,
  person_id,
  party_role,
  is_primary,
  started_on,
  ended_on,
  evidence_state,
  business_lifecycle,
  record_source,
  started_on_kind,
  started_on_confidence,
  ended_on_kind,
  ended_on_confidence,
  evidence_recorded_by,
  evidence_reason,
  created_by,
  updated_by
)
SELECT
  '${id}'::uuid,
  '${ids.organization}'::uuid,
  leases.id,
  '${ids.occupant}'::uuid,
  'authorized_occupant',
  false,
  DATE '2027-02-01',
  DATE '2027-10-31',
  'accepted',
  'effective',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  '${ids.admin}'::uuid,
  'tb02_party_concurrency',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
FROM public.leases AS leases
WHERE leases.organization_id = '${ids.organization}'::uuid
  AND leases.unit_id = '${ids.relationshipUnit}'::uuid;
\\echo ${marker}
${commit ? "COMMIT;" : ""}
`;
}

function insertAcceptedParticipantSql(
  id,
  unitId,
  partyId,
  startedOn,
  endedOn,
  marker,
  { commit = false } = {},
) {
  return `\\set ON_ERROR_STOP on
\\set VERBOSITY verbose
BEGIN;
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v2',
  true
);
INSERT INTO public.lease_occupancy_participants(
  id,
  organization_id,
  lease_occupancy_id,
  lease_party_id,
  started_on,
  ended_on,
  evidence_state,
  business_lifecycle,
  record_source,
  started_on_kind,
  started_on_confidence,
  ended_on_kind,
  ended_on_confidence,
  evidence_recorded_by,
  evidence_reason,
  created_by,
  updated_by
)
SELECT
  '${id}'::uuid,
  '${ids.organization}'::uuid,
  occupancies.id,
  '${partyId}'::uuid,
  DATE '${startedOn}',
  DATE '${endedOn}',
  'accepted',
  'planned',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  '${ids.admin}'::uuid,
  'tb02_participant_concurrency',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
FROM public.lease_occupancies AS occupancies
WHERE occupancies.organization_id = '${ids.organization}'::uuid
  AND occupancies.unit_id = '${unitId}'::uuid;
\\echo ${marker}
${commit ? "COMMIT;" : ""}
`;
}

function insertAcceptedOccupancySql(
  id,
  leaseId,
  marker,
  { commit = false } = {},
) {
  return `\\set ON_ERROR_STOP on
\\set VERBOSITY verbose
BEGIN;
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v2',
  true
);
INSERT INTO public.lease_occupancies(
  id,
  organization_id,
  lease_id,
  property_id,
  unit_id,
  status,
  scheduled_move_in_date,
  scheduled_move_out_date,
  evidence_state,
  business_lifecycle,
  record_source,
  scheduled_move_in_kind,
  scheduled_move_in_confidence,
  scheduled_move_out_kind,
  scheduled_move_out_confidence,
  actual_move_in_kind,
  actual_move_in_confidence,
  actual_move_out_kind,
  actual_move_out_confidence,
  notice_kind,
  notice_confidence,
  evidence_recorded_by,
  evidence_reason,
  created_by,
  updated_by
)
SELECT
  '${id}'::uuid,
  '${ids.organization}'::uuid,
  leases.id,
  '${ids.property}'::uuid,
  '${ids.occupancyRaceUnit}'::uuid,
  'reserved',
  DATE '2028-01-01',
  DATE '2028-12-31',
  'accepted',
  'reserved',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  '${ids.admin}'::uuid,
  'tb02_occupancy_concurrency',
  '${ids.admin}'::uuid,
  '${ids.admin}'::uuid
FROM public.leases AS leases
WHERE leases.organization_id = '${ids.organization}'::uuid
  AND leases.id = '${leaseId}'::uuid;
\\echo ${marker}
${commit ? "COMMIT;" : ""}
`;
}

function startPsql(container, sql, { holdOpen = false } = {}) {
  const applicationName =
    `nestory-tb02-concurrency-${++processSequence}`;
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
      if (!holdOpen || released || completed) {
        throw new Error("Held psql process cannot be released.");
      }
      released = true;
      child.stdin.end("COMMIT;\n\\echo TRANSACTION_RELEASED\n");
    },
    finish(sql) {
      if (!holdOpen || released || completed) {
        throw new Error("Held psql process cannot be finished.");
      }
      released = true;
      child.stdin.end(sql);
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

async function assertWaitsBehind(
  container,
  contender,
  blocker,
  label,
) {
  const deadline = Date.now() + markerTimeoutMs;
  while (Date.now() < deadline) {
    if (contender.completed) {
      throw new Error(
        `${label} contender exited before reaching a lock wait.\n${contender.output}`,
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
    `Timed out waiting for the ${label} blocker.\n${contender.output}`,
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
DELETE FROM public.financial_month_locks
WHERE organization_id = '${ids.organization}'::uuid;
ALTER TABLE public.import_rows
  DISABLE TRIGGER zz_guard_atomic_import_row_write;
ALTER TABLE public.import_runs
  DISABLE TRIGGER zz_guard_atomic_import_run_write;
DELETE FROM public.organizations
WHERE id = '${ids.organization}'::uuid;
ALTER TABLE public.import_runs
  ENABLE TRIGGER zz_guard_atomic_import_run_write;
ALTER TABLE public.import_rows
  ENABLE TRIGGER zz_guard_atomic_import_row_write;
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
    RAISE EXCEPTION 'TB-02 concurrency fixtures remain after cleanup';
  END IF;
END;
$cleanup$;`,
  );
}

function assertScalar(container, sql, expected, label) {
  const actual = queryScalar(container, sql);
  if (actual !== expected) {
    throw new Error(`Expected ${label} ${expected}, found ${actual}.`);
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

function assertContainer(container) {
  const result = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Running}}", container],
    { encoding: "utf8", timeout: markerTimeoutMs },
  );
  if (
    result.error ||
    (result.status ?? 1) !== 0 ||
    result.stdout.trim() !== "true"
  ) {
    throw new Error(
      `Local Supabase database container ${container} is not running.`,
    );
  }
}

async function stopProcesses(container) {
  const running = [...startedProcesses];
  if (running.length === 0) {
    return { terminatedBackends: 0 };
  }

  const applicationNames = running
    .map(
      (processHandle) =>
        `'${processHandle.applicationName.replaceAll("'", "''")}'`,
    )
    .join(", ");

  let terminationError;
  let terminatedBackends = 0;
  try {
    terminatedBackends = Number.parseInt(
      queryScalar(
        container,
        `SELECT count(*)::text
FROM (
  SELECT pg_terminate_backend(activity.pid) AS terminated
FROM pg_stat_activity AS activity
WHERE activity.pid <> pg_backend_pid()
    AND activity.application_name IN (${applicationNames})
) AS termination
WHERE termination.terminated;`,
      ),
      10,
    );
    await waitForBackendsToExit(container, applicationNames);
  } catch (error) {
    terminationError = error;
  }

  for (const processHandle of running) {
    processHandle.kill();
  }

  try {
    await withTimeout(
      Promise.allSettled(
        running.map((processHandle) => processHandle.result),
      ),
      "Timed out waiting for terminated in-container psql backends.",
    );
  } catch (waitError) {
    for (const processHandle of running) {
      processHandle.kill();
    }
    try {
      await withTimeout(
        Promise.allSettled(
          running.map((processHandle) => processHandle.result),
        ),
        "Timed out waiting for local psql wrappers after fallback kill.",
      );
    } catch (fallbackError) {
      throw new AggregateError(
        [waitError, fallbackError],
        "In-container backend termination and fallback cleanup timed out.",
      );
    }
    throw waitError;
  }

  if (terminationError) {
    throw terminationError;
  }

  return { terminatedBackends };
}

async function waitForBackendsToExit(container, applicationNames) {
  const deadline = Date.now() + markerTimeoutMs;
  while (Date.now() < deadline) {
    const remaining = queryScalar(
      container,
      `SELECT count(*)::text
FROM pg_stat_activity AS activity
WHERE activity.application_name IN (${applicationNames});`,
    );
    if (remaining === "0") {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }

  throw new Error(
    "Timed out waiting for terminated in-container Postgres backends.",
  );
}

function withTimeout(promise, message) {
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(message)),
      markerTimeoutMs,
    );
  });

  return Promise.race([promise, deadline]).finally(() => {
    clearTimeout(timeout);
  });
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
