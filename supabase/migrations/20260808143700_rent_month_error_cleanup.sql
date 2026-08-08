DO $migration$
DECLARE
  definition text;
BEGIN
  definition := pg_get_functiondef(
    'app_private.try_generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure
  );
  definition := replace(
    definition,
    'Property reporting period is not open%',
    'Financial month is locked%'
  );
  definition := replace(
    definition,
    'Organization Ledger period is locked%',
    'Financial month is locked%'
  );
  definition := replace(
    definition,
    'Accounting book period is locked%',
    'Financial month is locked%'
  );
  EXECUTE definition;
END;
$migration$;
