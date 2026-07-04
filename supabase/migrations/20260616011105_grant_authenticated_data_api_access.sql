-- Explicit Data API grants for new Supabase projects where auto-exposure is disabled.
-- RLS policies still decide which rows an authenticated user can access.

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON
  public.organizations,
  public.organization_members,
  public.properties,
  public.units,
  public.leases,
  public.ledger_entries,
  public.timeline_events,
  public.documents
TO authenticated;

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
