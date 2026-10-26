-- Synthetic dedicated-local overlay; apply only after the immutable baseline and both supplemental loaders.
-- Use the normal archive command; do not alter any customer data or archive flags directly.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $fixture$ BEGIN
 IF current_database()<>'postgres' OR (SELECT count(*) FROM public.organizations)<>1 OR NOT EXISTS(
  SELECT 1 FROM public.organizations WHERE id='00000000-0000-0000-0000-000000000001' AND slug='nestory-sample-operations') THEN
  RAISE EXCEPTION 'Synthetic archived overlay scope mismatch';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.properties WHERE id='10000000-0000-0000-0000-000000000004'
  AND organization_id='00000000-0000-0000-0000-000000000001' AND archived_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.units WHERE property_id='10000000-0000-0000-0000-000000000004')
 OR EXISTS(SELECT 1 FROM public.leases WHERE property_id='10000000-0000-0000-0000-000000000004')
 OR NOT EXISTS(SELECT 1 FROM public.owner_balance_periods WHERE property_id='10000000-0000-0000-0000-000000000004') THEN
  RAISE EXCEPTION 'Expected empty-unit historical owner fixture absent';
 END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id='00000000-0000-0000-0000-000000000001') THEN
  RAISE EXCEPTION 'Overlay requires clean unenrolled synthetic fixture';
 END IF;
END $fixture$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
SET LOCAL ROLE authenticated;
SELECT public.archive_property('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001');
RESET ROLE;
DO $fixture$ BEGIN
 IF (SELECT count(*) FROM public.properties WHERE organization_id='00000000-0000-0000-0000-000000000001' AND archived_at IS NOT NULL)<>1 THEN
  RAISE EXCEPTION 'Expected exactly one archived synthetic property';
 END IF;
END $fixture$;
COMMIT;
