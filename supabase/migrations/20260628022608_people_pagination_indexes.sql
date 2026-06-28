-- Match the default /people route query shape: organization-scoped,
-- active records, page-limited by display name or most recent update.
CREATE INDEX IF NOT EXISTS people_active_org_display_name_page_idx
  ON public.people (organization_id, display_name, id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS people_active_org_updated_at_page_idx
  ON public.people (organization_id, updated_at DESC, id DESC)
  WHERE archived_at IS NULL;
