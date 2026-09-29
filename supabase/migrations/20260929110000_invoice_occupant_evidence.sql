-- Snapshot accepted occupants once per person, not once per relationship row.
-- Only future generation changes: issued invoice snapshots are not rewritten.
DO $migration$
DECLARE
  target record;
  definition text;
  needle text;
  simple_needle text := $needle$  SELECT coalesce(
    pg_catalog.array_agg(
      person.display_name ORDER BY party.is_primary DESC, person.display_name
    ),
    ARRAY[v_lease.tenant_name]::text[]
  )
  INTO v_occupant_labels
  FROM public.lease_parties AS party
  JOIN public.people AS person
    ON person.organization_id = party.organization_id
    AND person.id = party.person_id
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
    AND party.party_role IN ('primary_tenant', 'co_tenant', 'authorized_occupant')
    AND (party.started_on IS NULL OR party.started_on <= v_period_end)
    AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
    AND person.archived_at IS NULL;$needle$;
  legacy_needle text := $needle$  SELECT coalesce(
    array_agg(
      people.display_name
      ORDER BY party.is_primary DESC, people.display_name
    ),
    ARRAY[v_lease.tenant_name]::text[]
  )
  INTO v_occupant_labels
  FROM public.lease_parties AS party
  JOIN public.people AS people
    ON people.organization_id = party.organization_id
   AND people.id = party.person_id
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
    AND party.party_role IN (
      'primary_tenant',
      'co_tenant',
      'authorized_occupant'
    )
    AND (party.started_on IS NULL OR party.started_on <= v_period_end)
    AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
    AND people.archived_at IS NULL;$needle$;
  replacement text := $replacement$  SELECT coalesce(
    pg_catalog.array_agg(
      occupant.display_name
      ORDER BY occupant.is_primary DESC, occupant.display_name, occupant.person_id
    ),
    ARRAY[v_lease.tenant_name]::text[]
  )
  INTO v_occupant_labels
  FROM (
    SELECT person.id AS person_id, person.display_name,
      pg_catalog.bool_or(party.is_primary) AS is_primary
    FROM public.lease_parties AS party
    JOIN public.people AS person
      ON person.organization_id = party.organization_id
      AND person.id = party.person_id
    WHERE party.organization_id = p_organization_id
      AND party.lease_id = p_lease_id
      AND party.archived_at IS NULL
      AND party.evidence_state = 'accepted'
      AND party.business_lifecycle IN ('planned', 'effective', 'ended')
      AND party.party_role IN ('primary_tenant', 'co_tenant', 'authorized_occupant')
      AND (party.started_on IS NULL OR party.started_on <= v_period_end)
      AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
      AND person.archived_at IS NULL
    GROUP BY person.id, person.display_name
  ) AS occupant;$replacement$;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)',
       '216e478b06579f4f8a6cf0e08807c879d67c158e4546158c384810e28e5408e8', false),
      ('app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid)',
       'b77cae2ac79b52e836cc8006cc8c42e17581486ba3d54b7a09bd8add7c1cc9ff', false),
      ('app_private.generate_lease_rent_invoice_after_financial_lock(uuid,uuid,date,date,text,uuid)',
       '5b5f8f270967b0431fe04c0076f0c3528cc5be12a1f839f3dce0179b93d15349', true)
    ) AS definitions(signature, expected_hash, legacy)
  LOOP
    definition := replace(pg_catalog.pg_get_functiondef(target.signature::regprocedure), chr(13), '');
    needle := CASE WHEN target.legacy THEN legacy_needle ELSE simple_needle END;
    IF encode(extensions.digest(definition, 'sha256'), 'hex') <> target.expected_hash
      OR array_length(string_to_array(definition, needle), 1) <> 2 THEN
      RAISE EXCEPTION 'invoice_occupant_prior_definition_mismatch: %', target.signature;
    END IF;
    EXECUTE replace(definition, needle, replacement);
  END LOOP;
END;
$migration$;
