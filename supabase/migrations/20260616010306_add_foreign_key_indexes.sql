-- Cover foreign key columns flagged by Supabase performance advisors.
-- Existing composite query indexes remain in place for timeline/report filters.

CREATE INDEX IF NOT EXISTS organization_members_user_id_idx
  ON public.organization_members (user_id);

CREATE INDEX IF NOT EXISTS properties_created_by_idx
  ON public.properties (created_by);
CREATE INDEX IF NOT EXISTS properties_updated_by_idx
  ON public.properties (updated_by);
CREATE INDEX IF NOT EXISTS properties_archived_by_idx
  ON public.properties (archived_by);

CREATE INDEX IF NOT EXISTS units_organization_id_idx
  ON public.units (organization_id);
CREATE INDEX IF NOT EXISTS units_created_by_idx
  ON public.units (created_by);
CREATE INDEX IF NOT EXISTS units_updated_by_idx
  ON public.units (updated_by);
CREATE INDEX IF NOT EXISTS units_archived_by_idx
  ON public.units (archived_by);

CREATE INDEX IF NOT EXISTS leases_organization_id_idx
  ON public.leases (organization_id);
CREATE INDEX IF NOT EXISTS leases_unit_id_idx
  ON public.leases (unit_id);
CREATE INDEX IF NOT EXISTS leases_created_by_idx
  ON public.leases (created_by);
CREATE INDEX IF NOT EXISTS leases_updated_by_idx
  ON public.leases (updated_by);
CREATE INDEX IF NOT EXISTS leases_archived_by_idx
  ON public.leases (archived_by);

CREATE INDEX IF NOT EXISTS ledger_entries_organization_id_idx
  ON public.ledger_entries (organization_id);
CREATE INDEX IF NOT EXISTS ledger_entries_unit_id_idx
  ON public.ledger_entries (unit_id);
CREATE INDEX IF NOT EXISTS ledger_entries_created_by_idx
  ON public.ledger_entries (created_by);
CREATE INDEX IF NOT EXISTS ledger_entries_updated_by_idx
  ON public.ledger_entries (updated_by);
CREATE INDEX IF NOT EXISTS ledger_entries_archived_by_idx
  ON public.ledger_entries (archived_by);

CREATE INDEX IF NOT EXISTS timeline_events_organization_id_idx
  ON public.timeline_events (organization_id);
CREATE INDEX IF NOT EXISTS timeline_events_lease_id_idx
  ON public.timeline_events (lease_id);
CREATE INDEX IF NOT EXISTS timeline_events_ledger_entry_id_idx
  ON public.timeline_events (ledger_entry_id);
CREATE INDEX IF NOT EXISTS timeline_events_created_by_idx
  ON public.timeline_events (created_by);
CREATE INDEX IF NOT EXISTS timeline_events_updated_by_idx
  ON public.timeline_events (updated_by);
CREATE INDEX IF NOT EXISTS timeline_events_archived_by_idx
  ON public.timeline_events (archived_by);

CREATE INDEX IF NOT EXISTS documents_organization_id_idx
  ON public.documents (organization_id);
CREATE INDEX IF NOT EXISTS documents_unit_id_idx
  ON public.documents (unit_id);
CREATE INDEX IF NOT EXISTS documents_lease_id_idx
  ON public.documents (lease_id);
CREATE INDEX IF NOT EXISTS documents_timeline_event_id_idx
  ON public.documents (timeline_event_id);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx
  ON public.documents (uploaded_by);
CREATE INDEX IF NOT EXISTS documents_archived_by_idx
  ON public.documents (archived_by);

CREATE INDEX IF NOT EXISTS activity_logs_organization_id_idx
  ON public.activity_logs (organization_id);
CREATE INDEX IF NOT EXISTS activity_logs_actor_id_idx
  ON public.activity_logs (actor_id);
