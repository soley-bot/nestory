-- The lease row is identity and lifecycle. Lease terms own dates and rent.
DELETE FROM public.lease_terms AS term
WHERE term.authority_kind <> 'authoritative';

INSERT INTO public.lease_terms (
  organization_id,
  lease_id,
  term_sequence,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  status,
  authority_kind,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  lease.organization_id,
  lease.id,
  1,
  lease.lease_start_date,
  lease.lease_end_date,
  lease.monthly_rent_amount,
  lease.monthly_rent_currency,
  1,
  'monthly',
  CASE
    WHEN lease.status IN ('ended', 'terminated', 'cancelled') THEN 'expired'
    WHEN lease.lease_start_date > current_date THEN 'upcoming'
    ELSE 'active'
  END,
  'authoritative',
  now(),
  coalesce(lease.created_by, lease.updated_by),
  lease.created_by,
  lease.updated_by
FROM public.leases AS lease
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lease_terms AS term
  WHERE term.organization_id = lease.organization_id
    AND term.lease_id = lease.id
    AND term.authority_kind = 'authoritative'
    AND term.archived_at IS NULL
);

ALTER FUNCTION app_private.create_authoritative_lease_term_plan04(
  uuid, uuid, date, date, numeric, public.currency_code, integer, text, text,
  uuid, text
) RENAME TO create_authoritative_lease_term_internal;
ALTER FUNCTION app_private.create_lease_with_authoritative_term_plan04(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, integer,
  text, text, numeric, public.currency_code, text, text
) RENAME TO create_lease_with_authoritative_term_internal;
ALTER FUNCTION app_private.update_lease_with_authoritative_term_plan04(
  uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, text
) RENAME TO update_lease_with_authoritative_term_internal;

DO $migration$
DECLARE
  mapping record;
  routine record;
  definition text;
BEGIN
  FOR mapping IN
    SELECT *
    FROM (VALUES
      ('app_private.create_authoritative_lease_term_plan04', 'app_private.create_authoritative_lease_term_internal'),
      ('app_private.create_lease_with_authoritative_term_plan04', 'app_private.create_lease_with_authoritative_term_internal'),
      ('app_private.update_lease_with_authoritative_term_plan04', 'app_private.update_lease_with_authoritative_term_internal')
    ) AS names(old_name, new_name)
  LOOP
    FOR routine IN
      SELECT procedure.oid
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname IN ('public', 'app_private')
        AND procedure.prokind IN ('f', 'p')
        AND pg_get_functiondef(procedure.oid) LIKE '%' || mapping.old_name || '%'
    LOOP
      definition := pg_get_functiondef(routine.oid);
      definition := replace(definition, mapping.old_name, mapping.new_name);
      EXECUTE definition;
    END LOOP;
  END LOOP;
END;
$migration$;

CREATE FUNCTION app_private.create_lease_record_internal(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_lease_id uuid;
  v_tenant_name text;
BEGIN
  SELECT person.display_name
  INTO STRICT v_tenant_name
  FROM public.people AS person
  WHERE person.organization_id = p_organization_id
    AND person.id = p_primary_tenant_person_id
    AND person.archived_at IS NULL;

  INSERT INTO public.leases (
    organization_id,
    property_id,
    unit_id,
    tenant_name,
    primary_tenant_person_id,
    deposit_amount,
    deposit_currency,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    v_tenant_name,
    p_primary_tenant_person_id,
    p_deposit_amount,
    p_deposit_currency,
    lower(trim(p_status)),
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_lease_id;

  RETURN v_lease_id;
END;
$$;

CREATE FUNCTION app_private.update_lease_record_internal(
  p_lease_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_tenant_name text;
BEGIN
  SELECT person.display_name
  INTO STRICT v_tenant_name
  FROM public.people AS person
  WHERE person.organization_id = p_organization_id
    AND person.id = p_primary_tenant_person_id
    AND person.archived_at IS NULL;

  UPDATE public.leases
  SET property_id = p_property_id,
      unit_id = p_unit_id,
      tenant_name = v_tenant_name,
      primary_tenant_person_id = p_primary_tenant_person_id,
      deposit_amount = p_deposit_amount,
      deposit_currency = p_deposit_currency,
      status = lower(trim(p_status)),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_lease_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  RETURN p_lease_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_lease_record_internal(
  uuid, uuid, uuid, uuid, numeric, public.currency_code, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.update_lease_record_internal(
  uuid, uuid, uuid, uuid, uuid, numeric, public.currency_code, text
) FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE
  definition text;
  start_pos integer;
  end_pos integer;
BEGIN
  definition := pg_get_functiondef(
    'app_private.create_lease_with_authoritative_term_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(definition, 'v_legacy_term_id', 'v_superseded_term_id');
  start_pos := strpos(definition, E'  v_lease_id := public.create_lease(');
  end_pos := strpos(
    definition,
    E'  PERFORM set_config(''app.lease_creation_context'', ''off'', true);'
  );
  IF start_pos = 0 OR end_pos <= start_pos THEN
    RAISE EXCEPTION 'Could not replace lease-record creation';
  END IF;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || E'  v_lease_id := app_private.create_lease_record_internal(\n'
    || E'    p_organization_id, p_property_id, p_unit_id,\n'
    || E'    p_primary_tenant_person_id, p_deposit_amount,\n'
    || E'    p_deposit_currency, p_lease_status\n  );\n\n'
    || substring(definition FROM end_pos);
  start_pos := strpos(definition, E'  SELECT terms.id\n  INTO v_superseded_term_id');
  end_pos := strpos(
    definition,
    E'  PERFORM public.create_authoritative_lease_term('
  );
  IF start_pos = 0 OR end_pos <= start_pos THEN
    RAISE EXCEPTION 'Could not remove inferred term lookup';
  END IF;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || E'  v_superseded_term_id := NULL;\n\n'
    || substring(definition FROM end_pos);
  EXECUTE definition;

  definition := pg_get_functiondef(
    'app_private.update_lease_with_authoritative_term_internal(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  start_pos := strpos(definition, E'  PERFORM public.update_lease(');
  end_pos := strpos(
    substring(definition FROM start_pos),
    E'  PERFORM set_config(\n    ''app.lease_term_projection_context'',\n    ''off'',\n    true\n  );'
  );
  IF start_pos = 0 OR end_pos = 0 THEN
    RAISE EXCEPTION 'Could not replace lease-record update';
  END IF;
  end_pos := start_pos - 1 + end_pos;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || E'  PERFORM app_private.update_lease_record_internal(\n'
    || E'    p_lease_id, p_organization_id, p_property_id, p_unit_id,\n'
    || E'    p_primary_tenant_person_id, p_deposit_amount,\n'
    || E'    p_deposit_currency, p_lease_status\n  );\n\n'
    || substring(definition FROM end_pos);
  EXECUTE definition;

  definition := pg_get_functiondef(
    'app_private.create_authoritative_lease_term_internal(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  start_pos := strpos(
    definition,
    E'  IF current_date BETWEEN p_start_date AND p_end_date'
  );
  end_pos := strpos(
    definition,
    E'  INSERT INTO public.activity_logs ('
  );
  IF start_pos = 0 OR end_pos <= start_pos THEN
    RAISE EXCEPTION 'Could not remove lease projection update';
  END IF;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || substring(definition FROM end_pos);
  EXECUTE definition;
END;
$migration$;

DROP TRIGGER guard_authoritative_lease_projection ON public.leases;
DROP TRIGGER sync_leases_backbone_records ON public.leases;
DROP FUNCTION app_private.guard_authoritative_lease_projection();
DROP FUNCTION public.sync_lease_backbone_records();
DROP FUNCTION public.create_lease(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, numeric,
  public.currency_code, text
);
DROP FUNCTION public.update_lease(
  uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  numeric, public.currency_code, text
);

ALTER TABLE public.leases
  DROP COLUMN lease_start_date,
  DROP COLUMN lease_end_date,
  DROP COLUMN monthly_rent_amount,
  DROP COLUMN monthly_rent_currency;

CREATE VIEW public.current_leases
WITH (security_invoker = true)
AS
SELECT
  lease.id,
  lease.organization_id,
  lease.property_id,
  lease.unit_id,
  lease.tenant_name,
  lease.primary_tenant_person_id,
  term.start_date AS lease_start_date,
  term.end_date AS lease_end_date,
  term.rent_amount AS monthly_rent_amount,
  term.rent_currency AS monthly_rent_currency,
  lease.deposit_amount,
  lease.deposit_currency,
  lease.status,
  lease.created_at,
  lease.created_by,
  lease.updated_at,
  lease.updated_by,
  lease.archived_at,
  lease.archived_by,
  term.id AS lease_term_id
FROM public.leases AS lease
JOIN LATERAL (
  SELECT candidate.*
  FROM public.lease_terms AS candidate
  WHERE candidate.organization_id = lease.organization_id
    AND candidate.lease_id = lease.id
    AND candidate.authority_kind = 'authoritative'
    AND candidate.status NOT IN ('superseded')
    AND candidate.archived_at IS NULL
  ORDER BY
    CASE WHEN current_date BETWEEN candidate.start_date AND candidate.end_date
      THEN 0 ELSE 1 END,
    candidate.start_date DESC,
    candidate.term_sequence DESC
  LIMIT 1
) AS term ON true;

REVOKE ALL ON public.current_leases FROM PUBLIC, anon;
GRANT SELECT ON public.current_leases TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leases_with_effective_rent(
  p_organization_id uuid,
  p_effective_date date
)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  unit_id uuid,
  tenant_name text,
  primary_tenant_person_id uuid,
  lease_start_date date,
  lease_end_date date,
  monthly_rent_amount numeric,
  monthly_rent_currency public.currency_code,
  deposit_amount numeric,
  deposit_currency public.currency_code,
  status text,
  archived_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    lease.id,
    lease.property_id,
    lease.unit_id,
    lease.tenant_name,
    lease.primary_tenant_person_id,
    term.start_date,
    term.end_date,
    term.rent_amount,
    term.rent_currency,
    lease.deposit_amount,
    lease.deposit_currency,
    lease.status,
    lease.archived_at
  FROM public.leases AS lease
  JOIN LATERAL (
    SELECT candidate.*
    FROM public.lease_terms AS candidate
    WHERE candidate.organization_id = lease.organization_id
      AND candidate.lease_id = lease.id
      AND candidate.authority_kind = 'authoritative'
      AND candidate.status NOT IN ('superseded')
      AND candidate.archived_at IS NULL
    ORDER BY
      CASE WHEN p_effective_date BETWEEN candidate.start_date AND candidate.end_date
        THEN 0 ELSE 1 END,
      candidate.start_date DESC,
      candidate.term_sequence DESC
    LIMIT 1
  ) AS term ON true
  WHERE lease.organization_id = p_organization_id;
$$;

REVOKE ALL ON FUNCTION public.get_leases_with_effective_rent(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leases_with_effective_rent(uuid, date)
  TO authenticated;

DO $migration$
DECLARE
  routine_name text;
  routine_oid regprocedure;
  definition text;
BEGIN
  FOREACH routine_name IN ARRAY ARRAY[
    'app_private.generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)',
    'app_private.try_current_month_rent(uuid,uuid,text,timestamp with time zone)',
    'public.approve_rent_policy_version(uuid,uuid)',
    'public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)'
  ]
  LOOP
    routine_oid := routine_name::regprocedure;
    definition := pg_get_functiondef(routine_oid);
    definition := replace(definition, 'FROM public.leases AS lease', 'FROM public.current_leases AS lease');
    definition := replace(definition, 'FROM public.leases AS leases', 'FROM public.current_leases AS leases');
    EXECUTE definition;
  END LOOP;
END;
$migration$;
