DO $migration$
DECLARE
  definition text;
BEGIN
  definition := pg_get_functiondef(
    'public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)'::regprocedure
  );

  definition := replace(
    definition,
    '  v_lease public.current_leases%ROWTYPE;',
    E'  v_lease public.current_leases%ROWTYPE;\n  v_lease_start_date date;\n  v_lease_end_date date;'
  );

  definition := replace(
    definition,
    E'  IF p_effective_from NOT BETWEEN v_lease.lease_start_date AND v_lease.lease_end_date THEN',
    E'  SELECT min(terms.start_date), max(terms.end_date)\n'
      || E'  INTO v_lease_start_date, v_lease_end_date\n'
      || E'  FROM public.lease_terms AS terms\n'
      || E'  WHERE terms.organization_id = p_organization_id\n'
      || E'    AND terms.lease_id = p_lease_id\n'
      || E'    AND terms.authority_kind = ''authoritative''\n'
      || E'    AND terms.status <> ''superseded''\n'
      || E'    AND terms.archived_at IS NULL;\n\n'
      || E'  IF v_lease_start_date IS NULL OR v_lease_end_date IS NULL THEN\n'
      || E'    RAISE EXCEPTION ''Lease term not found'' USING ERRCODE = ''23503'';\n'
      || E'  END IF;\n\n'
      || E'  IF NOT EXISTS (\n'
      || E'    SELECT 1\n'
      || E'    FROM public.lease_terms AS terms\n'
      || E'    WHERE terms.organization_id = p_organization_id\n'
      || E'      AND terms.lease_id = p_lease_id\n'
      || E'      AND terms.authority_kind = ''authoritative''\n'
      || E'      AND terms.status <> ''superseded''\n'
      || E'      AND terms.archived_at IS NULL\n'
      || E'      AND p_effective_from BETWEEN terms.start_date AND terms.end_date\n'
      || E'  ) THEN\n'
      || E'    RAISE EXCEPTION ''Billing effective date must fall within a Lease term''\n'
      || E'      USING ERRCODE = ''22023'';\n'
      || E'  END IF;\n\n'
      || E'  IF p_effective_from NOT BETWEEN v_lease_start_date AND v_lease_end_date THEN'
  );

  definition := replace(definition, 'v_lease.lease_start_date', 'v_lease_start_date');
  definition := replace(definition, 'v_lease.lease_end_date', 'v_lease_end_date');

  IF definition ILIKE '%v_lease.lease_start_date%'
    OR definition ILIKE '%v_lease.lease_end_date%' THEN
    RAISE EXCEPTION 'Could not align Lease billing with Lease terms';
  END IF;

  EXECUTE definition;
END;
$migration$;

DROP FUNCTION IF EXISTS public.generate_tenant_rent_invoice(
  uuid,
  uuid,
  date,
  date,
  text
);
