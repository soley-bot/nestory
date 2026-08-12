CREATE TABLE public.ips_cutover_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  authority_start_date date NOT NULL,
  data_owner text NOT NULL,
  manifest jsonb NOT NULL,
  manifest_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'staged',
  blocker_count integer NOT NULL DEFAULT 0,
  staged_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  staged_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  reconciled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  abandoned_at timestamptz,
  abandoned_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  signoff_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ips_cutover_batches_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT ips_cutover_batches_manifest_unique UNIQUE (organization_id, manifest_sha256),
  CONSTRAINT ips_cutover_batches_manifest_hash_check CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ips_cutover_batches_owner_check CHECK (length(pg_catalog.btrim(data_owner)) BETWEEN 3 AND 200),
  CONSTRAINT ips_cutover_batches_status_check CHECK (status IN ('staged', 'blocked', 'reconciled', 'abandoned')),
  CONSTRAINT ips_cutover_batches_blocker_check CHECK (blocker_count >= 0),
  CONSTRAINT ips_cutover_batches_state_check CHECK (
    (status IN ('staged', 'blocked') AND reconciled_at IS NULL AND reconciled_by IS NULL AND abandoned_at IS NULL AND abandoned_by IS NULL)
    OR (status = 'reconciled' AND reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL AND abandoned_at IS NULL AND abandoned_by IS NULL AND length(pg_catalog.btrim(signoff_reason)) >= 8)
    OR (status = 'abandoned' AND abandoned_at IS NOT NULL AND abandoned_by IS NOT NULL AND reconciled_at IS NULL AND reconciled_by IS NULL AND length(pg_catalog.btrim(signoff_reason)) >= 8)
  )
);

CREATE TABLE public.ips_cutover_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  item_kind text NOT NULL,
  source_key text NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  validation_status text NOT NULL,
  issue_code text,
  issue_detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ips_cutover_items_batch_fkey FOREIGN KEY (organization_id, batch_id)
    REFERENCES public.ips_cutover_batches(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_cutover_items_batch_source_unique UNIQUE (batch_id, source_key),
  CONSTRAINT ips_cutover_items_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT ips_cutover_items_kind_check CHECK (item_kind IN ('import_run', 'tenant_opening_balance', 'owner_opening_component', 'signed_exception')),
  CONSTRAINT ips_cutover_items_source_check CHECK (length(pg_catalog.btrim(source_key)) BETWEEN 3 AND 200),
  CONSTRAINT ips_cutover_items_hash_check CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ips_cutover_items_validation_check CHECK (validation_status IN ('ready', 'blocked')),
  CONSTRAINT ips_cutover_items_issue_check CHECK (
    (validation_status = 'ready' AND issue_code IS NULL AND issue_detail IS NULL)
    OR (validation_status = 'blocked' AND length(pg_catalog.btrim(issue_code)) > 0 AND issue_detail IS NOT NULL)
  )
);

CREATE TABLE public.ips_cutover_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  expected_totals jsonb NOT NULL,
  actual_totals jsonb NOT NULL,
  differences jsonb NOT NULL,
  reconciliation_sha256 text NOT NULL,
  reconciled_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ips_cutover_reconciliations_batch_fkey FOREIGN KEY (organization_id, batch_id)
    REFERENCES public.ips_cutover_batches(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_cutover_reconciliations_batch_unique UNIQUE (batch_id),
  CONSTRAINT ips_cutover_reconciliations_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT ips_cutover_reconciliations_hash_check CHECK (reconciliation_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE public.ips_cutover_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ips_cutover_transitions_batch_fkey FOREIGN KEY (organization_id, batch_id)
    REFERENCES public.ips_cutover_batches(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_cutover_transitions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT ips_cutover_transitions_status_check CHECK (
    (from_status IS NULL OR from_status IN ('staged', 'blocked', 'reconciled', 'abandoned'))
    AND to_status IN ('staged', 'blocked', 'reconciled', 'abandoned')
  ),
  CONSTRAINT ips_cutover_transitions_reason_check CHECK (length(pg_catalog.btrim(reason)) >= 3)
);

CREATE INDEX ips_cutover_batches_worklist_idx
  ON public.ips_cutover_batches (organization_id, status, authority_start_date, id);
CREATE INDEX ips_cutover_items_batch_idx
  ON public.ips_cutover_items (organization_id, batch_id, item_kind, source_key);
CREATE INDEX ips_cutover_transitions_batch_idx
  ON public.ips_cutover_transitions (organization_id, batch_id, occurred_at, id);

ALTER TABLE public.ips_cutover_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ips_cutover_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ips_cutover_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ips_cutover_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ips_cutover_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ips_cutover_reconciliations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ips_cutover_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ips_cutover_transitions FORCE ROW LEVEL SECURITY;

CREATE POLICY ips_cutover_batches_admin_read ON public.ips_cutover_batches
  FOR SELECT TO authenticated USING ((SELECT app_private.is_org_admin(organization_id)));
CREATE POLICY ips_cutover_items_admin_read ON public.ips_cutover_items
  FOR SELECT TO authenticated USING ((SELECT app_private.is_org_admin(organization_id)));
CREATE POLICY ips_cutover_reconciliations_admin_read ON public.ips_cutover_reconciliations
  FOR SELECT TO authenticated USING ((SELECT app_private.is_org_admin(organization_id)));
CREATE POLICY ips_cutover_transitions_admin_read ON public.ips_cutover_transitions
  FOR SELECT TO authenticated USING ((SELECT app_private.is_org_admin(organization_id)));

REVOKE ALL ON TABLE public.ips_cutover_batches FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ips_cutover_items FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ips_cutover_reconciliations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ips_cutover_transitions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ips_cutover_batches TO authenticated;
GRANT SELECT ON TABLE public.ips_cutover_items TO authenticated;
GRANT SELECT ON TABLE public.ips_cutover_reconciliations TO authenticated;
GRANT SELECT ON TABLE public.ips_cutover_transitions TO authenticated;

CREATE OR REPLACE FUNCTION app_private.guard_ips_cutover_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF pg_catalog.current_setting('app.ips_cutover_checked_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'ips_cutover_authority_immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ips_cutover_authority_immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'ips_cutover_batches' THEN
    RAISE EXCEPTION 'ips_cutover_authority_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE TRIGGER guard_ips_cutover_batches
  BEFORE INSERT OR UPDATE OR DELETE ON public.ips_cutover_batches
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_ips_cutover_authority();
CREATE TRIGGER guard_ips_cutover_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.ips_cutover_items
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_ips_cutover_authority();
CREATE TRIGGER guard_ips_cutover_reconciliations
  BEFORE INSERT OR UPDATE OR DELETE ON public.ips_cutover_reconciliations
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_ips_cutover_authority();
CREATE TRIGGER guard_ips_cutover_transitions
  BEFORE INSERT OR UPDATE OR DELETE ON public.ips_cutover_transitions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_ips_cutover_authority();

CREATE OR REPLACE FUNCTION app_private.ips_cutover_sha256(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $function$
  SELECT encode(extensions.digest(pg_catalog.convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app_private.lock_ips_cutover_scope(p_organization_id uuid)
RETURNS void
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ips_cutover_v1:' || p_organization_id::text, 0)
  )
$function$;

CREATE OR REPLACE FUNCTION app_private.validate_ips_cutover_item(
  p_organization_id uuid,
  p_authority_start_date date,
  p_item_kind text,
  p_payload jsonb
)
RETURNS TABLE(validation_status text, issue_code text, issue_detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
  v_amount numeric(14,2);
  v_expected numeric(14,2);
  v_month text;
BEGIN
  IF p_item_kind = 'import_run' THEN
    IF coalesce(p_payload->>'sourceClaimHash', '') !~ '^[0-9a-f]{64}$'
      OR coalesce(p_payload->>'importType', '') NOT IN ('properties', 'units', 'people', 'leases')
      OR coalesce(p_payload->>'expectedCommittedRows', '') !~ '^[0-9]+$' THEN
      RETURN QUERY SELECT 'blocked', 'cutover_import_claim_invalid', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
    SELECT count(*)::integer INTO v_count
    FROM public.import_runs AS run
    WHERE run.organization_id = p_organization_id
      AND run.import_type = p_payload->>'importType'
      AND run.source_claim_hash = p_payload->>'sourceClaimHash'
      AND run.status IN ('committed', 'committed_with_errors')
      AND run.failed_count = 0
      AND run.created_count + run.updated_count = (p_payload->>'expectedCommittedRows')::integer;
    IF v_count <> 1 THEN
      RETURN QUERY SELECT 'blocked', 'cutover_import_run_not_reconciled', jsonb_build_object('matching_runs', v_count);
      RETURN;
    END IF;
  ELSIF p_item_kind = 'owner_opening_component' THEN
    IF coalesce(p_payload->>'amount', '') !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{2}$'
      OR coalesce(p_payload->>'sourceReference', '') = ''
      OR coalesce(p_payload->>'propertyCode', '') = ''
      OR coalesce(p_payload->>'currency', '') NOT IN ('USD', 'KHR')
      OR coalesce(p_payload->>'component', '') NOT IN ('ips_held_owner_cash', 'owner_due_to_ips', 'ips_due_to_owner', 'security_deposit_custody') THEN
      RETURN QUERY SELECT 'blocked', 'cutover_owner_opening_invalid', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
    v_expected := (p_payload->>'amount')::numeric(14,2);
    SELECT count(*)::integer, coalesce(sum(entry.signed_amount), 0)::numeric(14,2)
    INTO v_count, v_amount
    FROM public.owner_opening_balance_entries AS entry
    JOIN public.owner_opening_balance_requests AS request
      ON request.organization_id = entry.organization_id AND request.id = entry.request_id
    JOIN public.properties AS property
      ON property.organization_id = entry.organization_id AND property.id = entry.property_id
    WHERE entry.organization_id = p_organization_id
      AND property.code = p_payload->>'propertyCode'
      AND request.source_reference = p_payload->>'sourceReference'
      AND entry.component::text = p_payload->>'component'
      AND entry.currency::text = p_payload->>'currency'
      AND request.status = 'approved';
    IF v_count < 1 OR v_amount IS DISTINCT FROM v_expected THEN
      RETURN QUERY SELECT 'blocked', 'cutover_owner_opening_mismatch', jsonb_build_object('actual', to_char(v_amount, 'FM999999999990.00'), 'expected', p_payload->>'amount');
      RETURN;
    END IF;
  ELSIF p_item_kind = 'tenant_opening_balance' THEN
    IF coalesce(p_payload->>'expectedBalance', '') !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{2}$'
      OR coalesce(p_payload->>'propertyCode', '') = ''
      OR coalesce(p_payload->>'unitNumber', '') = ''
      OR coalesce(p_payload->>'currency', '') NOT IN ('USD', 'KHR')
      OR jsonb_typeof(p_payload->'selectedRentMonths') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_payload->'selectedRentMonths') < 1 THEN
      RETURN QUERY SELECT 'blocked', 'cutover_tenant_opening_invalid', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
    SELECT count(*)::integer INTO v_count
    FROM public.leases AS lease
    JOIN public.properties AS property ON property.organization_id = lease.organization_id AND property.id = lease.property_id
    JOIN public.units AS unit ON unit.organization_id = lease.organization_id AND unit.id = lease.unit_id
    WHERE lease.organization_id = p_organization_id
      AND property.code = p_payload->>'propertyCode'
      AND unit.unit_number = p_payload->>'unitNumber'
      AND lease.archived_at IS NULL;
    IF v_count <> 1 THEN
      RETURN QUERY SELECT 'blocked', 'cutover_tenant_relationship_ambiguous', jsonb_build_object('matching_leases', v_count);
      RETURN;
    END IF;
    FOR v_month IN SELECT jsonb_array_elements_text(p_payload->'selectedRentMonths') LOOP
      IF v_month !~ '^[0-9]{4}-[0-9]{2}-01$' OR v_month::date >= p_authority_start_date THEN
        RETURN QUERY SELECT 'blocked', 'cutover_rent_month_invalid', jsonb_build_object('month_start', v_month);
        RETURN;
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(p_payload->'selectedRentMonths')) AS month) <> jsonb_array_length(p_payload->'selectedRentMonths') THEN
      RETURN QUERY SELECT 'blocked', 'cutover_rent_month_duplicate', jsonb_build_object('months', p_payload->'selectedRentMonths');
      RETURN;
    END IF;
  ELSIF p_item_kind = 'signed_exception' THEN
    IF length(pg_catalog.btrim(coalesce(p_payload->>'reason', ''))) < 8
      OR length(pg_catalog.btrim(coalesce(p_payload->>'approvedBy', ''))) < 3
      OR coalesce(p_payload->>'approvedAt', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN
      RETURN QUERY SELECT 'blocked', 'cutover_exception_unsigned', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT 'blocked', 'cutover_item_kind_unsupported', jsonb_build_object('item_kind', p_item_kind);
    RETURN;
  END IF;
  RETURN QUERY SELECT 'ready', NULL::text, NULL::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_ips_cutover_batch(
  p_organization_id uuid,
  p_authority_start_date date,
  p_data_owner text,
  p_manifest jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_batch_id uuid;
  v_claim record;
  v_hash text;
  v_item jsonb;
  v_kind text;
  v_source_key text;
  v_validation record;
  v_blockers integer := 0;
  v_payload jsonb;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_authority_start_date IS NULL
    OR length(pg_catalog.btrim(coalesce(p_data_owner, ''))) < 3
    OR jsonb_typeof(p_manifest) IS DISTINCT FROM 'object'
    OR p_manifest->>'schemaVersion' IS DISTINCT FROM '1'
    OR p_manifest->>'authorityStartDate' IS DISTINCT FROM p_authority_start_date::text
    OR p_manifest->>'dataOwner' IS DISTINCT FROM pg_catalog.btrim(p_data_owner)
    OR jsonb_typeof(p_manifest->'importRuns') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_manifest->'tenantOpeningBalances') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_manifest->'ownerOpeningComponents') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_manifest->'signedExceptions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'cutover_manifest_invalid' USING ERRCODE = '22023';
  END IF;
  v_hash := app_private.ips_cutover_sha256(p_manifest);
  v_payload := jsonb_build_object('organization_id', p_organization_id, 'authority_start_date', p_authority_start_date, 'data_owner', pg_catalog.btrim(p_data_owner), 'manifest_sha256', v_hash);
  PERFORM app_private.lock_ips_cutover_scope(p_organization_id);
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(p_organization_id, 'stage_ips_cutover_batch', p_idempotency_key, v_actor_id, v_payload);
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  PERFORM pg_catalog.set_config('app.ips_cutover_checked_write', 'on', true);
  INSERT INTO public.ips_cutover_batches (organization_id, authority_start_date, data_owner, manifest, manifest_sha256, staged_by)
  VALUES (p_organization_id, p_authority_start_date, pg_catalog.btrim(p_data_owner), p_manifest, v_hash, v_actor_id)
  RETURNING id INTO v_batch_id;

  FOR v_kind, v_item IN
    SELECT 'import_run', value FROM jsonb_array_elements(p_manifest->'importRuns')
    UNION ALL SELECT 'tenant_opening_balance', value FROM jsonb_array_elements(p_manifest->'tenantOpeningBalances')
    UNION ALL SELECT 'owner_opening_component', value FROM jsonb_array_elements(p_manifest->'ownerOpeningComponents')
    UNION ALL SELECT 'signed_exception', value FROM jsonb_array_elements(p_manifest->'signedExceptions')
  LOOP
    v_source_key := pg_catalog.btrim(coalesce(v_item->>'sourceKey', ''));
    IF length(v_source_key) < 3 THEN RAISE EXCEPTION 'cutover_source_key_invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_validation FROM app_private.validate_ips_cutover_item(p_organization_id, p_authority_start_date, v_kind, v_item);
    INSERT INTO public.ips_cutover_items (organization_id, batch_id, item_kind, source_key, payload, payload_sha256, validation_status, issue_code, issue_detail)
    VALUES (p_organization_id, v_batch_id, v_kind, v_source_key, v_item, app_private.ips_cutover_sha256(v_item), v_validation.validation_status, v_validation.issue_code, v_validation.issue_detail);
    IF v_validation.validation_status = 'blocked' THEN v_blockers := v_blockers + 1; END IF;
  END LOOP;
  UPDATE public.ips_cutover_batches SET status = CASE WHEN v_blockers > 0 THEN 'blocked' ELSE 'staged' END, blocker_count = v_blockers WHERE id = v_batch_id;
  INSERT INTO public.ips_cutover_transitions (organization_id, batch_id, from_status, to_status, reason, actor_id)
  VALUES (p_organization_id, v_batch_id, NULL, CASE WHEN v_blockers > 0 THEN 'blocked' ELSE 'staged' END, 'Cutover manifest staged', v_actor_id);
  v_result := jsonb_build_object('batch_id', v_batch_id, 'manifest_sha256', v_hash, 'status', CASE WHEN v_blockers > 0 THEN 'blocked' ELSE 'staged' END, 'blocker_count', v_blockers);
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id, p_organization_id, v_actor_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ips_cutover_readiness(p_organization_id uuid, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor_id uuid := (SELECT auth.uid()); v_batch public.ips_cutover_batches%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM public.ips_cutover_batches WHERE organization_id = p_organization_id AND id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_batch_not_found' USING ERRCODE = '23503'; END IF;
  RETURN jsonb_build_object(
    'batch_id', v_batch.id,
    'status', v_batch.status,
    'is_ready', v_batch.status = 'staged' AND v_batch.blocker_count = 0,
    'blockers', coalesce((SELECT jsonb_agg(jsonb_build_object('source_key', source_key, 'issue_code', issue_code, 'issue_detail', issue_detail) ORDER BY source_key) FROM public.ips_cutover_items WHERE batch_id = v_batch.id AND validation_status = 'blocked'), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ips_cutover_batch(p_organization_id uuid, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor_id uuid := (SELECT auth.uid()); v_batch public.ips_cutover_batches%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM public.ips_cutover_batches WHERE organization_id = p_organization_id AND id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_batch_not_found' USING ERRCODE = '23503'; END IF;
  RETURN jsonb_build_object(
    'batch_id', v_batch.id, 'authority_start_date', v_batch.authority_start_date,
    'data_owner', v_batch.data_owner, 'manifest_sha256', v_batch.manifest_sha256,
    'status', v_batch.status, 'blocker_count', v_batch.blocker_count,
    'manifest', v_batch.manifest,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', item_kind, 'source_key', source_key, 'status', validation_status, 'issue_code', issue_code, 'payload', payload) ORDER BY item_kind, source_key) FROM public.ips_cutover_items WHERE batch_id = v_batch.id), '[]'::jsonb),
    'reconciliation', (SELECT jsonb_build_object('id', id, 'expected_totals', expected_totals, 'actual_totals', actual_totals, 'differences', differences, 'sha256', reconciliation_sha256) FROM public.ips_cutover_reconciliations WHERE batch_id = v_batch.id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_ips_cutover_batch(
  p_organization_id uuid,
  p_batch_id uuid,
  p_signoff_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_batch public.ips_cutover_batches%ROWTYPE;
  v_claim record;
  v_item record;
  v_month text;
  v_lease_id uuid;
  v_property_id uuid;
  v_currency public.currency_code;
  v_expected numeric(14,2);
  v_actual numeric(14,2);
  v_expected_totals jsonb := '{}'::jsonb;
  v_actual_totals jsonb := '{}'::jsonb;
  v_differences jsonb := '[]'::jsonb;
  v_reconciliation_id uuid;
  v_reconciliation_hash text;
  v_result jsonb;
  v_payload jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501'; END IF;
  IF length(pg_catalog.btrim(coalesce(p_signoff_reason, ''))) < 8 THEN RAISE EXCEPTION 'cutover_signoff_required' USING ERRCODE = '22023'; END IF;
  PERFORM app_private.lock_ips_cutover_scope(p_organization_id);
  v_payload := jsonb_build_object('batch_id', p_batch_id, 'signoff_reason', pg_catalog.btrim(p_signoff_reason));
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(p_organization_id, 'commit_ips_cutover_batch', p_idempotency_key, v_actor_id, v_payload);
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  SELECT * INTO v_batch FROM public.ips_cutover_batches WHERE organization_id = p_organization_id AND id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_batch_not_found' USING ERRCODE = '23503'; END IF;
  IF v_batch.status <> 'staged' OR v_batch.blocker_count <> 0 THEN RAISE EXCEPTION 'cutover_batch_not_ready' USING ERRCODE = '23514'; END IF;

  FOR v_item IN SELECT payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'tenant_opening_balance' ORDER BY source_key LOOP
    SELECT lease.id, lease.property_id, (v_item.payload->>'currency')::public.currency_code
    INTO STRICT v_lease_id, v_property_id, v_currency
    FROM public.leases AS lease
    JOIN public.properties AS property ON property.organization_id = lease.organization_id AND property.id = lease.property_id
    JOIN public.units AS unit ON unit.organization_id = lease.organization_id AND unit.id = lease.unit_id
    WHERE lease.organization_id = p_organization_id AND property.code = v_item.payload->>'propertyCode' AND unit.unit_number = v_item.payload->>'unitNumber' AND lease.archived_at IS NULL;
    FOR v_month IN SELECT jsonb_array_elements_text(v_item.payload->'selectedRentMonths') ORDER BY 1 LOOP
      PERFORM app_private.lock_open_property_financial_month(p_organization_id, v_property_id, v_currency, v_month::date);
    END LOOP;
  END LOOP;

  BEGIN
    FOR v_item IN SELECT source_key, payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'tenant_opening_balance' ORDER BY source_key LOOP
      SELECT lease.id, lease.property_id, (v_item.payload->>'currency')::public.currency_code
      INTO STRICT v_lease_id, v_property_id, v_currency
      FROM public.leases AS lease
      JOIN public.properties AS property ON property.organization_id = lease.organization_id AND property.id = lease.property_id
      JOIN public.units AS unit ON unit.organization_id = lease.organization_id AND unit.id = lease.unit_id
      WHERE lease.organization_id = p_organization_id AND property.code = v_item.payload->>'propertyCode' AND unit.unit_number = v_item.payload->>'unitNumber' AND lease.archived_at IS NULL
      FOR SHARE OF lease;
      FOR v_month IN SELECT jsonb_array_elements_text(v_item.payload->'selectedRentMonths') ORDER BY 1 LOOP
        PERFORM app_private.generate_lease_rent_invoice(p_organization_id, v_lease_id, v_month::date, v_month::date, 'manual_recovery', v_actor_id);
      END LOOP;
      v_expected := (v_item.payload->>'expectedBalance')::numeric(14,2);
      SELECT coalesce(sum(balance.balance_due), 0)::numeric(14,2) INTO v_actual
      FROM public.tenant_invoice_balances AS balance
      JOIN public.tenant_invoices AS invoice ON invoice.id = balance.id
      WHERE invoice.organization_id = p_organization_id AND invoice.lease_id = v_lease_id
        AND invoice.billing_period_start IN (SELECT value::date FROM jsonb_array_elements_text(v_item.payload->'selectedRentMonths'));
      v_expected_totals := v_expected_totals || jsonb_build_object(v_item.source_key, to_char(v_expected, 'FM999999999990.00'));
      v_actual_totals := v_actual_totals || jsonb_build_object(v_item.source_key, to_char(v_actual, 'FM999999999990.00'));
      IF v_actual IS DISTINCT FROM v_expected THEN v_differences := v_differences || jsonb_build_array(jsonb_build_object('source_key', v_item.source_key, 'expected', to_char(v_expected, 'FM999999999990.00'), 'actual', to_char(v_actual, 'FM999999999990.00'))); END IF;
    END LOOP;
    FOR v_item IN SELECT source_key, payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'owner_opening_component' ORDER BY source_key LOOP
      v_expected := (v_item.payload->>'amount')::numeric(14,2);
      SELECT coalesce(sum(entry.signed_amount), 0)::numeric(14,2) INTO v_actual
      FROM public.owner_opening_balance_entries AS entry
      JOIN public.owner_opening_balance_requests AS request ON request.organization_id = entry.organization_id AND request.id = entry.request_id
      JOIN public.properties AS property ON property.organization_id = entry.organization_id AND property.id = entry.property_id
      WHERE entry.organization_id = p_organization_id AND property.code = v_item.payload->>'propertyCode'
        AND request.source_reference = v_item.payload->>'sourceReference' AND entry.component::text = v_item.payload->>'component' AND entry.currency::text = v_item.payload->>'currency' AND request.status = 'approved';
      v_expected_totals := v_expected_totals || jsonb_build_object(v_item.source_key, to_char(v_expected, 'FM999999999990.00'));
      v_actual_totals := v_actual_totals || jsonb_build_object(v_item.source_key, to_char(v_actual, 'FM999999999990.00'));
      IF v_actual IS DISTINCT FROM v_expected THEN v_differences := v_differences || jsonb_build_array(jsonb_build_object('source_key', v_item.source_key, 'expected', to_char(v_expected, 'FM999999999990.00'), 'actual', to_char(v_actual, 'FM999999999990.00'))); END IF;
    END LOOP;
    IF jsonb_array_length(v_differences) > 0 THEN RAISE EXCEPTION 'cutover_reconciliation_mismatch' USING ERRCODE = '23514', DETAIL = v_differences::text; END IF;
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_catalog.set_config('app.ips_cutover_checked_write', 'on', true);
    UPDATE public.ips_cutover_batches SET status = 'blocked', blocker_count = 1 WHERE id = p_batch_id;
    INSERT INTO public.ips_cutover_transitions (organization_id, batch_id, from_status, to_status, reason, actor_id)
    VALUES (p_organization_id, p_batch_id, 'staged', 'blocked', 'Cutover reconciliation mismatch', v_actor_id);
    v_result := jsonb_build_object('batch_id', p_batch_id, 'status', 'blocked', 'blocker_count', 1);
    PERFORM app_private.complete_financial_idempotency(v_claim.request_id, p_organization_id, v_actor_id, v_result);
    RETURN v_result;
  END;

  v_reconciliation_hash := app_private.ips_cutover_sha256(jsonb_build_object('manifest_sha256', v_batch.manifest_sha256, 'expected_totals', v_expected_totals, 'actual_totals', v_actual_totals, 'differences', v_differences));
  PERFORM pg_catalog.set_config('app.ips_cutover_checked_write', 'on', true);
  INSERT INTO public.ips_cutover_reconciliations (organization_id, batch_id, expected_totals, actual_totals, differences, reconciliation_sha256, reconciled_by)
  VALUES (p_organization_id, p_batch_id, v_expected_totals, v_actual_totals, v_differences, v_reconciliation_hash, v_actor_id)
  RETURNING id INTO v_reconciliation_id;
  UPDATE public.ips_cutover_batches SET status = 'reconciled', reconciled_at = now(), reconciled_by = v_actor_id, signoff_reason = pg_catalog.btrim(p_signoff_reason) WHERE id = p_batch_id;
  INSERT INTO public.ips_cutover_transitions (organization_id, batch_id, from_status, to_status, reason, actor_id)
  VALUES (p_organization_id, p_batch_id, 'staged', 'reconciled', pg_catalog.btrim(p_signoff_reason), v_actor_id);
  v_result := jsonb_build_object('batch_id', p_batch_id, 'reconciliation_id', v_reconciliation_id, 'reconciliation_sha256', v_reconciliation_hash, 'status', 'reconciled');
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id, p_organization_id, v_actor_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.abandon_ips_cutover_batch(p_organization_id uuid, p_batch_id uuid, p_reason text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor_id uuid := (SELECT auth.uid()); v_batch public.ips_cutover_batches%ROWTYPE; v_claim record; v_result jsonb; v_payload jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501'; END IF;
  IF length(pg_catalog.btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'cutover_abandon_reason_required' USING ERRCODE = '22023'; END IF;
  PERFORM app_private.lock_ips_cutover_scope(p_organization_id);
  v_payload := jsonb_build_object('batch_id', p_batch_id, 'reason', pg_catalog.btrim(p_reason));
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(p_organization_id, 'abandon_ips_cutover_batch', p_idempotency_key, v_actor_id, v_payload);
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  SELECT * INTO v_batch FROM public.ips_cutover_batches WHERE organization_id = p_organization_id AND id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_batch_not_found' USING ERRCODE = '23503'; END IF;
  IF v_batch.status NOT IN ('staged', 'blocked') THEN RAISE EXCEPTION 'cutover_batch_irreversible' USING ERRCODE = '55000'; END IF;
  PERFORM pg_catalog.set_config('app.ips_cutover_checked_write', 'on', true);
  UPDATE public.ips_cutover_batches SET status = 'abandoned', abandoned_at = now(), abandoned_by = v_actor_id, signoff_reason = pg_catalog.btrim(p_reason) WHERE id = p_batch_id;
  INSERT INTO public.ips_cutover_transitions (organization_id, batch_id, from_status, to_status, reason, actor_id)
  VALUES (p_organization_id, p_batch_id, v_batch.status, 'abandoned', pg_catalog.btrim(p_reason), v_actor_id);
  v_result := jsonb_build_object('batch_id', p_batch_id, 'status', 'abandoned');
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id, p_organization_id, v_actor_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION app_private.guard_ips_cutover_authority() OWNER TO postgres;
ALTER FUNCTION app_private.ips_cutover_sha256(jsonb) OWNER TO postgres;
ALTER FUNCTION app_private.lock_ips_cutover_scope(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.validate_ips_cutover_item(uuid,date,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.stage_ips_cutover_batch(uuid,date,text,jsonb,text) OWNER TO postgres;
ALTER FUNCTION public.commit_ips_cutover_batch(uuid,uuid,text,text) OWNER TO postgres;
ALTER FUNCTION public.abandon_ips_cutover_batch(uuid,uuid,text,text) OWNER TO postgres;
ALTER FUNCTION public.get_ips_cutover_batch(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_ips_cutover_readiness(uuid,uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.guard_ips_cutover_authority() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ips_cutover_sha256(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_ips_cutover_scope(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.validate_ips_cutover_item(uuid,date,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stage_ips_cutover_batch(uuid,date,text,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_ips_cutover_batch(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.abandon_ips_cutover_batch(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_ips_cutover_batch(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_ips_cutover_readiness(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_ips_cutover_batch(uuid,date,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_ips_cutover_batch(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_ips_cutover_batch(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ips_cutover_batch(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ips_cutover_readiness(uuid,uuid) TO authenticated;
