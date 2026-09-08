-- Reject non-finite monetary input before preview arithmetic or execution replay.
-- Exact prior definitions are pinned from the normally applied 155/156 chain.
-- Normalize CRLF/LF only; unknown bodies or ambiguous replacement sites fail closed.
DO $migration$
DECLARE
  target record;
  definition text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      (
        'app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer)',
        '4c08dad944a897e14368f70eac06d893ccdf16a46deee3dc3570865f83fd3a8d',
        $needle$    OR p_corrected_rent_amount <= 0$needle$,
        $replacement$    OR p_corrected_rent_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_corrected_rent_amount <= 0$replacement$
      ),
      (
        'public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)',
        '3d15eea27fa0ce1efd776bdb0e79965df7dbc9164f9d29fd5a74cb902159ecfe',
        $needle$  IF pg_catalog.length(v_reason) NOT BETWEEN 8 AND 500$needle$,
        $replacement$  IF pg_catalog.length(v_reason) NOT BETWEEN 8 AND 500
    OR p_corrected_rent_amount::text IN ('NaN', 'Infinity', '-Infinity')$replacement$
      )
    ) AS definitions(signature, expected_hash, needle, replacement)
  LOOP
    definition := replace(pg_catalog.pg_get_functiondef(target.signature::regprocedure), chr(13), '');
    IF encode(extensions.digest(definition, 'sha256'), 'hex') <> target.expected_hash
      OR array_length(string_to_array(definition, target.needle), 1) <> 2 THEN
      RAISE EXCEPTION 'historical_rent_nonfinite_prior_definition_mismatch: %', target.signature;
    END IF;
    EXECUTE replace(definition, target.needle, target.replacement);
  END LOOP;
END;
$migration$;
