-- Approved 2026-10-09: see docs/runbooks/deposit-release-access-assessment.md.
-- Each entry point derives the actor from Auth and checks current property,
-- company and branch authority. Direct settlement helpers remain inaccessible.
GRANT EXECUTE ON FUNCTION
  public.get_local_deposit_rent_candidates(uuid,uuid),
  public.get_deposit_rent_journal(uuid,uuid),
  public.prepare_deposit_rent_journal(uuid,uuid,jsonb,text),
  public.begin_deposit_rent_journal_attempt(uuid,uuid,uuid,uuid,text,integer),
  public.execute_deposit_rent_journal(uuid,uuid,uuid,uuid,text),
  public.confirm_deposit_rent_custody(uuid,uuid,uuid,text,uuid,date,numeric,text,text),
  public.get_local_lease_deposit_report_snapshot(uuid,uuid[],date,date,uuid)
TO authenticated;

-- The narrow public/private statement display reader grants are installed by
-- 20261009141715. Allocation SELECT uses the finance.view property RLS policy
-- installed with the settlement schema; no write privilege is added here.
