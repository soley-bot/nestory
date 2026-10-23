-- Retain immutable evidence but prevent an old generation from being served or
-- republished as current. No Storage objects or financial rows are deleted.
BEGIN;
CREATE FUNCTION app_private.financial_row_is_current(p_org uuid,p_generation integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.financial_write_controls%ROWTYPE;
BEGIN
  PERFORM app_private.assert_financial_lifecycle_isolation();
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('financial_write_lifecycle_v1:'||p_org::text,0));
  SELECT * INTO c FROM app_private.financial_write_controls WHERE organization_id=p_org;
  IF NOT FOUND THEN RETURN true; END IF;
  RETURN c.status='open' AND c.generation=p_generation;
END;
$$;
REVOKE ALL ON FUNCTION app_private.financial_row_is_current(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.financial_row_is_current(uuid,integer) TO authenticated;

CREATE FUNCTION app_private.guard_financial_generation_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_generation integer;
BEGIN
  IF TG_OP='DELETE' THEN v_org:=OLD.organization_id; ELSE v_org:=NEW.organization_id; END IF;
  PERFORM app_private.assert_financial_write_allowed(v_org);
  SELECT generation INTO v_generation FROM app_private.financial_write_controls WHERE organization_id=v_org;
  IF TG_OP='INSERT' THEN NEW.financial_generation:=coalesce(v_generation,0);
  ELSE
    IF v_generation IS NOT NULL AND OLD.financial_generation<>v_generation THEN
      RAISE EXCEPTION 'financial_intent_retired' USING ERRCODE='55000';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.financial_generation<>OLD.financial_generation OR NEW.organization_id<>OLD.organization_id) THEN
      RAISE EXCEPTION 'financial_intent_generation_immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_financial_generation_row() FROM PUBLIC,anon,authenticated,service_role;
DO $rows$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.tenant_invoices','public.tenant_invoice_payments','public.ips_cutover_batches','public.import_runs',
    'public.owner_close_revisions','public.owner_statement_publications','public.owner_statement_artifacts',
    'public.tenant_commercial_document_artifacts','app_private.tenant_commercial_document_upload_attestations',
    'app_private.tenant_commercial_document_cleanup_claims'] LOOP
    EXECUTE format('ALTER TABLE %s ADD COLUMN financial_generation integer NOT NULL DEFAULT 0 CHECK(financial_generation>=0)',t);
    EXECUTE format('CREATE TRIGGER a0_financial_generation BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_generation_row()',t);
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname='a_financial_write_fence') THEN
      EXECUTE format('CREATE TRIGGER a_financial_write_fence BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_write_row()',t);
    END IF;
  END LOOP;
END;
$rows$;

-- A new HTTP idempotency key must not revive a durable pre-reset batch/run.
-- Keep the old provenance, including committed import rows referenced by leases.
CREATE FUNCTION app_private.assert_financial_staged_intent_current(p_org uuid,p_kind text,p_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_generation integer;
BEGIN
  IF app_private.financial_scope_is_frozen(p_org) THEN
    RAISE EXCEPTION 'financial_writes_frozen' USING ERRCODE='55000';
  END IF;
  IF p_kind='cutover' THEN
    SELECT financial_generation INTO v_generation FROM public.ips_cutover_batches WHERE organization_id=p_org AND id=p_id;
  ELSIF p_kind='import' THEN
    SELECT financial_generation INTO v_generation FROM public.import_runs WHERE organization_id=p_org AND id=p_id;
  ELSE RAISE EXCEPTION 'financial_staged_intent_kind_invalid' USING ERRCODE='22023'; END IF;
  IF FOUND AND NOT app_private.financial_row_is_current(p_org,v_generation) THEN
    RAISE EXCEPTION 'financial_intent_retired' USING ERRCODE='55000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_financial_staged_intent_current(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.guard_financial_staged_intent_child() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old jsonb; v_new jsonb; v_key text; v_kind text;
BEGIN
  v_kind:=CASE WHEN TG_TABLE_NAME='import_rows' THEN 'import' ELSE 'cutover' END;
  v_key:=CASE WHEN v_kind='import' THEN 'import_run_id' ELSE 'batch_id' END;
  IF TG_OP<>'INSERT' THEN
    v_old:=to_jsonb(OLD);
    PERFORM app_private.assert_financial_staged_intent_current((v_old->>'organization_id')::uuid,v_kind,(v_old->>v_key)::uuid);
  END IF;
  IF TG_OP<>'DELETE' THEN
    v_new:=to_jsonb(NEW);
    PERFORM app_private.assert_financial_staged_intent_current((v_new->>'organization_id')::uuid,v_kind,(v_new->>v_key)::uuid);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_financial_staged_intent_child() FROM PUBLIC,anon,authenticated,service_role;
DO $staged$
DECLARE r record; t text; definition text; body text; invocation text; v_authorization text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_rows','ips_cutover_items','ips_cutover_reconciliations','ips_cutover_transitions'] LOOP
    EXECUTE format('CREATE TRIGGER a1_financial_staged_parent BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_staged_intent_child()',t);
  END LOOP;
  FOR r IN SELECT p.oid,p.proname,p.prosrc FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(ARRAY[
    'commit_ips_cutover_batch','abandon_ips_cutover_batch','get_ips_cutover_batch','get_ips_cutover_readiness',
    'commit_generic_import_run','commit_generic_import_run_internal','commit_unit_import_run']) LOOP
    invocation:=CASE WHEN r.proname LIKE '%ips_cutover%' THEN $$'cutover',p_batch_id$$ ELSE $$'import',p_import_run_id$$ END;
    -- RPC authorization precedes the parent lookup. The private row trigger also
    -- runs for genuine operator fixture/maintenance writes without a JWT; its
    -- existing table/domain guards remain the authorization boundary there.
    v_authorization:=CASE WHEN r.proname LIKE '%ips_cutover%' THEN
      'IF (SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION ''cutover_not_authorized'' USING ERRCODE=''42501''; END IF;'
    ELSE 'IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION ''Not authenticated'' USING ERRCODE=''28000''; END IF; IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION ''Not authorized'' USING ERRCODE=''42501''; END IF;' END;
    definition:=pg_get_functiondef(r.oid);
    body:=regexp_replace(r.prosrc,'\mBEGIN\M',E'BEGIN\n '||v_authorization||E'\n PERFORM app_private.assert_financial_staged_intent_current(p_organization_id,'||invocation||');','i');
    IF body=r.prosrc THEN RAISE EXCEPTION 'staged_intent_command_predecessor_changed'; END IF;
    EXECUTE replace(definition,r.prosrc,body);
  END LOOP;
  SELECT pg_get_functiondef(p.oid),p.prosrc INTO definition,body FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname='stage_import_run_v1';
  IF strpos(body,E'  IF FOUND THEN\n    SELECT')=0 THEN RAISE EXCEPTION 'stage_import_predecessor_changed'; END IF;
  EXECUTE replace(definition,body,replace(body,E'  IF FOUND THEN\n    SELECT',
    E'  IF FOUND THEN\n    PERFORM app_private.assert_financial_staged_intent_current(p_organization_id,''import'',v_run.id);\n    SELECT'));
END;
$staged$;

CREATE OR REPLACE FUNCTION app_private.tenant_commercial_document_property_id(p_organization_id uuid,p_source_kind text,p_source_id uuid)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE lower(btrim(p_source_kind))
  WHEN 'invoice' THEN (SELECT i.property_id FROM public.tenant_invoices i WHERE i.organization_id=p_organization_id AND i.id=p_source_id
    AND app_private.financial_row_is_current(i.organization_id,i.financial_generation))
  WHEN 'receipt' THEN (SELECT i.property_id FROM public.tenant_invoice_payments p JOIN public.tenant_invoices i
    ON i.organization_id=p.organization_id AND i.id=p.invoice_id WHERE p.organization_id=p_organization_id AND p.id=p_source_id
    AND app_private.financial_row_is_current(p.organization_id,p.financial_generation)
    AND app_private.financial_row_is_current(i.organization_id,i.financial_generation))
  WHEN 'artifact' THEN (SELECT app_private.tenant_commercial_document_property_id(a.organization_id,a.source_kind,a.source_id)
    FROM public.tenant_commercial_document_artifacts a WHERE a.organization_id=p_organization_id AND a.id=p_source_id
    AND app_private.financial_row_is_current(a.organization_id,a.financial_generation)) ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION app_private.owner_statement_property_id(p_organization_id uuid,p_target_kind text,p_target_id uuid)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE p_target_kind
 WHEN 'revision' THEN (SELECT r.property_id FROM public.owner_close_revisions r WHERE r.organization_id=p_organization_id AND r.id=p_target_id
   AND app_private.financial_row_is_current(r.organization_id,r.financial_generation))
 WHEN 'publication' THEN (SELECT r.property_id FROM public.owner_statement_publications p JOIN public.owner_close_revisions r
   ON r.organization_id=p.organization_id AND r.id=p.owner_close_revision_id WHERE p.organization_id=p_organization_id AND p.id=p_target_id
   AND app_private.financial_row_is_current(p.organization_id,p.financial_generation)
   AND app_private.financial_row_is_current(r.organization_id,r.financial_generation))
 WHEN 'artifact' THEN (SELECT app_private.owner_statement_property_id(a.organization_id,'publication',a.publication_id)
   FROM public.owner_statement_artifacts a WHERE a.organization_id=p_organization_id AND a.id=p_target_id
   AND app_private.financial_row_is_current(a.organization_id,a.financial_generation))
 WHEN 'series' THEN (SELECT s.property_id FROM public.owner_close_series s WHERE s.organization_id=p_organization_id AND s.id=p_target_id)
 ELSE NULL END;
$$;

DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['owner_statement_publications','owner_statement_artifacts','tenant_commercial_document_artifacts'] LOOP
    EXECUTE format('CREATE POLICY financial_artifact_current_generation ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (app_private.financial_row_is_current(organization_id,financial_generation))',t);
  END LOOP;
END;
$policies$;

-- These request/cleanup entry points can replay or call Storage before a row
-- write. Reject stale form context at entry as well as at the mutation boundary.
DO $commands$
DECLARE r record; definition text; body text;
BEGIN
 FOR r IN SELECT p.oid,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY['attest_tenant_commercial_document_upload',
   'register_tenant_commercial_document_artifact','mark_tenant_commercial_document_publication_failed',
   'begin_tenant_commercial_document_cleanup','finish_tenant_commercial_document_cleanup']) LOOP
   definition:=pg_get_functiondef(r.oid);
   body:=regexp_replace(r.prosrc,'\mBEGIN\M',E'BEGIN\n PERFORM app_private.assert_financial_write_allowed(p_organization_id);','i');
   IF body=r.prosrc THEN RAISE EXCEPTION 'artifact_command_predecessor_changed'; END IF;
   EXECUTE replace(definition,r.prosrc,body);
 END LOOP;
END;
$commands$;

DO $listing$
DECLARE definition text; anchor text;
BEGIN
 SELECT pg_get_functiondef('app_private.get_owner_statement_publications_for_series_baseline_branch106(uuid,uuid)'::regprocedure) INTO definition;
 anchor:='publication.organization_id = p_organization_id';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'artifact_listing_predecessor_changed'; END IF;
 EXECUTE replace(definition,anchor,anchor || ' AND app_private.financial_row_is_current(publication.organization_id,publication.financial_generation)');
END;
$listing$;

-- Storage upload/read policies and server-verified registrations use the actor
-- helper directly rather than the public property resolver.
DO $storage_authority$
DECLARE definition text; anchor text;
BEGIN
 SELECT pg_get_functiondef('app_private.can_access_owner_statement_publication_as_actor(uuid,uuid,uuid,public.organization_permission_key)'::regprocedure) INTO definition;
 anchor:='publication.organization_id=p_organization_id';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'artifact_actor_authority_predecessor_changed'; END IF;
 EXECUTE replace(definition,anchor,anchor || ' AND app_private.financial_row_is_current(publication.organization_id,publication.financial_generation) AND app_private.financial_row_is_current(revision.organization_id,revision.financial_generation)');
END;
$storage_authority$;
DO $tenant_artifact_reads$
DECLARE definition text; anchor text;
BEGIN
 SELECT pg_get_functiondef('app_private.is_tenant_commercial_document_registered(text,uuid,text)'::regprocedure) INTO definition;
 anchor:='artifact.publication_status=''published''';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'tenant_artifact_storage_predecessor_changed'; END IF;
 EXECUTE replace(definition,anchor,anchor || ' AND app_private.financial_row_is_current(artifact.organization_id,artifact.financial_generation)');
 SELECT pg_get_functiondef('app_private.get_tenant_commercial_document_publication_source_baseline_branch106(uuid,text,uuid)'::regprocedure) INTO definition;
 anchor:='WHERE existing_artifact.organization_id =';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'tenant_artifact_source_predecessor_changed'; END IF;
 EXECUTE replace(definition,anchor,'WHERE app_private.financial_row_is_current(existing_artifact.organization_id,existing_artifact.financial_generation) AND existing_artifact.organization_id =');
END;
$tenant_artifact_reads$;
COMMIT;
