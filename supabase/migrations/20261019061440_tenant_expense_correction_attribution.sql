-- Tenant corrections preserve the original liable invoice, property and unit.
-- This is enforced at the RPC boundary before any cancellation or reversal.
DO $patch$
DECLARE d text; old_text text; new_text text;
BEGIN
 d:=replace(pg_get_functiondef('public.replace_expense_transaction(uuid,uuid,text,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 old_text:=$old$  -- Existing evidence is exclusive to the immutable original.$old$;
 new_text:=$new$  IF v_transaction.responsibility='tenant' THEN
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'A tenant correction must keep its original invoice, property, and unit' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(p_lines)<>1 OR (SELECT count(*) FROM public.expense_transaction_lines l
      WHERE l.organization_id=p_organization_id AND l.transaction_id=p_transaction_id)<>1
      OR NOT EXISTS (SELECT 1 FROM public.expense_transaction_lines l
        JOIN public.expense_submissions s ON s.organization_id=l.organization_id AND s.id=l.submission_id
        WHERE l.organization_id=p_organization_id AND l.transaction_id=p_transaction_id
          AND s.tenant_invoice_id=(p_lines->0->>'tenant_invoice_id')::uuid
          AND s.property_id=(p_lines->0->>'property_id')::uuid
          AND s.unit_id IS NOT DISTINCT FROM nullif(p_lines->0->>'unit_id','')::uuid) THEN
      RAISE EXCEPTION 'A tenant correction must keep its original invoice, property, and unit' USING ERRCODE='22023';
    END IF;
  END IF;
  -- Existing evidence is exclusive to the immutable original.$new$;
 IF (length(d)-length(replace(d,old_text,'')))<>length(old_text) THEN
   RAISE EXCEPTION 'tenant_expense_attribution_contract_changed'; END IF;
 EXECUTE replace(d,old_text,new_text);
END;
$patch$;
