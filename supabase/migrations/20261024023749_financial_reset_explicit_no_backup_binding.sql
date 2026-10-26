-- Explicit one-off, forward-only policy. No external archive is represented by
-- a fabricated digest. Internal exact images remain transaction/audit evidence.
-- This migration enrolls nobody, opens no workspace and executes no reset.
BEGIN;

CREATE FUNCTION app_private.assert_financial_reset_no_backup_binding(p_binding jsonb,p_action text) RETURNS void
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text; c jsonb:=p_binding->'continuation_semantic';
BEGIN
 IF p_binding IS NULL OR jsonb_typeof(p_binding) IS DISTINCT FROM 'object'
  OR p_action IS NULL OR p_action NOT IN ('freeze','checkpoint','prepare','seal','execute')
  OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_binding) key) IS DISTINCT FROM
   (SELECT array_agg(key ORDER BY key) FROM unnest(ARRAY['version','operation_id','project_ref','organization_id',
    'packet_sha256','main_sha','sources_sha256','schema_sha256','ledger_sha256','source_snapshot_sha256',
    'foreign_snapshot_sha256','source_generation','target_generation','cutoff','issue_date','timezone',
    'execution_business_date','invoice_date_policy','manifest_sha256','plan_sha256','archive_sha256','action_sha256',
    'archive_artifact_sha256','archive_count','action_count','zero_review_sha256','continuation_semantic_sha256',
    'report_review_sha256','continuation_semantic','recovery_policy']) key)
  OR p_binding->'version' IS DISTINCT FROM '2'::jsonb
  OR p_binding->>'recovery_policy' IS DISTINCT FROM 'no-backup-user-waived'
  OR p_binding->'archive_artifact_sha256' IS DISTINCT FROM 'null'::jsonb
  OR p_binding->>'organization_id' IS DISTINCT FROM '752a87b8-bd04-4a45-9cb8-00687af66e73'
  OR p_binding->>'project_ref' IS DISTINCT FROM 'pfvmztxktkwyewvxfgot'
  OR coalesce(p_binding->>'operation_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_binding->'main_sha') IS DISTINCT FROM 'string'
  OR coalesce(p_binding->>'main_sha','') !~ '^[a-f0-9]{40}$'
  OR jsonb_typeof(p_binding->'source_generation') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_binding->'target_generation') IS DISTINCT FROM 'number'
  OR coalesce(p_binding->>'source_generation','') !~ '^[0-9]{1,10}$'
  OR coalesce(p_binding->>'target_generation','') !~ '^[1-9][0-9]{0,9}$'
  OR jsonb_typeof(p_binding->'archive_count') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_binding->'action_count') IS DISTINCT FROM 'number'
  OR coalesce(p_binding->>'archive_count','') !~ '^[1-9][0-9]{0,9}$'
  OR coalesce(p_binding->>'action_count','') !~ '^[1-9][0-9]{0,9}$'
  OR p_binding->>'cutoff' IS DISTINCT FROM '2026-10-01'
  OR p_binding->>'issue_date' IS DISTINCT FROM '2026-10-01'
  OR p_binding->>'timezone' IS DISTINCT FROM 'Asia/Phnom_Penh'
  OR p_binding->>'invoice_date_policy' IS DISTINCT FROM 'original-reviewed-october'
  OR coalesce(p_binding->>'execution_business_date','') !~ '^2026-10-(0[1-9]|[12][0-9]|3[01])$'
  OR jsonb_typeof(c) IS DISTINCT FROM 'object'
  OR c->'version' IS DISTINCT FROM '3'::jsonb
  OR c->>'billing_period_start' IS DISTINCT FROM p_binding->>'cutoff'
  OR c->>'issue_date' IS DISTINCT FROM p_binding->>'issue_date'
  OR c->>'execution_business_date' IS DISTINCT FROM p_binding->>'execution_business_date'
  OR c->>'invoice_date_policy' IS DISTINCT FROM p_binding->>'invoice_date_policy'
  OR coalesce(c->>'actor_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(c->'leases') IS DISTINCT FROM 'array'
  OR jsonb_typeof(c->'original_invoice_sources') IS DISTINCT FROM 'array'
  OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key) IS DISTINCT FROM
   ARRAY['actor_id','billing_period_start','execution_business_date','invoice_date_policy','issue_date','leases','original_invoice_sources','version']::text[]
  OR app_private.financial_reset_hash(c) IS DISTINCT FROM p_binding->>'continuation_semantic_sha256' THEN
  RAISE EXCEPTION 'financial_reset_no_backup_binding_invalid' USING ERRCODE='22023';
 END IF;
 IF (p_binding->>'target_generation')::bigint > 2147483647
  OR (p_binding->>'target_generation')::bigint <> (p_binding->>'source_generation')::bigint+1
  OR (p_binding->>'archive_count')::bigint > 2147483647 OR (p_binding->>'action_count')::bigint > 2147483647
  OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=(p_binding->>'organization_id')::uuid
    AND operational_timezone=p_binding->>'timezone') THEN
  RAISE EXCEPTION 'financial_reset_no_backup_binding_invalid' USING ERRCODE='22023';
 END IF;
 FOREACH k IN ARRAY ARRAY['packet_sha256','sources_sha256','schema_sha256','ledger_sha256','source_snapshot_sha256',
  'foreign_snapshot_sha256','manifest_sha256','plan_sha256','archive_sha256','action_sha256','zero_review_sha256',
  'continuation_semantic_sha256','report_review_sha256'] LOOP
  IF jsonb_typeof(p_binding->k) IS DISTINCT FROM 'string' OR coalesce(p_binding->>k,'') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'financial_reset_no_backup_binding_invalid' USING ERRCODE='22023';
  END IF;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_financial_reset_no_backup_binding(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

-- Only the exact reviewed predecessors may gain this additional typed policy.
-- Existing genuine-session/permission/expiry checks and the separate reopening
-- branch remain intact. A no-backup binding never authorizes inverse actions.
DO $no_backup_actor$
DECLARE d text; b text; a text:=E' IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_binding-''recovery'') k) IS DISTINCT FROM\n';
BEGIN
 SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n'),replace(prosrc,E'\r\n',E'\n') INTO STRICT d,b
 FROM pg_proc WHERE oid='app_private.assert_financial_reset_actor_binding(jsonb,text)'::regprocedure;
 IF encode(extensions.digest(b,'sha256'),'hex')<>'e84d4e19f55c1c8d962058741a6927166254be963b42d589b169a6288ab252b3'
  OR (length(b)-length(replace(b,a,'')))/length(a)<>1 THEN
  RAISE EXCEPTION 'financial_reset_no_backup_actor_predecessor_changed';
 END IF;
 EXECUTE replace(d,b,replace(b,a,E' IF p_binding->''version''=''2''::jsonb THEN\n  PERFORM app_private.assert_financial_reset_no_backup_binding(p_binding,p_action);\n  RETURN;\n END IF;\n'||a));
END;
$no_backup_actor$;

DO $no_backup_reservation$
DECLARE d text; b text;
 validation_start text:=E' IF jsonb_typeof(p_binding)<>''object'' OR p_binding->>''version''<>''1'' OR p_binding ? ''recovery'' OR\n';
 validation_end text:=E' PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''financial_write_lifecycle_v1:''||v_org::text,0));\n';
 lock_anchor text:=E' PERFORM app_private.assert_financial_reset_hosted_actor_context(p_binding,''freeze'');\n';
 i integer; j integer; validation text;
BEGIN
 SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n'),replace(prosrc,E'\r\n',E'\n') INTO STRICT d,b
 FROM pg_proc WHERE oid='app_private.reserve_financial_reset_hosted_operation(jsonb)'::regprocedure;
 IF encode(extensions.digest(b,'sha256'),'hex')<>'2e991d4e7a104b6ddadb730202118d239b4ec126e123f7db14c0b1507d4aa45f'
  OR (length(b)-length(replace(b,validation_start,'')))/length(validation_start)<>1
  OR (length(b)-length(replace(b,validation_end,'')))/length(validation_end)<>1
  OR (length(b)-length(replace(b,lock_anchor,'')))/length(lock_anchor)<>1 THEN
  RAISE EXCEPTION 'financial_reset_no_backup_reservation_predecessor_changed';
 END IF;
 i:=strpos(b,validation_start); j:=strpos(b,validation_end); validation:=substr(b,i,j-i);
 b:=replace(b,validation,E' IF p_binding->''version''=''2''::jsonb THEN\n  PERFORM app_private.assert_financial_reset_no_backup_binding(p_binding,''freeze'');\n ELSE\n'||validation||E' END IF;\n');
 b:=replace(b,validation_end,validation_end||E' IF p_binding->''version''=''2''::jsonb AND\n  app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(v_org)) IS DISTINCT FROM p_binding->>''foreign_snapshot_sha256'' THEN\n  RAISE EXCEPTION ''financial_reset_hosted_foreign_changed'' USING ERRCODE=''40001'';\n END IF;\n');
 -- Preserve the original exact definition's signature, owner and ACL.
 EXECUTE replace(d,replace((SELECT prosrc FROM pg_proc WHERE oid='app_private.reserve_financial_reset_hosted_operation(jsonb)'::regprocedure),E'\r\n',E'\n'),b);
END;
$no_backup_reservation$;

COMMIT;
