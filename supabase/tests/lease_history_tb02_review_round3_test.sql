BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

CREATE OR REPLACE FUNCTION pg_temp.capture_error(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_constraint text;
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RETURN 'NO_ERROR';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_constraint = CONSTRAINT_NAME,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN SQLSTATE || ':' || coalesce(
    NULLIF(v_constraint, ''),
    NULLIF(v_detail, ''),
    SQLERRM
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.probe_error(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_constraint text;
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'rollback successful probe' USING ERRCODE = 'Z0001';
EXCEPTION
  WHEN SQLSTATE 'Z0001' THEN
    RETURN 'NO_ERROR';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_constraint = CONSTRAINT_NAME,
      v_detail = PG_EXCEPTION_DETAIL;
    RETURN SQLSTATE || ':' || coalesce(
      NULLIF(v_constraint, ''),
      NULLIF(v_detail, ''),
      SQLERRM
    );
END;
$$;

CREATE TEMP TABLE lease_history_tb02_round3_state (
  exact_lease_id uuid,
  imported_lease_id uuid,
  imported_party_id uuid,
  imported_occupancy_id uuid
) ON COMMIT DROP;

INSERT INTO lease_history_tb02_round3_state DEFAULT VALUES;
GRANT ALL ON lease_history_tb02_round3_state TO authenticated;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'f4950000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round3@example.test',
  extensions.crypt('tb02-round3', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  'f4950000-0000-4000-8000-000000000001',
  'TB-02 review round 3',
  'tb02-review-round-3'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'f4950000-0000-4000-8000-000000000001',
  'f4950000-0000-4000-8000-000000000002',
  'admin'
);

INSERT INTO public.properties(
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
VALUES (
  'f4950000-0000-4000-8000-000000000003',
  'f4950000-0000-4000-8000-000000000001',
  'TB-02 round 3 property',
  'TB02-R3',
  'apartment',
  'active'
);

INSERT INTO public.units(
  id,
  organization_id,
  property_id,
  unit_number,
  status,
  current_rent_amount,
  current_rent_currency
)
SELECT
  (
    'f4950000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f4950000-0000-4000-8000-000000000001'::uuid,
  'f4950000-0000-4000-8000-000000000003'::uuid,
  'TB02-R3-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(10, 13) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type,
  created_at
)
VALUES
(
  'f4950000-0000-4000-8000-000000000020',
  'f4950000-0000-4000-8000-000000000001',
  'TB-02 duplicate tenant',
  'individual',
  now() - interval '1 day'
),
(
  'f4950000-0000-4000-8000-000000000021',
  'f4950000-0000-4000-8000-000000000001',
  'TB-02 duplicate tenant',
  'individual',
  now()
),
(
  'f4950000-0000-4000-8000-000000000022',
  'f4950000-0000-4000-8000-000000000001',
  'TB-02 unique legacy tenant',
  'individual',
  now()
),
(
  'f4950000-0000-4000-8000-000000000023',
  'f4950000-0000-4000-8000-000000000001',
  'TB-02 imported tenant',
  'individual',
  now()
);

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status,
  archived_at
)
SELECT
  'f4950000-0000-4000-8000-000000000001'::uuid,
  person_id,
  'tenant',
  'active',
  NULL
FROM unnest(ARRAY[
  'f4950000-0000-4000-8000-000000000020'::uuid,
  'f4950000-0000-4000-8000-000000000021'::uuid,
  'f4950000-0000-4000-8000-000000000022'::uuid,
  'f4950000-0000-4000-8000-000000000023'::uuid
]) AS person_id;

INSERT INTO public.import_runs(
  id,
  organization_id,
  import_type,
  status,
  source_file_name,
  total_rows,
  ready_rows
)
VALUES
(
  'f4950000-0000-4000-8000-000000000060',
  'f4950000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round3-referenced.csv',
  2,
  2
),
(
  'f4950000-0000-4000-8000-000000000062',
  'f4950000-0000-4000-8000-000000000001',
  'people',
  'staged',
  'tb02-round3-people.csv',
  0,
  0
),
(
  'f4950000-0000-4000-8000-000000000064',
  'f4950000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round3-unreferenced.csv',
  0,
  0
);

INSERT INTO public.import_rows(
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  normalized_data
)
VALUES
(
  'f4950000-0000-4000-8000-000000000061',
  'f4950000-0000-4000-8000-000000000060',
  'f4950000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{}'::jsonb
),
(
  'f4950000-0000-4000-8000-000000000063',
  'f4950000-0000-4000-8000-000000000060',
  'f4950000-0000-4000-8000-000000000001',
  2,
  'ready',
  'create',
  '{}'::jsonb
);

SELECT set_config(
  'request.jwt.claim.sub',
  'f4950000-0000-4000-8000-000000000002',
  true
);

SET LOCAL ROLE authenticated;

UPDATE lease_history_tb02_round3_state
SET exact_lease_id = public.create_lease_with_authoritative_term(
  'f4950000-0000-4000-8000-000000000001',
  'f4950000-0000-4000-8000-000000000003',
  'f4950000-0000-4000-8000-000000000010',
  'f4950000-0000-4000-8000-000000000021',
  DATE '2041-01-01',
  DATE '2041-12-31',
  1000,
  'USD',
  5,
  'monthly',
  'upcoming',
  NULL,
  NULL,
  'draft',
  'tb02-round3-exact-duplicate'
);

RESET ROLE;

SELECT is(
  (
    SELECT leases.primary_tenant_person_id
    FROM public.leases AS leases
    WHERE leases.id = (
      SELECT exact_lease_id
      FROM lease_history_tb02_round3_state
    )
  ),
  'f4950000-0000-4000-8000-000000000021'::uuid,
  'a supplied Person ID wins even when another active Tenant has the same name'
);

SELECT is(
  (
    SELECT parties.person_id
    FROM public.lease_parties AS parties
    WHERE parties.lease_id = (
      SELECT exact_lease_id
      FROM lease_history_tb02_round3_state
    )
      AND parties.party_role = 'primary_tenant'
  ),
  'f4950000-0000-4000-8000-000000000021'::uuid,
  'the primary Lease party uses the exact requested duplicate-name Person'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
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
        status
      )
      VALUES (
        'f4950000-0000-4000-8000-000000000040',
        'f4950000-0000-4000-8000-000000000001',
        'f4950000-0000-4000-8000-000000000003',
        'f4950000-0000-4000-8000-000000000011',
        '  TB-02 unique legacy tenant  ',
        NULL,
        DATE '2042-01-01',
        DATE '2042-12-31',
        1000,
        'USD',
        'draft'
      )
    $sql$
  ),
  'NO_ERROR',
  'legacy display-name fallback remains available only when no Person ID is supplied'
);

SELECT is(
  (
    SELECT primary_tenant_person_id
    FROM public.leases
    WHERE id = 'f4950000-0000-4000-8000-000000000040'
  ),
  'f4950000-0000-4000-8000-000000000022'::uuid,
  'legacy display-name fallback resolves the exact existing active Tenant'
);

SET LOCAL ROLE authenticated;

WITH created AS (
  SELECT public.create_lease_with_relationships(
    'f4950000-0000-4000-8000-000000000001',
    'f4950000-0000-4000-8000-000000000003',
    'f4950000-0000-4000-8000-000000000012',
    'f4950000-0000-4000-8000-000000000023',
    DATE '2043-01-01',
    DATE '2043-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    '{
      "primaryParty": {
        "personId": "f4950000-0000-4000-8000-000000000023",
        "lifecycle": "planned",
        "recordSource": "operator_confirmed",
        "reason": "tb02_round3_provenance",
        "startedOn": {
          "date": null,
          "kind": "unknown",
          "confidence": "unknown"
        },
        "endedOn": {
          "date": null,
          "kind": "unknown",
          "confidence": "unknown"
        }
      },
      "occupancy": {
        "lifecycle": "reserved",
        "recordSource": "operator_confirmed",
        "reason": "tb02_round3_provenance",
        "scheduledMoveIn": {
          "date": null,
          "kind": "unknown",
          "confidence": "unknown"
        },
        "scheduledMoveOut": {
          "date": null,
          "kind": "unknown",
          "confidence": "unknown"
        },
        "actualMoveIn": {
          "date": null,
          "kind": "unknown",
          "confidence": "unknown"
        },
        "actualMoveOut": {
          "date": null,
          "kind": "unknown",
          "confidence": "unknown"
        }
      },
      "participants": []
    }'::jsonb,
    'tb02-round3-provenance'
  ) AS result
)
UPDATE lease_history_tb02_round3_state
SET
  imported_lease_id = (created.result ->> 'leaseId')::uuid,
  imported_party_id = (created.result ->> 'partyId')::uuid,
  imported_occupancy_id = (created.result ->> 'occupancyId')::uuid
FROM created;

RESET ROLE;

SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v2',
  true
);

UPDATE public.lease_parties
SET source_import_row_id =
  'f4950000-0000-4000-8000-000000000061'
WHERE id = (
  SELECT imported_party_id
  FROM lease_history_tb02_round3_state
);

UPDATE public.lease_occupancies
SET source_import_row_id =
  'f4950000-0000-4000-8000-000000000061'
WHERE id = (
  SELECT imported_occupancy_id
  FROM lease_history_tb02_round3_state
);

SELECT set_config(
  'app.lease_history_write_context',
  'off',
  true
);

ALTER TABLE public.import_rows DISABLE TRIGGER USER;
UPDATE public.import_rows
SET
  result_lease_id = (
    SELECT imported_lease_id FROM lease_history_tb02_round3_state
  ),
  result_lease_party_id = (
    SELECT imported_party_id FROM lease_history_tb02_round3_state
  ),
  result_lease_occupancy_id = (
    SELECT imported_occupancy_id FROM lease_history_tb02_round3_state
  )
WHERE id = 'f4950000-0000-4000-8000-000000000061';
ALTER TABLE public.import_rows ENABLE TRIGGER USER;

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_rows
      SET import_run_id =
        'f4950000-0000-4000-8000-000000000062'
      WHERE id = 'f4950000-0000-4000-8000-000000000061'
    $sql$
  ),
  '55000:lease_import_provenance_immutable',
  'a referenced import row cannot move to a non-Lease run'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_runs
      SET import_type = 'people'
      WHERE id = 'f4950000-0000-4000-8000-000000000060'
    $sql$
  ),
  '55000:lease_import_provenance_immutable',
  'a run containing a referenced Lease row cannot be retyped'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_rows
      SET import_run_id =
        'f4950000-0000-4000-8000-000000000062'
      WHERE id = 'f4950000-0000-4000-8000-000000000063'
    $sql$
  ),
  '55000:lease_import_provenance_immutable',
  'an unreferenced staged Lease row keeps immutable run identity'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_runs
      SET import_type = 'people'
      WHERE id = 'f4950000-0000-4000-8000-000000000064'
    $sql$
  ),
  '55000:lease_import_provenance_immutable',
  'an unreferenced staged Lease run keeps immutable import type'
);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_rows
      SET normalized_data = '{"reviewed":true}'::jsonb
      WHERE id = 'f4950000-0000-4000-8000-000000000063'
    $sql$
  ),
  '42501:lease_import_row_checked_operation_required',
  'authenticated direct Lease-row staging updates require a checked owner operation'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.import_rows'::regclass
      AND conname IN (
        'import_rows_result_lease_org_fk',
        'import_rows_result_lease_party_org_fk',
        'import_rows_result_lease_occupancy_org_fk'
      )
      AND confdeltype = 'a'
  ),
  3,
  'all Lease import-result references use durable NO ACTION deletion'
);

SELECT set_config('app.people_leases_skip_sync', 'on', true);

SELECT matches(
  pg_temp.probe_error(
    $sql$
      DELETE FROM public.lease_parties
      WHERE id = (
        SELECT imported_party_id
        FROM lease_history_tb02_round3_state
      )
    $sql$
  ),
  '^23503:import_rows_result_lease_party_org_fk$',
  'a referenced Lease party cannot be deleted from audit provenance'
);

SELECT matches(
  pg_temp.probe_error(
    $sql$
      DELETE FROM public.lease_occupancies
      WHERE id = (
        SELECT imported_occupancy_id
        FROM lease_history_tb02_round3_state
      )
    $sql$
  ),
  '^23503:import_rows_result_lease_occupancy_org_fk$',
  'a referenced Lease occupancy cannot be deleted from audit provenance'
);

SELECT matches(
  pg_temp.probe_error(
    $sql$
      DELETE FROM public.leases
      WHERE id = (
        SELECT imported_lease_id
        FROM lease_history_tb02_round3_state
      )
    $sql$
  ),
  '^23503:import_rows_result_lease_(org|party_org|occupancy_org)_fk$',
  'a referenced Lease composition cannot be deleted from audit provenance'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.import_rows AS rows
    JOIN public.import_runs AS runs
      ON runs.organization_id = rows.organization_id
      AND runs.id = rows.import_run_id
    WHERE rows.id = 'f4950000-0000-4000-8000-000000000061'
      AND runs.import_type = 'leases'
      AND rows.result_lease_id = (
        SELECT imported_lease_id
        FROM lease_history_tb02_round3_state
      )
  ),
  'the rejected mutations leave the referenced row in its Lease run'
);

SELECT * FROM finish();
ROLLBACK;
