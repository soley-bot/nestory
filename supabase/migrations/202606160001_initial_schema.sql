CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.currency_code AS ENUM ('USD');

CREATE TYPE public.timeline_event_type AS ENUM (
  'Lease Started',
  'Lease Ended',
  'Tenant Move In',
  'Tenant Move Out',
  'Rent Increase',
  'Maintenance',
  'Repair',
  'Renovation',
  'Inspection',
  'Document Added',
  'General Note'
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  property_type text NOT NULL,
  owner text,
  address text,
  status text NOT NULL DEFAULT 'active',
  acquisition_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  floor text,
  size_sqm numeric(10, 2),
  status text NOT NULL DEFAULT 'vacant',
  current_rent_amount numeric(14, 2),
  current_rent_currency public.currency_code,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (property_id, unit_number)
);

CREATE TABLE public.leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  tenant_name text NOT NULL,
  lease_start_date date NOT NULL,
  lease_end_date date NOT NULL,
  monthly_rent_amount numeric(14, 2) NOT NULL,
  monthly_rent_currency public.currency_code NOT NULL DEFAULT 'USD',
  deposit_amount numeric(14, 2),
  deposit_currency public.currency_code,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  transaction_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('income', 'expense')),
  category text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  lease_id uuid REFERENCES public.leases(id) ON DELETE SET NULL,
  ledger_entry_id uuid REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  event_date date NOT NULL,
  event_type public.timeline_event_type NOT NULL,
  title text NOT NULL,
  description text,
  cost_amount numeric(14, 2) CHECK (cost_amount >= 0),
  cost_currency public.currency_code,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  lease_id uuid REFERENCES public.leases(id) ON DELETE SET NULL,
  timeline_event_id uuid REFERENCES public.timeline_events(id) ON DELETE SET NULL,
  category text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX properties_organization_idx ON public.properties (organization_id);
CREATE INDEX units_property_idx ON public.units (property_id);
CREATE INDEX leases_property_idx ON public.leases (property_id);
CREATE INDEX ledger_entries_property_date_idx ON public.ledger_entries (property_id, transaction_date DESC);
CREATE INDEX timeline_events_property_date_idx ON public.timeline_events (property_id, event_date DESC);
CREATE INDEX timeline_events_unit_date_idx ON public.timeline_events (unit_id, event_date DESC);
CREATE INDEX documents_property_idx ON public.documents (property_id);
CREATE INDEX activity_logs_entity_idx ON public.activity_logs (entity_type, entity_id, created_at DESC);

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_properties_updated_at
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_units_updated_at
BEFORE UPDATE ON public.units
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_leases_updated_at
BEFORE UPDATE ON public.leases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_ledger_entries_updated_at
BEFORE UPDATE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_timeline_events_updated_at
BEFORE UPDATE ON public.timeline_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_private.is_org_admin(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.organization_has_no_members(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = target_organization_id
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.organization_has_no_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.organization_has_no_members(uuid) TO authenticated;

CREATE POLICY "Authenticated users can create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Admins can read organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(id));

CREATE POLICY "Admins can update organizations"
ON public.organizations
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(id))
WITH CHECK (app_private.is_org_admin(id));

CREATE POLICY "Admins can delete organizations"
ON public.organizations
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(id));

CREATE POLICY "Admins can create organization memberships"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  role = 'admin'
  AND (
    app_private.is_org_admin(organization_id)
    OR (
      user_id = (select auth.uid())
      AND app_private.organization_has_no_members(organization_id)
    )
  )
);

CREATE POLICY "Admins can read organization memberships"
ON public.organization_members
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can update organization memberships"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can delete organization memberships"
ON public.organization_members
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage properties"
ON public.properties
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage units"
ON public.units
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage leases"
ON public.leases
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage ledger entries"
ON public.ledger_entries
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage timeline events"
ON public.timeline_events
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage documents"
ON public.documents
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can read activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can create activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
