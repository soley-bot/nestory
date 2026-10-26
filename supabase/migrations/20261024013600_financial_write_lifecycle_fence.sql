-- Inactive-by-default safeguards only. No organization is enrolled, frozen, reset,
-- or assigned a cutoff by this migration. Activation needs a separate reviewed artifact.
BEGIN;
CREATE TABLE app_private.financial_write_controls (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  generation integer NOT NULL CHECK (generation > 0),
  status text NOT NULL CHECK (status IN ('open', 'frozen')),
  financial_start_date date NOT NULL CHECK (isfinite(financial_start_date)),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app_private.financial_write_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_write_controls FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE app_private.financial_idempotency_requests
  ADD COLUMN financial_generation integer NOT NULL DEFAULT 0 CHECK (financial_generation >= 0);
ALTER TABLE app_private.deposit_rent_journal_intents
  ADD COLUMN financial_generation integer NOT NULL DEFAULT 0 CHECK (financial_generation >= 0);
ALTER TABLE app_private.deferred_owner_cash
  ADD COLUMN financial_generation integer NOT NULL DEFAULT 0 CHECK (financial_generation >= 0);

-- A transaction snapshot taken before enrollment can hide the new control even
-- after waiting for its advisory lock. Default PostgREST/cron READ COMMITTED is
-- the supported writer contract; reject fixed-snapshot writers before lookup.
CREATE FUNCTION app_private.assert_financial_lifecycle_isolation() RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'financial_write_requires_read_committed' USING ERRCODE='25000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_financial_lifecycle_isolation() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.guard_financial_write_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.assert_financial_lifecycle_isolation();
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'financial_control_removal_forbidden' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'financial_control_scope_immutable' USING ERRCODE='23514';
  END IF;
  -- Every guarded writer takes the shared counterpart, including before enrollment.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'financial_write_lifecycle_v1:' || NEW.organization_id::text, 0));
  IF TG_OP = 'INSERT' AND NEW.status <> 'frozen' THEN
    RAISE EXCEPTION 'financial_control_initial_freeze_required' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.generation < OLD.generation OR NEW.financial_start_date < OLD.financial_start_date THEN
      RAISE EXCEPTION 'financial_control_cannot_regress' USING ERRCODE='23514';
    END IF;
    IF (NEW.generation <> OLD.generation OR NEW.financial_start_date <> OLD.financial_start_date)
      AND (OLD.status <> 'frozen' OR NEW.status <> 'frozen' OR NEW.generation <= OLD.generation) THEN
      RAISE EXCEPTION 'financial_control_generation_change_requires_freeze' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_financial_write_control() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER financial_write_control_guard BEFORE INSERT OR UPDATE OR DELETE
ON app_private.financial_write_controls FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_write_control();

-- A private, transaction-local scheduler capability. A request header or an arbitrary
-- custom setting alone cannot impersonate a scheduled writer.
CREATE TABLE app_private.financial_scheduler_capability (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), token uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO app_private.financial_scheduler_capability(singleton) VALUES (true);
ALTER TABLE app_private.financial_scheduler_capability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_scheduler_capability FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.assert_financial_write_allowed(p_organization_id uuid, p_effective_date date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_control app_private.financial_write_controls%ROWTYPE;
  v_headers jsonb;
  v_generation text;
  v_scheduler boolean;
BEGIN
  PERFORM app_private.assert_financial_lifecycle_isolation();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'financial_write_scope_required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'financial_write_lifecycle_v1:' || p_organization_id::text, 0));
  SELECT * INTO v_control FROM app_private.financial_write_controls WHERE organization_id=p_organization_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_control.status <> 'open' THEN
    RAISE EXCEPTION 'financial_writes_frozen' USING ERRCODE='55000';
  END IF;
  SELECT coalesce(pg_catalog.current_setting('app.financial_scheduler_scope',true),'') =
    p_organization_id::text || ':' || capability.token::text INTO v_scheduler
  FROM app_private.financial_scheduler_capability capability WHERE singleton;
  IF NOT coalesce(v_scheduler,false) THEN
    BEGIN
      v_headers := coalesce(nullif(pg_catalog.current_setting('request.headers',true),''),'{}')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'financial_generation_required' USING ERRCODE='22023';
    END;
    v_generation := v_headers->>'x-nestory-financial-generation';
    IF v_generation IS NULL OR v_generation !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'financial_generation_required' USING ERRCODE='22023';
    END IF;
    IF v_generation <> v_control.generation::text THEN
      RAISE EXCEPTION 'financial_generation_stale' USING ERRCODE='40001';
    END IF;
  END IF;
  IF p_effective_date IS NOT NULL AND
    (NOT pg_catalog.isfinite(p_effective_date) OR p_effective_date < v_control.financial_start_date) THEN
    RAISE EXCEPTION 'financial_date_before_start' USING ERRCODE='22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_financial_write_allowed(uuid,date) FROM PUBLIC, anon, authenticated, service_role;

-- Master/configuration writers participate in the freeze without requiring a
-- financial intent header. This includes login membership bookkeeping.
CREATE FUNCTION app_private.guard_preserved_write_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_orgs uuid[];
BEGIN
  PERFORM app_private.assert_financial_lifecycle_isolation();
  IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='organizations' THEN
    IF TG_OP='DELETE' THEN v_orgs:=ARRAY[OLD.id];
    ELSIF TG_OP='UPDATE' THEN v_orgs:=ARRAY[OLD.id,NEW.id];
    ELSE v_orgs:=ARRAY[NEW.id]; END IF;
  ELSE
    IF TG_OP='DELETE' THEN v_orgs:=ARRAY[OLD.organization_id];
    ELSIF TG_OP='UPDATE' THEN v_orgs:=ARRAY[OLD.organization_id,NEW.organization_id];
    ELSE v_orgs:=ARRAY[NEW.organization_id]; END IF;
  END IF;
  FOR v_org IN SELECT DISTINCT org FROM unnest(v_orgs) org ORDER BY org LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
      'financial_write_lifecycle_v1:' || v_org::text,0));
    IF EXISTS(SELECT 1 FROM app_private.financial_write_controls
      WHERE organization_id=v_org AND status='frozen') THEN
      RAISE EXCEPTION 'financial_writes_frozen' USING ERRCODE='55000';
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_preserved_write_row() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.assert_financial_request_current(p_organization_id uuid,p_operation text,p_idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.assert_financial_write_allowed(p_organization_id);
  IF EXISTS (SELECT 1 FROM app_private.financial_idempotency_requests r
    JOIN app_private.financial_write_controls c ON c.organization_id=r.organization_id
    WHERE r.organization_id=p_organization_id AND r.operation=lower(btrim(p_operation))
      AND r.idempotency_key=btrim(p_idempotency_key) AND r.financial_generation<>c.generation) THEN
    RAISE EXCEPTION 'financial_intent_retired' USING ERRCODE='55000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_financial_request_current(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_financial_write_context(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control app_private.financial_write_controls%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=p_organization_id AND m.user_id=(SELECT auth.uid())
  ) THEN RAISE EXCEPTION 'financial_context_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_control FROM app_private.financial_write_controls WHERE organization_id=p_organization_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('generation',0,'status','open','financial_start_date',NULL,'enforced',false);
  END IF;
  RETURN jsonb_build_object('generation',v_control.generation,'status',v_control.status,
    'financial_start_date',v_control.financial_start_date,'enforced',true);
END;
$$;
REVOKE ALL ON FUNCTION public.get_financial_write_context(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_write_context(uuid) TO authenticated;

CREATE FUNCTION app_private.begin_financial_scheduled_scope(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_status text; v_token uuid;
BEGIN
  PERFORM app_private.assert_financial_lifecycle_isolation();
  -- Cron runs as a database operator, outside PostgREST. A service-role HTTP
  -- request must carry the same expected generation as other application writers.
  IF session_user NOT IN ('postgres','supabase_admin')
    OR coalesce(pg_catalog.current_setting('request.method',true),'') <> ''
    OR coalesce(pg_catalog.current_setting('role',true),'none') NOT IN ('none','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'financial_scheduler_context_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'financial_write_lifecycle_v1:' || p_organization_id::text,0));
  SELECT status INTO v_status FROM app_private.financial_write_controls WHERE organization_id=p_organization_id;
  IF v_status='frozen' THEN RETURN false; END IF;
  SELECT token INTO STRICT v_token FROM app_private.financial_scheduler_capability WHERE singleton;
  PERFORM pg_catalog.set_config('app.financial_scheduler_scope',p_organization_id::text || ':' || v_token::text,true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION app_private.begin_financial_scheduled_scope(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.financial_scope_is_frozen(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.assert_financial_lifecycle_isolation();
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'financial_write_lifecycle_v1:' || p_organization_id::text,0));
  RETURN EXISTS(SELECT 1 FROM app_private.financial_write_controls
    WHERE organization_id=p_organization_id AND status='frozen');
END;
$$;
REVOKE ALL ON FUNCTION app_private.financial_scope_is_frozen(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Explicit coverage, not a rewrite of every public function. These shared hooks
-- run before completed-result replay and before ordinary property/month locking.
DO $fence_helpers$
DECLARE v_signature regprocedure; v_definition text; v_body text; v_new text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'app_private.get_financial_idempotency_replay(uuid,text,text,uuid,jsonb)'::regprocedure,
    'app_private.claim_financial_idempotency(uuid,text,text,uuid,jsonb)'::regprocedure,
    'app_private.complete_financial_idempotency(uuid,uuid,uuid,jsonb)'::regprocedure,
    'app_private.lock_property_financial_month(uuid,uuid,public.currency_code,date)'::regprocedure
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_signature),prosrc INTO v_definition,v_body FROM pg_catalog.pg_proc WHERE oid=v_signature;
    v_new := pg_catalog.regexp_replace(v_body,'\mBEGIN\M',
      E'BEGIN\n  PERFORM app_private.' ||
      CASE WHEN v_signature IN ('app_private.get_financial_idempotency_replay(uuid,text,text,uuid,jsonb)'::regprocedure,
        'app_private.claim_financial_idempotency(uuid,text,text,uuid,jsonb)'::regprocedure)
        THEN 'assert_financial_request_current(p_organization_id,p_operation,p_idempotency_key)'
        WHEN v_signature='app_private.lock_property_financial_month(uuid,uuid,public.currency_code,date)'::regprocedure
        THEN 'assert_financial_write_allowed(p_organization_id,p_effective_date)'
        ELSE 'assert_financial_write_allowed(p_organization_id)' END || E';\n','i');
    IF v_new=v_body THEN RAISE EXCEPTION 'financial_fence_helper_predecessor_changed: %',v_signature; END IF;
    v_definition := replace(v_definition,v_body,v_new);
    IF v_signature='app_private.get_financial_idempotency_replay(uuid,text,text,uuid,jsonb)'::regprocedure THEN
      v_definition := replace(v_definition,' STABLE',' VOLATILE');
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$fence_helpers$;

-- Entry guards protect no-op/replay paths and mixed operational writes before
-- row mutations. All overloads of these exact names are deliberately covered.
DO $fence_commands$
DECLARE r record; v_definition text; v_new text;
BEGIN
  FOR r IN SELECT p.oid,p.proname,p.prosrc,p.proargnames FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE l.lanname='plpgsql'
      AND ('p_organization_id'=ANY(p.proargnames) OR 'p_org'=ANY(p.proargnames))
      AND ((n.nspname='app_private' AND p.proname='deposit_rent_command') OR
        (n.nspname='public' AND p.proname=ANY(ARRAY[
        'record_owner_contribution','record_owner_cash_event','correct_owner_distribution_date',
        'correct_owner_contribution','void_owner_contribution','correct_historical_rent',
        'update_maintenance_task','submit_maintenance_cost','process_due_lease_activations',
        'transition_lease_lifecycle','generate_lease_rent_invoice','generate_historical_rent_invoice',
        'submit_expense_transaction','post_expense_transaction','replace_expense_transaction',
        'review_expense_transaction','reverse_expense_transaction','cancel_expense_transaction','submit_expense',
        'submit_expense_with_accounts','record_tenant_invoice_payment','record_owner_invoice_payment',
        'record_tenant_invoice_payment_with_account','reverse_tenant_invoice_payment',
        'record_owner_collection_confirmation','record_lease_deposit','record_lease_deposit_event',
        'record_lease_deposit_event_idempotent','record_lease_deposit_event_with_account','reverse_lease_deposit_event',
        'create_lease_with_deposit_receipt',
        'create_lease_with_billing_rules','update_lease_with_billing_rules','save_lease_billing_rules',
        'recover_rent_generation_exception','generate_owner_balance_period','close_owner_month','reopen_owner_month',
        'publish_owner_statement','resume_owner_statement_publication','register_owner_statement_artifact_verified',
        'apply_deposit_to_rent','reverse_deposit_rent_application','confirm_deposit_rent_custody',
        'prepare_deposit_rent_journal','begin_deposit_rent_journal_attempt','execute_deposit_rent_journal',
        'register_paid_cost_evidence_verified','begin_paid_cost_evidence_cleanup','finish_paid_cost_evidence_cleanup',
        'stage_ips_cutover_batch','commit_ips_cutover_batch','abandon_ips_cutover_batch',
        'stage_import_run_v1','commit_generic_import_run','commit_generic_import_run_internal','commit_unit_import_run'
      ]))) ORDER BY p.oid
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(r.oid);
    v_new := pg_catalog.regexp_replace(r.prosrc,'\mBEGIN\M',
      E'BEGIN\n  PERFORM app_private.assert_financial_write_allowed(' ||
      CASE WHEN 'p_organization_id'=ANY(r.proargnames) THEN 'p_organization_id' ELSE 'p_org' END ||
      CASE WHEN r.proname='deposit_rent_command' THEN ',p_date' ELSE '' END || E');\n','i');
    IF v_new=r.prosrc THEN RAISE EXCEPTION 'financial_fence_command_predecessor_changed: %',r.proname; END IF;
    EXECUTE replace(v_definition,r.prosrc,v_new);
  END LOOP;
END;
$fence_commands$;

CREATE FUNCTION app_private.guard_financial_write_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row jsonb; v_old jsonb; v_org uuid; v_key text; v_date date;
BEGIN
  IF TG_OP='DELETE' THEN v_row:=to_jsonb(OLD); ELSE v_row:=to_jsonb(NEW); END IF;
  v_org := (v_row->>'organization_id')::uuid;
  PERFORM app_private.assert_financial_write_allowed(v_org);
  IF TG_TABLE_SCHEMA='app_private' AND TG_TABLE_NAME IN ('financial_idempotency_requests','deposit_rent_journal_intents','deferred_owner_cash') THEN
    IF TG_OP='INSERT' THEN
      NEW.financial_generation := coalesce((SELECT generation FROM app_private.financial_write_controls WHERE organization_id=v_org),0);
    ELSIF EXISTS (SELECT 1 FROM app_private.financial_write_controls c
      WHERE c.organization_id=v_org AND c.generation<>OLD.financial_generation) THEN
      RAISE EXCEPTION 'financial_intent_retired' USING ERRCODE='55000';
    ELSIF TG_OP='UPDATE' AND NEW.financial_generation<>OLD.financial_generation THEN
      RAISE EXCEPTION 'financial_intent_generation_immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    PERFORM app_private.assert_financial_write_allowed(OLD.organization_id);
  END IF;
  -- The declared date keys are financial effect dates only, never contract start
  -- dates or audit timestamps. Validate both sides of an edit, including periods.
  FOREACH v_key IN ARRAY coalesce(TG_ARGV,ARRAY[]::text[]) LOOP
    v_date := (v_row->>v_key)::date;
    IF v_date IS NOT NULL THEN PERFORM app_private.assert_financial_write_allowed(v_org,v_date); END IF;
    IF TG_OP='UPDATE' THEN
      v_old:=to_jsonb(OLD); v_date:=(v_old->>v_key)::date;
      IF v_date IS NOT NULL THEN PERFORM app_private.assert_financial_write_allowed(OLD.organization_id,v_date); END IF;
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_financial_write_row() FROM PUBLIC, anon, authenticated, service_role;

DO $fence_rows$
DECLARE v_table text; v_schema text; v_name text; v_dates text; v_args text; v_preserved boolean;
BEGIN
  -- All tables are named explicitly and must exist. Includes configuration/master
  -- records to keep the preservation fingerprint stable while frozen.
  FOREACH v_table IN ARRAY ARRAY[
    'public.properties','public.units','public.people','public.person_roles','public.property_owners',
    'public.organizations','public.organization_members','public.organization_branches','public.organization_teams',
    'public.organization_roles','public.organization_role_permissions','public.organization_authorization_states','public.organization_invitations',
    'public.leases','public.lease_terms','public.lease_billing_terms','public.lease_deposits','public.tasks',
    'public.lease_activation_schedules','public.maintenance_recurrence_series','public.maintenance_recurrence_revisions',
    'public.notification_outbox',
    'public.finance_accounts','public.finance_categories','public.financial_reconciliation_sources',
    'public.finance_account_roles','public.finance_account_source_links','public.finance_account_category_links',
    'public.rent_policy_versions','public.import_mappings',
    'public.import_runs','public.import_rows','public.rent_generation_exceptions',
    'public.ips_cutover_batches','public.ips_cutover_items','public.ips_cutover_reconciliations','public.ips_cutover_transitions',
    'public.finance_income_items','public.finance_expense_items','public.finance_receipts','public.finance_payments',
    'public.finance_receipt_allocations','public.finance_payment_allocations','public.ledger_entries',
    'public.tenant_invoices','public.tenant_invoice_lines','public.tenant_invoice_payments',
    'public.tenant_invoice_payment_allocations','public.tenant_invoice_rent_segments','public.tenant_invoice_corrections',
    'public.management_fee_occurrences','public.tenant_credit_occurrences',
    'public.owner_invoices','public.owner_invoice_lines','public.owner_payments','public.owner_payment_allocations',
    'public.owner_collection_confirmations','public.owner_collection_confirmation_allocations','public.owner_charge_cash_allocations',
    'public.owner_cash_events','public.property_withdrawals','public.owner_event_allocation_sets','public.owner_event_owner_allocations',
    'public.owner_component_movements','public.owner_cash_source_consumptions','public.owner_component_transfer_instructions',
    'public.owner_component_transfer_lines','public.owner_balance_periods','public.owner_balance_period_components',
    'public.owner_opening_balance_requests','public.owner_opening_balance_entries','public.owner_close_series',
    'public.owner_close_revisions','public.owner_close_lines','public.owner_close_line_sources','public.owner_close_corrections',
    'public.owner_statement_publications','public.owner_statement_artifacts','public.financial_month_locks',
    'public.expense_submissions','public.expense_transactions','public.expense_transaction_lines','public.expense_transaction_scopes',
    'public.expense_customer_adjustments','public.ips_expense_responsibilities','public.expense_legacy_replacements',
    'public.fee_payment_date_corrections','public.historical_rent_settlement_reapplications',
    'public.lease_deposit_events','public.deposit_rent_custody_confirmations','public.deposit_rent_applications',
    'public.deposit_rent_allocations','public.deposit_rent_owner_bridges',
    'public.petty_cash_entries','public.petty_cash_periods','public.petty_cash_accounts',
    'app_private.financial_idempotency_requests','app_private.deferred_owner_cash',
    'app_private.paid_cost_evidence_registrations','app_private.paid_cost_evidence_cleanup_claims',
    'app_private.deposit_rent_journal_intents','app_private.deposit_rent_journal_slots',
    'app_private.deposit_rent_custody_attestations','app_private.deposit_rent_application_attestations'
  ] LOOP
    v_schema:=split_part(v_table,'.',1); v_name:=split_part(v_table,'.',2);
    IF pg_catalog.to_regclass(v_table) IS NULL THEN RAISE EXCEPTION 'financial_fence_table_missing: %',v_table; END IF;
    v_args:='';
    v_preserved:=v_name=ANY(ARRAY['properties','units','people','person_roles','property_owners',
      'organizations','organization_members','organization_branches','organization_teams',
      'organization_roles','organization_role_permissions','organization_authorization_states','organization_invitations',
      'leases','lease_terms','lease_billing_terms',
      'lease_activation_schedules','tasks','maintenance_recurrence_series','maintenance_recurrence_revisions','notification_outbox',
      'finance_accounts','finance_categories','financial_reconciliation_sources','petty_cash_accounts',
      'finance_account_roles','finance_account_source_links','finance_account_category_links',
      'rent_policy_versions','import_mappings','rent_generation_exceptions']);
    -- Discover only these reviewed financial date names on the explicit tables.
    -- Master tables intentionally have no date-cutoff rule.
    IF NOT v_preserved THEN
      SELECT string_agg(quote_literal(a.attname),',' ORDER BY a.attname) INTO v_args
      FROM pg_catalog.pg_attribute a WHERE a.attrelid=v_table::regclass AND NOT a.attisdropped AND a.attnum>0
        AND a.atttypid='date'::regtype AND a.attname=ANY(ARRAY[
          'effective_date','event_date','business_date','received_date','paid_date','expense_date','recognized_on',
          'billing_period_start','billing_period_end','period_start','period_end','as_of_date','entry_date',
          'allocation_date','opening_date','close_date','distribution_date','payment_date','receipt_date',
          'application_date','applied_on','confirmed_on','eligible_on','month_start','movement_date','transaction_date',
          'settlement_date','adjustment_date','invoice_date','rent_billing_period_start','confirmed_date',
          'clear_date','withdrawal_date','evidence_recognized_on','segment_start','segment_end','issue_date',
          'received_on','returned_on','correction_business_date','fee_date','occurred_on','authority_start_date'
        ]);
    END IF;
    EXECUTE format('CREATE TRIGGER a_financial_write_fence BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION app_private.%I(%s)',v_schema,v_name,
      CASE WHEN v_preserved THEN 'guard_preserved_write_row' ELSE 'guard_financial_write_row' END,coalesce(v_args,''));
  END LOOP;
END;
$fence_rows$;

-- Preserve old specialized journal evidence, but never return or execute its
-- result in a new financial generation. Slot disposition remains part of the
-- separately reviewed cutover; this does not unlock an unconfirmed attempt.
DO $fence_journal$
DECLARE v_signature regprocedure; v_definition text; v_anchor text; v_new text;
BEGIN
  v_signature:='app_private.deposit_rent_journal_parent_scope(app_private.deposit_rent_journal_intents,jsonb)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  v_anchor:='BEGIN';
  v_new:=E'BEGIN\n  IF app_private.financial_scope_is_frozen(p_record.organization_id) THEN\n    RAISE EXCEPTION ''financial_writes_frozen'' USING ERRCODE=''55000'';\n  END IF;\n  IF EXISTS(SELECT 1 FROM app_private.financial_write_controls c WHERE c.organization_id=p_record.organization_id AND c.generation<>p_record.financial_generation) THEN\n    RAISE EXCEPTION ''financial_intent_retired'' USING ERRCODE=''55000'';\n  END IF;';
  IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'financial_journal_parent_predecessor_changed'; END IF;
  EXECUTE replace(v_definition,v_anchor,v_new);
END;
$fence_journal$;

-- Three private cron runners: choose one organization at a time, skip frozen
-- scopes before financial work, and carry the private capability only internally.
DO $fence_schedulers$
DECLARE v_definition text; v_signature regprocedure; v_anchor text; v_new text;
BEGIN
  v_signature:='app_private.run_due_rent_generation(timestamptz)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  v_anchor:='    v_result := app_private.try_current_month_rent(';
  v_new:=E'    IF NOT app_private.begin_financial_scheduled_scope(v_lease.organization_id) THEN\n      v_skipped := v_skipped + 1;\n      CONTINUE;\n    END IF;\n' || v_anchor;
  IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'financial_rent_runner_predecessor_changed'; END IF;
  EXECUTE replace(v_definition,v_anchor,v_new);

  v_signature:='app_private.run_due_lease_activations(timestamptz)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  v_anchor:='    v_result := public.process_due_lease_activations(';
  v_new:=E'    IF NOT app_private.begin_financial_scheduled_scope(v_organization.id) THEN CONTINUE; END IF;\n' || v_anchor;
  IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'financial_activation_runner_predecessor_changed'; END IF;
  EXECUTE replace(v_definition,v_anchor,v_new);

  v_signature:='app_private.run_deferred_owner_cash(timestamptz)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  v_anchor:='business_day := (p_clock AT TIME ZONE item.operational_timezone)::date;';
  v_new:=E'   IF NOT app_private.begin_financial_scheduled_scope(item.organization_id) THEN CONTINUE; END IF;\n   IF EXISTS (SELECT 1 FROM app_private.deferred_owner_cash q JOIN app_private.financial_write_controls c ON c.organization_id=q.organization_id WHERE q.organization_id=item.organization_id AND q.property_id=item.property_id AND q.financial_generation<>c.generation) THEN CONTINUE; END IF;\n' || v_anchor;
  IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'financial_deferred_runner_predecessor_changed'; END IF;
  EXECUTE replace(v_definition,v_anchor,v_new);
END;
$fence_schedulers$;

-- The signed HTTP maintenance runner is not granted a cron capability. It skips
-- frozen organizations; open enrolled scopes still require a matching header.
DO $fence_maintenance$
DECLARE v_definition text; v_anchor text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.run_maintenance_automation(timestamptz,integer)'::regprocedure) INTO v_definition;
  v_anchor:='      AND series.lifecycle = ''active''';
  IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'financial_maintenance_generation_predecessor_changed'; END IF;
  v_definition:=replace(v_definition,v_anchor,v_anchor || E'\n      AND NOT app_private.financial_scope_is_frozen(series.organization_id)');
  v_anchor:='    WHERE outbox.status IN (''pending'', ''retry'')';
  IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'financial_maintenance_delivery_predecessor_changed'; END IF;
  v_definition:=replace(v_definition,v_anchor,v_anchor || E'\n      AND NOT app_private.financial_scope_is_frozen(outbox.organization_id)');
  EXECUTE v_definition;
END;
$fence_maintenance$;

COMMENT ON TABLE app_private.financial_write_controls IS
  'Empty by default. Reviewed operator-only enrollment/freeze/cutoff control; not a reset executor. No app-role write grants.';
COMMIT;
