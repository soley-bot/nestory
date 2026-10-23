BEGIN;
-- The original organization counter serialized unrelated source writers. An
-- archive could hold that counter while a deposit receipt needed it, introducing
-- a lock dependency that the deposit/lifecycle commands deliberately avoid.
-- Preserve each existing counter as a weighted baseline, then append one entry
-- per organization/transaction. Distinct transactions never update the same row.
ALTER TABLE app_private.financial_report_source_revisions
  DROP CONSTRAINT financial_report_source_revisions_pkey,
  ADD PRIMARY KEY (organization_id,last_transaction_id);

COMMENT ON TABLE app_private.financial_report_source_revisions IS
  'Private append-once report revision entries per organization/transaction. Sum revision in one MVCC snapshot; existing pre-upgrade entries retain their counter weight. Do not prune entries without preserving the sum under a reviewed exclusive lifecycle fence.';

CREATE OR REPLACE FUNCTION app_private.advance_financial_report_source_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_orgs uuid[];
BEGIN
  IF TG_TABLE_NAME='organizations' THEN
    IF TG_OP='DELETE' THEN v_orgs:=ARRAY[OLD.id];
    ELSIF TG_OP='UPDATE' THEN v_orgs:=ARRAY[OLD.id,NEW.id];
    ELSE v_orgs:=ARRAY[NEW.id]; END IF;
  ELSIF TG_OP='DELETE' THEN v_orgs:=ARRAY[OLD.organization_id];
  ELSIF TG_OP='UPDATE' THEN v_orgs:=ARRAY[OLD.organization_id,NEW.organization_id];
  ELSE v_orgs:=ARRAY[NEW.organization_id]; END IF;
  FOR v_org IN SELECT DISTINCT scope FROM unnest(v_orgs) scope ORDER BY scope LOOP
    -- Do not recreate report authority during an organization deletion cascade.
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

CREATE OR REPLACE FUNCTION public.get_financial_report_context(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control jsonb; v_revision numeric;
BEGIN
  v_control:=public.get_financial_write_context(p_organization_id);
  -- STABLE keeps the lifecycle context and committed entry sum on the same
  -- statement snapshot. MVCC hides in-flight entries and removes aborted ones.
  -- Count every committed transaction, including an older txid that commits
  -- after a newer one. max(txid), sequences and timestamps cannot guarantee this.
  SELECT coalesce(sum(revision),0) INTO v_revision
    FROM app_private.financial_report_source_revisions WHERE organization_id=p_organization_id;
  RETURN jsonb_build_object('context',v_control,'source_revision',v_revision::text);
END;
$$;
REVOKE ALL ON FUNCTION public.get_financial_report_context(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_report_context(uuid) TO authenticated;
COMMIT;
