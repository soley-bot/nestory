DO $migration$
DECLARE
  target_function regprocedure;
  function_definition text;
  hard_coded_source_predicate constant text :=
    'AND source.code = ''IPS_COLLECTIONS''';
  predicate_occurrences integer;
BEGIN
  FOREACH target_function IN ARRAY ARRAY[
    'public.get_tenant_commercial_document_publication_source(uuid,text,uuid)'::regprocedure,
    'public.register_tenant_commercial_document_artifact(uuid,text,uuid,text,text,bigint,text,text,jsonb)'::regprocedure,
    'public.mark_tenant_commercial_document_publication_failed(uuid,text,uuid,text)'::regprocedure
  ]
  LOOP
    function_definition := pg_catalog.pg_get_functiondef(target_function);
    predicate_occurrences :=
      (
        pg_catalog.length(function_definition)
        - pg_catalog.length(
          pg_catalog.replace(
            function_definition,
            hard_coded_source_predicate,
            ''
          )
        )
      ) / pg_catalog.length(hard_coded_source_predicate);

    IF predicate_occurrences <> 1 THEN
      RAISE EXCEPTION 'tenant_commercial_document_receipt_source_contract_drift'
        USING ERRCODE = '55000';
    END IF;

    EXECUTE pg_catalog.replace(
      function_definition,
      hard_coded_source_predicate,
      ''
    );
  END LOOP;
END
$migration$;
