-- Personal filter preferences only. These rows never grant access to the underlying records.
CREATE TABLE public.workspace_saved_views (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource IN (
    '/properties', '/units', '/leases', '/people', '/maintenance',
    '/reports/transactions', '/reports/management-fees', '/reports/rent-roll',
    '/reports/rent-collections', '/reports/monthly-owner-activity', '/reports/unit-profit-loss'
  )),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60 AND name = btrim(name)),
  query text NOT NULL CHECK (octet_length(query) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, resource, name)
);

ALTER TABLE public.workspace_saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_saved_views FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_saved_views FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_saved_views TO authenticated;
GRANT ALL ON public.workspace_saved_views TO service_role;

CREATE POLICY saved_views_select ON public.workspace_saved_views FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND app_private.is_org_member(organization_id));
CREATE POLICY saved_views_insert ON public.workspace_saved_views FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND app_private.is_org_member(organization_id));
CREATE POLICY saved_views_update ON public.workspace_saved_views FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND app_private.is_org_member(organization_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND app_private.is_org_member(organization_id));
CREATE POLICY saved_views_delete ON public.workspace_saved_views FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND app_private.is_org_member(organization_id));

CREATE FUNCTION app_private.check_saved_view_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.organization_id, NEW.user_id, NEW.resource, NEW.name)
    IS DISTINCT FROM (OLD.organization_id, OLD.user_id, OLD.resource, OLD.name) THEN
    RAISE EXCEPTION 'Saved view identity cannot change.' USING ERRCODE = '42501';
  END IF;
  -- Serialize two devices adding views to the same personal register.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    NEW.organization_id::text || '/' || NEW.user_id::text || '/' || NEW.resource, 0));
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.workspace_saved_views
    WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id
      AND resource = NEW.resource AND name = NEW.name
  ) AND (SELECT count(*) FROM public.workspace_saved_views
    WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id AND resource = NEW.resource) >= 12 THEN
    RAISE EXCEPTION 'A maximum of 12 views can be saved per register.' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.check_saved_view_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workspace_saved_views_limit BEFORE INSERT OR UPDATE ON public.workspace_saved_views
  FOR EACH ROW EXECUTE FUNCTION app_private.check_saved_view_limit();
