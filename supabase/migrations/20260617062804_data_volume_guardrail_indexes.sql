-- Guardrails for high-volume operational screens.
-- These indexes support organization-scoped pagination, server-side filters,
-- relationship lookups, and substring search without changing table shape.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS properties_active_org_name_idx
  ON public.properties (organization_id, name)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS properties_name_trgm_idx
  ON public.properties USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS properties_code_trgm_idx
  ON public.properties USING gin (code extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS units_active_org_property_number_idx
  ON public.units (organization_id, property_id, unit_number)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS units_unit_number_trgm_idx
  ON public.units USING gin (unit_number extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS leases_active_org_property_unit_idx
  ON public.leases (organization_id, property_id, unit_id, lease_start_date DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS ledger_entries_active_org_date_idx
  ON public.ledger_entries (organization_id, transaction_date DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS ledger_entries_archived_org_date_idx
  ON public.ledger_entries (organization_id, transaction_date DESC, id DESC)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ledger_entries_org_property_date_idx
  ON public.ledger_entries (organization_id, property_id, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS ledger_entries_org_unit_date_idx
  ON public.ledger_entries (organization_id, unit_id, transaction_date DESC, id DESC)
  WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ledger_entries_org_direction_date_idx
  ON public.ledger_entries (organization_id, direction, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS ledger_entries_category_trgm_idx
  ON public.ledger_entries USING gin (category extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ledger_entries_description_trgm_idx
  ON public.ledger_entries USING gin (description extensions.gin_trgm_ops)
  WHERE description IS NOT NULL;

CREATE INDEX IF NOT EXISTS timeline_events_active_org_date_idx
  ON public.timeline_events (organization_id, event_date DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS timeline_events_archived_org_date_idx
  ON public.timeline_events (organization_id, event_date DESC, id DESC)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS timeline_events_org_property_date_idx
  ON public.timeline_events (organization_id, property_id, event_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS timeline_events_org_unit_date_idx
  ON public.timeline_events (organization_id, unit_id, event_date DESC, id DESC)
  WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS timeline_events_org_type_date_idx
  ON public.timeline_events (organization_id, event_type, event_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS timeline_events_org_ledger_entry_created_idx
  ON public.timeline_events (organization_id, ledger_entry_id, created_at DESC)
  WHERE ledger_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS timeline_events_title_trgm_idx
  ON public.timeline_events USING gin (title extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS timeline_events_description_trgm_idx
  ON public.timeline_events USING gin (description extensions.gin_trgm_ops)
  WHERE description IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_active_org_timeline_event_idx
  ON public.documents (organization_id, timeline_event_id)
  WHERE archived_at IS NULL AND timeline_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_active_org_ledger_entry_idx
  ON public.documents (organization_id, ledger_entry_id)
  WHERE archived_at IS NULL AND ledger_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS activity_logs_org_recent_idx
  ON public.activity_logs (organization_id, created_at DESC);
