-- pg_trgm is installed by earlier migrations. These partial indexes match the
-- active-record ILIKE predicates used by the authenticated workspace search.
CREATE INDEX IF NOT EXISTS tasks_title_active_trgm_idx
  ON public.tasks USING gin (title extensions.gin_trgm_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_description_active_trgm_idx
  ON public.tasks USING gin (description extensions.gin_trgm_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_file_name_active_trgm_idx
  ON public.documents USING gin (file_name extensions.gin_trgm_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS leases_tenant_name_active_trgm_idx
  ON public.leases USING gin (tenant_name extensions.gin_trgm_ops)
  WHERE archived_at IS NULL;
