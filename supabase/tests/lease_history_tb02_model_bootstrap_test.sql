BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(42);

SELECT has_column(
  'public', 'lease_parties', 'evidence_state',
  'Lease parties expose typed evidence state'
);
SELECT has_column(
  'public', 'lease_parties', 'business_lifecycle',
  'Lease parties expose business lifecycle separately'
);
SELECT has_column(
  'public', 'lease_parties', 'record_source',
  'Lease parties expose typed record source'
);
SELECT has_column(
  'public', 'lease_parties', 'started_on_kind',
  'Lease parties expose a start boundary kind'
);
SELECT has_column(
  'public', 'lease_parties', 'ended_on_kind',
  'Lease parties expose an end boundary kind'
);
SELECT has_column(
  'public', 'lease_parties', 'effective_range',
  'Lease parties expose a generated accepted-fact range'
);
SELECT has_column(
  'public', 'lease_parties', 'supersedes_lease_party_id',
  'Lease parties retain correction lineage'
);
SELECT has_column(
  'public', 'lease_parties', 'evidence_recorded_by',
  'Lease parties retain the evidence actor'
);

SELECT has_column(
  'public', 'lease_occupancies', 'evidence_state',
  'Lease occupancies expose typed evidence state'
);
SELECT has_column(
  'public', 'lease_occupancies', 'business_lifecycle',
  'Lease occupancies expose business lifecycle separately'
);
SELECT has_column(
  'public', 'lease_occupancies', 'record_source',
  'Lease occupancies expose typed record source'
);
SELECT has_column(
  'public', 'lease_occupancies', 'scheduled_move_in_kind',
  'Lease occupancies type scheduled move-in evidence'
);
SELECT has_column(
  'public', 'lease_occupancies', 'actual_move_in_kind',
  'Lease occupancies type actual move-in evidence'
);
SELECT has_column(
  'public', 'lease_occupancies', 'protected_occupancy_range',
  'Lease occupancies expose a generated accepted-fact range'
);
SELECT has_column(
  'public', 'lease_occupancies', 'supersedes_lease_occupancy_id',
  'Lease occupancies retain correction lineage'
);

SELECT has_table(
  'public', 'lease_occupancy_participants',
  'Person-level occupancy participation is normalized'
);
SELECT has_column(
  'public', 'lease_occupancy_participants', 'lease_occupancy_id',
  'Participants link the exact Lease occupancy'
);
SELECT has_column(
  'public', 'lease_occupancy_participants', 'lease_party_id',
  'Participants link the exact Lease party'
);
SELECT has_column(
  'public', 'lease_occupancy_participants', 'evidence_state',
  'Participants expose typed evidence state'
);
SELECT has_column(
  'public', 'lease_occupancy_participants', 'business_lifecycle',
  'Participants expose business lifecycle separately'
);
SELECT has_column(
  'public', 'lease_occupancy_participants', 'effective_range',
  'Participants expose a generated accepted-fact range'
);
SELECT has_column(
  'public', 'import_rows', 'result_lease_id',
  'Lease imports retain the exact created Lease ID'
);
SELECT has_column(
  'public', 'import_rows', 'result_lease_party_id',
  'Lease imports retain the exact created party ID'
);
SELECT has_column(
  'public', 'import_rows', 'result_lease_occupancy_id',
  'Lease imports retain the exact created occupancy ID'
);

SELECT table_privs_are(
  'public',
  'lease_occupancy_participants',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers have read-only participant privileges'
);
SELECT table_privs_are(
  'public',
  'lease_occupancy_participants',
  'service_role',
  ARRAY['SELECT'],
  'service role has read-only participant privileges'
);
SELECT table_privs_are(
  'public',
  'lease_occupancy_participants',
  'anon',
  ARRAY[]::text[],
  'anonymous callers have no participant privileges'
);
SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.lease_occupancy_participants'::regclass
  ),
  'participant RLS is enabled'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lease_occupancy_participants'
      AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[]
  ),
  1,
  'participant reads have one explicit authenticated policy'
);

SELECT has_function(
  'public',
  'create_lease_with_relationships',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric',
    'currency_code', 'integer', 'text', 'text', 'numeric',
    'currency_code', 'text', 'jsonb', 'text'
  ],
  'one checked new-Lease relationship composition exists'
);
SELECT function_privs_are(
  'public',
  'create_lease_with_relationships',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric',
    'currency_code', 'integer', 'text', 'text', 'numeric',
    'currency_code', 'text', 'jsonb', 'text'
  ],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated callers reach only the checked composition'
);
SELECT function_privs_are(
  'public',
  'create_lease_with_relationships',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric',
    'currency_code', 'integer', 'text', 'text', 'numeric',
    'currency_code', 'text', 'jsonb', 'text'
  ],
  'service_role',
  ARRAY[]::text[],
  'service role cannot execute checked Lease creation'
);
SELECT function_privs_are(
  'public',
  'create_lease_with_authoritative_term',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric',
    'currency_code', 'integer', 'text', 'text', 'numeric',
    'currency_code', 'text', 'text'
  ],
  'authenticated',
  ARRAY['EXECUTE'],
  'the Plan 04 create signature remains as a safe checked compatibility alias'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.lease_parties'::regclass
      AND contype = 'x'
      AND conname = 'lease_parties_primary_effective_range_excl'
  ),
  'accepted primary-party intervals have a database exclusion'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.lease_parties'::regclass
      AND contype = 'x'
      AND conname = 'lease_parties_person_role_effective_range_excl'
  ),
  'accepted Person-role intervals have a database exclusion'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.lease_occupancies'::regclass
      AND contype = 'x'
      AND conname = 'lease_occupancies_unit_protected_range_excl'
  ),
  'accepted scheduled or actual Unit intervals have a database exclusion'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.lease_occupancy_participants'::regclass
      AND contype = 'x'
      AND conname = 'lease_participants_party_effective_range_excl'
  ),
  'accepted participant intervals have a database exclusion'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.lease_parties
    WHERE evidence_state <> 'legacy_unresolved'
  ),
  'every pre-TB-02 Lease-party row starts legacy unresolved'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.lease_occupancies
    WHERE evidence_state <> 'legacy_unresolved'
  ),
  'every pre-TB-02 Lease-occupancy row starts legacy unresolved'
);
SELECT is(
  (SELECT count(*)::integer FROM public.lease_occupancy_participants),
  0,
  'legacy party and occupancy overlap does not invent participants'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.lease_parties
    WHERE evidence_state = 'legacy_unresolved'
      AND (
        (started_on IS NULL AND started_on_kind <> 'unknown')
        OR (started_on IS NOT NULL AND started_on_kind <> 'known')
        OR started_on_confidence <> 'unknown'
        OR ended_on_confidence <> 'unknown'
      )
  ),
  'legacy party boundary dates remain separate from unknown confidence'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.lease_occupancies
    WHERE evidence_state = 'legacy_unresolved'
      AND (
        actual_move_in_confidence <> 'unknown'
        OR actual_move_out_confidence <> 'unknown'
        OR scheduled_move_in_confidence <> 'unknown'
        OR scheduled_move_out_confidence <> 'unknown'
      )
  ),
  'legacy occupancy boundaries are never promoted by bootstrap'
);

SELECT * FROM finish();
ROLLBACK;
