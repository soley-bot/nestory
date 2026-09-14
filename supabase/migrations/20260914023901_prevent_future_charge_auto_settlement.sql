-- Automatic settlement triggered by a historical receipt must not turn later
-- charges into earlier payments. Explicit, evidenced prepayments are separate.
DO $patch$
DECLARE
  definition text;
  marker text := E'      AND invoice.lifecycle = ''issued''\n      AND app_private.owner_invoice_line_outstanding(';
BEGIN
  SELECT pg_get_functiondef('app_private.apply_available_owner_cash(uuid,uuid,date,uuid)'::regprocedure)
    INTO definition;
  IF strpos(definition, marker) = 0 THEN
    RAISE EXCEPTION 'auto_cash_date_predecessor_changed';
  END IF;
  definition := replace(definition, marker,
    E'      AND invoice.lifecycle = ''issued''\n      AND invoice.issue_date <= p_allocation_date\n      AND line.recognized_on <= p_allocation_date\n      AND app_private.owner_invoice_line_outstanding(');
  EXECUTE definition;
END;
$patch$;

