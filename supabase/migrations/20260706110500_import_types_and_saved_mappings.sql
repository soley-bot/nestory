ALTER TABLE public.import_runs
DROP CONSTRAINT IF EXISTS import_runs_import_type_check;

ALTER TABLE public.import_runs
ADD CONSTRAINT import_runs_import_type_check
CHECK (import_type IN ('properties', 'units', 'people', 'leases'));

CREATE TABLE public.import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_type text NOT NULL CHECK (import_type IN ('properties', 'units', 'people', 'leases')),
  name text NOT NULL DEFAULT 'Default',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, import_type, name)
);

CREATE TRIGGER set_import_mappings_updated_at
BEFORE UPDATE ON public.import_mappings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX import_mappings_org_type_idx
  ON public.import_mappings (organization_id, import_type, updated_at DESC);

ALTER TABLE public.import_mappings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_mappings TO authenticated;
GRANT ALL PRIVILEGES ON public.import_mappings TO service_role;

CREATE POLICY "Admins can manage import mappings"
ON public.import_mappings
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
