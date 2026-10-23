-- Inactive private authority only. No organization is frozen or reset here.
-- Runtime row gates are installed by the following integration migration.
BEGIN;

CREATE TABLE app_private.financial_reset_relation_rules (
  relation_name text PRIMARY KEY,
  archive_remove boolean NOT NULL,
  normalize_columns text[] NOT NULL DEFAULT '{}',
  generated_columns text[] NOT NULL DEFAULT '{}',
  restore_allowed boolean NOT NULL DEFAULT true
);
INSERT INTO app_private.financial_reset_relation_rules(relation_name,archive_remove)
SELECT n, true FROM unnest(ARRAY[
 'public.deposit_rent_allocations','public.deposit_rent_applications','public.deposit_rent_custody_confirmations','public.deposit_rent_owner_bridges',
 'public.expense_customer_adjustments','public.expense_legacy_replacements','public.expense_submissions','public.expense_transaction_lines','public.expense_transaction_scopes','public.expense_transactions',
 'public.fee_payment_date_corrections','public.finance_expense_items','public.finance_income_items','public.finance_payment_allocations','public.finance_payments','public.finance_receipt_allocations','public.finance_receipts','public.financial_month_locks',
 'public.historical_rent_settlement_reapplications','public.ips_expense_responsibilities','public.lease_deposit_events','public.ledger_entries','public.management_fee_occurrences',
 'public.owner_balance_period_components','public.owner_balance_periods','public.owner_cash_events','public.owner_cash_source_consumptions','public.owner_charge_cash_allocations','public.owner_close_corrections','public.owner_close_line_sources','public.owner_close_lines','public.owner_close_revisions','public.owner_close_series',
 'public.owner_collection_confirmation_allocations','public.owner_collection_confirmations','public.owner_component_movements','public.owner_component_transfer_instructions','public.owner_component_transfer_lines','public.owner_event_allocation_sets','public.owner_event_owner_allocations',
 'public.owner_invoice_lines','public.owner_invoices','public.owner_opening_balance_entries','public.owner_opening_balance_requests','public.owner_payment_allocations','public.owner_payments','public.owner_statement_artifacts','public.owner_statement_publications',
 'public.petty_cash_entries','public.petty_cash_periods','public.property_withdrawals','public.rent_generation_exceptions','public.tenant_commercial_document_artifacts','public.tenant_credit_occurrences','public.tenant_invoice_corrections','public.tenant_invoice_lines','public.tenant_invoice_payment_allocations','public.tenant_invoice_payments','public.tenant_invoice_rent_segments','public.tenant_invoices',
 'app_private.deferred_owner_cash','app_private.deposit_rent_application_attestations','app_private.deposit_rent_custody_attestations'
]) n;
INSERT INTO app_private.financial_reset_relation_rules(relation_name,archive_remove,normalize_columns) VALUES
 ('public.lease_deposits',false,ARRAY['status','received_on','returned_on']),
 ('public.tasks',false,ARRAY['actual_cost_amount','actual_cost_currency','actual_cost_date','actual_cost_document_id','actual_cost_reference']),
 ('public.timeline_events',false,ARRAY['ledger_entry_id','cost_amount','cost_currency']),
 ('public.documents',false,ARRAY['ledger_entry_id']);
INSERT INTO app_private.financial_reset_relation_rules(relation_name,archive_remove,normalize_columns,restore_allowed) VALUES
 ('app_private.financial_idempotency_requests',false,'{}',false),
 ('app_private.finance_category_idempotency_result_seals',false,'{}',false),
 ('app_private.paid_cost_evidence_registrations',false,'{}',false),
 ('public.notification_outbox',false,ARRAY['status'],false);
UPDATE app_private.financial_reset_relation_rules SET normalize_columns=ARRAY['ledger_entry_id'] WHERE relation_name IN (
 'public.finance_expense_items','public.finance_payment_allocations','public.finance_receipt_allocations','public.lease_deposit_events',
 'public.owner_collection_confirmation_allocations','public.owner_payments','public.petty_cash_entries','public.property_withdrawals');
UPDATE app_private.financial_reset_relation_rules SET normalize_columns=ARRAY['owner_invoice_line_id'] WHERE relation_name='public.ips_expense_responsibilities';
UPDATE app_private.financial_reset_relation_rules SET normalize_columns=ARRAY['state','active_revision_id','current_closed_revision_id'] WHERE relation_name='public.owner_close_series';
UPDATE app_private.financial_reset_relation_rules SET generated_columns=ARRAY['signed_amount'] WHERE relation_name IN ('public.deposit_rent_allocations','public.tenant_invoice_payment_allocations');
UPDATE app_private.financial_reset_relation_rules SET generated_columns=ARRAY['customer_total_amount'] WHERE relation_name='public.expense_submissions';

CREATE TABLE app_private.financial_reset_operations (
 operation_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 operation_kind text NOT NULL CHECK(operation_kind IN ('reset','restore')),
 restore_of uuid REFERENCES app_private.financial_reset_operations(operation_id) ON DELETE RESTRICT,
 database_oid oid NOT NULL,
 database_name text NOT NULL,
 source_generation integer NOT NULL CHECK(source_generation>=0 AND source_generation<2147483647),
 target_generation integer NOT NULL CHECK(target_generation=source_generation+1),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
 plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[0-9a-f]{64}$'),
 schema_sha256 text NOT NULL CHECK(schema_sha256 ~ '^[0-9a-f]{64}$'),
 archive_sha256 text NOT NULL CHECK(archive_sha256 ~ '^[0-9a-f]{64}$'),
 action_sha256 text NOT NULL CHECK(action_sha256 ~ '^[0-9a-f]{64}$'),
 archive_count integer NOT NULL CHECK(archive_count>=0),
 action_count integer NOT NULL CHECK(action_count>=0),
 audit_timestamp timestamptz NOT NULL CHECK(isfinite(audit_timestamp)),
 audit_actor uuid,
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','sealed','executing','actions_complete')),
 execution_backend integer,
 execution_xid xid8,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 UNIQUE(operation_id,organization_id),
 CHECK((operation_kind='reset' AND restore_of IS NULL) OR (operation_kind='restore' AND restore_of IS NOT NULL)),
 CHECK((status IN ('prepared','sealed') AND execution_backend IS NULL AND execution_xid IS NULL AND completed_at IS NULL)
   OR (status='executing' AND execution_backend IS NOT NULL AND execution_xid IS NOT NULL AND completed_at IS NULL)
   OR (status='actions_complete' AND execution_backend IS NOT NULL AND execution_xid IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX financial_reset_one_pending_operation ON app_private.financial_reset_operations(organization_id)
 WHERE status<>'actions_complete';

CREATE TABLE app_private.financial_reset_archive_rows (
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 relation_name text NOT NULL REFERENCES app_private.financial_reset_relation_rules(relation_name) ON DELETE RESTRICT,
 relation_oid oid NOT NULL,
 primary_key jsonb NOT NULL CHECK(jsonb_typeof(primary_key)='object' AND primary_key<>'{}'::jsonb),
 row_json jsonb NOT NULL CHECK(jsonb_typeof(row_json)='object'),
 row_sha256 text NOT NULL CHECK(row_sha256 ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(operation_id,relation_name,primary_key),
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE app_private.financial_reset_actions (
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 action_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>0),
 relation_name text NOT NULL REFERENCES app_private.financial_reset_relation_rules(relation_name) ON DELETE RESTRICT,
 relation_oid oid NOT NULL,
 primary_key jsonb NOT NULL CHECK(jsonb_typeof(primary_key)='object' AND primary_key<>'{}'::jsonb),
 kind text NOT NULL CHECK(kind IN ('archive-delete','normalization','restore')),
 before_row jsonb,
 after_row jsonb,
 before_sha256 text CHECK(before_sha256 ~ '^[0-9a-f]{64}$'),
 after_sha256 text CHECK(after_sha256 ~ '^[0-9a-f]{64}$'),
 applied_at timestamptz,
 PRIMARY KEY(operation_id,action_id), UNIQUE(operation_id,ordinal), UNIQUE(operation_id,action_id,organization_id),
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT,
 CHECK((before_row IS NULL)=(before_sha256 IS NULL)),
 CHECK((after_row IS NULL)=(after_sha256 IS NULL)),
 CHECK((kind='archive-delete' AND before_row IS NOT NULL AND after_row IS NULL)
   OR (kind='normalization' AND before_row IS NOT NULL AND after_row IS NOT NULL)
   OR (kind='restore' AND after_row IS NOT NULL))
);
CREATE TABLE app_private.financial_reset_transaction_capabilities (
 backend_pid integer PRIMARY KEY,
 transaction_id xid8 NOT NULL,
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 action_id uuid NOT NULL,
 phase text NOT NULL CHECK(phase IN ('archive-delete','normalization','restore')),
 entered boolean NOT NULL DEFAULT false,
 FOREIGN KEY(operation_id,action_id,organization_id) REFERENCES app_private.financial_reset_actions(operation_id,action_id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT
);

CREATE FUNCTION app_private.financial_reset_hash(p_row jsonb) RETURNS text
 LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT pg_catalog.encode(extensions.digest(p_row::text,'sha256'),'hex')
$$;

CREATE FUNCTION app_private.financial_reset_primary_key(p_relation oid,p_row jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_key jsonb;
BEGIN
 SELECT pg_catalog.jsonb_object_agg(a.attname,p_row->a.attname ORDER BY k.n) INTO v_key
 FROM pg_catalog.pg_index i
 CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,n)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
 WHERE i.indrelid=p_relation AND i.indisprimary AND k.n<=i.indnkeyatts;
 IF v_key IS NULL OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(v_key) e WHERE e.value='null'::jsonb) THEN
   RAISE EXCEPTION 'financial_reset_primary_key_required' USING ERRCODE='23514';
 END IF;
 RETURN v_key;
END;
$$;

CREATE FUNCTION app_private.financial_reset_typed_row(p_relation oid,p_row jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_result jsonb; v_schema text; v_table text;
BEGIN
 SELECT n.nspname,c.relname INTO v_schema,v_table FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN app_private.financial_reset_relation_rules r ON pg_catalog.to_regclass(r.relation_name)::oid=c.oid AND r.relation_name=n.nspname||'.'||c.relname
 WHERE c.oid=p_relation AND c.relkind='r';
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_relation_not_allowed' USING ERRCODE='23514'; END IF;
 EXECUTE pg_catalog.format('SELECT to_jsonb(r) FROM jsonb_populate_record(NULL::%I.%I,$1) r',v_schema,v_table) INTO v_result USING p_row;
 IF p_row IS NULL OR v_result IS DISTINCT FROM p_row OR
   (SELECT array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_row) key) IS DISTINCT FROM
   (SELECT array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(v_result) key) THEN
   RAISE EXCEPTION 'financial_reset_full_typed_row_required' USING ERRCODE='23514';
 END IF;
 RETURN v_result;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_frozen(p_operation_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_control app_private.financial_write_controls%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||v_op.organization_id::text,0));
 SELECT * INTO v_control FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id;
 IF NOT FOUND OR v_control.status<>'frozen' OR v_control.generation<>v_op.target_generation THEN
   RAISE EXCEPTION 'financial_reset_frozen_generation_required' USING ERRCODE='55000';
 END IF;
 IF v_op.database_name<>pg_catalog.current_database() OR v_op.database_oid<>(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) THEN
   RAISE EXCEPTION 'financial_reset_database_binding_changed' USING ERRCODE='55000';
 END IF;
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_immutable() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'financial_reset_evidence_immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER financial_reset_rules_immutable BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_relation_rules
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_archive_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_archive_rows
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.guard_financial_reset_operation() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'financial_reset_evidence_immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'prepared' OR NEW.database_name<>pg_catalog.current_database()
     OR NEW.database_oid<>(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) THEN
     RAISE EXCEPTION 'financial_reset_initial_binding_invalid' USING ERRCODE='23514';
   END IF;
 ELSE
   IF (to_jsonb(NEW)-ARRAY['status','execution_backend','execution_xid','completed_at']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['status','execution_backend','execution_xid','completed_at']) THEN
     RAISE EXCEPTION 'financial_reset_binding_immutable' USING ERRCODE='23514';
   END IF;
   IF NOT ((OLD.status='prepared' AND NEW.status='sealed' AND NEW.execution_backend IS NULL AND NEW.execution_xid IS NULL)
     OR (OLD.status='sealed' AND NEW.status='executing' AND NEW.execution_backend=pg_catalog.pg_backend_pid() AND NEW.execution_xid=pg_catalog.pg_current_xact_id())
     OR (OLD.status='executing' AND NEW.status='actions_complete' AND NEW.execution_backend=OLD.execution_backend AND NEW.execution_xid=OLD.execution_xid
         AND OLD.execution_backend=pg_catalog.pg_backend_pid() AND OLD.execution_xid=pg_catalog.pg_current_xact_id())) THEN
     RAISE EXCEPTION 'financial_reset_status_transition_invalid' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_operation_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_operations
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_operation();

CREATE FUNCTION app_private.prepare_financial_reset_operation(p_binding jsonb) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid:=(p_binding->>'operation_id')::uuid; v_existing app_private.financial_reset_operations%ROWTYPE; v_expected jsonb; v_original app_private.financial_reset_operations%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 IF p_binding IS NULL OR jsonb_typeof(p_binding)<>'object' THEN RAISE EXCEPTION 'financial_reset_binding_required' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||(p_binding->>'organization_id')::uuid::text,0));
 v_expected:=jsonb_build_object('operation_id',v_id,'organization_id',(p_binding->>'organization_id')::uuid,'operation_kind',p_binding->>'operation_kind',
   'restore_of',(p_binding->>'restore_of')::uuid,'source_generation',(p_binding->>'source_generation')::integer,'target_generation',(p_binding->>'target_generation')::integer,
   'manifest_sha256',p_binding->>'manifest_sha256','plan_sha256',p_binding->>'plan_sha256','schema_sha256',p_binding->>'schema_sha256',
   'archive_sha256',p_binding->>'archive_sha256','action_sha256',p_binding->>'action_sha256','archive_count',(p_binding->>'archive_count')::integer,'action_count',(p_binding->>'action_count')::integer,
   'audit_timestamp',(p_binding->>'audit_timestamp')::timestamptz,'audit_actor',(p_binding->>'audit_actor')::uuid);
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_expected) key) IS DISTINCT FROM
    (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_binding) key) THEN
   RAISE EXCEPTION 'financial_reset_binding_fields_invalid' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_existing FROM app_private.financial_reset_operations WHERE operation_id=v_id;
 IF FOUND THEN
   IF (to_jsonb(v_existing)-ARRAY['database_oid','database_name','status','execution_backend','execution_xid','created_at','completed_at']) IS DISTINCT FROM v_expected THEN
     RAISE EXCEPTION 'financial_reset_operation_id_reused' USING ERRCODE='23514';
   END IF;
   IF v_existing.database_name<>current_database() OR v_existing.database_oid<>(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) THEN
     RAISE EXCEPTION 'financial_reset_database_binding_changed' USING ERRCODE='55000';
   END IF;
   RETURN v_id;
 END IF;
 IF p_binding->>'operation_kind'='restore' THEN
   SELECT * INTO v_original FROM app_private.financial_reset_operations WHERE operation_id=(p_binding->>'restore_of')::uuid;
   IF NOT FOUND OR v_original.status<>'actions_complete' OR v_original.operation_kind<>'reset'
     OR v_original.organization_id<>(p_binding->>'organization_id')::uuid OR v_original.target_generation<>(p_binding->>'source_generation')::integer
     OR v_original.archive_sha256<>p_binding->>'archive_sha256' OR v_original.archive_count<>(p_binding->>'archive_count')::integer THEN
     RAISE EXCEPTION 'financial_reset_restore_binding_invalid' USING ERRCODE='23514';
   END IF;
 END IF;
 INSERT INTO app_private.financial_reset_operations(operation_id,organization_id,operation_kind,restore_of,database_oid,database_name,source_generation,target_generation,
   manifest_sha256,plan_sha256,schema_sha256,archive_sha256,action_sha256,archive_count,action_count,audit_timestamp,audit_actor)
 VALUES(v_id,(p_binding->>'organization_id')::uuid,p_binding->>'operation_kind',(p_binding->>'restore_of')::uuid,
   (SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()),current_database(),(p_binding->>'source_generation')::integer,(p_binding->>'target_generation')::integer,
   p_binding->>'manifest_sha256',p_binding->>'plan_sha256',p_binding->>'schema_sha256',p_binding->>'archive_sha256',p_binding->>'action_sha256',
   (p_binding->>'archive_count')::integer,(p_binding->>'action_count')::integer,(p_binding->>'audit_timestamp')::timestamptz,(p_binding->>'audit_actor')::uuid);
 PERFORM app_private.assert_financial_reset_frozen(v_id);
 RETURN v_id;
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_archive_insert() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_rule app_private.financial_reset_relation_rules%ROWTYPE; v_actual jsonb;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(NEW.operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=NEW.operation_id FOR UPDATE;
 IF NEW.organization_id IS NOT NULL AND NEW.organization_id<>v_op.organization_id THEN RAISE EXCEPTION 'financial_reset_archive_scope_invalid' USING ERRCODE='23514'; END IF;
 NEW.organization_id:=v_op.organization_id;
 SELECT * INTO v_rule FROM app_private.financial_reset_relation_rules WHERE relation_name=NEW.relation_name;
 IF v_op.status<>'prepared' OR v_op.operation_kind<>'reset' OR NOT FOUND OR NEW.relation_oid IS DISTINCT FROM pg_catalog.to_regclass(v_rule.relation_name)::oid THEN
   RAISE EXCEPTION 'financial_reset_archive_not_preparable' USING ERRCODE='23514';
 END IF;
 IF NEW.row_json->>'organization_id' IS DISTINCT FROM v_op.organization_id::text OR
   NEW.primary_key IS DISTINCT FROM app_private.financial_reset_primary_key(NEW.relation_oid,NEW.row_json) OR
   NEW.row_sha256 IS DISTINCT FROM app_private.financial_reset_hash(NEW.row_json) OR
   NEW.row_sha256 IS DISTINCT FROM app_private.financial_reset_hash(app_private.financial_reset_typed_row(NEW.relation_oid,NEW.row_json)) THEN
   RAISE EXCEPTION 'financial_reset_archive_image_invalid' USING ERRCODE='23514';
 END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE app_private.financial_reset_primary_key($1,to_jsonb(t))=$2 AND t.organization_id=$3 FOR SHARE',
   split_part(NEW.relation_name,'.',1),split_part(NEW.relation_name,'.',2)) INTO v_actual USING NEW.relation_oid,NEW.primary_key,v_op.organization_id;
 IF v_actual IS NULL OR app_private.financial_reset_hash(v_actual) IS DISTINCT FROM NEW.row_sha256 THEN
   RAISE EXCEPTION 'financial_reset_archive_source_mismatch' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_archive_insert_guard BEFORE INSERT ON app_private.financial_reset_archive_rows
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_archive_insert();

CREATE FUNCTION app_private.archive_financial_reset_rows(p_operation_id uuid,p_rows jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; v_row jsonb; v_oid oid;
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'financial_reset_rows_array_required' USING ERRCODE='22023'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   v_row:=(v->>'row_text')::jsonb;
   IF v->>'row_text' IS DISTINCT FROM v_row::text OR v->>'row_sha256' IS DISTINCT FROM app_private.financial_reset_hash(v_row) THEN
     RAISE EXCEPTION 'financial_reset_original_row_text_required' USING ERRCODE='23514';
   END IF;
   SELECT pg_catalog.to_regclass(relation_name)::oid INTO v_oid FROM app_private.financial_reset_relation_rules WHERE relation_name=v->>'relation_name';
   INSERT INTO app_private.financial_reset_archive_rows(operation_id,relation_name,relation_oid,primary_key,row_json,row_sha256)
   VALUES(p_operation_id,v->>'relation_name',v_oid,v->'primary_key',v_row,v->>'row_sha256');
 END LOOP;
END;
$$;

CREATE FUNCTION app_private.financial_reset_archive_digest(p_operation_id uuid) RETURNS text
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT app_private.financial_reset_hash(coalesce(jsonb_agg(jsonb_build_object('relation_name',r.relation_name,'primary_key',r.primary_key,'row_sha256',r.row_sha256)
 ORDER BY r.relation_name,r.primary_key::text),'[]'::jsonb)) FROM app_private.financial_reset_archive_rows r
 WHERE r.operation_id=(SELECT coalesce(restore_of,operation_id) FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id)
$$;
CREATE FUNCTION app_private.financial_reset_action_digest(p_operation_id uuid) RETURNS text
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT app_private.financial_reset_hash(coalesce(jsonb_agg(jsonb_build_object('action_id',a.action_id,'ordinal',a.ordinal,'relation_name',a.relation_name,
 'primary_key',a.primary_key,'kind',a.kind,'before_sha256',a.before_sha256,'after_sha256',a.after_sha256) ORDER BY a.ordinal),'[]'::jsonb))
 FROM app_private.financial_reset_actions a WHERE a.operation_id=p_operation_id
$$;

CREATE FUNCTION app_private.financial_reset_normalized_image(p_relation oid,p_before jsonb,p_after jsonb,p_audit_timestamp timestamptz,p_audit_actor uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_rule app_private.financial_reset_relation_rules%ROWTYPE; v_column text; v_allowed text[];
BEGIN
 SELECT * INTO STRICT v_rule FROM app_private.financial_reset_relation_rules WHERE pg_catalog.to_regclass(relation_name)::oid=p_relation;
 IF cardinality(v_rule.normalize_columns)=0 OR p_before IS NULL OR p_after IS NULL THEN RETURN false; END IF;
 IF v_rule.relation_name='public.notification_outbox' AND
   (p_before->>'event_type' IS DISTINCT FROM 'maintenance_reminder' OR p_before->>'status' IS DISTINCT FROM 'pending'
     OR p_before->'claimed_at' IS DISTINCT FROM 'null'::jsonb OR p_before->'delivered_at' IS DISTINCT FROM 'null'::jsonb) THEN RETURN false; END IF;
 v_allowed:=v_rule.normalize_columns||ARRAY['updated_at','updated_by'];
 IF (p_before-v_allowed) IS DISTINCT FROM (p_after-v_allowed) THEN RETURN false; END IF;
 FOR v_column IN SELECT unnest(v_rule.normalize_columns) LOOP
   IF v_rule.relation_name='public.notification_outbox' AND v_column='status' THEN
     IF p_after->>'status' IS DISTINCT FROM 'cancelled' THEN RETURN false; END IF;
   ELSIF v_rule.relation_name='public.lease_deposits' AND v_column='status' THEN
     IF p_after->>'status' IS DISTINCT FROM 'pending' THEN RETURN false; END IF;
   ELSIF v_rule.relation_name='public.owner_close_series' AND v_column='state' THEN
     IF p_after->>'state' IS DISTINCT FROM 'open' THEN RETURN false; END IF;
   ELSIF p_after->v_column IS DISTINCT FROM 'null'::jsonb THEN RETURN false;
   END IF;
 END LOOP;
 IF p_after ? 'updated_at' AND p_after->'updated_at' IS DISTINCT FROM p_before->'updated_at'
   AND p_after->>'updated_at' IS DISTINCT FROM (to_jsonb(p_audit_timestamp)#>>'{}') THEN RETURN false; END IF;
 IF p_after ? 'updated_by' AND p_after->'updated_by' IS DISTINCT FROM p_before->'updated_by'
   AND p_after->'updated_by' IS DISTINCT FROM coalesce(to_jsonb(p_audit_actor),'null'::jsonb) THEN RETURN false; END IF;
 RETURN true;
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_action() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_rule app_private.financial_reset_relation_rules%ROWTYPE; v_archive jsonb; v_restore jsonb; v_cap app_private.financial_reset_transaction_capabilities%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'financial_reset_evidence_immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
   SELECT * INTO v_cap FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid();
   IF (to_jsonb(NEW)-'applied_at') IS DISTINCT FROM (to_jsonb(OLD)-'applied_at') OR OLD.applied_at IS NOT NULL OR NEW.applied_at IS NULL
     OR NOT FOUND OR NOT v_cap.entered OR v_cap.transaction_id<>pg_current_xact_id() OR v_cap.operation_id<>OLD.operation_id OR v_cap.action_id<>OLD.action_id THEN
     RAISE EXCEPTION 'financial_reset_action_immutable' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 PERFORM app_private.assert_financial_reset_frozen(NEW.operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=NEW.operation_id FOR UPDATE;
 IF NEW.organization_id IS NOT NULL AND NEW.organization_id<>v_op.organization_id THEN RAISE EXCEPTION 'financial_reset_action_scope_invalid' USING ERRCODE='23514'; END IF;
 NEW.organization_id:=v_op.organization_id;
 SELECT * INTO v_rule FROM app_private.financial_reset_relation_rules WHERE relation_name=NEW.relation_name;
 IF v_op.status<>'prepared' OR NEW.applied_at IS NOT NULL OR NOT FOUND OR NEW.relation_oid IS DISTINCT FROM pg_catalog.to_regclass(v_rule.relation_name)::oid THEN
   RAISE EXCEPTION 'financial_reset_action_not_preparable' USING ERRCODE='23514';
 END IF;
 SELECT row_json INTO v_archive FROM app_private.financial_reset_archive_rows WHERE operation_id=coalesce(v_op.restore_of,v_op.operation_id)
   AND relation_name=NEW.relation_name AND primary_key=NEW.primary_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_action_archive_required' USING ERRCODE='23514'; END IF;
 IF NEW.before_row IS NOT NULL AND (NEW.before_row->>'organization_id' IS DISTINCT FROM v_op.organization_id::text OR
   app_private.financial_reset_primary_key(NEW.relation_oid,NEW.before_row) IS DISTINCT FROM NEW.primary_key OR
   app_private.financial_reset_hash(NEW.before_row) IS DISTINCT FROM NEW.before_sha256 OR
   app_private.financial_reset_hash(app_private.financial_reset_typed_row(NEW.relation_oid,NEW.before_row)) IS DISTINCT FROM NEW.before_sha256) THEN
   RAISE EXCEPTION 'financial_reset_action_before_invalid' USING ERRCODE='23514';
 END IF;
 IF NEW.after_row IS NOT NULL AND (NEW.after_row->>'organization_id' IS DISTINCT FROM v_op.organization_id::text OR
   app_private.financial_reset_primary_key(NEW.relation_oid,NEW.after_row) IS DISTINCT FROM NEW.primary_key OR
   app_private.financial_reset_hash(NEW.after_row) IS DISTINCT FROM NEW.after_sha256 OR
   app_private.financial_reset_hash(app_private.financial_reset_typed_row(NEW.relation_oid,NEW.after_row)) IS DISTINCT FROM NEW.after_sha256) THEN
   RAISE EXCEPTION 'financial_reset_action_after_invalid' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='archive-delete' THEN
   IF v_op.operation_kind<>'reset' OR NOT v_rule.archive_remove THEN RAISE EXCEPTION 'financial_reset_delete_not_allowed' USING ERRCODE='23514'; END IF;
 ELSIF NEW.kind='normalization' THEN
   IF v_op.operation_kind<>'reset' OR NOT app_private.financial_reset_normalized_image(NEW.relation_oid,NEW.before_row,NEW.after_row,v_op.audit_timestamp,v_op.audit_actor) THEN
     RAISE EXCEPTION 'financial_reset_normalization_not_allowed' USING ERRCODE='23514';
   END IF;
 ELSE
   v_restore:=v_archive;
   IF v_restore ? 'financial_generation' THEN v_restore:=jsonb_set(v_restore,'{financial_generation}',to_jsonb(v_op.target_generation)); END IF;
   IF v_op.operation_kind<>'restore' OR NOT v_rule.restore_allowed OR (NEW.before_row IS NULL AND NOT v_rule.archive_remove) OR
      (app_private.financial_reset_hash(NEW.after_row)<>app_private.financial_reset_hash(v_restore)
       AND NOT (v_rule.archive_remove AND app_private.financial_reset_normalized_image(NEW.relation_oid,v_restore,NEW.after_row,v_op.audit_timestamp,v_op.audit_actor))) THEN
     RAISE EXCEPTION 'financial_reset_restore_image_invalid' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_action_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_actions
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_action();

CREATE FUNCTION app_private.prepare_financial_reset_actions(p_operation_id uuid,p_actions jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; v_before jsonb; v_after jsonb; v_oid oid;
BEGIN
 IF jsonb_typeof(p_actions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'financial_reset_actions_array_required' USING ERRCODE='22023'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_actions) LOOP
   v_before:=(v->>'before_row_text')::jsonb; v_after:=(v->>'after_row_text')::jsonb;
   IF (v->>'before_row_text') IS DISTINCT FROM v_before::text OR (v->>'after_row_text') IS DISTINCT FROM v_after::text THEN
     RAISE EXCEPTION 'financial_reset_canonical_action_text_required' USING ERRCODE='23514';
   END IF;
   SELECT pg_catalog.to_regclass(relation_name)::oid INTO v_oid FROM app_private.financial_reset_relation_rules WHERE relation_name=v->>'relation_name';
   INSERT INTO app_private.financial_reset_actions(operation_id,action_id,ordinal,relation_name,relation_oid,primary_key,kind,before_row,after_row,before_sha256,after_sha256)
   VALUES(p_operation_id,(v->>'action_id')::uuid,(v->>'ordinal')::integer,v->>'relation_name',v_oid,v->'primary_key',v->>'kind',v_before,v_after,v->>'before_sha256',v->>'after_sha256');
 END LOOP;
END;
$$;

CREATE FUNCTION app_private.seal_financial_reset_operation(p_operation_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_action app_private.financial_reset_actions%ROWTYPE; v_previous app_private.financial_reset_actions%ROWTYPE; v_original jsonb; v_current jsonb; v_count integer;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF v_op.status<>'prepared' THEN RAISE EXCEPTION 'financial_reset_operation_not_prepared' USING ERRCODE='55000'; END IF;
 SELECT count(*) INTO v_count FROM app_private.financial_reset_archive_rows WHERE operation_id=coalesce(v_op.restore_of,p_operation_id);
 IF v_count<>v_op.archive_count OR app_private.financial_reset_archive_digest(p_operation_id)<>v_op.archive_sha256
   OR (SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=p_operation_id)<>v_op.action_count
   OR app_private.financial_reset_action_digest(p_operation_id)<>v_op.action_sha256
   OR coalesce((SELECT max(ordinal) FROM app_private.financial_reset_actions WHERE operation_id=p_operation_id),0)<>v_op.action_count THEN
   RAISE EXCEPTION 'financial_reset_manifest_counts_or_digest_mismatch' USING ERRCODE='23514';
 END IF;
 FOR v_action IN SELECT * FROM app_private.financial_reset_actions WHERE operation_id=p_operation_id ORDER BY ordinal LOOP
   SELECT * INTO v_previous FROM app_private.financial_reset_actions WHERE operation_id=p_operation_id AND relation_name=v_action.relation_name
     AND primary_key=v_action.primary_key AND ordinal<v_action.ordinal ORDER BY ordinal DESC LIMIT 1;
   IF FOUND THEN
     IF v_previous.after_row IS NULL OR v_previous.after_sha256 IS DISTINCT FROM v_action.before_sha256 THEN
       RAISE EXCEPTION 'financial_reset_action_chain_mismatch' USING ERRCODE='23514';
     END IF;
   ELSE
     SELECT row_json INTO STRICT v_original FROM app_private.financial_reset_archive_rows WHERE operation_id=coalesce(v_op.restore_of,p_operation_id)
       AND relation_name=v_action.relation_name AND primary_key=v_action.primary_key;
     IF v_op.operation_kind='reset' AND app_private.financial_reset_hash(v_original) IS DISTINCT FROM v_action.before_sha256 THEN
       RAISE EXCEPTION 'financial_reset_initial_action_not_archived' USING ERRCODE='23514';
     END IF;
     EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE app_private.financial_reset_primary_key($1,to_jsonb(t))=$2 AND t.organization_id=$3 FOR SHARE',
       split_part(v_action.relation_name,'.',1),split_part(v_action.relation_name,'.',2)) INTO v_current USING v_action.relation_oid,v_action.primary_key,v_op.organization_id;
     IF app_private.financial_reset_hash(v_current) IS DISTINCT FROM v_action.before_sha256 THEN
       RAISE EXCEPTION 'financial_reset_current_action_image_changed' USING ERRCODE='40001';
     END IF;
   END IF;
 END LOOP;
 -- A restored archival row cannot finish in its temporary cycle-detached form.
 IF v_op.operation_kind='restore' AND EXISTS(
   SELECT 1 FROM app_private.financial_reset_actions a JOIN app_private.financial_reset_archive_rows r ON r.operation_id=v_op.restore_of AND r.relation_name=a.relation_name AND r.primary_key=a.primary_key
   WHERE a.operation_id=p_operation_id AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actions b WHERE b.operation_id=p_operation_id AND b.relation_name=a.relation_name AND b.primary_key=a.primary_key AND b.ordinal>a.ordinal)
   AND a.after_sha256<>app_private.financial_reset_hash(CASE WHEN r.row_json ? 'financial_generation' THEN jsonb_set(r.row_json,'{financial_generation}',to_jsonb(v_op.target_generation)) ELSE r.row_json END)
 ) THEN RAISE EXCEPTION 'financial_reset_restore_final_image_not_original' USING ERRCODE='23514'; END IF;
 UPDATE app_private.financial_reset_operations SET status='sealed' WHERE operation_id=p_operation_id;
END;
$$;

CREATE FUNCTION app_private.start_financial_reset_actions(p_operation_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 PERFORM 1 FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id AND status='sealed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_operation_not_sealed' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()) THEN
   RAISE EXCEPTION 'financial_reset_capability_already_active' USING ERRCODE='55000';
 END IF;
 UPDATE app_private.financial_reset_operations SET status='executing',execution_backend=pg_backend_pid(),execution_xid=pg_current_xact_id() WHERE operation_id=p_operation_id;
END;
$$;

CREATE FUNCTION app_private.arm_financial_reset_action(p_operation_id uuid,p_action_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_next app_private.financial_reset_actions%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF v_op.status<>'executing' OR v_op.execution_backend<>pg_backend_pid() OR v_op.execution_xid<>pg_current_xact_id() THEN
   RAISE EXCEPTION 'financial_reset_execution_transaction_required' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()) THEN
   RAISE EXCEPTION 'financial_reset_capability_already_active' USING ERRCODE='55000';
 END IF;
 SELECT * INTO v_next FROM app_private.financial_reset_actions WHERE operation_id=p_operation_id AND applied_at IS NULL ORDER BY ordinal LIMIT 1;
 IF NOT FOUND OR v_next.action_id<>p_action_id THEN RAISE EXCEPTION 'financial_reset_next_action_required' USING ERRCODE='23514'; END IF;
 INSERT INTO app_private.financial_reset_transaction_capabilities(backend_pid,transaction_id,operation_id,action_id,phase)
 VALUES(pg_backend_pid(),pg_current_xact_id(),p_operation_id,p_action_id,v_next.kind);
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_capability() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_action app_private.financial_reset_actions%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.backend_pid<>pg_backend_pid() OR OLD.transaction_id<>pg_current_xact_id() OR NOT OLD.entered
     OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=OLD.operation_id AND action_id=OLD.action_id AND applied_at IS NOT NULL) THEN
     RAISE EXCEPTION 'financial_reset_capability_removal_invalid' USING ERRCODE='23514';
   END IF;
   RETURN OLD;
 END IF;
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=NEW.operation_id;
 IF NEW.organization_id IS NOT NULL AND NEW.organization_id<>v_op.organization_id THEN RAISE EXCEPTION 'financial_reset_capability_scope_invalid' USING ERRCODE='23514'; END IF;
 NEW.organization_id:=v_op.organization_id;
 IF NEW.backend_pid<>pg_backend_pid() OR NEW.transaction_id<>pg_current_xact_id() OR v_op.status<>'executing'
   OR v_op.execution_backend<>NEW.backend_pid OR v_op.execution_xid<>NEW.transaction_id THEN
   RAISE EXCEPTION 'financial_reset_capability_transaction_invalid' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_action FROM app_private.financial_reset_actions WHERE operation_id=NEW.operation_id AND applied_at IS NULL ORDER BY ordinal LIMIT 1;
 IF NOT FOUND OR v_action.action_id<>NEW.action_id OR v_action.kind<>NEW.phase THEN
   RAISE EXCEPTION 'financial_reset_next_action_required' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.entered THEN RAISE EXCEPTION 'financial_reset_capability_entry_invalid' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'entered') IS DISTINCT FROM (to_jsonb(OLD)-'entered') OR OLD.entered OR NOT NEW.entered OR pg_trigger_depth()<2) THEN
   RAISE EXCEPTION 'financial_reset_capability_entry_invalid' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_capability_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_transaction_capabilities
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_capability();

CREATE FUNCTION app_private.financial_reset_action_allowed(p_relation oid,p_verb text,p_old jsonb,p_new jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cap app_private.financial_reset_transaction_capabilities%ROWTYPE; v_action app_private.financial_reset_actions%ROWTYPE; v_op app_private.financial_reset_operations%ROWTYPE; v_verb text; v_generated text[];
BEGIN
 SELECT * INTO v_cap FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid();
 IF NOT FOUND THEN RETURN false; END IF;
 IF v_cap.transaction_id<>pg_current_xact_id() OR NOT v_cap.entered OR pg_trigger_depth()=0 THEN
   RAISE EXCEPTION 'financial_reset_capability_context_invalid' USING ERRCODE='55000';
 END IF;
 SELECT * INTO STRICT v_action FROM app_private.financial_reset_actions WHERE operation_id=v_cap.operation_id AND action_id=v_cap.action_id;
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=v_cap.operation_id;
 PERFORM app_private.assert_financial_reset_frozen(v_cap.operation_id);
 SELECT generated_columns INTO STRICT v_generated FROM app_private.financial_reset_relation_rules WHERE pg_catalog.to_regclass(relation_name)::oid=p_relation;
 IF v_generated IS DISTINCT FROM coalesce((SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute
   WHERE attrelid=p_relation AND attnum>0 AND NOT attisdropped AND attgenerated<>''),'{}'::text[]) THEN
   RAISE EXCEPTION 'financial_reset_generated_columns_changed' USING ERRCODE='55000';
 END IF;
 v_verb:=CASE WHEN v_action.after_row IS NULL THEN 'DELETE' WHEN v_action.before_row IS NULL THEN 'INSERT' ELSE 'UPDATE' END;
 IF v_op.status<>'executing' OR v_op.execution_backend<>pg_backend_pid() OR v_op.execution_xid<>pg_current_xact_id()
   OR v_action.applied_at IS NOT NULL OR v_cap.phase<>v_action.kind OR v_action.relation_oid<>p_relation OR v_verb<>p_verb
   OR pg_catalog.to_regclass(v_action.relation_name)::oid IS DISTINCT FROM p_relation
   OR app_private.financial_reset_hash(p_old) IS DISTINCT FROM v_action.before_sha256
   OR app_private.financial_reset_hash(p_new-v_generated) IS DISTINCT FROM app_private.financial_reset_hash(v_action.after_row-v_generated) THEN
   RAISE EXCEPTION 'financial_reset_exact_row_action_mismatch' USING ERRCODE='23514';
 END IF;
 RETURN true;
END;
$$;

CREATE FUNCTION app_private.begin_financial_reset_row_action() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cap app_private.financial_reset_transaction_capabilities%ROWTYPE; v_old jsonb; v_new jsonb;
BEGIN
 SELECT * INTO v_cap FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid();
 IF FOUND THEN
   IF v_cap.entered OR v_cap.transaction_id<>pg_current_xact_id() THEN RAISE EXCEPTION 'financial_reset_action_event_reused' USING ERRCODE='23514'; END IF;
   UPDATE app_private.financial_reset_transaction_capabilities SET entered=true WHERE backend_pid=pg_backend_pid();
   IF TG_OP<>'INSERT' THEN v_old:=to_jsonb(OLD); END IF;
   IF TG_OP<>'DELETE' THEN v_new:=to_jsonb(NEW); END IF;
   PERFORM app_private.financial_reset_action_allowed(TG_RELID,TG_OP,v_old,v_new);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;

CREATE FUNCTION app_private.finish_financial_reset_row_action() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old jsonb; v_new jsonb; v_cap app_private.financial_reset_transaction_capabilities%ROWTYPE; v_action app_private.financial_reset_actions%ROWTYPE;
BEGIN
 SELECT * INTO v_cap FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid();
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN v_old:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN v_new:=to_jsonb(NEW); END IF;
 PERFORM app_private.financial_reset_action_allowed(TG_RELID,TG_OP,v_old,v_new);
 SELECT * INTO STRICT v_action FROM app_private.financial_reset_actions WHERE operation_id=v_cap.operation_id AND action_id=v_cap.action_id;
 -- Generated values are unavailable in BEFORE NEW; only this AFTER check can
 -- certify the complete actual tuple, including every generated amount.
 IF app_private.financial_reset_hash(v_new) IS DISTINCT FROM v_action.after_sha256 THEN
   RAISE EXCEPTION 'financial_reset_final_stored_image_mismatch' USING ERRCODE='23514';
 END IF;
 UPDATE app_private.financial_reset_actions SET applied_at=clock_timestamp() WHERE operation_id=v_cap.operation_id AND action_id=v_cap.action_id;
 DELETE FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid();
 RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.complete_financial_reset_actions(p_operation_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF v_op.status<>'executing' OR v_op.execution_backend<>pg_backend_pid() OR v_op.execution_xid<>pg_current_xact_id()
   OR EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=p_operation_id AND applied_at IS NULL)
   OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE operation_id=p_operation_id) THEN
   RAISE EXCEPTION 'financial_reset_actions_incomplete' USING ERRCODE='55000';
 END IF;
 UPDATE app_private.financial_reset_operations SET status='actions_complete',completed_at=clock_timestamp() WHERE operation_id=p_operation_id;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_transaction_complete() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid())
   OR EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE status='executing' AND execution_backend=pg_backend_pid() AND execution_xid=pg_current_xact_id()) THEN
   RAISE EXCEPTION 'financial_reset_transaction_incomplete' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_capability_transaction_complete AFTER INSERT OR UPDATE ON app_private.financial_reset_transaction_capabilities
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_transaction_complete();
CREATE CONSTRAINT TRIGGER financial_reset_operation_transaction_complete AFTER INSERT OR UPDATE ON app_private.financial_reset_operations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_transaction_complete();

CREATE FUNCTION app_private.financial_reset_operation_status(p_operation_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('operation_id',o.operation_id,'organization_id',o.organization_id,'operation_kind',o.operation_kind,'restore_of',o.restore_of,
 'status',o.status,'source_generation',o.source_generation,'target_generation',o.target_generation,'manifest_sha256',o.manifest_sha256,
 'plan_sha256',o.plan_sha256,'schema_sha256',o.schema_sha256,'archive_sha256',o.archive_sha256,'action_sha256',o.action_sha256,
 'archive_count',o.archive_count,'action_count',o.action_count,'applied_count',(SELECT count(*) FROM app_private.financial_reset_actions a WHERE a.operation_id=o.operation_id AND applied_at IS NOT NULL),
 'completed_at',o.completed_at,'known_zero_verified',false,'recovery_verified',false)
 FROM app_private.financial_reset_operations o WHERE operation_id=p_operation_id
$$;

ALTER TABLE app_private.financial_reset_relation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_archive_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_transaction_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_relation_rules,app_private.financial_reset_operations,app_private.financial_reset_archive_rows,
 app_private.financial_reset_actions,app_private.financial_reset_transaction_capabilities FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='app_private' AND (p.proname LIKE '%financial_reset%') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);
 END LOOP;
END; $$;
COMMIT;
