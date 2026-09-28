-- A past move-in date is valid evidence. Term, billing, scope, occupancy,
-- authorization and audit checks still run in the existing activation command.
DO $activation$
DECLARE
  definition text;
  anchor text := 'IF p_activation_date IS NULL OR p_activation_date < v_business_date THEN';
BEGIN
  definition := pg_get_functiondef('public.request_lease_activation(uuid,uuid,text,uuid,date,text)'::regprocedure);
  IF (length(definition) - length(replace(definition, anchor, ''))) <> length(anchor) THEN
    RAISE EXCEPTION 'lease_activation_date_contract_changed';
  END IF;
  definition := replace(definition, anchor, 'IF p_activation_date IS NULL THEN');
  definition := replace(definition, 'Activation date cannot be before today', 'Choose an activation date');
  definition := replace(definition, 'lease_activation_date_in_past', 'lease_activation_date_required');
  EXECUTE definition;
END;
$activation$;
