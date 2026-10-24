DO $rental_space_metadata$
DECLARE
  definition text := pg_catalog.pg_get_functiondef('app_private.finance_read_context(uuid,uuid)'::regprocedure);
  anchor text := 'SELECT property.id,property.code,property.name,property.archived_at';
BEGIN
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 THEN
    RAISE EXCEPTION 'Expected finance property projection anchor missing or ambiguous';
  END IF;
  definition := replace(definition,anchor,anchor||',property.rental_structure');
  EXECUTE definition;
END;
$rental_space_metadata$;
