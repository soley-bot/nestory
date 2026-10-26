BEGIN;
-- Transactional source version: a report assembled by several requests can
-- reject a result if a source write committed between its boundary reads.
-- This does not replace report reconciliation or immutable publication hashes.
CREATE TABLE app_private.financial_report_source_revisions (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision > 0),
  last_transaction_id bigint NOT NULL
);
ALTER TABLE app_private.financial_report_source_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_report_source_revisions FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.advance_financial_report_source_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_orgs uuid[];
BEGIN
  IF TG_TABLE_NAME='organizations' THEN
    -- Workspace names/logo/theme are used by report headers; this parent table
    -- uses id as its scope key rather than organization_id.
    IF TG_OP='DELETE' THEN v_orgs:=ARRAY[OLD.id];
    ELSIF TG_OP='UPDATE' THEN v_orgs:=ARRAY[OLD.id,NEW.id];
    ELSE v_orgs:=ARRAY[NEW.id]; END IF;
  ELSIF TG_OP='DELETE' THEN v_orgs:=ARRAY[OLD.organization_id];
  ELSIF TG_OP='UPDATE' THEN v_orgs:=ARRAY[OLD.organization_id,NEW.organization_id];
  ELSE v_orgs:=ARRAY[NEW.organization_id]; END IF;
  FOR v_org IN SELECT DISTINCT scope FROM unnest(v_orgs) scope ORDER BY scope LOOP
    -- A parent deletion can cascade through several registered source tables.
    -- There is no report authority left to version once that workspace is gone;
    -- recreating a revision here would violate its parent FK mid-cascade.
    IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org) THEN CONTINUE; END IF;
    INSERT INTO app_private.financial_report_source_revisions AS existing
      (organization_id,revision,last_transaction_id)
    VALUES(v_org,1,pg_catalog.txid_current())
    ON CONFLICT(organization_id) DO UPDATE
      SET revision=existing.revision+1,last_transaction_id=excluded.last_transaction_id
      WHERE existing.last_transaction_id<>excluded.last_transaction_id;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.advance_financial_report_source_revision() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE source record; v_count integer:=0;
BEGIN
  -- Reuse the reviewed lifecycle table manifest, including master data which
  -- changes attribution or labels. Private command journals are not report sources.
  FOR source IN
    SELECT c.oid::regclass AS relation FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND t.tgname='a_financial_write_fence' AND NOT t.tgisinternal
  LOOP
    EXECUTE format('CREATE TRIGGER financial_report_source_revision AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.advance_financial_report_source_revision()',source.relation);
    v_count:=v_count+1;
  END LOOP;
  IF v_count<70 THEN RAISE EXCEPTION 'financial_report_source_manifest_incomplete'; END IF;
END;
$$;

CREATE FUNCTION public.get_financial_report_context(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control jsonb; v_revision bigint;
BEGIN
  -- This existing reader checks the ordinary signed-in workspace membership.
  v_control:=public.get_financial_write_context(p_organization_id);
  SELECT revision INTO v_revision FROM app_private.financial_report_source_revisions WHERE organization_id=p_organization_id;
  RETURN jsonb_build_object('context',v_control,'source_revision',coalesce(v_revision,0)::text);
END;
$$;
REVOKE ALL ON FUNCTION public.get_financial_report_context(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_report_context(uuid) TO authenticated;
COMMIT;
