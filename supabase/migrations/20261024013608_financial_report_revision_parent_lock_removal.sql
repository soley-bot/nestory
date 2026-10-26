BEGIN;
-- A per-transaction revision INSERT must not take an organization KEY SHARE
-- lock: finance commands can already hold account/lease locks while another
-- command holds the organization row. Source rows have their own enforced
-- organization lifetime; validate that complete path before removing this
-- redundant FK. Keep the catalog assertion available for migration contracts.
CREATE FUNCTION app_private.assert_financial_report_source_lifetime() RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_unprotected text; v_count integer;
BEGIN
  WITH RECURSIVE lifetime_edges AS (
    SELECT fk.conrelid AS child_relation, child_scope.attnum AS child_scope,
      fk.confrelid AS parent_relation, parent_scope.attnum AS parent_scope
    FROM pg_catalog.pg_constraint fk
    JOIN pg_catalog.pg_attribute child_scope ON child_scope.attrelid=fk.conrelid
      AND child_scope.attname='organization_id' AND NOT child_scope.attisdropped
    JOIN pg_catalog.pg_attribute parent_scope ON parent_scope.attrelid=fk.confrelid
      AND parent_scope.attname=CASE WHEN fk.confrelid='public.organizations'::regclass THEN 'id' ELSE 'organization_id' END
      AND NOT parent_scope.attisdropped
    WHERE fk.contype='f' AND fk.convalidated AND NOT fk.condeferrable
      AND fk.confdeltype IN ('a','c','r') AND fk.confupdtype IN ('a','c','r')
      AND EXISTS (SELECT 1 FROM generate_subscripts(fk.conkey,1) AS position
        WHERE fk.conkey[position]=child_scope.attnum AND fk.confkey[position]=parent_scope.attnum)
      -- MATCH SIMPLE skips enforcement when any referencing value is NULL.
      AND NOT EXISTS (SELECT 1 FROM unnest(fk.conkey) AS key
        LEFT JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid=fk.conrelid AND attribute.attnum=key
        WHERE attribute.attnum IS NULL OR attribute.attisdropped OR NOT attribute.attnotnull)
      -- Require all four ordinary FK enforcement triggers, on both relations.
      -- Deferred paths could finish their wait after organization cleanup.
      AND (SELECT count(*) FROM pg_catalog.pg_trigger enforcement WHERE enforcement.tgconstraint=fk.oid AND enforcement.tgisinternal)=4
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger enforcement
        WHERE enforcement.tgconstraint=fk.oid AND enforcement.tgenabled NOT IN ('O','A'))
  ), protected_relations AS (
    SELECT organization.oid AS relation, id.attnum AS scope
    FROM pg_catalog.pg_class organization
    JOIN pg_catalog.pg_attribute id ON id.attrelid=organization.oid AND id.attname='id' AND id.attnotnull
    WHERE organization.oid='public.organizations'::regclass
    UNION
    SELECT edge.child_relation,edge.child_scope
    FROM lifetime_edges edge JOIN protected_relations parent
      ON parent.relation=edge.parent_relation AND parent.scope=edge.parent_scope
  ), sources AS (
    SELECT relation.oid, relation.oid::regclass::text AS name, fence.tgenabled AS fence_enabled,
      revision.tgfoid, revision.tgtype, revision.tgenabled,
      EXISTS(SELECT 1 FROM protected_relations protected WHERE protected.relation=relation.oid) AS protected
    FROM pg_catalog.pg_trigger fence
    JOIN pg_catalog.pg_class relation ON relation.oid=fence.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    LEFT JOIN pg_catalog.pg_trigger revision ON revision.tgrelid=relation.oid
      AND revision.tgname='financial_report_source_revision' AND NOT revision.tgisinternal
    WHERE namespace.nspname='public' AND fence.tgname='a_financial_write_fence' AND NOT fence.tgisinternal
  )
  SELECT count(*), string_agg(name,', ' ORDER BY name) FILTER (WHERE NOT protected
    OR fence_enabled NOT IN ('O','A') OR tgenabled IS NULL OR tgenabled NOT IN ('O','A')
    OR tgfoid<>'app_private.advance_financial_report_source_revision()'::regprocedure OR tgtype<>29)
  INTO v_count,v_unprotected FROM sources;
  IF v_count<70 OR v_unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'financial_report_source_lifetime_unproven: %',coalesce(v_unprotected,'source manifest incomplete') USING ERRCODE='23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_financial_report_source_lifetime() FROM PUBLIC, anon, authenticated, service_role;
SELECT app_private.assert_financial_report_source_lifetime();

ALTER TABLE app_private.financial_report_source_revisions
  DROP CONSTRAINT financial_report_source_revisions_organization_id_fkey;

CREATE OR REPLACE FUNCTION app_private.advance_financial_report_source_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_orgs uuid[];
BEGIN
  IF TG_TABLE_NAME='organizations' THEN
    IF TG_OP='DELETE' THEN
      -- Immediate source FKs have already completed cascades or rejected this
      -- deletion. Those cascades wait for source UPDATE/DELETE tuple locks;
      -- source INSERTs are protected by their existing FK checks. This VOLATILE
      -- trigger's DELETE sees entries committed by writers it had to wait for.
      DELETE FROM app_private.financial_report_source_revisions WHERE organization_id=OLD.id;
      RETURN OLD;
    ELSIF TG_OP='UPDATE' THEN
      -- Preserve the old FK's refusal to move an organization identity that
      -- already has revision authority, without taking that FK lock per entry.
      IF OLD.id IS DISTINCT FROM NEW.id AND EXISTS(
        SELECT 1 FROM app_private.financial_report_source_revisions WHERE organization_id=OLD.id) THEN
        RAISE EXCEPTION 'financial_report_organization_identity_immutable' USING ERRCODE='23503';
      END IF;
      v_orgs:=ARRAY[OLD.id,NEW.id];
    ELSE v_orgs:=ARRAY[NEW.id]; END IF;
  ELSIF TG_OP='DELETE' THEN v_orgs:=ARRAY[OLD.organization_id];
  ELSIF TG_OP='UPDATE' THEN v_orgs:=ARRAY[OLD.organization_id,NEW.organization_id];
  ELSE v_orgs:=ARRAY[NEW.organization_id]; END IF;
  FOR v_org IN SELECT DISTINCT scope FROM unnest(v_orgs) scope ORDER BY scope LOOP
    IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org) THEN CONTINUE; END IF;
    INSERT INTO app_private.financial_report_source_revisions
      (organization_id,revision,last_transaction_id)
    VALUES(v_org,1,pg_catalog.txid_current())
    ON CONFLICT(organization_id,last_transaction_id) DO NOTHING;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.advance_financial_report_source_revision() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
