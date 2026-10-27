-- Disposable-clone setup for genuine Auth/PostgREST empty books proof. The test
-- driver supplies actual signed-up synthetic users and the maker's session.
-- This file never creates Auth identities, fabricates request claims, grants
-- permissions, obtains a token, or calls a financial reset mutation function.
\set ON_ERROR_STOP on
SELECT current_database() ~ '^pilot_reset_empty_books_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' AS receipt_disposable_database \gset
\if :receipt_disposable_database
\else
\echo 'Refusing HTTP receipt setup outside its explicitly named disposable database.'
\quit 3
\endif
\if :{?http_maker}
\else
\echo 'Actual synthetic HTTP maker UUID is required.'
\quit 3
\endif
\if :{?http_reviewer}
\else
\echo 'Actual synthetic HTTP reviewer UUID is required.'
\quit 3
\endif
\if :{?http_session}
\else
\echo 'Actual synthetic HTTP maker session UUID is required.'
\quit 3
\endif

BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE http_empty_books_fixture(
 organization uuid,foreign_organization uuid,operation uuid,maker uuid,reviewer uuid,session_id uuid,
 source_row jsonb,operation_binding jsonb,archive_rows jsonb,actions jsonb,zero_plan jsonb,binding jsonb,foreign_before jsonb
);
INSERT INTO http_empty_books_fixture(organization,foreign_organization,operation,maker,reviewer,session_id) VALUES
 ('eb270057-0000-4000-8000-000000000001','eb270057-0000-4000-8000-000000000009','eb270057-0000-4000-8000-000000000100',
  :'http_maker'::uuid,:'http_reviewer'::uuid,:'http_session'::uuid);
DO $$ DECLARE f record; BEGIN
 SELECT * INTO STRICT f FROM http_empty_books_fixture;
 IF f.maker=f.reviewer OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id
   WHERE u.id=f.maker AND s.id=f.session_id AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
    AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) OR
   NOT EXISTS(SELECT 1 FROM auth.users WHERE id=f.reviewer AND deleted_at IS NULL AND NOT coalesce(is_anonymous,false)) THEN
  RAISE EXCEPTION 'synthetic_receipt_actual_auth_users_and_session_required';
 END IF;
END $$;
INSERT INTO public.organizations(id,name,slug,operational_timezone)
 SELECT organization,'Synthetic HTTP empty books proof','synthetic-http-empty-books-proof','Asia/Phnom_Penh' FROM http_empty_books_fixture
 UNION ALL SELECT foreign_organization,'Synthetic HTTP empty books foreign sentinel','synthetic-http-empty-books-foreign','Asia/Phnom_Penh' FROM http_empty_books_fixture;
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT organization,maker,'super_admin' FROM http_empty_books_fixture UNION ALL SELECT organization,reviewer,'super_admin' FROM http_empty_books_fixture;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
 SELECT 'eb270057-0000-4000-8000-000000000020',organization,'HTTP receipt branch','HRCP','active' FROM http_empty_books_fixture;
DO $$ DECLARE v_token text; BEGIN
 SELECT capability_token INTO STRICT v_token FROM app_private.property_branch_assignment_context_capability WHERE singleton;
 PERFORM set_config('app.property_branch_assignment_context',v_token,true);
 INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
  SELECT 'eb270057-0000-4000-8000-000000000002',organization,'HTTP receipt property','HRCP','Apartment','eb270057-0000-4000-8000-000000000020' FROM http_empty_books_fixture;
 PERFORM set_config('app.property_branch_assignment_context','',true);
END $$;
INSERT INTO public.people(id,organization_id,display_name)
 SELECT 'eb270057-0000-4000-8000-000000000003',organization,'HTTP receipt owner' FROM http_empty_books_fixture;
INSERT INTO public.person_roles(organization_id,person_id,role,status)
 SELECT organization,'eb270057-0000-4000-8000-000000000003','owner','active' FROM http_empty_books_fixture;
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on)
 SELECT 'eb270057-0000-4000-8000-000000000004',organization,'eb270057-0000-4000-8000-000000000002',
  'eb270057-0000-4000-8000-000000000003',100,'2026-01-01' FROM http_empty_books_fixture;
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
 SELECT 'eb270057-0000-4000-8000-000000000030'::uuid,organization,DATE '2026-09-01',maker,'Synthetic HTTP exact source' FROM http_empty_books_fixture
 UNION ALL SELECT 'eb270057-0000-4000-8000-000000000039'::uuid,foreign_organization,DATE '2026-09-01',maker,'Synthetic HTTP foreign sentinel' FROM http_empty_books_fixture;
UPDATE http_empty_books_fixture SET source_row=(SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='eb270057-0000-4000-8000-000000000030'),
 foreign_before=(SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='eb270057-0000-4000-8000-000000000039');
UPDATE http_empty_books_fixture SET actions=jsonb_build_array(jsonb_build_object('action_id','eb270057-0000-4000-8000-000000000101','ordinal',1,
 'relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',source_row->'id'),'kind','archive-delete',
 'before_row_text',source_row::text,'before_sha256',app_private.financial_reset_hash(source_row),'after_row_text',NULL,'after_sha256',NULL,'changed_columns','[]'::jsonb)),
 archive_rows=jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',source_row->'id'),
 'row_text',source_row::text,'row_sha256',app_private.financial_reset_hash(source_row)));
UPDATE http_empty_books_fixture SET operation_binding=jsonb_build_object('operation_id',operation,'organization_id',organization,
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_sha256',app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks',
  'primary_key',jsonb_build_object('id',source_row->'id'),'row_sha256',app_private.financial_reset_hash(source_row)))),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text','changed_columns'] ORDER BY (a->>'ordinal')::integer))
  FROM jsonb_array_elements(actions) a),'archive_count',1,'action_count',1,'audit_timestamp',clock_timestamp(),'audit_actor',NULL);
UPDATE http_empty_books_fixture f SET zero_plan=jsonb_build_object('operation_id',operation,'organization_id',organization,
 'manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),'maker_actor_id',maker,'reviewer_actor_id',reviewer,
 'effective_date','2026-10-01','currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_zero_scope_on_date(f.organization,DATE '2026-10-01'));
UPDATE http_empty_books_fixture SET binding=jsonb_build_object('version',1,'operation_id',operation,'project_ref','syntheticprojectrefa','organization_id',organization,
 'packet_sha256',repeat('1',64),'main_sha',repeat('2',40),'sources_sha256',repeat('3',64),'schema_sha256',operation_binding->>'schema_sha256',
 'ledger_sha256',repeat('4',64),'source_snapshot_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(organization)),
 'source_generation',0,'target_generation',1,'cutoff','2026-10-01','issue_date','2026-10-01','timezone','Asia/Phnom_Penh',
 'execution_business_date',app_private.rent_business_date(organization,statement_timestamp()),'invoice_date_policy','empty-books-no-invoices',
 'manifest_sha256',operation_binding->>'manifest_sha256','plan_sha256',operation_binding->>'plan_sha256',
 'archive_sha256',operation_binding->>'archive_sha256','action_sha256',operation_binding->>'action_sha256',
 'archive_artifact_sha256',repeat('5',64),'archive_count',1,'action_count',1,'zero_review_sha256',app_private.financial_reset_hash(zero_plan),
 'continuation_semantic',jsonb_build_object('version',4,'actor_id',maker,'billing_period_start','2026-10-01','issue_date','2026-10-01',
  'execution_business_date',app_private.rent_business_date(organization,statement_timestamp()),'invoice_date_policy','empty-books-no-invoices','contracts_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(organization)),'leases','[]'::jsonb),
 'report_review_sha256',repeat('6',64));
UPDATE http_empty_books_fixture SET binding=binding||jsonb_build_object('continuation_semantic_sha256',app_private.financial_reset_hash(binding->'continuation_semantic'));
COMMIT;
SELECT jsonb_build_object('binding',binding,'operation_binding',operation_binding,'archive_rows',archive_rows,'actions',actions,'zero_plan',zero_plan,
 'zero_plan_text',zero_plan::text,'source_row',source_row,'foreign_before',foreign_before,'operation',operation,'organization',organization) FROM http_empty_books_fixture;
