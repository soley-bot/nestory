-- Both indexes predate the consolidated baseline. Refuse to remove either if
-- the hosted definition has diverged or the surviving access path is invalid.
DO $migration$
DECLARE
  v_keep oid := to_regclass('public.leases_org_primary_tenant_person_id_idx');
  v_duplicate oid := to_regclass('public.leases_primary_tenant_person_fk_idx');
  v_keep_shape jsonb;
  v_duplicate_shape jsonb;
BEGIN
  IF v_duplicate IS NULL THEN RETURN; END IF;
  IF v_keep IS NULL THEN RAISE EXCEPTION 'Duplicate lease index removal requires the surviving index'; END IF;
  SELECT jsonb_build_array(i.indrelid, c.relam, i.indnatts, i.indnkeyatts, i.indisunique, i.indisexclusion,
    i.indkey::text, i.indclass::text, i.indcollation::text, i.indoption::text,
    pg_get_expr(i.indexprs, i.indrelid), pg_get_expr(i.indpred, i.indrelid))
  INTO v_keep_shape FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE i.indexrelid = v_keep AND i.indrelid = 'public.leases'::regclass AND i.indisvalid AND i.indisready;
  SELECT jsonb_build_array(i.indrelid, c.relam, i.indnatts, i.indnkeyatts, i.indisunique, i.indisexclusion,
    i.indkey::text, i.indclass::text, i.indcollation::text, i.indoption::text,
    pg_get_expr(i.indexprs, i.indrelid), pg_get_expr(i.indpred, i.indrelid))
  INTO v_duplicate_shape FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indexrelid = v_duplicate;
  IF v_keep_shape IS NULL OR v_keep_shape IS DISTINCT FROM v_duplicate_shape THEN
    RAISE EXCEPTION 'Lease tenant indexes are not valid equivalent access paths';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = v_duplicate) THEN
    RAISE EXCEPTION 'Duplicate lease index supports a constraint';
  END IF;
  PERFORM set_config('lock_timeout', '5s', true);
  DROP INDEX public.leases_primary_tenant_person_fk_idx;
END;
$migration$;
